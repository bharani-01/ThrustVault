"""
scrapers/google/google_scraper.py
===================================
Universal motor scraper using DuckDuckGo search.

How it works
────────────
1. Takes any motor query (e.g. "T-Motor U7 V2.0 KV420")
2. Searches DuckDuckGo → gets top result URLs
3. Falls back to Bing, then direct manufacturer URLs
4. Scrapes each URL using the generic page_extractor
5. Returns motor records + performance data

No API key needed. Completely free.
"""

import re
import concurrent.futures
from typing import Optional
from urllib.parse import unquote, parse_qs, urlparse

from scrapers.base_scraper import BaseScraper
from scrapers.google.page_extractor import extract_page
from utils.logger import get_logger

log = get_logger(__name__)

RESULTS_PER_QUERY = 5

# Trusted manufacturer / review sites
PRIORITY_SITES = [
    'store.tmotor.com',
    'mad-motor.com',
    'kdedirect.com',
    'emaxmodel.com',
    'getfpv.com',
    'rcbenchmark.com',
    'rcgroups.com',
    'sunnyskyusa.com',
    'hobbywing.com',
]

# Irrelevant domains to skip
SKIP_DOMAINS = [
    'amazon', 'ebay', 'aliexpress', 'alibaba', 'lazada', 'shopee',
    'youtube', 'facebook', 'instagram', 'twitter', 'reddit',
    'pinterest', 'banggood', 'dhgate',
]


