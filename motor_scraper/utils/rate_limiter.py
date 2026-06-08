"""
utils/rate_limiter.py — Per-domain rate limiter with random jitter.
"""

import time
import random
from urllib.parse import urlparse
from config import REQUEST_DELAY_MIN, REQUEST_DELAY_MAX


_last_request: dict[str, float] = {}


def wait_for_domain(url: str) -> None:
    """Block until it's polite to hit the given domain again."""
    domain = urlparse(url).netloc
    last = _last_request.get(domain, 0)
    elapsed = time.time() - last
    delay = random.uniform(REQUEST_DELAY_MIN, REQUEST_DELAY_MAX)
    if elapsed < delay:
        time.sleep(delay - elapsed)
    _last_request[domain] = time.time()
