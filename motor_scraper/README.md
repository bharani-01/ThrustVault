# 🚁 Motor Scraper

Self-contained web scraper for drone motor, ESC, and propeller data.
Part of the **ThrustVault** project.

---

## Features

- 🛡️ **Bot-bypass**: `curl_cffi` (TLS fingerprint impersonation) → `cloudscraper` → `Playwright-stealth`
- 🤖 **Groq AI**: Uses `llama3-70b` to extract structured specs from messy product pages
- 📦 **Multi-source**: T-Motor, GetFPV, EMAX, Speedybee, RCBenchmark
- 💾 **Exports**: CSV and/or JSON to `output/`
- 🔁 **Deduplication**: by motor name + company

---

## Setup

```powershell
# 1. Navigate into motor_scraper
cd motor_scraper

# 2. Create virtual environment
python -m venv venv
venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Install Playwright browser (only needed for JS-heavy sites)
playwright install chromium

# 5. Add your Groq API key to .env
# Edit .env and replace: GROQ_API_KEY=your_groq_api_key_here
# Get a free key at: https://console.groq.com
```

---

## Usage

```powershell
# Run all scrapers (CSV output, with Groq AI)
python run.py --all

# Run a specific source
python run.py --source tmotor
python run.py --source getfpv emax

# Output as JSON
python run.py --all --format json

# Output both CSV and JSON
python run.py --all --format both

# Skip Groq AI (faster, no API key needed)
python run.py --all --no-groq

# Dry run — scrape but don't save files
python run.py --all --dry-run
```

---

## Available Sources

| Source | What it scrapes |
|--------|----------------|
| `tmotor` | T-Motor official motor catalog |
| `getfpv` | GetFPV motors, ESCs, propellers |
| `emax` | EMAX official motor/ESC catalog |
| `speedybee` | Speedybee motor/ESC catalog |
| `rcbenchmark` | Public thrust test CSVs (performance data) |

---

## Output

All files are saved to `output/`:

| File | Contents |
|------|----------|
| `motors_YYYYMMDD_HHMMSS.csv` | All scraped motors |
| `motors_YYYYMMDD_HHMMSS.json` | Same, as JSON |
| `performance_YYYYMMDD_HHMMSS.csv` | Thrust/RPM/efficiency test data |

---

## Project Structure

```
motor_scraper/
├── .env               ← Your Groq API key goes here
├── requirements.txt
├── config.py          ← All settings
├── run.py             ← CLI entry point
├── scrapers/          ← One file per source
├── parsers/           ← Data normalization + Groq AI
├── storage/           ← CSV/JSON exporters
├── utils/             ← Logger, rate limiter, dedup
└── output/            ← Scraped data files (auto-created)
```
