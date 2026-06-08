"""
scrapers/base_scraper.py

Abstract base class for all scrapers.

Fetch strategy (in order):
  1. requests + realistic Chrome headers  (works for most sites, fastest)
  2. curl_cffi                            (TLS fingerprint — beats Cloudflare)
  3. cloudscraper                         (CF JS-challenge solver, fallback)
  4. Playwright-stealth                   (full browser — last resort)

All subclasses implement  scrape(query="") -> list[dict]
"""

import time
import random
from abc import ABC, abstractmethod
from typing import Optional

import requests as _requests
from bs4 import BeautifulSoup
from tenacity import (
    retry, stop_after_attempt, wait_exponential,
    retry_if_exception_type, RetryError,
)

from utils.logger import get_logger
from utils.rate_limiter import wait_for_domain
from config import CURL_IMPERSONATE, MAX_RETRIES, REQUEST_TIMEOUT

log = get_logger(__name__)

# ── Realistic browser headers ──────────────────────────────────────────────
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
}


class BaseScraper(ABC):
    name: str = "base"
    base_url: str = ""

    def __init__(self):
        self._session_req   = None
        self._session_curl  = None
        self._session_cloud = None

    # ── 1. Plain requests session (lazy) ───────────────────────────────────
    def _get_req_session(self) -> _requests.Session:
        if self._session_req is None:
            s = _requests.Session()
            s.headers.update(_HEADERS)
            self._session_req = s
        return self._session_req

    # ── 2. curl_cffi session (lazy) ───────────────────────────────────────
    def _get_curl_session(self):
        if self._session_curl is None:
            try:
                from curl_cffi.requests import Session
                self._session_curl = Session(impersonate=CURL_IMPERSONATE)
                log.debug(f"[{self.name}] curl_cffi ready ({CURL_IMPERSONATE})")
            except Exception as e:
                log.debug(f"[{self.name}] curl_cffi unavailable: {e}")
        return self._session_curl

    # ── 3. cloudscraper session (lazy) ────────────────────────────────────
    def _get_cloud_session(self):
        if self._session_cloud is None:
            try:
                import cloudscraper
                self._session_cloud = cloudscraper.create_scraper(
                    browser={"browser": "chrome", "platform": "windows", "mobile": False}
                )
                log.debug(f"[{self.name}] cloudscraper ready")
            except Exception as e:
                log.debug(f"[{self.name}] cloudscraper unavailable: {e}")
        return self._session_cloud

    # ── Main fetch (tries 1→2→3 with fallback) ────────────────────────────
    def fetch(self, url: str, params: Optional[dict] = None) -> Optional[str]:
        wait_for_domain(url)

        # 1. requests + browser headers
        html = self._fetch_requests(url, params)
        if html:
            return html

        # 2. curl_cffi (TLS fingerprint)
        log.debug(f"[{self.name}] requests failed, trying curl_cffi...")
        html = self._fetch_curl(url, params)
        if html:
            return html

        # 3. cloudscraper (CF JS challenge)
        log.debug(f"[{self.name}] curl_cffi failed, trying cloudscraper...")
        html = self._fetch_cloud(url, params)
        if html:
            return html

        log.warning(f"[{self.name}] All fetch methods failed for {url}")
        return None

    def _fetch_requests(self, url: str, params: Optional[dict] = None) -> Optional[str]:
        try:
            s = self._get_req_session()
            resp = s.get(url, params=params, timeout=REQUEST_TIMEOUT)
            if resp.status_code == 200:
                log.debug(f"[{self.name}] requests OK: {url}")
                return resp.text
            log.debug(f"[{self.name}] requests HTTP {resp.status_code}: {url}")
        except Exception as e:
            log.debug(f"[{self.name}] requests error: {e}")
        return None

    def _fetch_curl(self, url: str, params: Optional[dict] = None) -> Optional[str]:
        session = self._get_curl_session()
        if session is None:
            return None
        for attempt in range(MAX_RETRIES):
            try:
                resp = session.get(url, params=params, timeout=REQUEST_TIMEOUT)
                if resp.status_code == 200:
                    log.debug(f"[{self.name}] curl_cffi OK: {url}")
                    return resp.text
                log.debug(f"[{self.name}] curl_cffi HTTP {resp.status_code}: {url}")
                break
            except Exception as e:
                log.debug(f"[{self.name}] curl_cffi attempt {attempt+1} failed: {e}")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(2 ** attempt)
        return None

    def _fetch_cloud(self, url: str, params: Optional[dict] = None) -> Optional[str]:
        session = self._get_cloud_session()
        if session is None:
            return None
        for attempt in range(MAX_RETRIES):
            try:
                resp = session.get(url, params=params, timeout=REQUEST_TIMEOUT)
                if resp.status_code == 200:
                    log.debug(f"[{self.name}] cloudscraper OK: {url}")
                    return resp.text
                log.debug(f"[{self.name}] cloudscraper HTTP {resp.status_code}: {url}")
                break
            except Exception as e:
                log.debug(f"[{self.name}] cloudscraper attempt {attempt+1} failed: {e}")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(2 ** attempt)
        return None

    # ── Playwright (JS-heavy sites / last resort) ─────────────────────────
    def fetch_with_browser(self, url: str, wait_selector: Optional[str] = None) -> Optional[str]:
        wait_for_domain(url)
        try:
            from playwright.sync_api import sync_playwright
            try:
                from playwright_stealth import stealth_sync
                use_stealth = True
            except ImportError:
                use_stealth = False

            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                ctx = browser.new_context(
                    viewport={"width": 1920, "height": 1080},
                    user_agent=_HEADERS["User-Agent"],
                )
                page = ctx.new_page()
                if use_stealth:
                    stealth_sync(page)
                page.goto(url, wait_until="domcontentloaded", timeout=20000)
                if wait_selector:
                    page.wait_for_selector(wait_selector, timeout=15000)
                html = page.content()
                browser.close()
                log.debug(f"[{self.name}] Playwright OK: {url}")
                return html
        except Exception as e:
            log.error(f"[{self.name}] Playwright failed for {url}: {e}")
            return None

    def parse(self, html: str) -> BeautifulSoup:
        return BeautifulSoup(html, "html.parser")

    @abstractmethod
    def scrape(self, query: str = "") -> list[dict]:
        """Return list of raw dicts. Each subclass implements this."""
        ...

    def __repr__(self):
        return f"<Scraper: {self.name}>"
