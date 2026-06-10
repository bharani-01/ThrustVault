"""
scrapers/speedybee_scraper.py — Speedybee motor catalog scraper.

Speedybee runs a Shopify store. Uses Shopify JSON API
(/products.json) which works without HTML parsing.
"""

import re
import json
from scrapers.base_scraper import BaseScraper
from utils.logger import get_logger

log = get_logger(__name__)


class SpeedbeeeScraper(BaseScraper):
    name = "speedybee"
    base_url = "https://www.speedybee.com"

    def scrape(self, query: str = "") -> list[dict]:
        results = []
        q_lower = query.lower().strip()
        tokens = [t for t in re.split(r'[\s\-_/]+', q_lower) if len(t) >= 2] if q_lower else []

        # Try Shopify suggest API first (fastest)
        if query.strip():
            results.extend(self._suggest_search(query, tokens))

        # Fallback: browse motors collection via JSON
        if not results:
            results.extend(self._browse_collection("motors", tokens))

        log.info(f"[speedybee] Total items: {len(results)}")
        return results

    def _suggest_search(self, query: str, tokens: list) -> list[dict]:
        url = (
            f"{self.base_url}/search/suggest.json"
            f"?q={query.replace(' ', '+')}"
            f"&resources[type]=product&resources[limit]=50"
        )
        log.info(f"[speedybee] Suggest search: {url}")
        html = self.fetch(url)
        if not html:
            return []
        try:
            data = json.loads(html)
            products = (
                data.get("resources", {})
                    .get("results", {})
                    .get("products", [])
            )
            log.info(f"[speedybee] Suggest: {len(products)} products")
            return [r for r in (self._product_to_record(p) for p in products) if r]
        except Exception as e:
            log.debug(f"[speedybee] Suggest parse error: {e}")
            return []

    def _browse_collection(self, handle: str, tokens: list) -> list[dict]:
        items = []
        page = 1
        while page <= 5:
            url = f"{self.base_url}/collections/{handle}/products.json?limit=250&page={page}"
            log.info(f"[speedybee] Collection '{handle}' page {page}")
            html = self.fetch(url)
            if not html:
                break
            try:
                data = json.loads(html)
                products = data.get("products", [])
                if not products:
                    break
                for p in products:
                    title = (p.get("title") or "").lower()
                    if tokens and not any(t in title for t in tokens):
                        continue
                    record = self._product_to_record(p)
                    if record:
                        items.append(record)
                if len(products) < 250:
                    break
            except Exception as e:
                log.debug(f"[speedybee] Collection JSON error: {e}")
                break
            page += 1
        return items

    def _product_to_record(self, p: dict) -> dict | None:
        try:
            title = p.get("title", "")
            handle = p.get("handle", "")
            if not title:
                return None
            skip = ["prop", "battery", "charger", "frame", "stand", "cable"]
            if any(s in title.lower() for s in skip):
                return None
            link = f"{self.base_url}/products/{handle}"
            variants = p.get("variants", [])
            price = f"${variants[0].get('price', '')}" if variants else ""
            kv_m = re.search(r'(\d{3,5})\s*[Kk][Vv]', title)
            kv = f"{kv_m.group(1)}KV" if kv_m else ""
            is_esc = "esc" in title.lower()
            cat = "esc" if is_esc else "motor"
            return {
                "category":              cat,
                "motor_name":            title if cat == "motor" else "",
                "company":               "SpeedyBee",
                "max_thrust":            "",
                "recommended_esc":       "",
                "recommended_propeller": "",
                "price":                 price,
                "link_motor":            link if cat == "motor" else "",
                "link_esc":              link if cat == "esc" else "",
                "link_propeller":        "",
                "source":                "speedybee_official",
                "kv_rating":             kv,
                "stator_size":           self._extract_stator(title),
            }
        except Exception as e:
            log.debug(f"[speedybee] record error: {e}")
            return None

    def _extract_stator(self, text: str) -> str:
        m = re.search(r'\b(\d{4})\b', text)
        return m.group(1) if m else ""
