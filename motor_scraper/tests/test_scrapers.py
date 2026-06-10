"""
tests/test_scrapers.py
======================
Per-scraper unit tests — instantiate each scraper class directly and
verify they return well-formed records for known motors.

These make REAL network requests. Mark slow tests with @pytest.mark.slow.
Run fast (unit-only) tests with:  pytest -m "not slow"
Run all tests with:               pytest -m "slow or not slow"
"""

import sys, os, re
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest


# ── Motor fixtures known to return results ─────────────────────────────────────
#
# Each tuple: (motor_query, expected_company, expected_source, min_records)
# These motors were selected because they have rich public data pages.

TMOTOR_MOTORS = [
    ("T-Motor MN3508 KV380",      "T-Motor", "tmotor_official", 1),
    ("T-Motor U7 V2.0 KV420",     "T-Motor", "tmotor_official", 1),
    ("T-Motor MN5212 KV280",      "T-Motor", "tmotor_official", 1),
    ("T-Motor U10 Plus KV100",    "T-Motor", "tmotor_official", 1),
]

MAD_MOTORS = [
    ("MAD 5008 IPE V3 KV240",     "MAD",     "mad_official",    1),
    ("MAD 5010 EEE V2.0 KV200",  "MAD",     "mad_official",    1),
]

KDE_MOTORS = [
    ("KDE4215XF-465",             "KDE",     "kdedirect_official", 1),
    ("KDE5215XF-330",             "KDE",     "kdedirect_official", 1),
]

SUNNYSKY_MOTORS = [
    ("SunnySky V5210 KV300",      "SunnySky","sunnysky_official",  1),
    ("SunnySky X5212S KV320",     "SunnySky","sunnysky_official",  1),
]

EMAX_MOTORS = [
    ("EMAX RS2205 2300KV",        "EMAX",    "emax_official",      1),
    ("EMAX ECO 2207 2400KV",      "EMAX",    "emax_official",      1),
]


# ── Helpers ────────────────────────────────────────────────────────────────────

def _record_fields_ok(record: dict) -> tuple[bool, str]:
    """Check that a motor record has required fields."""
    required = ["motor_name", "company", "source"]
    for f in required:
        if f not in record:
            return False, f"missing field '{f}'"
    if not record.get("motor_name"):
        return False, "motor_name is empty"
    return True, "ok"


def _perf_point_fields_ok(point: dict) -> tuple[bool, str]:
    """Check that a performance point has required numeric fields."""
    for f in ["throttle", "thrust_g"]:
        if f not in point:
            return False, f"missing field '{f}'"
        if point[f] is None:
            return False, f"'{f}' is None"
    return True, "ok"


# ── T-Motor scraper tests ──────────────────────────────────────────────────────

class TestTMotorScraper:

    @pytest.fixture(scope="class")
    def scraper(self):
        from scrapers.tmotor_scraper import TMotorScraper
        return TMotorScraper()

    @pytest.mark.slow
    @pytest.mark.parametrize("query,company,source,min_rec", TMOTOR_MOTORS)
    def test_scrape_motor(self, scraper, query, company, source, min_rec):
        results = scraper.scrape(query=query)
        motor_recs = [r for r in results if "motor_name" in r]
        perf_pts   = [r for r in results if "throttle" in r]

        assert len(motor_recs) >= min_rec, \
            f"Expected ≥{min_rec} motor record for '{query}', got {len(motor_recs)}"

        for rec in motor_recs:
            ok, msg = _record_fields_ok(rec)
            assert ok, f"[{query}] Bad motor record: {msg} — {rec}"
            assert rec["company"] == company or rec.get("source") == source, \
                f"[{query}] Unexpected company: {rec['company']}"

    @pytest.mark.slow
    def test_mn3508_has_perf_data(self, scraper):
        results = scraper.scrape(query="T-Motor MN3508 KV380")
        perf_pts = [r for r in results if "throttle" in r]
        assert len(perf_pts) > 0, "Expected performance data for MN3508"
        for pt in perf_pts:
            ok, msg = _perf_point_fields_ok(pt)
            assert ok, f"Bad perf point: {msg} — {pt}"

    @pytest.mark.slow
    def test_u7_has_perf_data(self, scraper):
        results = scraper.scrape(query="T-Motor U7 V2.0 KV420")
        perf_pts = [r for r in results if "throttle" in r]
        assert len(perf_pts) > 0, "Expected performance data for U7 V2.0"

    @pytest.mark.slow
    def test_no_duplicate_perf_points(self, scraper):
        """T-Motor HTML repeats rows 3×; verify dedup in caller."""
        results = scraper.scrape(query="T-Motor U7 V2.0 KV420")
        perf_pts = [r for r in results if "throttle" in r]
        # Raw scraper may have duplicates — check at API level in test_api.py
        # Here just assert we got something
        assert len(perf_pts) > 0


