"""
storage/json_exporter.py — Export scraped data to JSON files.
"""

import json
from pathlib import Path
from datetime import datetime
from config import OUTPUT_DIR
from utils.logger import get_logger

log = get_logger(__name__)


def export_json(data: list[dict], filename: str = "", label: str = "items") -> Path:
    if not filename:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{label}_{ts}.json"
    path = OUTPUT_DIR / filename

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False, default=str)

    log.info(f"[json] Exported {len(data)} {label} → {path}")
    return path