class GoogleScraper(BaseScraper):
    """
    Universal scraper powered by DuckDuckGo search.
    Searches → finds top pages → extracts motor specs generically.
    """
    name = 'google'
    base_url = 'https://html.duckduckgo.com'
    RESULTS_PER_QUERY = RESULTS_PER_QUERY

    # ── Shopify stores — use JSON API instead of HTML scraping ───────────────
    SHOPIFY_STORES = {
        'emaxmodel.com':    'https://emaxmodel.com',
        'sunnyskyusa.com':  'https://sunnyskyusa.com',
        'kdedirect.com':    'https://www.kdedirect.com',
        'www.speedybee.com':'https://www.speedybee.com',
    }

    def scrape(self, query: str = '') -> list[dict]:
        if not query.strip():
            log.info('[ddg] No query — skipping')
            return []

        urls = self._search(query)
        if not urls:
            log.warning(f'[ddg] No URLs found for "{query}"')
            return []

        log.info(f'[ddg] Scraping {len(urls)} URLs for "{query}"')

        all_motors, all_perf = [], []
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(urls)) as pool:
            futures = {pool.submit(self._scrape_url, url, query): url for url in urls}
            try:
                for future in concurrent.futures.as_completed(futures, timeout=60):
                    url = futures[future]
                    try:
                        motors, perf = future.result()
                        all_motors.extend(motors)
                        all_perf.extend(perf)
                    except Exception as e:
                        log.warning(f'[ddg] Error scraping {url}: {e}')
            except concurrent.futures.TimeoutError:
                log.warning('[ddg] Some URLs timed out — returning partial results')

        log.info(f'[ddg] Total: {len(all_motors)} motor records, {len(all_perf)} perf points')
        return all_motors + all_perf

    # ── Search chain ──────────────────────────────────────────────────────────

    def _search(self, query: str) -> list[str]:
        """
        Search chain:
        1. DuckDuckGo HTML
        2. Bing HTML
        3. Direct manufacturer URLs (always works)
        """
        search_q = f'{query.strip()} motor specifications'

        # 1. DuckDuckGo
        urls = self._duckduckgo(search_q)
        if urls:
            log.info(f'[ddg] DuckDuckGo: {len(urls)} URLs')
            return urls

        # 2. Bing
        urls = self._bing(search_q)
        if urls:
            log.info(f'[ddg] Bing: {len(urls)} URLs')
            return urls

        # 3. Direct manufacturer URLs
        log.info(f'[ddg] Using direct manufacturer URLs')
        return self._direct_urls(query)

    def _duckduckgo(self, search_q: str) -> list[str]:
        url = f'https://html.duckduckgo.com/html/?q={search_q.replace(" ", "+")}'
        log.info(f'[ddg] Searching: {search_q}')
        html = self.fetch(url)
        if not html:
            return []

        soup = self.parse(html)
        results = []

        # Try multiple selectors — DDG changes their HTML structure
        for selector in [
            'a.result__a',
            'h2.result__title a',
            '.result__url',
            'a[data-testid="result-title-a"]',
        ]:
            for a in soup.select(selector):
                href = a.get('href', '')
                # Unwrap DDG redirect links
                if 'duckduckgo.com/l/?uddg=' in href or 'duckduckgo.com/l/?kh=' in href:
                    parsed = urlparse(href)
                    href = unquote(parse_qs(parsed.query).get('uddg', [''])[0])
                if href.startswith('http') and not any(s in href for s in SKIP_DOMAINS):
                    if href not in results:
                        results.append(href)
            if results:
                break

        return self._rank(results)[:self.RESULTS_PER_QUERY]

    def _bing(self, search_q: str) -> list[str]:
        url = f'https://www.bing.com/search?q={search_q.replace(" ", "+")}'
        log.info(f'[ddg/bing] Searching Bing: {search_q}')
        html = self.fetch(url)
        if not html:
            return []

        soup = self.parse(html)
        results = []
        for a in soup.select('li.b_algo h2 a, .b_algo a.tilk, #b_results .b_algo a'):
            href = a.get('href', '')
            if href.startswith('http') and not any(s in href for s in SKIP_DOMAINS):
                if href not in results:
                    results.append(href)
                    if len(results) >= self.RESULTS_PER_QUERY:
                        break

        return self._rank(results)[:self.RESULTS_PER_QUERY]

    def _direct_urls(self, query: str) -> list[str]:
        """
        Construct direct search URLs for known manufacturer sites.
        Always works — no scraping of search engines required.
        """
        q = query.replace(' ', '+')
        q_lower = query.lower()
        urls = []

        if any(x in q_lower for x in ['t-motor', 'tmotor', 'mn', 'u7', 'u8', 'u10', 'u12', 'p80', 'p120']):
            urls.append(f'https://store.tmotor.com/search.php?keywords={q}')

        if 'kde' in q_lower:
            urls.append(f'https://www.kdedirect.com/search?type=product&q={q}')

        if 'mad' in q_lower:
            urls.append(f'https://www.mad-motor.com/search.html?search_query={q}')

        if any(x in q_lower for x in ['emax', 'rs22', 'eco 22']):
            urls.append(f'https://emaxmodel.com/search?type=product&q={q}')

        if any(x in q_lower for x in ['sunnysky', 'x52', 'v52']):
            urls.append(f'https://sunnyskyusa.com/search?type=product&q={q}')

        # GetFPV as universal fallback retailer
        urls.append(f'https://www.getfpv.com/catalogsearch/result/?q={q}')

        return urls[:self.RESULTS_PER_QUERY]

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _rank(self, urls: list[str]) -> list[str]:
        """Put manufacturer/trusted sites first."""
        priority, others = [], []
        for url in urls:
            domain = re.sub(r'^https?://(www\.)?', '', url).split('/')[0]
            if any(p in domain for p in PRIORITY_SITES):
                priority.append(url)
            else:
                others.append(url)
        return priority + others

    def _scrape_url(self, url: str, query: str) -> tuple[list[dict], list[dict]]:
        """
        Route to the right extractor based on the target site:
        - KDE Direct product pages  → specs + Excel performance data
        - Shopify stores             → /products.json API
        - T-Motor, GetFPV, others   → generic HTML page extractor
        """
        domain = re.sub(r'^https?://(www\.)?', '', url).split('/')[0]

        # ── KDE Direct product page → full specs + XLSX performance data ──────
        if 'kdedirect.com' in domain and '/products/' in url:
            from scrapers.google.kde_product_scraper import scrape_kde_product
            return scrape_kde_product(url)

        # ── Shopify JSON API ──────────────────────────────────────────────────
        base = self.SHOPIFY_STORES.get(domain) or self.SHOPIFY_STORES.get('www.' + domain)
        if base:
            return self._scrape_shopify(base, query, url)

        # ── Generic HTML extractor ────────────────────────────────────────────
        html = self.fetch(url)
        if not html:
            return [], []
        soup = self.parse(html)
        return extract_page(soup, url, query)

    def _scrape_shopify(self, base_url: str, query: str, source_url: str) -> tuple[list[dict], list[dict]]:
        """
        Use Shopify's /products.json endpoint to search a store.
        Uses requests directly (BaseScraper.fetch can't handle JSON APIs).
        """
        import requests as _req
        import json as _json

        q_lower = query.lower()
        # Every word of the input must appear in the product title
        words = q_lower.split()

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
            'Accept': 'application/json',
        }

        motors = []
        all_perf = []
        page = 1
        while page <= 10:  # scan up to 10 pages = 2500 products
            endpoint = f'{base_url}/products.json?limit=250&page={page}'
            try:
                r = _req.get(endpoint, headers=headers, timeout=15)
                if r.status_code != 200:
                    log.debug(f'[ddg/shopify] {endpoint} → HTTP {r.status_code}')
                    break
                data = r.json()
            except Exception as e:
                log.debug(f'[ddg/shopify] Request error {base_url}: {e}')
                break

            products = data.get('products', [])
            if not products:
                break

            for p in products:
                title = (p.get('title') or '')
                title_lower = title.lower()

                # All words of the query must appear in the title
                if words and not all(w in title_lower for w in words):
                    continue
                # Skip non-motor products
                if any(s in title_lower for s in ['propeller', 'prop guard', 'battery', 'charger', 'cable', 'frame', 'vtx', 'camera', 'goggle', 'bag', 'accessories']):
                    continue

                handle   = p.get('handle', '')
                link     = f'{base_url}/products/{handle}'
                variants = p.get('variants', [])
                price    = f"${variants[0].get('price', '')}" if variants else ''

                kv_m     = re.search(r'(\d{3,5})\s*[Kk][Vv]', title)
                kv       = f"{kv_m.group(1)}KV" if kv_m else ''
                stator_m = re.search(r'\b(\d{4})\b', title)
                stator   = stator_m.group(1) if stator_m else ''

                product_type = (p.get('product_type') or '').lower()
                is_esc = 'esc' in title_lower or 'esc' in product_type

                if 'kdedirect.com' in base_url and not is_esc:
                    from scrapers.google.kde_product_scraper import scrape_kde_product
                    try:
                        kde_motors, kde_perf = scrape_kde_product(link)
                        if kde_motors:
                            motors.extend(kde_motors)
                            all_perf.extend(kde_perf)
                            continue
                    except Exception as e:
                        log.warning(f'[ddg/shopify] Failed to scrape KDE product {link}: {e}')

                motors.append({
                    'category':              'esc' if is_esc else 'motor',
                    'motor_name':            title,
                    'company':               p.get('vendor', ''),
                    'kv_rating':             kv,
                    'stator_size':           stator,
                    'max_thrust':            '',
                    'recommended_esc':       '',
                    'recommended_propeller': '',
                    'price':                 price,
                    'link_motor':            link if not is_esc else '',
                    'link_esc':              link if is_esc else '',
                    'link_propeller':        '',
                    'source':                'web_search',
                    'source_url':            source_url,
                })

            if len(products) < 250:
                break  # last page
            page += 1

        log.info(f'[ddg/shopify] {base_url}: {len(motors)} matching motors (query: {query!r})')
        return motors, all_perf

    def _build_search_query(self, motor_name: str) -> str:
        return f'{motor_name.strip()} motor specifications'


