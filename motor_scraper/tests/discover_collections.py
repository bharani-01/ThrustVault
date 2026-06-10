import sys, json
sys.path.insert(0, 'd:/motor data/motor_scraper')
from scrapers.emax_scraper import EmaxScraper
from scrapers.speedybee_scraper import SpeedbeeeScraper

e = EmaxScraper()
s = SpeedbeeeScraper()

def test_url(scraper, url, label):
    r = scraper.fetch(url)
    if not r or not r.strip():
        print(f'FAIL {label}: no response')
        return
    try:
        data = json.loads(r)
        prods = data.get('products', [])
        titles = [p['title'] for p in prods[:2]]
        print(f'OK   {label}: {len(prods)} products - {titles}')
    except Exception as ex:
        print(f'ERR  {label}: {ex} | response[:80]={r[:80]}')

# EMAX
for col in ['brushless-motors', 'all', 'motors', 'fpv-motors']:
    test_url(e, f'https://emaxmodel.com/collections/{col}/products.json?limit=5&page=1', f'EMAX /collections/{col}')
test_url(e, 'https://emaxmodel.com/products.json?limit=5&page=1', 'EMAX /products.json')

# SpeedyBee  
for col in ['motors', 'all', 'brushless-motors', 'fpv-motors']:
    test_url(s, f'https://www.speedybee.com/collections/{col}/products.json?limit=5&page=1', f'SB   /collections/{col}')
test_url(s, 'https://www.speedybee.com/products.json?limit=5&page=1', 'SB   /products.json')
