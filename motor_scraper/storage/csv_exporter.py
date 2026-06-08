"""
storage/csv_exporter.py — Export scraped data to CSV files.
"""

import csv
from pathlib import Path
from datetime import datetime
from config import OUTPUT_DIR
from utils.logger import get_logger

log = get_logger(__name__)


def export_motors(motors: list[dict], filename: str = "") -> Path:
    if not filename:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"motors_{ts}.csv"
    path = OUTPUT_DIR / filename

    if not motors:
        log.warning("[csv] No motors to export.")
        return path

    fieldnames = [
        "motor_name", "company", "max_thrust", "kv_rating", "stator_size",
        "recommended_esc", "recommended_propeller", "battery_config",
        "weight_g", "max_current", "price",
        "link_motor", "link_esc", "link_propeller",
        "description_summary", "source",
    ]
    # Include any extra keys found in data
    all_keys = set()
    for m in motors:
        all_keys.update(m.keys())
    extra_keys = sorted(all_keys - set(fieldnames))
    all_fieldnames = fieldnames + extra_keys

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=all_fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(motors)

    log.info(f"[csv] Exported {len(motors)} motors → {path}")
    return path


def export_performance(data_points: list[dict], filename: str = "") -> Path:
    if not filename:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"performance_{ts}.csv"
    path = OUTPUT_DIR / filename

    if not data_points:
        log.warning("[csv] No performance data to export.")
        return path

    fieldnames = [
        "label", "throttle", "voltage", "current", "power",
        "thrust_g", "rpm", "efficiency", "temperature", "source", "source_url",
    ]
    all_keys = set()
    for d in data_points:
        all_keys.update(d.keys())
    extra_keys = sorted(all_keys - set(fieldnames))
    all_fieldnames = fieldnames + extra_keys

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=all_fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(data_points)

    log.info(f"[csv] Exported {len(data_points)} performance points → {path}")
    return path