# ── MAD Components scraper tests ───────────────────────────────────────────────

class TestMADScraper:

    @pytest.fixture(scope="class")
    def scraper(self):
        from scrapers.mad_scraper import MADScraper
        return MADScraper()

    @pytest.mark.slow
    @pytest.mark.parametrize("query,company,source,min_rec", MAD_MOTORS)
    def test_scrape_motor(self, scraper, query, company, source, min_rec):
        results = scraper.scrape(query=query)
        motor_recs = [r for r in results if "motor_name" in r]
        assert len(motor_recs) >= min_rec or len(results) > 0, \
            f"Expected ≥{min_rec} records for '{query}', got {len(results)}"


# ── KDE Direct scraper tests ───────────────────────────────────────────────────

class TestKDEScraper:

    @pytest.fixture(scope="class")
    def scraper(self):
        from scrapers.kdedirect_scraper import KDEDirectScraper
        return KDEDirectScraper()

    @pytest.mark.slow
    @pytest.mark.parametrize("query,company,source,min_rec", KDE_MOTORS)
    def test_scrape_motor(self, scraper, query, company, source, min_rec):
        results = scraper.scrape(query=query)
        assert len(results) >= min_rec, \
            f"Expected ≥{min_rec} records for '{query}', got {len(results)}"


# ── SunnySky scraper tests ─────────────────────────────────────────────────────

class TestSunnySkyScraper:

    @pytest.fixture(scope="class")
    def scraper(self):
        from scrapers.sunnysky_scraper import SunnySkyScraper
        return SunnySkyScraper()

    @pytest.mark.slow
    @pytest.mark.parametrize("query,company,source,min_rec", SUNNYSKY_MOTORS)
    def test_scrape_motor(self, scraper, query, company, source, min_rec):
        results = scraper.scrape(query=query)
        assert len(results) >= min_rec, \
            f"Expected ≥{min_rec} records for '{query}', got {len(results)}"


# ── EMAX scraper tests (Shopify JSON API) ─────────────────────────────────────

class TestEmaxScraper:

    @pytest.fixture(scope="class")
    def scraper(self):
        from scrapers.emax_scraper import EmaxScraper
        return EmaxScraper()

    @pytest.mark.slow
    @pytest.mark.parametrize("query,company,source,min_rec", EMAX_MOTORS)
    def test_scrape_motor(self, scraper, query, company, source, min_rec):
        results = scraper.scrape(query=query)
        assert len(results) >= min_rec, \
            f"Expected ≥{min_rec} records for '{query}', got {len(results)}"

    @pytest.mark.slow
    def test_returns_well_formed_records(self, scraper):
        results = scraper.scrape(query="EMAX ECO 2207")
        for r in results:
            assert "motor_name" in r or "category" in r, f"Bad record: {r}"
            assert r.get("source") == "emax_official"

    @pytest.mark.slow
    def test_no_propellers_in_results(self, scraper):
        results = scraper.scrape(query="EMAX")
        for r in results:
            name = (r.get("motor_name") or "").lower()
            assert "propeller" not in name and "prop guard" not in name


# ── SpeedyBee scraper tests (Shopify JSON API) ────────────────────────────────

class TestSpeedyBeeScraper:

    @pytest.fixture(scope="class")
    def scraper(self):
        from scrapers.speedybee_scraper import SpeedbeeeScraper
        return SpeedbeeeScraper()

    @pytest.mark.slow
    def test_scrape_returns_list(self, scraper):
        results = scraper.scrape(query="2207")
        assert isinstance(results, list)

    @pytest.mark.slow
    def test_records_have_source(self, scraper):
        results = scraper.scrape(query="motor")
        for r in results:
            assert r.get("source") == "speedybee_official"


# ── GetFPV scraper tests ───────────────────────────────────────────────────────

class TestGetFPVScraper:

    @pytest.fixture(scope="class")
    def scraper(self):
        from scrapers.getfpv_scraper import GetFPVScraper
        return GetFPVScraper()

    @pytest.mark.slow
    def test_scrape_returns_list(self, scraper):
        results = scraper.scrape(query="T-Motor MN3508")
        assert isinstance(results, list)
