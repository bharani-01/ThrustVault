# Developer Guide — ThrustVault Scraper

**Document Version**: 1.3.0  

**Target Audience**: Lead Engineer, Backend Developers, Quality Assurance Engineers, Integration Specialists

---

## 1. Codebase Directory Layout & Modules Description

```
motor_scraper/
│
├── api.py                    # Flask server, SSE routing, and job runner
├── config.py                 # Central configurations & env variable loader
├── run.py                    # CLI script for offline extraction
├── requirements.txt          # Python dependency list
│
├── scrapers/                 # Web Scraping Modules
│   ├── base_scraper.py       # Scraper interface & HTTP connection fallbacks
│   ├── tmotor_scraper.py     # T-Motor crawler (pre-filtering, table parser)
│   ├── getfpv_scraper.py     # GetFPV crawler (Playwright fallback, Magento)
│   ├── emax_scraper.py       # EMAX crawler (Shopify)
│   ├── speedybee_scraper.py  # Speedybee crawler (Shopify)
│   └── rcbenchmark_scraper.py# RCBenchmark crawler (CSV test log downloads)
│
├── parsers/                  # Spec extraction & normalization
│   ├── motor_parser.py       # String cleanup & unit extraction
│   └── groq_parser.py        # Groq Llama3 spec extraction pipeline
│
├── storage/                  # Persistence handlers
│   └── csv_storage.py        # CSV/JSON writers with UTF-8 BOM
│
├── utils/                    # Utility components
│   ├── logger.py             # Custom colored logger
│   ├── rate_limiter.py       # Per-domain random jitter throttle
│   └── dedup.py              # Record deduplication engine
│
└── output/                   # Auto-generated CSV and JSON reports
```

---

### 1.1 Core File Descriptions

#### `api.py`
Exposes the web platform interface. It handles incoming requests, spins up the concurrent orchestrator queue, monitors threads, and streams logs back to the front-end dashboard using server-sent events (SSE).
* **Important classes/functions**: `run_scrape_job`, `stream`, `export_job_csv`, `start_scrape`.

#### `config.py`
Central config engine. Loads key credentials and path parameters from `.env` using python-dotenv.
* **Important variables**: `GROQ_API_KEY`, `REQUEST_DELAY_MIN`, `REQUEST_DELAY_MAX`, `PLAYWRIGHT_GOTO_TIMEOUT`, `PLAYWRIGHT_SELECTOR_TIMEOUT`.

#### `scrapers/base_scraper.py`
Abstract base class defining the scraping interface. Incorporates connection recovery loops, UA rotations, TLS spoofing, and JavaScript rendering fallbacks.
* **Important methods**: `fetch`, `fetch_with_browser`, `parse`.

#### `parsers/groq_parser.py`
Controls the integration with Groq's high-speed AI completions API. Contains prompt templates and response validators.
* **Important methods**: `extract_motor_specs`, `enrich_motor_record`, `summarize_batch`.

#### `utils/rate_limiter.py`
Protects scrapers from triggering security traps on vendor servers by maintaining a strict, jitter-added, per-domain request delay.
* **Important functions**: `wait_for_domain`.

---

## 2. Setting Up the Development Environment

### 2.1 Dependencies Installation
Ensure Python 3.10+ is installed on your system. Run:

```bash
# Clone the repository and navigate to the project
cd motor_scraper

# Create a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate

# Install requirements
pip install -r requirements.txt

# Install Playwright browser binaries
playwright install chromium
```

---

### 2.2 Environment Configuration

Create a `.env` file in the root of the `motor_scraper/` folder:

```ini
# Groq API key for spec extraction & batch summaries
GROQ_API_KEY=gsk_your_real_api_key_here

# Groq Model
GROQ_MODEL=llama-3.3-70b-versatile

# Rate Limit Overrides (use 0.0 for development/tests)
REQUEST_DELAY_MIN=0.1
REQUEST_DELAY_MAX=0.3

# Playwright Browser Timeouts (in milliseconds)
PLAYWRIGHT_GOTO_TIMEOUT=12000
PLAYWRIGHT_SELECTOR_TIMEOUT=8000
```

---

## 3. How to Write a New Scraper

To add a new crawler source (e.g. `hobbyking`), follow this recipe:

### 3.1 Create the Scraper Module
Create `scrapers/hobbyking_scraper.py`. Inherit from `BaseScraper` and implement the `scrape` method:

