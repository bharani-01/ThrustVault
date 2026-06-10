"""
scrapers/sunnysky_scraper.py — SunnySky official motor catalog scraper.

SunnySky (sunnyskyusa.com) manufactures a wide range of brushless motors
for UAVs, planes, and multirotors.

Scrapes:
  - https://sunnyskyusa.com/collections/multi-rotor-motors
  - https://sunnyskyusa.com/collections/x-series
  - https://sunnyskyusa.com/collections/v-series
"""

import re
from scrapers.base_scraper import BaseScraper
from utils.logger import get_logger

log = get_logger(__name__)


class SunnySkyScraper(BaseScraper):
    name = "sunnysky"
    base_url = "https://sunnyskyusa.com"

    CATALOG_URLS = [
        "https://sunnyskyusa.com/collections/multi-rotor-motors",
        "https://sunnyskyusa.com/collections/x-series",
        "https://sunnyskyusa.com/collections/v-series",
        "https://sunnyskyusa.com/collections/all",
    ]

    def scrape(self, query: str = "") -> list[dict]:
        results = []

        if query.strip():
            # Shopify search endpoint
            search_url = f"{self.base_url}/search?type=product&q={query.replace(' ', '+')}"
            log.info(f"[sunnysky] Searching: {search_url}")
            results.extend(self._scrape_collection(search_url, query))

        # Browse catalog pages for broader coverage
        for cat_url in self.CATALOG_URLS:
            results.extend(self._scrape_collection(cat_url, query))

        # Deduplicate by link
        seen = set()
        deduped = []
        for r in results:
            key = r.get("link_motor") or r.get("motor_name", "")
            if key and key not in seen:
                seen.add(key)
                deduped.append(r)

        log.info(f"[sunnysky] Total items scraped: {len(deduped)}")
        return deduped

    def _scrape_collection(self, url: str, query: str = "") -> list[dict]:
        items = []
        page = 1

        while True:
            sep = "&" if "?" in url else "?"
            page_url = url if page == 1 else f"{url}{sep}page={page}"

            log.info(f"[sunnysky] Fetching page {page}: {page_url}")
            html = self.fetch(page_url)
            if not html:
                break

            soup = self.parse(html)

            # Shopify product grid
            products = soup.select(
                ".product-item, .grid__item, .grid-product, "
                ".product-card, article.product, li.product-item, "
                ".collection-product-card"
            )

            if not products:
                # Fallback: look for any product links
                products = soup.select("a[href*='/products/']")

            if not products:
                break

            found_on_page = 0
            for item in products:
                try:
                    name_el = item.select_one(
                        ".product-item__title, .grid-product__title, "
                        ".product-card__title, .product-title, "
                        "h2, h3, h4, [class*='title'], [class*='name']"
                    )
                    price_el = item.select_one(
                        ".product-item__price, .grid-product__price, "
                        ".price, [class*='price']"
                    )
                    link_el = item if item.name == "a" else item.select_one("a[href]")

                    name = name_el.get_text(strip=True) if name_el else ""
                    # If item itself is an <a>, try its text
                    if not name and item.name == "a":
                        name = item.get_text(strip=True)

                    price = price_el.get_text(strip=True) if price_el else ""
                    href = link_el.get("href", "") if link_el else ""

                    if not name or len(name) < 3:
                        continue

                    # Skip non-motor results (accessories, etc.)
                    skip_keywords = ["prop", "stand", "mount", "adapter", "cable", "case", "bag"]
                    if any(kw in name.lower() for kw in skip_keywords):
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

                    items.append({
                        "category":              "motor",
                        "motor_name":            name,
                        "company":               "SunnySky",
                        "max_thrust":            self._extract_thrust(name),
                        "recommended_esc":       "",
                        "recommended_propeller": self._extract_prop(name),
                        "price":                 price,
                        "link_motor":            full_link,
                        "link_esc":              "",
                        "link_propeller":        "",
                        "source":                "sunnysky_official",
                        "kv_rating":             self._extract_kv(name),
                        "stator_size":           self._extract_stator(name),
                    })
                    found_on_page += 1

                except Exception as e:
                    log.debug(f"[sunnysky] Parse error: {e}")

            log.info(f"[sunnysky] Page {page}: {found_on_page} items found")

            # Shopify next-page link
            next_btn = soup.select_one(
                "a[rel='next'], .pagination__next, li.next a, "
                "a[aria-label='Next page'], [class*='pagination'] a:last-child"
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
        # SunnySky uses "X2216", "X4112S" etc. — 4-digit stator
        m = re.search(r'[Xx](\d{4})', text)
        if m:
            return m.group(1)
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
