"""
utils/dedup.py — Deduplication helpers.
"""

from typing import Any


def dedup_motors(motors: list[dict]) -> list[dict]:
    """Remove duplicate motors by (motor_name, company) pair."""
    seen: set[tuple] = set()
    unique = []
    for m in motors:
        key = (
            m.get("motor_name", "").strip().lower(),
            m.get("company", "").strip().lower(),
        )
        if key not in seen and key != ("", ""):
            seen.add(key)
            unique.append(m)
    return unique


def dedup_by_field(items: list[dict], field: str) -> list[dict]:
    """Remove duplicates by a single field value."""
    seen: set[Any] = set()
    unique = []
    for item in items:
        val = item.get(field, "").strip().lower()
        if val and val not in seen:
            seen.add(val)
            unique.append(item)
    return unique
