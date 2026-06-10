"""
scrapers/google/page_extractor.py
==================================
Generic spec/table extractor that works on ANY webpage.

Given any product page URL (T-Motor, GetFPV, RCGroups, retailer, blog post,
data sheet ...) it:

  1. Finds ALL HTML tables → extracts key-value pairs and performance rows
  2. Scans definition lists (<dl>), bold/label pairs
  3. Reads JSON-LD structured data
  4. Falls back to regex scanning of body text

This means we can scrape the top-3 Google results for any motor and extract
specs without writing brand-specific parsers.
"""

import re
import json
from typing import Optional
from utils.logger import get_logger

log = get_logger(__name__)


# ── Canonical field name mapping ─────────────────────────────────────────────
# Maps whatever a page calls a field → our schema field name

FIELD_MAP = {
    # Motor name / model
    r'motor\s*model|test\s*item|motor\s*name|model\s*no': 'motor_name',
    r'brand|manufacturer|vendor': 'company',

    # Physical specs
    r'weight.*cable|weight\s*exc|net\s*weight': 'weight_g',
    r'weight': 'weight_g',
    r'stator\s*diameter': 'stator_diameter',
    r'stator\s*height|stator\s*length': 'stator_height',
    r'motor\s*dimen|outer\s*dimen|size': 'dimensions',
    r'shaft\s*diam': 'shaft_diameter',
    r'no\.?\s*of\s*cells|lipo\s*cell|battery': 'battery_config',

    # Electrical specs
    r'kv|velocity\s*constant|rpm/v': 'kv_rating',
    r'resistance|internal\s*resist': 'internal_resistance',
    r'max.*current|current.*max': 'max_current',
    r'max.*power|power.*max': 'max_power',
    r'max.*thrust|thrust.*max': 'max_thrust',

    # Performance columns
    r'throttle|throt': 'throttle',
    r'voltage|volt\b': 'voltage',
    r'current|amp\b': 'current',
    r'power|watt\b': 'power',
    r'thrust|force': 'thrust_g',
    r'rpm|speed': 'rpm',
    r'effic|g/w': 'efficiency',
    r'temp': 'temperature',
    r'prop|propell': 'prop',
    r'item\s*no|configuration': 'item',
}


def _canonical(raw: str) -> Optional[str]:
    """Map a raw column/label name to our schema field."""
    raw_lower = raw.lower().strip()
    for pattern, field in FIELD_MAP.items():
        if re.search(pattern, raw_lower):
            return field
    return None


def _safe_float(val: str) -> Optional[float]:
    if not val:
        return None
    clean = re.sub(r'[^\d.]', '', str(val))
    try:
        return float(clean) if clean else None
    except ValueError:
        return None


def _is_perf_table(headers: list[str]) -> bool:
    """Returns True if this looks like a performance/test data table."""
    h_lower = ' '.join(headers).lower()
    return ('throttle' in h_lower or 'thrust' in h_lower) and \
           ('voltage' in h_lower or 'current' in h_lower or 'rpm' in h_lower)


def _is_spec_table(headers: list[str], first_col: list[str]) -> bool:
    """Returns True if this looks like a spec/parameter table."""
    combined = ' '.join(headers + first_col[:5]).lower()
    keywords = ['weight', 'kv', 'resistance', 'stator', 'shaft', 'cells',
                'voltage', 'motor model', 'test item']
    return sum(1 for k in keywords if k in combined) >= 2