```python
from scrapers.base_scraper import BaseScraper
from utils.logger import get_logger

log = get_logger(__name__)

class HobbyKingScraper(BaseScraper):
    name = "hobbyking"
    base_url = "https://hobbyking.com"

    def scrape(self, query: str = "") -> list[dict]:
        results = []
        # 1. Fetch content
        url = f"{self.base_url}/search?q={query}"
        html = self.fetch(url) # Automatically uses fallbacks, headers & rate limiters
        
        if not html:
            # Fallback to Playwright if plain HTTP gets blocked
            html = self.fetch_with_browser(url, wait_selector=".product-card")
            
        if not html:
            return results

        # 2. Parse content
        soup = self.parse(html)
        products = soup.select(".product-card")
        
        for item in products:
            # Extract and parse specs into a standard dict
            # ...
            results.append({
                "motor_name": "...",
                "company": "HobbyKing",
                "max_thrust": "...",
                "recommended_esc": "...",
                "recommended_propeller": "...",
                "link_motor": "...",
                "source": "hobbyking",
            })
            
        return results
```

---

### 3.2 Register the Scraper

Add your new scraper to `config.py` in `SOURCES` and `_get_scraper` in `api.py` / `run.py`:

```python
# In config.py:
SOURCES = {
    # ...
    "hobbyking": "HobbyKing listings",
}

# In api.py:
def _get_scraper(name: str):
    # ...
    elif name == "hobbyking":
        from scrapers.hobbyking_scraper import HobbyKingScraper
        return HobbyKingScraper()
```

---

## 4. Verification & Testing Workflows

### 4.1 CLI Scrape Jobs
Verify scraper output directly from the terminal:

```bash
# Dry run a specific scraper with query filtering
python run.py --source tmotor --query "MN3508" --dry-run
```

---

### 4.2 API Integration Testing

Use the programmatic test suite to verify the REST backend:

```bash
# Start Flask locally
python api.py

# Run the test job script (in a separate terminal)
python C:\Users\bhara\.gemini\antigravity-ide\brain\44303753-c3e5-445a-9617-21fb9f378a2c\scratch\debug_scrape_job.py
```

---

## 5. Performance Tuning & Best Practices

1. **Keep Rate Limits Low in Dev**: Set `REQUEST_DELAY_MIN=0.0` and `REQUEST_DELAY_MAX=0.0` inside your dev `.env` file to accelerate iteration.

2. **Pre-Filter Aggressively**: Always verify titles/links against query terms before dispatching detail page crawls.

3. **Use Thread Pools**: When writing loops that hit multiple URLs or API endpoints, use `concurrent.futures.ThreadPoolExecutor` to execute them in parallel.

4. **Clean up DOM Elements**: When parsing complex tables, propagate rowspans and colspans to ensure specifications arrays remain dense and align correctly with performance records.

---

## 6. Docker deployment configuration

Deploying ThrustVault in production requires containerization. Below is the multi-stage build script:

```dockerfile
# Production Dockerfile
FROM python:3.10-slim-bullseye

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    gnupg \
    libgconf-2-4 \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright Chromium driver
RUN playwright install chromium
RUN playwright install-deps

COPY . .

EXPOSE 5050
ENV PORT 5050

CMD ["gunicorn", "--bind", "0.0.0.0:5050", "--workers", "4", "--threads", "8", "--timeout", "120", "api:app"]
```

---

## 7. Troubleshooting & Recovery Procedures

### 7.1 Playwright Initialization Crashes
If you get `playwright.node_modules.executableNotFound` or system crashes:
* **Fix**: Re-run browser installations with system dependencies:
  ```bash
  playwright install chromium
  playwright install-deps
  ```

---

### 7.2 Cloudflare Blocking Errors

If you see repeated `403 Forbidden` or Cloudflare challenge pages:
* **Check**: Check logs to verify which fallback layer failed.
* **Mitigation**: Update `.env` to increase request delay times (`REQUEST_DELAY_MIN=2.0`, `REQUEST_DELAY_MAX=5.0`) to avoid IP blocking, or configure a proxy rotation middleware in `base_scraper.py`.

---

### 7.3 Groq API Rate Limit Failures

If you see `RateLimitError` (HTTP 429) during AI enrichment:
* **Check**: Verify token and request limits on your Groq console.
* **Fix**: Reduce parallel workers (`max_workers` in `api.py` Groq enrichment block) to reduce concurrent token usage, or switch to a lower tier model (like `llama-3.1-8b-instant`) in your `.env` file.

---

## 8. Appendix: CLI Argument Matrix

