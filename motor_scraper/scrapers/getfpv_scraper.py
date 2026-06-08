"""
scrapers/getfpv_scraper.py — GetFPV motor & ESC catalog scraper.

GetFPV uses Cloudflare — curl_cffi with Chrome impersonation handles this.
Falls back to Playwright-stealth if needed.
"""

from scrapers.base_scraper import BaseScraper
from utils.logger import get_logger

log = get_logger(__name__)


class GetFPVScraper(BaseScraper):
    name = "getfpv"
    base_url = "https://www.getfpv.com"

    MOTOR_URL  = "https://www.getfpv.com/motors.html"
    ESC_URL    = "https://www.getfpv.com/electronics/electronic-speed-controllers-esc.html"
    PROP_URL   = "https://www.getfpv.com/propellers.html"

    def scrape(self, query: str = "") -> list[dict]:
        results = []
        if query.strip():
            # GetFPV Magento search endpoint
            search_url = f"{self.base_url}/catalogsearch/result/?q={query.replace(' ', '+')}"
            log.info(f"[getfpv] Searching: {search_url}")
            results.extend(self._scrape_category(search_url, "motor", query=query))
        else:
            results.extend(self._scrape_category(self.MOTOR_URL, "motor"))
            results.extend(self._scrape_category(self.ESC_URL,   "esc"))
            results.extend(self._scrape_category(self.PROP_URL,  "propeller"))
        log.info(f"[getfpv] Total items scraped: {len(results)}")
        return results

    def _scrape_category(self, url: str, category: str, query: str = "") -> list[dict]:
        items = []
        page = 1
        while True:
            separator = "&" if "?" in url else "?"
            page_url = f"{url}{separator}p={page}"
            log.info(f"[getfpv] Scraping {category} page {page}: {page_url}")
            html = self.fetch(page_url)

            if not html:
                log.info(f"[getfpv] curl/cloud failed, trying Playwright...")
                html = self.fetch_with_browser(page_url, wait_selector=".product-item-info")

            if not html:
                break

            soup = self.parse(html)

            # GetFPV uses Magento — product items are in .product-item-info
            products = soup.select(".product-item-info, .product-item, li.item.product")
            if not products:
                log.info(f"[getfpv] No {category} items on page {page}, done.")
                break

            found = self._parse_items(products, category)
            items.extend(found)
            log.info(f"[getfpv] Page {page}: {len(found)} {category} items")

            next_btn = soup.select_one("a.next, li.next > a, .pages-item-next a")
            if not next_btn:
                break
            page += 1

        return items

    def _parse_items(self, products, category: str) -> list[dict]:
        results = []
        for item in products:
            try:
                name_el  = item.select_one(".product-item-name, .product-name, a.product-item-link")
                price_el = item.select_one(".price, .price-box .price")
                link_el  = item.select_one("a.product-item-link, a.product-item-photo, h2 a, h3 a")

                name  = name_el.get_text(strip=True)  if name_el  else ""
                price = price_el.get_text(strip=True) if price_el else ""
                href  = link_el.get("href", "")       if link_el  else ""
                link  = href if href.startswith("http") else self.base_url + href

                if not name:
                    continue

                record = {
                    "category":   category,
                    "name":       name,
                    "price":      price,
                    "link":       link,
                    "source":     "getfpv",
                    # Motor-specific fields (filled by Groq parser later)
                    "motor_name":            name if category == "motor" else "",
                    "company":               "",
                    "max_thrust":            "",
                    "recommended_esc":       "",
                    "recommended_propeller": "",
                    "link_motor":            link if category == "motor"    else "",
                    "link_esc":              link if category == "esc"       else "",
                    "link_propeller":        link if category == "propeller" else "",
                }
                results.append(record)
            except Exception as e:
                log.debug(f"[getfpv] Parse error: {e}")
        return results
