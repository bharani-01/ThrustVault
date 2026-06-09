"""
scrapers/rcbenchmark_scraper.py — RCBenchmark public thrust-test data scraper.

RCBenchmark publishes CSV test files for motors at:
  https://www.rcbenchmark.com/pages/series-1520-thrust-stand-dynamometer

We scrape the index page to find CSV download links, then parse each CSV
into motor_test_data_points schema records.
"""

import io
import csv
from scrapers.base_scraper import BaseScraper
from utils.logger import get_logger

log = get_logger(__name__)


class RCBenchmarkScraper(BaseScraper):
    name = "rcbenchmark"
    base_url = "https://www.rcbenchmark.com"

    INDEX_URLS = [
        "https://www.rcbenchmark.com/pages/series-1520-thrust-stand-dynamometer",
        "https://www.rcbenchmark.com/pages/database",
    ]

    def scrape(self, query: str = "") -> list[dict]:
        results = []
        csv_links = self._find_csv_links()
        log.info(f"[rcbenchmark] Found {len(csv_links)} CSV files")

        if query.strip():
            filtered = []
            for url, label in csv_links:
                if self._is_candidate_match(query, label, url):
                    filtered.append((url, label))
                else:
                    log.debug(f"[rcbenchmark] Pre-filtered (skipped): {label}")
            log.info(f"[rcbenchmark] After pre-filtering: {len(filtered)}/{len(csv_links)} CSVs remain")
            csv_links = filtered

        for url, label in csv_links:
            log.info(f"[rcbenchmark] Downloading: {label} → {url}")
            html = self.fetch(url)
            if not html:
                continue
            parsed = self._parse_csv(html, label, url)
            results.extend(parsed)
            log.info(f"[rcbenchmark] {label}: {len(parsed)} data points")

        log.info(f"[rcbenchmark] Total test data points: {len(results)}")
        return results

    def _find_csv_links(self) -> list[tuple[str, str]]:
        found = []
        for index_url in self.INDEX_URLS:
            html = self.fetch(index_url)
            if not html:
                continue
            soup = self.parse(html)
            for a in soup.find_all("a", href=True):
                href = a["href"]
                text = a.get_text(strip=True)
                if href.endswith(".csv") or "csv" in href.lower():
                    full = href if href.startswith("http") else self.base_url + href
                    found.append((full, text or href.split("/")[-1]))
        return found

    def _parse_csv(self, content: str, label: str, source_url: str) -> list[dict]:
        """
        Parse a raw CSV string into a list of data point dicts.
        RCBenchmark CSVs typically have columns:
          Throttle(%), ESC signal(µs), Voltage(V), Current(A), Power(W),
          Motor speed(RPM), Thrust(g), Torque(N.m), Motor Efficiency(g/W)
        """
        records = []
        try:
            reader = csv.DictReader(io.StringIO(content))
            for row in reader:
                # Normalize column names
                def g(keys):
                    for k in keys:
                        for col in row:
                            if k.lower() in col.lower():
                                val = row[col].strip()
                                try:
                                    return float(val) if val else None
                                except ValueError:
                                    return None
                    return None

                record = {
                    "source":       "rcbenchmark",
                    "label":        label,
                    "source_url":   source_url,
                    "throttle":     g(["throttle", "thr", "signal"]),
                    "voltage":      g(["voltage", "volt"]),
                    "current":      g(["current", "amp"]),
                    "power":        g(["power", "watt"]),
                    "thrust_g":     g(["thrust", "force"]),
                    "rpm":          g(["rpm", "speed", "rotation"]),
                    "efficiency":   g(["efficiency", "g/w"]),
                    "temperature":  g(["temp"]),
                }
                if record["thrust_g"] is not None:
                    records.append(record)
        except Exception as e:
            log.warning(f"[rcbenchmark] CSV parse error for {label}: {e}")
        return records

    def _is_candidate_match(self, query: str, name: str, link: str) -> bool:
        if not query.strip():
            return True

        name_lower = name.lower()
        link_lower = link.lower()

        # Extract model terms from query (terms that are NOT just KV numbers or KV labels)
        import re
        # Clean KV patterns
        q_clean = re.sub(r'\b\d{3,5}\s*kv\b', '', query, flags=re.IGNORECASE)
        q_clean = re.sub(r'\bkv\s*\d{3,5}\b', '', q_clean, flags=re.IGNORECASE)
        q_clean = re.sub(r'[-/]\d{3,5}\s*kv\b', '', q_clean, flags=re.IGNORECASE)
        q_clean = re.sub(r'[-/]kv\s*\d{3,5}\b', '', q_clean, flags=re.IGNORECASE)
        q_clean = q_clean.lower().strip()

        # Get tokens from q_clean
        tokens = re.split(r'[\s\-_/]+', q_clean)
        tokens = [t.strip() for t in tokens if len(t.strip()) >= 2]

        # If no tokens left after removing KV, just use the original query tokens
        if not tokens:
            tokens = [t.strip() for t in re.split(r'[\s\-_/]+', query.lower()) if len(t.strip()) >= 2]

        # Check if ANY of the model tokens appear in candidate name or link
        for tok in tokens:
            if tok in name_lower or tok in link_lower:
                return True

        # Also check if the candidate name has the stator size if it's in the query
        # E.g. search "MN3508" -> candidate "MN3508" has "3508"
        nums = re.findall(r'\b\d{4}\b', query)
        for num in nums:
            if num in name_lower or num in link_lower:
                return True

        return False