Below is a detailed matrix of the arguments accepted by the orchestrator CLI (`run.py`):

| Argument | Flag | Allowed Values | Default | Description |
|:---|:---|:---|:---|:---|
| `--sources` | `-s` | `tmotor`, `getfpv`, `emax`, `speedybee`, `rcbenchmark` | All sources | List of sources to query. |
| `--query` | `-q` | String | `""` | Search query for specific motor models. |
| `--format` | `-f` | `csv`, `json`, `both` | `csv` | Serialization format. |
| `--no-groq` | — | Boolean (Flag) | `False` | Disables Groq AI enrichments. |
| `--dry-run` | `-d` | Boolean (Flag) | `False` | Simulates run without writing files to storage. |

---

## 9. Appendix: Comprehensive Setup Checklist for QA Engineers

Follow this checklist step-by-step to verify deployment builds before moving them to production releases:

### Step 1: Sandbox Initialization
* [ ] Verify Python 3.10 is installed by running `python --version`.
* [ ] Create sandbox virtual environment: `python -m venv venv`.
* [ ] Activate environment and ensure the shell indicator displays `(venv)`.

### Step 2: Install Libraries
* [ ] Run `pip install -r requirements.txt`.
* [ ] Verify that libraries like `Flask`, `beautifulsoup4`, `requests`, `curl_cffi`, and `groq` are successfully installed without conflicts.
* [ ] Run `playwright install chromium`.

### Step 3: Local Configuration
* [ ] Create `.env` file in the root folder.
* [ ] Insert a valid Groq API key into `GROQ_API_KEY`.
* [ ] Set `REQUEST_DELAY_MIN=0.0` and `REQUEST_DELAY_MAX=0.0` for high-speed local testing.

### Step 4: CLI Execution Checks
* [ ] Run `python run.py -s tmotor -q "MN3508" -d`.
* [ ] Verify console displays T-Motor results extraction and logs "Done".

### Step 5: Web UI Verification
* [ ] Start the local server: `python api.py`.
* [ ] Open a web browser and navigate to `http://localhost:5050`.
* [ ] Verify the header badge shows `● IDLE`.
* [ ] Enter `MN3508 KV380` in the input field.
* [ ] Click **Scrape Now** and ensure the status changes to `● RUNNING` and logs start streaming.
* [ ] Scroll down and verify the performance test points display grouped collapsible tables.
* [ ] Click **Download Reference CSV** and check that a CSV file is generated containing correct headers and values.

---

## 10. API Specification & Route Reference

This section details all public REST API endpoints exposed by the Flask server in `api.py`.

### 10.1 POST `/scrape`
Spawns a background worker thread to execute scraping across chosen sources.
* **HTTP Method**: `POST`
* **Content-Type**: `application/json`
* **Request Payload Example**:
  ```json
  {
    "motor": "MN3508 KV380",
    "sources": ["tmotor", "rcbenchmark"],
    "use_groq": false
  }
  | Field | Data Type | Required | Description |
  |:---|:---|:---|:---|
  | `motor` | String | No | The search query target. If empty, scrapes broad listings. |
  | `sources` | Array of Strings | No | Sources list. Defaults to all active scrapers. |
  | `use_groq` | Boolean | No | Enables LLM spec enrichment. Defaults to true. |
  ```
* **Success Response (HTTP 200)**:
  ```json
  {
    "job_id": "8a329d5b-43d9-482a-a92c-15a0cbb192b0",
    "status": "started"
  }
  ```

### 10.2 GET `/stream/<job_id>`
Establishes a long-running Server-Sent Events (SSE) log output channel.
* **HTTP Method**: `GET`
* **Headers Response**:
  ```http
  Content-Type: text/event-stream
  Cache-Control: no-cache
  X-Accel-Buffering: no
  ```
* **Event Message Formats**:
  * **log**: Stream logs printed in real-time by scraper modules.
    `data: {"message": "🔍 Scraping [tmotor]...", "level": "source", "ts": "02:02:20"}`
  * **results**: Stream containing the finalized motor and curve listings.
    `data: {"motors": [...], "performance": [...]}`
  * **ai_summary**: Contains the final batch summary computed by Groq LLM.
    `data: {"summary": "..."}`
  * **done**: Dispatched when thread execution terminates successfully.
    `data: {"total": 36}`
  * **error**: Dispatched when a critical thread failure halts the pipeline.
    `data: {"message": "..."}`
  * **end**: Final event indicating stream closed.
    `data: {}`

