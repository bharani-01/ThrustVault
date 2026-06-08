"""
scrapers/emax_scraper.py — EMAX official motor catalog scraper.

EMAX is a major FPV motor brand. Scrapes emaxmodel.com product pages.
"""

from scrapers.base_scraper import BaseScraper
from utils.logger import get_logger

log = get_logger(__name__)


class EmaxScraper(BaseScraper):
    name = "emax"
    base_url = "https://emaxmodel.com"

    CATEGORY_URLS = [
        "https://emaxmodel.com/collections/brushless-motors",
        "https://emaxmodel.com/collections/esc",
    ]

    def scrape(self, query: str = "") -> list[dict]:
        results = []
        if query.strip():
            # Shopify search endpoint
            search_url = f"{self.base_url}/search?q={query.replace(' ', '+')}&type=product"
            log.info(f"[emax] Searching: {search_url}")
            results.extend(self._scrape_collection(search_url, category="motor"))
        else:
            for cat_url in self.CATEGORY_URLS:
                results.extend(self._scrape_collection(cat_url))
        log.info(f"[emax] Total items scraped: {len(results)}")
        return results

    def _scrape_collection(self, url: str, category: str = "") -> list[dict]:
        items = []
        page = 1
        if not category:
            category = "esc" if "esc" in url else "motor"

        while True:
            separator = "&" if "?" in url else "?"
            page_url = f"{url}{separator}page={page}"
            log.info(f"[emax] Scraping {category} page {page}")
            html = self.fetch(page_url)
            if not html:
                break

            soup = self.parse(html)
            # Shopify store — product cards
            products = soup.select(".product-item, .grid-product, .product-card, article.product")
            if not products:
                break

            for item in products:
                try:
                    name_el  = item.select_one(".product-item__title, .grid-product__title, h2, h3, .product-name")
                    price_el = item.select_one(".product-item__price, .grid-product__price, .price")
                    link_el  = item.select_one("a[href]")

                    name  = name_el.get_text(strip=True)  if name_el  else ""
                    price = price_el.get_text(strip=True) if price_el else ""
                    href  = link_el.get("href", "")       if link_el  else ""
                    link  = href if href.startswith("http") else self.base_url + href

                    if not name:
                        continue

                    items.append({
                        "category":              category,
                        "motor_name":            name if category == "motor" else "",
                        "company":               "EMAX",
                        "max_thrust":            "",
                        "recommended_esc":       "",
                        "recommended_propeller": "",
                        "price":                 price,
                        "link_motor":            link if category == "motor" else "",
                        "link_esc":              link if category == "esc"   else "",
                        "link_propeller":        "",
                        "source":                "emax_official",
                    })
                except Exception as e:
                    log.debug(f"[emax] Parse error: {e}")

            log.info(f"[emax] Page {page}: {len(items)} items so far")
            next_btn = soup.select_one("a[rel='next'], .pagination__next, li.next a")
            if not next_btn:
                break
            page += 1

        return items
