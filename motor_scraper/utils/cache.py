"""
utils/cache.py — Thread-safe, disk-based cache for scraping results.
Keyed by the sanitized search query and selected sources.
"""

import time
import json
import hashlib
import threading
from pathlib import Path
from config import CACHE_DIR
from utils.logger import get_logger

log = get_logger(__name__)
_cache_lock = threading.Lock()


def _get_cache_path(query: str, sources: list[str]) -> Path:
    """Generate a consistent cache file path based on normalized query and sources."""
    # Normalize query: strip, collapse whitespace, lowercase
    clean_query = " ".join(query.strip().lower().split())
    # Sort and lowercase sources
    sorted_sources = sorted([s.strip().lower() for s in sources])
    
    # Create unique hash key
    key_data = f"{clean_query}:{','.join(sorted_sources)}"
    key_hash = hashlib.sha256(key_data.encode("utf-8")).hexdigest()
    
    # Store cache files in storage/search_cache
    cache_subdir = CACHE_DIR / "search_cache"
    cache_subdir.mkdir(exist_ok=True)
    return cache_subdir / f"{key_hash}.json"


def get_cached_results(query: str, sources: list[str], ttl_seconds: int = 86400) -> dict | None:
    """
    Retrieve cached results if they exist and are within the Time-To-Live (TTL).
    Default TTL is 24 hours (86400 seconds).
    """
    path = _get_cache_path(query, sources)
    if not path.exists():
        return None

    with _cache_lock:
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            cached_at = data.get("cached_at", 0)
            elapsed = time.time() - cached_at
            
            if elapsed > ttl_seconds:
                log.debug(f"[cache] Cache expired for query '{query}' (elapsed {elapsed:.0f}s > TTL {ttl_seconds}s)")
                return None
                
            log.info(f"[cache] Cache HIT for query '{query}' (expires in {ttl_seconds - elapsed:.0f}s)")
            return data.get("payload")
        except Exception as e:
            log.warning(f"[cache] Failed to read cache file {path}: {e}")
            return None


def set_cached_results(query: str, sources: list[str], payload: dict) -> None:
    """Save payload (motors and performance data) to a disk cache file."""
    path = _get_cache_path(query, sources)
    with _cache_lock:
        try:
            data = {
                "query": query,
                "sources": sources,
                "cached_at": time.time(),
                "payload": payload
            }
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            log.debug(f"[cache] Cache SAVED for query '{query}' to {path.name}")
        except Exception as e:
            log.warning(f"[cache] Failed to write cache file {path}: {e}")


def clear_cache() -> None:
    """Clear all files in the cache directory."""
    cache_subdir = CACHE_DIR / "search_cache"
    if not cache_subdir.exists():
        return
    with _cache_lock:
        try:
            for file in cache_subdir.iterdir():
                if file.is_file():
                    file.unlink()
            log.info("[cache] All cache files cleared.")
        except Exception as e:
            log.warning(f"[cache] Failed to clear cache directory: {e}")