def extract_page(soup, source_url: str, query: str) -> tuple[list[dict], list[dict]]:
    """
    Extract motor records and performance data points from a parsed BeautifulSoup page.

    Returns:
        motor_records  — list of motor spec dicts
        perf_points    — list of performance data point dicts
    """
    motor_records = []
    perf_points   = []

    # ── 1. JSON-LD structured data ────────────────────────────────────────────
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            data = json.loads(script.string or '')
            if not isinstance(data, dict):
                continue
            name = data.get('name') or data.get('model') or ''
            brand = ''
            if isinstance(data.get('brand'), dict):
                brand = data['brand'].get('name', '')
            elif isinstance(data.get('brand'), str):
                brand = data['brand']
            if name and any(k in name.lower() for k in
                            ['motor', 'kv', 'mn', 'kde', 'mad', 'u7', 'u8', 'u10']):
                motor_records.append({
                    'motor_name':  name,
                    'company':     brand,
                    'source':      'google_search',
                    'source_url':  source_url,
                    'link_motor':  source_url,
                })
        except Exception:
            pass

    # ── 2. HTML tables ────────────────────────────────────────────────────────
    for table in soup.find_all('table'):
        rows = _parse_table_with_rowspan(table)
        if not rows:
            continue

        headers = [str(c).strip() for c in rows[0]]
        first_col = [str(row[0]).strip() for row in rows[1:] if row]

        # ── Performance table
        if _is_perf_table(headers):
            col_map = {}
            for i, h in enumerate(headers):
                canon = _canonical(h)
                if canon and canon not in col_map:
                    col_map[canon] = i

            for row in rows[1:]:
                if len(row) < 3:
                    continue
                throttle_raw = row[col_map['throttle']].strip() if 'throttle' in col_map else ''
                throttle = _safe_float(throttle_raw)
                thrust = _safe_float(row[col_map['thrust_g']].strip()) if 'thrust_g' in col_map else None

                if throttle is None or thrust is None:
                    continue
                if not (0 <= throttle <= 100):
                    continue

                pt = {
                    'source':     'google_search',
                    'source_url': source_url,
                    'label':      query,
                    'throttle':   throttle,
                    'voltage':    _safe_float(row[col_map['voltage']].strip()) if 'voltage' in col_map else None,
                    'current':    _safe_float(row[col_map['current']].strip()) if 'current' in col_map else None,
                    'power':      _safe_float(row[col_map['power']].strip()) if 'power' in col_map else None,
                    'thrust_g':   thrust,
                    'rpm':        _safe_float(row[col_map['rpm']].strip()) if 'rpm' in col_map else None,
                    'efficiency': _safe_float(row[col_map['efficiency']].strip()) if 'efficiency' in col_map else None,
                    'temperature':_safe_float(row[col_map['temperature']].strip()) if 'temperature' in col_map else None,
                }
                perf_points.append(pt)

        # ── Spec table (key-value pairs)
        elif _is_spec_table(headers, first_col):
            specs = {}
            # Two-column k/v table
            if len(headers) >= 2:
                for row in rows:
                    if len(row) >= 2:
                        k = _canonical(str(row[0]).strip())
                        v = str(row[1]).strip()
                        if k:
                            specs[k] = v
            if specs:
                rec = {
                    'motor_name':  specs.get('motor_name') or query,
                    'company':     specs.get('company', ''),
                    'kv_rating':   specs.get('kv_rating', ''),
                    'max_thrust':  specs.get('max_thrust', ''),
                    'weight_g':    specs.get('weight_g', ''),
                    'dimensions':  specs.get('dimensions', ''),
                    'battery_config': specs.get('battery_config', ''),
                    'max_current': specs.get('max_current', ''),
                    'max_power':   specs.get('max_power', ''),
                    'source':      'google_search',
                    'source_url':  source_url,
                    'link_motor':  source_url,
                }
                motor_records.append(rec)

    # ── 3. Definition lists <dl><dt><dd> ─────────────────────────────────────
    for dl in soup.find_all('dl'):
        terms = dl.find_all('dt')
        defs  = dl.find_all('dd')
        specs = {}
        for dt, dd in zip(terms, defs):
            k = _canonical(dt.get_text(strip=True))
            if k:
                specs[k] = dd.get_text(strip=True)
        if len(specs) >= 3:
            motor_records.append({
                'motor_name':  specs.get('motor_name') or query,
                'company':     specs.get('company', ''),
                'kv_rating':   specs.get('kv_rating', ''),
                'max_thrust':  specs.get('max_thrust', ''),
                'weight_g':    specs.get('weight_g', ''),
                'source':      'google_search',
                'source_url':  source_url,
                'link_motor':  source_url,
            })

    # ── 4. Regex fallback — scan body text for key specs ─────────────────────
    if not motor_records:
        body_text = soup.get_text(separator=' ')
        kv_m = re.search(r'(\d{2,5})\s*KV', body_text, re.IGNORECASE)
        thrust_m = re.search(r'(\d+\.?\d*)\s*(?:kg|g)\s*(?:max\s*)?thrust', body_text, re.IGNORECASE)
        weight_m = re.search(r'weight\s*[:\-]?\s*(\d+\.?\d*)\s*g', body_text, re.IGNORECASE)

        if kv_m or thrust_m:
            motor_records.append({
                'motor_name':  query,
                'company':     '',
                'kv_rating':   f"{kv_m.group(1)}KV" if kv_m else '',
                'max_thrust':  thrust_m.group(0) if thrust_m else '',
                'weight_g':    weight_m.group(1) if weight_m else '',
                'source':      'google_search',
                'source_url':  source_url,
                'link_motor':  source_url,
            })

    log.info(f"[google_extractor] {source_url}: "
             f"{len(motor_records)} spec records, {len(perf_points)} perf points")
    return motor_records, perf_points


def _parse_table_with_rowspan(table) -> list[list[str]]:
    """Parse an HTML table with rowspan/colspan into a flat grid."""
    rows = table.find_all('tr')
    if not rows:
        return []
    grid = {}
    for r_idx, row in enumerate(rows):
        c_idx = 0
        for cell in row.find_all(['td', 'th']):
            while (r_idx, c_idx) in grid:
                c_idx += 1
            rowspan = int(cell.get('rowspan', 1))
            colspan = int(cell.get('colspan', 1))
            val = cell.get_text(separator=' ', strip=True)
            for dr in range(rowspan):
                for dc in range(colspan):
                    grid[(r_idx + dr, c_idx + dc)] = val
            c_idx += colspan

    if not grid:
        return []
    num_rows = len(rows)
    num_cols = max(c for r, c in grid.keys()) + 1
    return [
        [grid.get((r, c), '') for c in range(num_cols)]
        for r in range(num_rows)
    ]
