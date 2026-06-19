"""
utils/browser_manager.py — Thread-safe, thread-local Playwright browser manager.
Avoids starting and stopping Chromium for every single page request by reusing
a browser instance within the same thread.
"""

import threading
from utils.logger import get_logger

log = get_logger(__name__)


class ThreadLocalBrowserManager:
    def __init__(self):
        self._local = threading.local()

    def get_page(self, user_agent: str) -> tuple[object, object]:
        """
        Get or initialize a thread-local page.
        Returns (context, page) where page is a fresh page in a thread-local browser.
        """
        # Lazily initialize Playwright on the current thread
        if not hasattr(self._local, "playwright"):
            try:
                from playwright.sync_api import sync_playwright
                log.debug(f"[browser_manager] Launching Playwright Chromium on thread '{threading.current_thread().name}'")
                self._local.playwright = sync_playwright().start()
                self._local.browser = self._local.playwright.chromium.launch(headless=True)
                self._local.context = self._local.browser.new_context(
                    viewport={"width": 1920, "height": 1080},
                    user_agent=user_agent,
                )
            except Exception as e:
                log.error(f"[browser_manager] Failed to launch Playwright Chromium: {e}")
                # Clean up if partially initialized
                self.close_thread_browser()
                raise e

        # Return the context and a new page/tab
        page = self._local.context.new_page()
        return self._local.context, page

    def close_thread_browser(self) -> None:
        """Close the Playwright instance and browser for the current thread."""
        if hasattr(self._local, "browser"):
            try:
                log.debug(f"[browser_manager] Tearing down Playwright Chromium on thread '{threading.current_thread().name}'")
                if hasattr(self._local, "context"):
                    self._local.context.close()
                self._local.browser.close()
                self._local.playwright.stop()
            except Exception as e:
                log.warning(f"[browser_manager] Error during Playwright shutdown on thread '{threading.current_thread().name}': {e}")
            finally:
                # Clean up local variables
                if hasattr(self._local, "playwright"): del self._local.playwright
                if hasattr(self._local, "browser"): del self._local.browser
                if hasattr(self._local, "context"): del self._local.context


# Global singleton instance
browser_manager = ThreadLocalBrowserManager()
