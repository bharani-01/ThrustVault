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
            handle = p.get("handle", "") or ""
            vendor = p.get("vendor", "EMAX")
            product_type = (p.get("product_type") or "").lower().strip()
            title_lower = title.lower()

            # ── 1. Skip by product_type field ──────────────────────────────
            _SKIP_TYPES = {
                "prop", "propeller", "stand", "charger", "battery", "frame",
                "servo", "esc", "flight controller", "fc", "antenna", "receiver",
                "transmitter", "remote", "camera", "video transmitter", "vtx",
                "drone", "quad", "fpv kit", "accessory", "accessoires", "tool",
                "connector", "wire", "cable", "apparel", "clothing", "cap", "hat",
                "shirt", "sticker", "tape", "glue", "screw", "hardware",
                "power board", "power distribution", "ubec", "bec", "osd",
            }
            if any(s in product_type for s in _SKIP_TYPES):
                return None

            # ── 2. Skip by title keywords ─────────────────────────────────
            _SKIP_TITLE_KEYWORDS = [
                # Servos
                "servo", "actuator", "es30", "es60", "es90", "es08", "es09",
                # Non-motor electronics
                "esc", "flight controller", "receiver", "transmitter", "remote",
                "antenna", "vtx", "video", "camera", "osd", "elrs rx", "elrs_",
                "expressLRS", "receiver",
                # Complete drones / RTF kits
                "fpv racing drone", "fpv drone", "bnf", "rtf", "pnp",
                "babyhawk", "cinehawk", "nanohawk", "tinyhawk", "hawk 5",
                "hawk 7", "hawk 8", "hawk 9", "hawk 10", "hawk apex",
                "nighthawk", "interceptor rc car",
                # Spare parts, hardware, accessories
                "spare part", "spare parts", "hardware kit", "hardware pack",
                "bottom plate", "top plate", "side plate", "middle plate",
                "arm set", "body part", "shell kit", "motor case kit",
                "screw", "nut", "screwdriver", "pliers", "tool", "tools",
                "tape", "adhesive", "sticker", "logo", "t-shirt", "cap", "hat",
                "connector", "wire", "cable", "prop cap",
                # Power / distribution boards
                "power board", "power distribution", "ubec board", "ubec",
                "bec", "skyline", "f4 magnum", "f4 fc", "f3 fc",
                # Propellers
                "propeller", "prop guard", " prop ", "4045", "5045", "t5050",
                # Notifications / PDFs
                "notification", "说明书", "manual",
                # Combo kits (motor + ESC)
                "combo",
            ]
            if any(kw in title_lower for kw in _SKIP_TITLE_KEYWORDS):
                return None

            # ── 3. Skip by URL handle ─────────────────────────────────────
            _SKIP_HANDLE_PARTS = [
                "servo", "esc", "receiver", "transmitter", "antenna", "camera",
                "drone-bnf", "drone-rtf", "drone-pnp", "babyhawk", "cinehawk",
                "nanohawk", "tinyhawk", "nighthawk-x", "interceptor",
                "hardware-kit", "bottom-plate", "top-plate", "spare-part",
                "power-board", "ubec", "flight-controller", "prop-set",
                "propeller", "t-shirt", "logo-cap", "sticker", "screwdriver",
                "说明书", "manual", "combo",
            ]
            if any(part in handle for part in _SKIP_HANDLE_PARTS):
                return None

            # ── 4. Must look like a brushless motor ───────────────────────
            # Allow if product_type explicitly says motor, OR title has stator+KV pattern
            _motor_product_types = {"motor", "brushless motor", "motors"}
            is_typed_as_motor = any(mt in product_type for mt in _motor_product_types)

            _has_motor_pattern = bool(
                re.search(r'\b\d{3,4}\b', title)    # stator code like 2207, 2814
                and re.search(r'\d{2,5}\s*[Kk][Vv]', title)  # KV rating
            ) or bool(re.search(r'\bMT\d{4}\b|\bRS\d{4}\b|\bECO\b|\bECOII\b|\bECOIII\b|\bFS\d{4}\b|\bLS\d{4}\b|\bTH\d{4}\b|\bGB\d{4}\b', title))

            if not is_typed_as_motor and not _has_motor_pattern:
                log.debug(f"[emax] Skipped (no motor pattern): {title!r}")
                return None

            # ── Build record ───────────────────────────────────────────────
            link = f"{self.base_url}/products/{handle}"

            # Price from first variant
            variants = p.get("variants", [])
            price = ""
            if variants:
                price = f"${variants[0].get('price', '')}"

            # KV from title
            kv_match = re.search(r'(\d{3,5})\s*[Kk][Vv]', title)
            kv = f"{kv_match.group(1)}KV" if kv_match else ""

            return {
                "category":              "motor",
                "motor_name":            title,
                "company":               vendor or "EMAX",
                "max_thrust":            "",
                "recommended_esc":       "",
                "recommended_propeller": "",
                "price":                 price,
                "link_motor":            link,
                "link_esc":              "",
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