### 10.3 GET `/results/<job_id>`
Retrieves static completed scraping outcomes from memory.
* **HTTP Method**: `GET`
* **Success Response (HTTP 200)**:
  ```json
  {
    "status": "done",
    "query": "MN3508 KV380",
    "motors": [...],
    "performance": [...]
  }
  ```
* **Error Response (HTTP 404)**:
  ```json
  {
    "error": "Job not found"
  }
  ```

### 10.4 GET `/export/<job_id>`
Downloads reference CSV report containing direct links.
* **HTTP Method**: `GET`
* **Response Headers**:
  ```http
  Content-Type: text/csv; charset=utf-8
  Content-Disposition: attachment; filename=motor_list_export.csv
  ```
* **Payload**: UTF-8 BOM text stream representing spreadsheet rows.

---

## 11. Code Conventions & Coding Standards

To maintain standard development quality across the codebase, developers must adhere to the following rules:

### 11.1 Coding Style
* Follow **PEP 8** formatting guidelines. Use 4 spaces per indentation level.
* Utilize type annotations for all new method signatures:
  ```python
  def parse_specs(raw_text: str, brand: str = "") -> dict[str, str]:
  ```

### 11.2 Error Handling Heuristics
* Never swallow exceptions using blank `except:` blocks. Always catch specific exceptions and log them using the custom logger:
  ```python
  try:
      # parsing code
  except Exception as e:
      log.error(f"Failed to parse stator specs: {e}")
  ```
* Scrapers must unwrap `RetryError` or custom exception wrappers to log the root connection failure cause for debugging.

### 11.3 Logging Conventions
* Scrapers must instantiate module-level loggers:
  ```python
  from utils.logger import get_logger
  log = get_logger(__name__)
  ```
* Use appropriate logging severity tags:
  * `log.info()`: General state updates, start of tasks.
  * `log.debug()`: Verbose selectors trace, HTTP status checks.
  * `log.warning()`: Recoverable connection drops, missing optional parameters.
  * `log.error()`: Fatal site changes, missing critical selectors.

---

## 12. Git Flow & Release Versioning Guidelines

To maintain repository cleanliness and trace development iterations, all team members must follow this Git branching and release versioning standard.

### 12.1 Branch Naming Conventions
Always create a branch from `main` before starting development work:
* **Feature Branches**: For new scraping sources, parsing improvements, or API features.
  Format: `feature/<task-name>` (e.g., `feature/hobbyking-scraper`, `feature/parallel-groq`).
* **Bugfix Branches**: For fixing layout parsing breaks or connection timeout issues.
  Format: `bugfix/<issue-name>` (e.g., `bugfix/getfpv-cf-bypass`, `bugfix/rowspan-index-error`).
* **Hotfix Branches**: For critical production patches that cannot wait for regular releases.
  Format: `hotfix/<patch-name>` (e.g., `hotfix/groq-api-key-leak`).

### 12.2 Commit Message Standard
Commit messages should follow the conventional commits style to generate change logs automatically:
* **feat**: A new feature (e.g. `feat: add parallel Groq enrichment pipeline`).
* **fix**: A bug fix (e.g. `fix: reduce Playwright selector wait limit to 8s`).
* **docs**: Documentation updates (e.g. `docs: expand system architecture specification`).
* **refactor**: Code restructure without functional changes (e.g. `refactor: extract table parser to base scraper`).
* **test**: Adding or fixing test cases (e.g. `test: add verification cases for MN3508`).

### 12.3 Pull Request & Code Review Checklist
Before submitting a PR to merge into `main`, verify the following items:
- [ ] Code follows PEP 8 style formatting rules.
- [ ] No passwords, API keys, or private `.env` parameters are present.
- [ ] Programmatic tests (`debug_scrape_job.py`) pass without warnings.
- [ ] Code coverage has not dropped below the acceptable 80% limit.
- [ ] Documentation (`docs/`) has been updated to reflect new configs or scrapers.

### 12.4 Release Version Tagging
Release versioning follows the SemVer (Semantic Versioning) specification (`MAJOR.MINOR.PATCH`):
* Increment **MAJOR** version for incompatible API breaks.
* Increment **MINOR** version for adding scrapers or non-breaking features.
* Increment **PATCH** version for bug fixes and performance optimizations.
To create a release version tag:
```bash
git checkout main
git pull origin main
git tag -a v1.3.0 -m "Release version 1.3.0: Scraping speed optimizations and UI performance table grouping"
git push origin v1.3.0
```
This versioning scheme ensures clear tracking of releases and compatibility matrices across clients and microservices.


