"""
utils/rate_limiter.py — Per-domain rate limiter with random jitter.
"""

import time
import random
import threading
from urllib.parse import urlparse
from config import REQUEST_DELAY_MIN, REQUEST_DELAY_MAX


_last_request: dict[str, float] = {}
_limiter_lock = threading.Lock()


def wait_for_domain(url: str) -> None:
    """Block until it's polite to hit the given domain again."""
    domain = urlparse(url).netloc
    sleep_time = 0
    
    with _limiter_lock:
        now = time.time()
        last = _last_request.get(domain, 0)
        elapsed = now - last
        delay = random.uniform(REQUEST_DELAY_MIN, REQUEST_DELAY_MAX)
        if elapsed < delay:
            sleep_time = delay - elapsed
            _last_request[domain] = now + sleep_time
        else:
            _last_request[domain] = now

    if sleep_time > 0:
        time.sleep(sleep_time)
