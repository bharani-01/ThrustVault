"""
scrapers/mad_scraper.py — MAD Components official motor catalog scraper.

MAD Components (mad-motor.com) is a major UAV motor manufacturer
known for high-power industrial/commercial drone motors.

Scrapes:
  - https://www.mad-motor.com/category-motors.html (catalog index)
  - Direct search URL
"""

import re
from scrapers.base_scraper import BaseScraper
from utils.logger import get_logger

log = get_logger(__name__)


class MADScraper(BaseScraper):
    name = "mad"
    base_url = "https://mad-motor.com"

    CATALOG_URLS = [
        "https://mad-motor.com/collections/uav-motors",
        "https://mad-motor.com/collections/esc",
    ]

    def scrape(self, query: str = "") -> list[dict]:
        results = []
        if query.strip():
            # MAD uses a search endpoint
            search_url = f"{self.base_url}/search?type=product&q={query.replace(' ', '+')}"
            log.info(f"[mad] Searching: {search_url}")
            results.extend(self._scrape_page(search_url, query))

        # Only browse catalog categories if query is empty or search returned nothing
        if not results:
            for cat_url in self.CATALOG_URLS:
                results.extend(self._scrape_page(cat_url, query))

        # Deduplicate by link
        seen = set()
        deduped = []
        for r in results:
            key = r.get("link_motor") or r.get("motor_name", "")
            if key and key not in seen:
                seen.add(key)
                deduped.append(r)

        log.info(f"[mad] Total items scraped: {len(deduped)}")
        return deduped

    def _scrape_page(self, url: str, query: str = "") -> list[dict]:
        items = []
        page = 1

        while True:
            page_url = f"{url}&page={page}" if "?" in url else f"{url}?page={page}"
            if page == 1:
                page_url = url  # first page has no ?page=1 param on some sites

            log.info(f"[mad] Fetching page {page}: {page_url}")
            html = self.fetch(page_url)
            if not html:
                log.info(f"[mad] No response for page {page}, stopping.")
                break

            soup = self.parse(html)

            # MAD uses various product card layouts
            products = soup.select(
                ".product-item, .product_item, .list_products_item, .themes_prod, "
                "article.product, .product-card, "
                ".product-list-item, li.product"
            )

            if not products:
                # Try generic link-based extraction
                products = soup.select("a[href*='/products/'], a[href*='/motor']")

            if not products:
                log.info(f"[mad] No products found on page {page}.")
                break

            found_on_page = 0
            for item in products:
                try:
                    # Name selectors
                    name_el = item.select_one(
                        ".product-title, .product-name, h2, h3, h4, "
                        ".item-title, .name, [class*='title']"
                    )
                    price_el = item.select_one(
                        ".price, .product-price, [class*='price'], .amount"
                    )
                    link_el = item if item.name == "a" else item.select_one("a[href]")

                    name = name_el.get_text(strip=True) if name_el else ""
                    price = price_el.get_text(strip=True) if price_el else ""
                    href = link_el.get("href", "") if link_el else ""

                    if not name or len(name) < 3:
                        continue

                    # Filter by query if provided
                    if query.strip():
                        q_lower = query.lower()
                        name_lower = name.lower()
                        # Check if any meaningful token from query matches
                        tokens = re.split(r'[\s\-_/]+', q_lower)
                        tokens = [t for t in tokens if len(t) >= 2]
                        if not any(t in name_lower or t in href.lower() for t in tokens):
                            continue

                    full_link = href if href.startswith("http") else self.base_url + href
                    category = "motor" if "esc" not in (href + name).lower() else "esc"

                    items.append({
                        "category":              category,
                        "motor_name":            name if category == "motor" else "",
                        "company":               "MAD Components",
                        "max_thrust":            self._extract_thrust(name),
                        "recommended_esc":       "",
                        "recommended_propeller": self._extract_prop(name),
                        "price":                 price,
                        "link_motor":            full_link if category == "motor" else "",
                        "link_esc":              full_link if category == "esc" else "",
                        "link_propeller":        "",
                        "source":                "mad_official",
                        "kv_rating":             self._extract_kv(name),
                        "stator_size":           self._extract_stator(name),
                    })
                    found_on_page += 1

                except Exception as e:
                    log.debug(f"[mad] Parse error: {e}")

            log.info(f"[mad] Page {page}: {found_on_page} matching items")

            # Check for next page
            next_btn = soup.select_one(
                "a[rel='next'], .pagination__next, li.next a, "
                "a.next-page, [class*='pagination'] a[aria-label*='Next']"
            )
            if not next_btn or found_on_page == 0:
                break
            page += 1
            if page > 10:  # Safety cap
                break

        return items

    # ── Field extractors ──────────────────────────────────────────────────────
    def _extract_kv(self, text: str) -> str:
        m = re.search(r'(\d{2,5})\s*[Kk][Vv]', text)
        return f"{m.group(1)}KV" if m else ""

    def _extract_stator(self, text: str) -> str:
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