# ── Stator code utilities (used by api.py for cross-brand search) ─────────────

def parse_stator_code(motor_name: str) -> Optional[tuple[int, int]]:
    """
    Extract (diameter_mm, height_mm) from motor name's 4-digit stator code.

    Examples:
      'MN3508 KV380'  → (35, 8)
      'KDE4215XF-465' → (42, 15)
      '5008 IPE V3'   → (50, 8)
      'RS2205'        → (22, 5)
      'U7 V2.0 KV420' → None
    """
    m = re.search(r'(?<![A-Za-z\d])(?:[A-Za-z]{1,5})?(\d{2})(\d{2})(?!\d)', motor_name)
    if m:
        d, h = int(m.group(1)), int(m.group(2))
        if 15 <= d <= 100 and 3 <= h <= 40:
            return d, h

    m = re.search(r'\b(\d{2})(\d{2})\b', motor_name)
    if m:
        d, h = int(m.group(1)), int(m.group(2))
        if 15 <= d <= 100 and 3 <= h <= 40:
            return d, h

    return None


def stator_to_thrust_class(d_mm: int, h_mm: int) -> str:
    vol = d_mm * d_mm * h_mm
    if vol < 5000:   return '< 0.5 kg'
    if vol < 10000:  return '0.5–1 kg'
    if vol < 20000:  return '1–2 kg'
    if vol < 32000:  return '2–4 kg'
    if vol < 48000:  return '4–6 kg'
    if vol < 70000:  return '6–9 kg'
    return '> 9 kg'
