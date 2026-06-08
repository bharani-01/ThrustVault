"""
Quick diagnostic: fetch each site and show what HTML structure we get.
Run: .\venv\Scripts\python debug_fetch.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import requests

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

TESTS = [
    ("T-Motor search",    "https://store.tmotor.com/search",           {"q": "MN3508"}),
    ("T-Motor products",  "https://store.tmotor.com/products.json",    {"limit": 5}),
    ("EMAX products",     "https://emaxmodel.com/products.json",        {"limit": 5}),
    ("Speedybee products","https://www.speedybee.com/products.json",    {"limit": 5}),
    ("GetFPV search",     "https://www.getfpv.com/catalogsearch/result/?q=MN3508", {}),
    ("RCBenchmark index", "https://www.rcbenchmark.com/pages/series-1520-thrust-stand-dynamometer", {}),
]

for label, url, params in TESTS:
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"  URL: {url}")
    try:
        r = requests.get(url, params=params, headers=HEADERS, timeout=15)
        print(f"  STATUS: {r.status_code}")
        print(f"  Content-Type: {r.headers.get('content-type','')}")
        if r.status_code == 200:
            # Show first 800 chars
            preview = r.text[:800].replace('\n', ' ').strip()
            print(f"  PREVIEW: {preview}")
        else:
            print(f"  BODY: {r.text[:200]}")
    except Exception as e:
        print(f"  ERROR: {e}")
