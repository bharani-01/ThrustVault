"""
parsers/motor_parser.py — Normalize raw scraped motor dicts to ThrustVault schema.

Applies regex + heuristics to clean up raw values before Groq enrichment.
"""

import re
from utils.logger import get_logger

log = get_logger(__name__)


# ── Regex patterns ─────────────────────────────────────────────────────────
_RE_THRUST      = re.compile(r"(\d[\d.,]*)\s*(g|kg|gram|kilogram)", re.IGNORECASE)
_RE_KV          = re.compile(r"\b(?:kv\s*(\d{3,5})|(\d{3,5})\s*kv)\b", re.IGNORECASE)
_RE_STATOR      = re.compile(r"\b(\d{2})(\d{2})\b")   # e.g. 2207, 2306
_RE_PROP_SIZE   = re.compile(r"(\d[\d.]*)\s*[\"'x×]\s*(\d[\d.]*)", re.IGNORECASE)
_RE_ESC_AMP     = re.compile(r"(\d+)\s*[aA](?:\s|$|\b)")
_RE_CELL        = re.compile(r"(\d+)[sS](?:\s|$|-|\b)")


def normalize_thrust(raw: str) -> str:
    """Convert '1.2kg', '1200 grams', '1200g' → '1200g'"""
    if not raw:
        return ""
    raw = raw.replace(",", "")
    m = _RE_THRUST.search(raw)
    if not m:
        return raw.strip()
    val = float(m.group(1))
    unit = m.group(2).lower()
    if "kg" in unit or "kilo" in unit:
        val = val * 1000
    return f"{int(val)}g"


def extract_kv(text: str) -> str:
    m = _RE_KV.search(text)
    if not m:
        return ""
    val = m.group(1) or m.group(2)
    return f"{val}KV" if val else ""


def extract_stator(text: str) -> str:
    m = _RE_STATOR.search(text)
    return m.group(0) if m else ""


def extract_prop_size(text: str) -> str:
    m = _RE_PROP_SIZE.search(text)
    return f"{m.group(1)}x{m.group(2)}" if m else ""


def extract_esc_amp(text: str) -> str:
    m = _RE_ESC_AMP.search(text)
    return f"{m.group(1)}A" if m else ""


def normalize_motor(raw: dict) -> dict:
    """
    Apply normalization rules to a single raw scraped motor dict.
    Returns a clean dict aligned with the ThrustVault motors schema.
    """
    name    = raw.get("motor_name", raw.get("name", "")).strip()
    company = raw.get("company", "").strip()
    thrust  = normalize_thrust(raw.get("max_thrust", ""))
    
    # Try to extract from name if company is missing
    known_brands = ["T-Motor", "EMAX", "Speedybee", "BrotherHobby", "iFlight",
                    "Racerstar", "RCINPOWER", "Hobbywing", "Dys", "SunnySky"]
    if not company:
        for brand in known_brands:
            if brand.lower() in name.lower():
                company = brand
                break

    # Infer stator size from name
    stator = extract_stator(name)
    kv = extract_kv(name)

    return {
        "motor_name":            name,
        "company":               company,
        "max_thrust":            thrust,
        "recommended_esc":       raw.get("recommended_esc", ""),
        "recommended_propeller": raw.get("recommended_propeller", ""),
        "link_motor":            raw.get("link_motor", raw.get("link", "")),
        "link_esc":              raw.get("link_esc", ""),
        "link_propeller":        raw.get("link_propeller", ""),
        # Extra enrichment fields
        "kv_rating":             kv or raw.get("kv_rating", ""),
        "stator_size":           stator or raw.get("stator_size", ""),
        "price":                 raw.get("price", ""),
        "source":                raw.get("source", ""),
        # Detailed specifications fields
        "internal_resistance":   raw.get("internal_resistance", ""),
        "dimensions":            raw.get("dimensions", ""),
        "shaft_diameter":        raw.get("shaft_diameter", ""),
        "weight_g":              raw.get("weight_g", ""),
        "battery_config":        raw.get("battery_config", ""),
        "max_current":           raw.get("max_current", ""),
        "max_power":             raw.get("max_power", ""),
    }


def normalize_batch(raw_list: list[dict]) -> list[dict]:
    normalized = []
    for raw in raw_list:
        try:
            normalized.append(normalize_motor(raw))
        except Exception as e:
            log.debug(f"[motor_parser] Normalize error: {e}")
    return normalized
