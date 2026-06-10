"""
scrapers/emax_scraper.py — EMAX official motor catalog scraper.

EMAX is a major FPV motor brand. Uses Shopify's built-in JSON API
(/products.json and /search/suggest.json) which works without
any HTML parsing or anti-bot bypass — pure JSON responses.
"""

import re
from scrapers.base_scraper import BaseScraper
from utils.logger import get_logger

log = get_logger(__name__)


class EmaxScraper(BaseScraper):
    name = "emax"
    base_url = "https://emaxmodel.com"

    # Shopify product JSON API — returns structured JSON without JS
    COLLECTIONS = [
        "brushless-motors",
        "all",
    ]

    def scrape(self, query: str = "") -> list[dict]:
        results = []

        if query.strip():
            results.extend(self._search_shopify_json(query))

        # If search returned nothing, browse the motors collection
        if not results:
            results.extend(self._browse_collection("brushless-motors", query))

        log.info(f"[emax] Total items scraped: {len(results)}")
        return results

    # ── Shopify JSON search API ───────────────────────────────────────────────
    def _search_shopify_json(self, query: str) -> list[dict]:
        """
        Shopify exposes /search/suggest.json?q=<query>&resources[type]=product
        Returns JSON without any HTML/JS rendering needed.
        """
        import json

        items = []
        url = (
            f"{self.base_url}/search/suggest.json"
            f"?q={query.replace(' ', '+')}"
            f"&resources[type]=product"
            f"&resources[limit]=50"
        )
        log.info(f"[emax] Shopify suggest search: {url}")
        html = self.fetch(url)
        if not html:
            log.info(f"[emax] Suggest API failed, falling back to /search.json")
            return self._search_json_fallback(query)

        try:
            data = json.loads(html)
            products = (
                data.get("resources", {})
                    .get("results", {})
                    .get("products", [])
            )
            log.info(f"[emax] Suggest API: {len(products)} products found")
            for p in products:
                item = self._product_to_record(p)
                if item:
                    items.append(item)
        except (json.JSONDecodeError, KeyError) as e:
            log.debug(f"[emax] Suggest JSON parse error: {e}")
            return self._search_json_fallback(query)

        return items

    def _search_json_fallback(self, query: str) -> list[dict]:
        """
        Fallback: Shopify /products.json with query filtering.
        """
        import json
        items = []
        page = 1
        q_lower = query.lower()
        tokens = [t for t in re.split(r'[\s\-_/]+', q_lower) if len(t) >= 2]

        while page <= 5:
            url = f"{self.base_url}/products.json?limit=250&page={page}"
            log.info(f"[emax] products.json page {page}: {url}")
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
                    item = self._product_to_record(p)
                    if item:
                        items.append(item)

                if len(products) < 250:
                    break
            except json.JSONDecodeError:
                break
            page += 1

        return items

    # ── Shopify collection JSON API ───────────────────────────────────────────
    def _browse_collection(self, collection_handle: str, query: str = "") -> list[dict]:
        """
        Shopify /collections/<handle>/products.json — full catalog browse.
        """
        import json
        items = []
        page = 1
        q_lower = query.lower()
        tokens = [t for t in re.split(r'[\s\-_/]+', q_lower) if len(t) >= 2] if query else []

        while page <= 10:
            url = f"{self.base_url}/collections/{collection_handle}/products.json?limit=250&page={page}"
            log.info(f"[emax] Collection '{collection_handle}' page {page}")
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
                    # Apply query filter
                    if tokens and not any(t in title for t in tokens):
                        continue
                    item = self._product_to_record(p)
                    if item:
                        items.append(item)

                if len(products) < 250:
                    break
            except json.JSONDecodeError as e:
                log.debug(f"[emax] Collection JSON parse error: {e}")
                break
            page += 1

        log.info(f"[emax] Collection '{collection_handle}': {len(items)} matching items")
        return items

    # ── Normalize a Shopify product dict → our schema ─────────────────────────
    def _product_to_record(self, p: dict) -> dict | None:
        try:
            title = p.get("title", "")
            handle = p.get("handle", "")
            vendor = p.get("vendor", "EMAX")
            tags = p.get("tags", [])

            # Skip non-motor products
            product_type = (p.get("product_type") or "").lower()
            skip_types = ["prop", "propeller", "stand", "charger", "battery", "frame"]
            if any(s in product_type for s in skip_types):
                return None
            if any(s in title.lower() for s in ["propeller", "prop guard", "charger", "battery"]):
                return None

            # Link
            link = f"{self.base_url}/products/{handle}"

            # Price from first variant
            variants = p.get("variants", [])
            price = ""
            if variants:
                price = f"${variants[0].get('price', '')}"

            # KV from title
            kv_match = re.search(r'(\d{3,5})\s*[Kk][Vv]', title)
            kv = f"{kv_match.group(1)}KV" if kv_match else ""

            # Category
            is_esc = "esc" in title.lower() or "esc" in product_type
            category = "esc" if is_esc else "motor"

            return {
                "category":              category,
                "motor_name":            title if category == "motor" else "",
                "company":               vendor or "EMAX",
                "max_thrust":            "",
                "recommended_esc":       "",
                "recommended_propeller": "",
                "price":                 price,
                "link_motor":            link if category == "motor" else "",
                "link_esc":              link if category == "esc" else "",
                "link_propeller":        "",
                "source":                "emax_official",
                "kv_rating":             kv,
                "stator_size":           self._extract_stator(title),
            }
        except Exception as e:
            log.debug(f"[emax] product_to_record error: {e}")
            return None

    def _extract_stator(self, text: str) -> str:
        m = re.search(r'\b(\d{4})\b', text)
        return m.group(1) if m else ""
