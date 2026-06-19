import requests
import re
from bs4 import BeautifulSoup
from scrapers.sunnysky_scraper import SunnySkyScraper

s = SunnySkyScraper()
url = 'https://sunnyskyusa.com/search?type=product&q=V5210'
r = requests.get(url)
soup = BeautifulSoup(r.text, 'html.parser')

products = soup.select(
    ".product-item, .grid__item, .grid-product, "
    ".product-card, article.product, li.product-item, "
    ".collection-product-card"
)
print("Products by main selectors:", len(products))
if not products:
    products = soup.select("a[href*='/products/']")
    print("Products by fallback selector:", len(products))

for idx, item in enumerate(products):
    print(f"\n--- Item {idx} ---")
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
        if not name and item.name == "a":
            name = item.get_text(strip=True)

        price = price_el.get_text(strip=True) if price_el else ""
        href = link_el.get("href", "") if link_el else ""

        print(f"Parsed Name: {repr(name)}")
        print(f"Parsed Price: {repr(price)}")
        print(f"Parsed Href: {repr(href)}")

        if not name or len(name) < 3:
            print("SKIPPED: Name too short or empty")
            continue

        skip_keywords = ["prop", "stand", "mount", "adapter", "cable", "case", "bag"]
        if any(kw in name.lower() for kw in skip_keywords):
            print("SKIPPED: Matches skip keywords")
            continue

        query = "V5210"
        if query.strip():
            q_lower = query.lower()
            name_lower = name.lower()
            href_lower = href.lower()
            tokens = re.split(r'[\s\-_/]+', q_lower)
            tokens = [t for t in tokens if len(t) >= 2]
            print("Tokens:", tokens)
            if not any(t in name_lower or t in href_lower for t in tokens):
                print("SKIPPED: Query tokens do not match name or href")
                continue

        print("ACCEPTED!")
    except Exception as e:
        print("EXCEPTION:", e)
