"""
config.py — Central configuration for motor_scraper.
All paths, delays, and API keys are loaded from motor_scraper/.env
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env that lives INSIDE motor_scraper/
_env_path = Path(__file__).parent / ".env"
load_dotenv(_env_path)

# ─── Groq ─────────────────────────────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# ─── Output paths ─────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent
OUTPUT_DIR = BASE_DIR / "output"
OUTPUT_DIR.mkdir(exist_ok=True)
CACHE_DIR  = BASE_DIR / os.getenv("CACHE_DIR", "storage")
CACHE_DIR.mkdir(exist_ok=True)

# ─── HTTP settings ────────────────────────────────────────────────────────
CURL_IMPERSONATE            = "chrome120"   # Browser fingerprint to impersonate
REQUEST_DELAY_MIN           = float(os.getenv("REQUEST_DELAY_MIN", "0.1"))           # seconds (min wait between requests per domain)
REQUEST_DELAY_MAX           = float(os.getenv("REQUEST_DELAY_MAX", "0.3"))           # seconds
MAX_RETRIES                 = 3
REQUEST_TIMEOUT             = 30            # seconds
PLAYWRIGHT_GOTO_TIMEOUT     = int(os.getenv("PLAYWRIGHT_GOTO_TIMEOUT", "12000"))     # milliseconds
PLAYWRIGHT_SELECTOR_TIMEOUT = int(os.getenv("PLAYWRIGHT_SELECTOR_TIMEOUT", "8000")) # milliseconds

# ─── Available scraper sources ────────────────────────────────────────────
SOURCES = {
    "tmotor":      "T-Motor official store",
    "getfpv":      "GetFPV motor & ESC catalog",
    "rcbenchmark": "RCBenchmark public thrust-test CSVs",
    "emax":        "EMAX official motor pages",
    "speedybee":   "Speedybee motor catalog",
    "hobbyking":   "HobbyKing motor listings",
    "mad":         "MAD Components official store",
    "kdedirect":   "KDE Direct official store",
    "sunnysky":    "SunnySky official store",
}
