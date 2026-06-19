"""
tests/test_cache.py — Unit tests for the cache module.
"""

import time
import pytest
from utils.cache import get_cached_results, set_cached_results, clear_cache, _get_cache_path


def test_cache_get_set():
    clear_cache()
    
    query = "T-Motor MN3508"
    sources = ["tmotor", "emax"]
    payload = {"motors": [{"motor_name": "MN3508"}], "performance": []}
    
    # Cache should be empty initially
    assert get_cached_results(query, sources) is None
    
    # Save to cache
    set_cached_results(query, sources, payload)
    
    # Cache should hit
    cached = get_cached_results(query, sources)
    assert cached is not None
    assert cached["motors"][0]["motor_name"] == "MN3508"


def test_cache_expiration():
    clear_cache()
    
    query = "KDE4215"
    sources = ["kdedirect"]
    payload = {"motors": [{"motor_name": "KDE4215"}], "performance": []}
    
    set_cached_results(query, sources, payload)
    
    # Cache hit within 10s TTL
    assert get_cached_results(query, sources, ttl_seconds=10) is not None
    
    # Cache miss with 0s TTL (simulating expiration)
    assert get_cached_results(query, sources, ttl_seconds=-1) is None


def test_cache_key_consistency():
    # Order of sources and casing in query shouldn't affect cache lookup
    clear_cache()
    
    payload = {"motors": [{"motor_name": "MN3508"}], "performance": []}
    
    set_cached_results("MN3508  KV380", ["tmotor", "EMAX"], payload)
    
    # Query with different casing and spacing, and shuffled sources
    cached = get_cached_results("mn3508 kv380", ["EMAX", "tmotor"])
    assert cached is not None
    assert cached["motors"][0]["motor_name"] == "MN3508"


def test_clear_cache():
    clear_cache()
    query = "Test Clear"
    sources = ["tmotor"]
    payload = {"test": 123}
    
    set_cached_results(query, sources, payload)
    assert get_cached_results(query, sources) is not None
    
    clear_cache()
    assert get_cached_results(query, sources) is None
