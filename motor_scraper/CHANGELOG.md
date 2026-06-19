# Changelog

All notable changes to **ThrustVault** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- API key authentication middleware
- Rate limiting per client IP
- Redis-backed job queue
- Additional data sources: Innov8tive Designs, Cobra Motors

---

## [2.1.0] — 2026-06-17

### Added
- **Disk-based result cache** (`utils/cache.py`): Thread-safe, SHA-256-keyed JSON cache with configurable TTL (default 24h). Prevents redundant network calls for identical queries — integrated into both `api.py` and `run.py`.
- **`--query` / `-q` CLI flag** (`run.py`): Allows targeted motor searches from the command line, matching the web UI experience.
- **`--no-cache` CLI flag** (`run.py`): Forces a fresh scrape, bypassing the cache.
- **Thread-local Playwright browser manager** (`utils/browser_manager.py`): Reuses a single Chromium process per OS thread instead of launching/tearing down Chromium on every `fetch_with_browser()` call. Dramatically reduces process startup overhead for JS-heavy sites.

### Changed
- **`run.py` now fully concurrent**: Scrapers run in parallel via `ThreadPoolExecutor`, and Groq AI enrichment is also parallelized — bringing CLI performance to parity with the Web API.
- **Conditional catalog crawling** in `sunnysky_scraper.py`, `mad_scraper.py`, `kdedirect_scraper.py`: Full category/collection crawls are now skipped when a targeted search query returns results, cutting unnecessary paginated requests.
- **`rate_limiter.py` thread-safety fix**: The lock now only guards state reads/writes; `time.sleep()` happens outside the lock, eliminating a bottleneck that previously blocked all scraper threads waiting on a single domain.
- **`mad_scraper.py` domain update**: Updated to MAD Components' new Shopify domain (`mad-motor.com`) with corrected collection and search paths.

### Fixed
- **Brotli encoding bug** (`base_scraper.py`): Removed `br` from `Accept-Encoding` header. Servers that defaulted to Brotli returned compressed binary garbage because `requests` does not natively decompress Brotli, silently causing empty HTML parses.
- **KDE Direct selector typo** (`kdedirect_scraper.py`): Corrected product card CSS selector from `.grid__item` to `.grid-item`.
- **MAD scraper search URL** (`mad_scraper.py`): Updated to Shopify's `/search/suggest` endpoint with the correct `type=product` parameter.

---

## [2.0.0] — 2025-06-09

### Added
- Parallel source execution via `ThreadPoolExecutor` (5× speed improvement)
- Groq LLaMA3-70b query expansion layer
- Propeller grouping in UI (Motor → Propeller → Data Points)
- Step count badges on each grouping
- Pre-filter heuristics for URL and text-level relevance
- SSE heartbeat every 15s to prevent stream disconnection
- Excel (XLSX) multi-sheet export endpoint
- Full MNC-grade documentation suite in `docs/`

### Changed
- `RCBenchmark` scraper default tier changed to `curl_cffi`
- `T-Motor` scraper now extracts embedded JavaScript chart data
- `BaseScraper` fallback logic refactored with cleaner error propagation
- Default `MAX_WORKERS` increased from 3 to 5
- `run.py` flag `--output-format` renamed to `--format`

### Fixed
- SSE stream disconnecting when all sources returned 0 results
- `pandas` `FutureWarning` from deprecated `.append()` (migrated to `pd.concat()`)
- `playwright` timeout not respecting `PLAYWRIGHT_TIMEOUT` env var

### Breaking Changes
- `/search` response now returns `job_id` + `stream_url`; results no longer inline
- `run.py --output-format` flag renamed to `--format`

---

## [1.2.1] — 2025-04-15

### Fixed
- `cloudscraper` compatibility with Cloudflare's updated JS challenge format
- `lxml` compatibility issue on Python 3.12

---

## [1.2.0] — 2025-03-20

### Added
- SpeedyBee scraper module
- `python-dotenv` for `.env` configuration management
- Improved `rich` progress bar accuracy for multi-source searches

---

## [1.1.0] — 2025-02-10

### Added
- RCBenchmark scraper with CSV download capability
- `tenacity` retry logic with exponential backoff across all scrapers

---

## [1.0.0] — 2025-01-01

### Added
- Initial release
- T-Motor, EMAX, and GetFPV scrapers
- Flask web UI with search and CSV export
- Sequential (single-threaded) scrape execution
