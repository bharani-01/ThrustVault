"""
scrapers/kdedirect_scraper.py — KDE Direct official motor catalog scraper.

KDE Direct (kdedirect.com) manufactures premium multi-rotor motors.
Their store is a standard e-commerce site with paginated product listings.

Scrapes:
  - https://www.kdedirect.com/collections/uas-multi-rotor-brushless-motors
"""

import re
from scrapers.base_scraper import BaseScraper
from utils.logger import get_logger

log = get_logger(__name__)


class KDEDirectScraper(BaseScraper):
    name = "kdedirect"
    base_url = "https://www.kdedirect.com"

    CATALOG_URLS = [
        "https://www.kdedirect.com/collections/uas-multi-rotor-brushless-motors",
        "https://www.kdedirect.com/collections/multi-rotor-esc",
    ]

    def scrape(self, query: str = "") -> list[dict]:
        results = []

        if query.strip():
            # KDE uses Shopify — search endpoint
            search_url = f"{self.base_url}/search?type=product&q={query.replace(' ', '+')}"
            log.info(f"[kdedirect] Searching: {search_url}")
            results.extend(self._scrape_collection(search_url, query, category="motor"))

        # Always also browse the catalog for broader coverage
        for cat_url in self.CATALOG_URLS:
            category = "esc" if "esc" in cat_url else "motor"
            results.extend(self._scrape_collection(cat_url, query, category=category))

        # Deduplicate by link
        seen = set()
        deduped = []
        for r in results:
            key = r.get("link_motor") or r.get("link_esc") or r.get("motor_name", "")
            if key and key not in seen:
                seen.add(key)
                deduped.append(r)

        log.info(f"[kdedirect] Total items scraped: {len(deduped)}")
        return deduped

    def _scrape_collection(self, url: str, query: str = "", category: str = "motor") -> list[dict]:
        items = []
        page = 1

        while True:
            sep = "&" if "?" in url else "?"
            page_url = url if page == 1 else f"{url}{sep}page={page}"

            log.info(f"[kdedirect] Fetching {category} page {page}: {page_url}")
            html = self.fetch(page_url)
            if not html:
                break

            soup = self.parse(html)

            # Shopify product grid selectors
            products = soup.select(
                ".product-item, .grid__item, .grid-product, "
                ".collection-product-card, article.product-card, "
                ".product, li.product-item"
            )

            if not products:
                break

            found_on_page = 0
            for item in products:
                try:
                    name_el = item.select_one(
                        ".product-item__title, .grid-product__title, "
                        ".product-card__name, .product-title, h2, h3, "
                        ".product-item-meta__title, [class*='title']"
                    )
                    price_el = item.select_one(
                        ".product-item__price, .grid-product__price, "
                        ".price, .product-price, [class*='price']"
                    )
                    link_el = item.select_one("a[href]")

                    name = name_el.get_text(strip=True) if name_el else ""
                    price = price_el.get_text(strip=True) if price_el else ""
                    href = link_el.get("href", "") if link_el else ""

                    if not name or len(name) < 3:
                        continue

                    # Apply query filter
                    if query.strip():
                        q_lower = query.lower()
                        name_lower = name.lower()
                        href_lower = href.lower()
                        tokens = re.split(r'[\s\-_/]+', q_lower)
                        tokens = [t for t in tokens if len(t) >= 2]
                        if not any(t in name_lower or t in href_lower for t in tokens):
                            continue

                    full_link = href if href.startswith("http") else self.base_url + href
                    cat = "esc" if "esc" in (name + href).lower() else "motor"

                    items.append({
                        "category":              cat,
                        "motor_name":            name if cat == "motor" else "",
                        "company":               "KDE Direct",
                        "max_thrust":            self._extract_thrust(name),
                        "recommended_esc":       "",
                        "recommended_propeller": self._extract_prop(name),
                        "price":                 price,
                        "link_motor":            full_link if cat == "motor" else "",
                        "link_esc":              full_link if cat == "esc" else "",
                        "link_propeller":        "",
                        "source":                "kdedirect_official",
                        "kv_rating":             self._extract_kv(name),
                        "stator_size":           self._extract_stator(name),
                    })
                    found_on_page += 1

                except Exception as e:
                    log.debug(f"[kdedirect] Parse error: {e}")

            log.info(f"[kdedirect] Page {page}: {found_on_page} matching items")

            # Shopify pagination
            next_btn = soup.select_one(
                "a[rel='next'], .pagination__next, li.next a, "
                ".pagination-custom__next, a[aria-label='Next page']"
            )
            if not next_btn or found_on_page == 0:
                break
            page += 1
            if page > 15:
                break

        return items

    # ── Field extractors ──────────────────────────────────────────────────────
    def _extract_kv(self, text: str) -> str:
        m = re.search(r'(\d{2,5})\s*[Kk][Vv]', text)
        return f"{m.group(1)}KV" if m else ""

    def _extract_stator(self, text: str) -> str:
        # KDE uses formats like "KDE4213XF-360" — look for 4-digit stator code
        m = re.search(r'\b(\d{4})\b', text)
        return m.group(1) if m else ""

    def _extract_thrust(self, text: str) -> str:
        m = re.search(r'(\d+(?:\.\d+)?)\s*[Kk][Gg]', text)
        if m:
            return f"{m.group(1)}kg"
        m = re.search(r'(\d+(?:\.\d+)?)\s*[Gg](?!\w)', text)
        return f"{m.group(1)}g" if m else ""

    def _extract_prop(self, text: str) -> str:
        m = re.search(r'(\d{1,2}[x×]\d{1,2}(?:\.\d)?)', text, re.IGNORECASE)
        return m.group(1) if m else ""
