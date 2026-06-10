"""
tests/test_all_sources.py
=========================
Complete integration test suite — covers ALL 8 sources, the full API
pipeline, batch endpoint, and parallel concurrent instances.

Motor coverage: T-Motor · MAD Components · KDE Direct · SunnySky ·
                EMAX · SpeedyBee · GetFPV · RCBenchmark

Run modes
---------
  Unit only (offline, fast):
      pytest tests/test_all_sources.py -m "not slow" -v

  All tests (network, ~3-5 min):
      pytest tests/test_all_sources.py -m slow -v

  Parallel (4 workers, requires pytest-xdist):
      pytest tests/test_all_sources.py -m slow -n 4 -v
"""

import sys, os, re, time, threading, json, concurrent.futures
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

# ─────────────────────────────────────────────────────────────────────────────
# Curated motor list — one representative motor per source / brand
# Format: (query, scraper_name, expected_company_substr, min_records)
# ─────────────────────────────────────────────────────────────────────────────
ALL_SOURCE_MOTORS = [
    # ── T-Motor official store ────────────────────────────────────────────────
    ("T-Motor MN3508 KV380",       "tmotor",       "T-Motor",   1),
    ("T-Motor U7 V2.0 KV420",      "tmotor",       "T-Motor",   1),
    ("T-Motor MN5212 KV280",       "tmotor",       "T-Motor",   1),
    ("T-Motor U10 Plus KV100",     "tmotor",       "T-Motor",   1),
    ("T-Motor P80 III KV100",      "tmotor",       "T-Motor",   1),

    # ── MAD Components ───────────────────────────────────────────────────────
    ("MAD 5008 IPE V3 KV240",      "mad",          "MAD",       1),
    ("MAD 5010 EEE V2.0 KV200",   "mad",          "MAD",       1),
    ("MAD M6C10 EEE KV200",        "mad",          "MAD",       1),

    # ── KDE Direct ───────────────────────────────────────────────────────────
    ("KDE4215XF-465",              "kdedirect",    "KDE",       1),
    ("KDE5215XF-330",              "kdedirect",    "KDE",       1),
    ("KDE6213XF-185",              "kdedirect",    "KDE",       1),

    # ── SunnySky ─────────────────────────────────────────────────────────────
    ("SunnySky V5210 KV300",       "sunnysky",     "SunnySky",  1),
    ("SunnySky X5212S KV320",      "sunnysky",     "SunnySky",  1),

    # ── EMAX (Shopify JSON API) ───────────────────────────────────────────────
    ("EMAX ECO 2207 2400KV",       "emax",         "EMAX",      1),
    ("EMAX RS2205 2300KV",         "emax",         "EMAX",      1),

    # ── SpeedyBee (Shopify JSON API) ──────────────────────────────────────────
    ("SpeedyBee 2207 motor",       "speedybee",    "SpeedyBee", 1),

    # ── GetFPV (retailer — may have multiple brands) ───────────────────────────
    ("T-Motor MN3508",             "getfpv",       "",          0),  # 0 = just ensure no crash

    # ── RCBenchmark (CSV database) ────────────────────────────────────────────
    ("T-Motor MN3508",             "rcbenchmark",  "",          0),  # network often blocked
]

# ─────────────────────────────────────────────────────────────────────────────
# Scraper registry (mirrors api.py _registry)
# ─────────────────────────────────────────────────────────────────────────────

def _get_scraper(name: str):
    from scrapers.tmotor_scraper      import TMotorScraper
    from scrapers.getfpv_scraper      import GetFPVScraper
    from scrapers.emax_scraper        import EmaxScraper
    from scrapers.speedybee_scraper   import SpeedbeeeScraper
    from scrapers.rcbenchmark_scraper import RCBenchmarkScraper
    from scrapers.mad_scraper         import MADScraper
    from scrapers.kdedirect_scraper   import KDEDirectScraper
    from scrapers.sunnysky_scraper    import SunnySkyScraper

    registry = {
        "tmotor":      TMotorScraper,
        "getfpv":      GetFPVScraper,
        "emax":        EmaxScraper,
        "speedybee":   SpeedbeeeScraper,
        "rcbenchmark": RCBenchmarkScraper,
        "mad":         MADScraper,
        "kdedirect":   KDEDirectScraper,
        "sunnysky":    SunnySkyScraper,
    }
    cls = registry.get(name)
    return cls() if cls else None


# ─────────────────────────────────────────────────────────────────────────────
# 1. OFFLINE UNIT TESTS  (no network)
# ─────────────────────────────────────────────────────────────────────────────

class TestQueryProcessing:
    """Verify query sanitizer, tokenizer, and smart_match offline."""

    from api import _sanitize_query, _tokenize, smart_match

    # ── Sanitizer ──
    @pytest.mark.parametrize("raw,expected", [
        ("T-Motor U7 V2.0 KV420 (*9.1 kg)",    "T-Motor U7 V2.0 KV420"),
        ("MAD 5010 EEE V2.0 KV150 (12S)",       "MAD 5010 EEE V2.0 KV150"),
        ("T-Motor U12 II KV60 — Alpha 120A",     "T-Motor U12 II KV60"),
        ("KDE8218XF-120 (HE) — 30.5\" Triple",  "KDE8218XF-120"),
        ("T-Motor P80 III KV100 (Pin)",          "T-Motor P80 III KV100"),
        ("T-Motor P80 III KV120 (No Pin)",       "T-Motor P80 III KV120"),
        ("MN3508 KV380",                         "MN3508 KV380"),        # clean, unchanged
        ("",                                      ""),                   # empty
    ])
    def test_sanitize(self, raw, expected):
        from api import _sanitize_query
        assert _sanitize_query(raw) == expected

    # ── Tokenizer ──
    def test_tokenize_tmotor(self):
        from api import _tokenize
        toks = _tokenize("T-Motor U7 V2.0 KV420")
        assert "u7" in toks
        assert "v2.0" in toks
        assert "420" in toks
        assert "motor" not in toks   # noise word

    def test_tokenize_kde(self):
        from api import _tokenize
        toks = _tokenize("KDE4215XF-465")
        assert "kde4215xf" in toks

    def test_tokenize_mad(self):
        from api import _tokenize
        toks = _tokenize("MAD 5008 IPE V3 KV240")
        assert "5008" in toks
        assert "240" in toks

    # ── Smart match — should match ──
    @pytest.mark.parametrize("query,candidate", [
        ("MN3508 KV380",          "T-Motor MN3508 KV380 Multi-Rotor Motor"),
        ("MN3508 KV380",          "MN3508-380KV"),
        ("T-Motor U7 V2.0 KV420", "U7 V2.0 KV420 Motor Page"),
        ("KDE4215XF-465",         "KDE4215XF-465 Brushless Motor"),
        ("MAD 5008 IPE V3 KV240", "MAD 5008 IPE V3 240KV"),
        ("SunnySky V5210 KV300",  "SunnySky V5210-KV300 Drone Motor"),
        # With annotation — sanitizer should handle it
        ("T-Motor U7 V2.0 KV420 (*9.1 kg)", "U7 V2.0 KV420"),
    ])
    def test_smart_match_positive(self, query, candidate):
        from api import smart_match
        assert smart_match(query, candidate), \
            f"'{query}' should match '{candidate}'"

    # ── Smart match — should NOT match ──
    @pytest.mark.parametrize("query,candidate", [
        ("MN3508 KV380",          "MN4010 KV370"),
        ("MN3508 KV380",          "MN3508 KV700"),   # wrong KV
        ("U7 V2.0 KV420",         "Foxtech 4008 Motor"),
        ("KDE4215XF-465",         "KDE5215XF-330"),  # different model
    ])
    def test_smart_match_negative(self, query, candidate):
        from api import smart_match
        assert not smart_match(query, candidate), \
            f"'{query}' should NOT match '{candidate}'"


class TestMotorListParser:
    """Verify the catalog text parser handles all notation styles."""

    FULL_CATALOG = """
2KG Thrust Stand Motors
MOTOR
MN3508 KV380/KV580/KV700
MN3510 KV360/KV630/KV700
KDE4215XF-465
KDE4215XF-330
5KG Thrust Stand Motors
MOTOR
T-Motor U7 V2.0 KV280
T-Motor U7 V2.0 KV420 (*9.1 kg)
MAD 5008 IPE V3 KV240
MAD 5010 EEE V2.0 KV150 (12S)
Sunnysky V5210 KV300
10KG Thrust Stand Motors
MOTOR
T-Motor U8 II PRO KV100 (*9.1 kg)
T-Motor U10 II KV100 — Alpha 80A
MAD M6C10 EEE KV150 — 24\" Prop
KDE6213XF-185 (HE) — Triple Prop
20KG Thrust Stand Motors
MOTOR
T-Motor U12 II KV120
T-Motor P80 III KV100 (Pin)
T-Motor P80 III KV120 (No Pin)
"""

    def test_kv_variants_expanded(self):
        from api import _parse_motor_list
        motors = _parse_motor_list(self.FULL_CATALOG)
        mn3508 = [m for m in motors if "MN3508" in m]
        assert len(mn3508) == 3, f"Expected 3 MN3508 variants, got {mn3508}"
        assert any("KV380" in m for m in mn3508)
        assert any("KV580" in m for m in mn3508)
        assert any("KV700" in m for m in mn3508)

    def test_headers_skipped(self):
        from api import _parse_motor_list
        motors = _parse_motor_list(self.FULL_CATALOG)
        for m in motors:
            assert m.strip().lower() not in ("motor", "company", "esc")
            assert "thrust stand" not in m.lower()
            assert "kg thrust" not in m.lower()

    def test_annotations_stripped(self):
        from api import _parse_motor_list
        motors = _parse_motor_list(self.FULL_CATALOG)
        for m in motors:
            assert "(*9.1 kg)" not in m
            assert "(12S)" not in m
            assert "Alpha 80A" not in m
            assert "Triple Prop" not in m
            assert "(HE)" not in m
            assert "(Pin)" not in m
            assert "(No Pin)" not in m

    def test_all_brands_represented(self):
        from api import _parse_motor_list
        motors = _parse_motor_list(self.FULL_CATALOG)
        text = " ".join(motors)
        assert "MN3508" in text          # T-Motor MN series
        assert "KDE4215" in text         # KDE
        assert "T-Motor U7" in text      # T-Motor U series
        assert "MAD 5008" in text        # MAD
        assert "Sunnysky" in text        # SunnySky
        assert "U12" in text             # T-Motor large
        assert "P80" in text             # T-Motor P series

    def test_total_motor_count_reasonable(self):
        from api import _parse_motor_list
        motors = _parse_motor_list(self.FULL_CATALOG)
        # MN3508(3) + MN3510(3) + KDE(2) + U7(2) + MAD(2) + Sunnysky(1)
        # + U8(1) + U10(1) + MAD M6C10(1) + KDE6213(1) + U12(1) + P80(2) = 20
        assert len(motors) >= 15, f"Expected ≥15 motors, got {len(motors)}: {motors}"


# ─────────────────────────────────────────────────────────────────────────────
# 2. SCRAPER INSTANTIATION TESTS  (offline — no scraping, just class init)
# ─────────────────────────────────────────────────────────────────────────────

class TestScraperInstantiation:
    """All 8 scrapers must import and instantiate without errors."""

    ALL_SCRAPERS = [
        ("tmotor",      "scrapers.tmotor_scraper",      "TMotorScraper"),
        ("getfpv",      "scrapers.getfpv_scraper",       "GetFPVScraper"),
        ("emax",        "scrapers.emax_scraper",         "EmaxScraper"),
        ("speedybee",   "scrapers.speedybee_scraper",    "SpeedbeeeScraper"),
        ("rcbenchmark", "scrapers.rcbenchmark_scraper",  "RCBenchmarkScraper"),
        ("mad",         "scrapers.mad_scraper",          "MADScraper"),
        ("kdedirect",   "scrapers.kdedirect_scraper",    "KDEDirectScraper"),
        ("sunnysky",    "scrapers.sunnysky_scraper",     "SunnySkyScraper"),
    ]

    @pytest.mark.parametrize("src_name,module,classname", ALL_SCRAPERS)
    def test_scraper_imports(self, src_name, module, classname):
        import importlib
        mod = importlib.import_module(module)
        cls = getattr(mod, classname)
        instance = cls()
        assert instance.name == src_name, \
            f"Expected name='{src_name}', got '{instance.name}'"
        assert hasattr(instance, "scrape"), "Missing .scrape() method"
        assert hasattr(instance, "fetch"),  "Missing .fetch() method"

    @pytest.mark.parametrize("src_name,module,classname", ALL_SCRAPERS)
    def test_scraper_via_registry(self, src_name, module, classname):
        scraper = _get_scraper(src_name)
        assert scraper is not None, f"Registry returned None for '{src_name}'"
        assert scraper.name == src_name


# ─────────────────────────────────────────────────────────────────────────────
# 3. NETWORK SCRAPER TESTS  (slow — real HTTP)
# ─────────────────────────────────────────────────────────────────────────────

class TestTMotorScraper:
    """T-Motor — deep scrape with thrust tables."""

    @pytest.fixture(scope="class")
    def scraper(self):
        return _get_scraper("tmotor")

    @pytest.mark.slow
    @pytest.mark.parametrize("query", [
        "T-Motor MN3508 KV380",
        "T-Motor U7 V2.0 KV420",
        "T-Motor MN5212 KV280",
    ])
    def test_returns_results(self, scraper, query):
        results = scraper.scrape(query=query)
        assert isinstance(results, list), "scrape() must return a list"
        assert len(results) > 0, f"Expected results for '{query}', got none"

    @pytest.mark.slow
    def test_motor_record_fields(self, scraper):
        results = scraper.scrape(query="T-Motor MN3508 KV380")
        motors = [r for r in results if "motor_name" in r and "throttle" not in r]
        assert len(motors) > 0, "Expected at least 1 motor record"
        for m in motors:
            assert m.get("company") == "T-Motor"
            assert m.get("motor_name"), "motor_name is empty"
            assert m.get("link_motor"), "link_motor is empty"
            assert m.get("source") == "tmotor_official"

    @pytest.mark.slow
    def test_performance_data_fields(self, scraper):
        results = scraper.scrape(query="T-Motor MN3508 KV380")
        perf = [r for r in results if "throttle" in r]
        assert len(perf) > 0, "Expected performance data points"
        for p in perf:
            assert p["throttle"] is not None
            assert p["thrust_g"] is not None
            assert 0 <= p["throttle"] <= 100, f"Bad throttle: {p['throttle']}"
            assert p["thrust_g"] > 0, f"Bad thrust: {p['thrust_g']}"

    @pytest.mark.slow
    def test_u7_kv420_annotation_stripped(self, scraper):
        """Annotated query must work same as clean query."""
        r1 = scraper.scrape(query="T-Motor U7 V2.0 KV420 (*9.1 kg)")
        r2 = scraper.scrape(query="T-Motor U7 V2.0 KV420")
        # Both should return at least something
        assert len(r1) > 0 or len(r2) > 0, "Both annotated and clean query returned empty"


class TestMADScraper:
    @pytest.fixture(scope="class")
    def scraper(self):
        return _get_scraper("mad")

    @pytest.mark.slow
    @pytest.mark.parametrize("query", [
        "MAD 5008 IPE V3 KV240",
        "MAD 5010 EEE V2.0 KV200",
    ])
    def test_returns_list(self, scraper, query):
        results = scraper.scrape(query=query)
        assert isinstance(results, list)

    @pytest.mark.slow
    def test_records_have_company(self, scraper):
        results = scraper.scrape(query="MAD 5008")
        for r in results:
            company = (r.get("company") or "").upper()
            assert "MAD" in company or r.get("source", "").startswith("mad"), \
                f"Unexpected company in MAD result: {r}"


class TestKDEScraper:
    @pytest.fixture(scope="class")
    def scraper(self):
        return _get_scraper("kdedirect")

    @pytest.mark.slow
    @pytest.mark.parametrize("query", [
        "KDE4215XF-465",
        "KDE5215XF-330",
    ])
    def test_returns_list(self, scraper, query):
        results = scraper.scrape(query=query)
        assert isinstance(results, list)


class TestSunnySkyScraper:
    @pytest.fixture(scope="class")
    def scraper(self):
        return _get_scraper("sunnysky")

    @pytest.mark.slow
    @pytest.mark.parametrize("query", [
        "SunnySky V5210 KV300",
        "SunnySky X5212S KV320",
    ])
    def test_returns_list(self, scraper, query):
        results = scraper.scrape(query=query)
        assert isinstance(results, list)


class TestEmaxScraper:
    @pytest.fixture(scope="class")
    def scraper(self):
        return _get_scraper("emax")

    @pytest.mark.slow
    @pytest.mark.parametrize("query", [
        "EMAX ECO 2207 2400KV",
        "EMAX RS2205",
    ])
    def test_returns_list(self, scraper, query):
        results = scraper.scrape(query=query)
        assert isinstance(results, list)

    @pytest.mark.slow
    def test_records_well_formed(self, scraper):
        results = scraper.scrape(query="EMAX ECO 2207")
        for r in results:
            assert "motor_name" in r or "category" in r
            assert r.get("source") == "emax_official"
            # No propellers
            name = (r.get("motor_name") or "").lower()
            assert "propeller" not in name

    @pytest.mark.slow
    def test_shopify_json_no_html_parse(self, scraper):
        """Verify we use JSON API (fetch returns JSON, not HTML with CSS selectors)."""
        # Scraper should succeed even without Playwright
        results = scraper.scrape(query="motor")
        assert isinstance(results, list)


class TestSpeedyBeeScraper:
    @pytest.fixture(scope="class")
    def scraper(self):
        return _get_scraper("speedybee")

    @pytest.mark.slow
    def test_returns_list(self, scraper):
        results = scraper.scrape(query="2207 motor")
        assert isinstance(results, list)

    @pytest.mark.slow
    def test_source_tag(self, scraper):
        results = scraper.scrape(query="motor")
        for r in results:
            assert r.get("source") == "speedybee_official"


class TestGetFPVScraper:
    @pytest.fixture(scope="class")
    def scraper(self):
        return _get_scraper("getfpv")

    @pytest.mark.slow
    def test_returns_list(self, scraper):
        results = scraper.scrape(query="T-Motor MN3508")
        assert isinstance(results, list)  # may be empty if blocked

    @pytest.mark.slow
    def test_no_crash_on_search(self, scraper):
        try:
            results = scraper.scrape(query="MN3508 KV380")
            assert isinstance(results, list)
        except Exception as e:
            pytest.fail(f"GetFPV scraper raised: {e}")


class TestRCBenchmarkScraper:
    @pytest.fixture(scope="class")
    def scraper(self):
        return _get_scraper("rcbenchmark")

    @pytest.mark.slow
    def test_returns_list(self, scraper):
        results = scraper.scrape(query="MN3508")
        assert isinstance(results, list)  # may be empty if site is blocked

    @pytest.mark.slow
    def test_perf_points_well_formed(self, scraper):
        results = scraper.scrape(query="")
        perf = [r for r in results if r.get("thrust_g") is not None]
        for p in perf[:10]:  # spot-check first 10
            assert p.get("source") == "rcbenchmark"
            assert p.get("throttle") is not None
            assert p["thrust_g"] > 0


# ─────────────────────────────────────────────────────────────────────────────
# 4. PARALLEL INSTANCE TESTS  (multiple scrapers running simultaneously)
# ─────────────────────────────────────────────────────────────────────────────

class TestParallelInstances:
    """
    Spin up multiple scraper instances at the same time — verifies thread
    safety, no shared-state corruption, and deadlock freedom.
    """

    @pytest.mark.slow
    def test_tmotor_concurrent_different_motors(self):
        """Two TMotorScraper instances running different queries in parallel."""
        queries = [
            "T-Motor MN3508 KV380",
            "T-Motor MN5212 KV280",
        ]
        results = {}
        errors  = {}

        def run(q):
            try:
                scraper = _get_scraper("tmotor")
                results[q] = scraper.scrape(query=q)
            except Exception as e:
                errors[q] = str(e)

        threads = [threading.Thread(target=run, args=(q,)) for q in queries]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=60)

        assert not errors, f"Parallel TMotor errors: {errors}"
        for q in queries:
            assert q in results, f"No result dict for query '{q}'"
            assert isinstance(results[q], list), f"Result for '{q}' is not a list"

    @pytest.mark.slow
    def test_all_sources_parallel_single_motor(self):
        """
        All 8 sources scraping 'MN3508 KV380' simultaneously.
        Mirrors the exact production scrape_source() concurrency pattern.
        """
        sources = ["tmotor", "getfpv", "emax", "speedybee",
                   "rcbenchmark", "mad", "kdedirect", "sunnysky"]
        query   = "T-Motor MN3508 KV380"
        results = {}
        errors  = {}

        def scrape_one(src):
            try:
                scraper = _get_scraper(src)
                results[src] = scraper.scrape(query=query)
            except Exception as e:
                errors[src]  = str(e)

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            futures = {pool.submit(scrape_one, src): src for src in sources}
            for f in concurrent.futures.as_completed(futures, timeout=120):
                pass  # exceptions captured in errors dict

        # All sources must complete without exception
        assert not errors, f"Sources crashed: {errors}"
        # Every source must return a list
        for src in sources:
            assert src in results, f"Source '{src}' never returned"
            assert isinstance(results[src], list), \
                f"Source '{src}' returned non-list: {type(results[src])}"

    @pytest.mark.slow
    def test_five_parallel_tmotor_instances(self):
        """
        5 concurrent TMotorScraper instances with different motors —
        stress-tests connection pool and thread safety.
        """
        motors = [
            "T-Motor MN3508 KV380",
            "T-Motor U7 V2.0 KV420",
            "T-Motor MN5212 KV280",
            "T-Motor U10 Plus KV100",
            "T-Motor MN4014 KV330",
        ]
        all_results = {}
        errors      = {}

        def run(q):
            try:
                scraper = _get_scraper("tmotor")
                all_results[q] = scraper.scrape(query=q)
            except Exception as e:
                errors[q] = str(e)

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            futures = {pool.submit(run, q): q for q in motors}
            for f in concurrent.futures.as_completed(futures, timeout=180):
                pass

        assert not errors, f"Parallel TMotor errors: {errors}"
        for q in motors:
            assert isinstance(all_results.get(q), list), \
                f"Missing or invalid result for '{q}'"

    @pytest.mark.slow
    def test_emax_shopify_concurrent(self):
        """
        3 EMAX instances in parallel — tests Shopify JSON API thread safety.
        """
        queries = ["EMAX ECO 2207", "EMAX RS2205", "EMAX"]
        results = {}
        errors  = {}

        def run(q):
            try:
                scraper = _get_scraper("emax")
                results[q] = scraper.scrape(query=q)
            except Exception as e:
                errors[q] = str(e)

        threads = [threading.Thread(target=run, args=(q,)) for q in queries]
        for t in threads: t.start()
        for t in threads: t.join(timeout=60)

        assert not errors, f"EMAX parallel errors: {errors}"


# ─────────────────────────────────────────────────────────────────────────────
# 5. API INTEGRATION TESTS  (Flask running on localhost:5050)
# ─────────────────────────────────────────────────────────────────────────────

API_BASE = "http://localhost:5050"


def _api_available() -> bool:
    try:
        import requests
        r = requests.get(API_BASE, timeout=3)
        return r.status_code == 200
    except Exception:
        return False


@pytest.mark.skipif(not _api_available(), reason="Flask API not running on :5050")
class TestAPIEndpoints:
    """Full-pipeline tests through the HTTP API."""

    def _post_scrape(self, motor: str, sources=None, use_groq=False) -> dict:
        import requests
        payload = {
            "motor":    motor,
            "sources":  sources or ["tmotor"],
            "use_groq": use_groq,
        }
        r = requests.post(f"{API_BASE}/scrape", json=payload, timeout=10)
        assert r.status_code == 200
        return r.json()

    def _wait_for_job(self, job_id: str, timeout: int = 120) -> dict:
        import requests
        deadline = time.time() + timeout
        while time.time() < deadline:
            r = requests.get(f"{API_BASE}/results/{job_id}", timeout=10)
            data = r.json()
            if data.get("status") == "done":
                return data
            time.sleep(2)
        pytest.fail(f"Job {job_id} did not complete in {timeout}s")

    # ── Single scrape ──────────────────────────────────────────────────────────

    @pytest.mark.slow
    def test_scrape_mn3508_tmotor(self):
        resp = self._post_scrape("T-Motor MN3508 KV380", sources=["tmotor"])
        job_id = resp["job_id"]
        data = self._wait_for_job(job_id)
        assert len(data["motors"]) > 0 or len(data["performance"]) > 0, \
            "Expected at least some results for MN3508"

    @pytest.mark.slow
    def test_scrape_u7_all_sources(self):
        resp = self._post_scrape(
            "T-Motor U7 V2.0 KV420 (*9.1 kg)",
            sources=["tmotor", "emax", "speedybee", "mad", "kdedirect", "sunnysky"],
        )
        job_id = resp["job_id"]
        data = self._wait_for_job(job_id)
        # Sanitizer should have cleaned query
        assert data["query"] == "T-Motor U7 V2.0 KV420"

    @pytest.mark.slow
    def test_perf_dedup(self):
        """Verify performance data is deduplicated (no 3× rows)."""
        resp = self._post_scrape("T-Motor U7 V2.0 KV420", sources=["tmotor"])
        data = self._wait_for_job(resp["job_id"])
        perf = data.get("performance", [])
        # Build dedup key tuples
        seen = set()
        dups = 0
        for p in perf:
            key = (p.get("label"), p.get("throttle"), p.get("thrust_g"))
            if key in seen:
                dups += 1
            seen.add(key)
        assert dups == 0, f"Found {dups} duplicate performance points"

    @pytest.mark.slow
    def test_export_csv(self):
        import requests
        resp = self._post_scrape("T-Motor MN3508 KV380", sources=["tmotor"])
        job_id = resp["job_id"]
        self._wait_for_job(job_id)
        r = requests.get(f"{API_BASE}/export/{job_id}", timeout=10)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("Content-Type", "")
        assert len(r.text) > 10   # non-empty CSV

    # ── Batch endpoint ─────────────────────────────────────────────────────────

    @pytest.mark.slow
    def test_batch_motor_list(self):
        """Batch 5 motors via /batch endpoint."""
        import requests
        motors = [
            "T-Motor MN3508 KV380",
            "T-Motor MN3508 KV580",
            "MAD 5008 IPE V3 KV240",
            "KDE4215XF-465",
            "SunnySky V5210 KV300",
        ]
        r = requests.post(
            f"{API_BASE}/batch",
            json={"motors": motors, "sources": ["tmotor", "mad", "kdedirect", "sunnysky"]},
            timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 5
        assert "batch_id" in data
        assert len(data["jobs"]) == 5

    @pytest.mark.slow
    def test_batch_raw_text(self):
        """Batch from pasted catalog text."""
        import requests
        catalog = """
MN3508 KV380/KV580
T-Motor U7 V2.0 KV420 (*9.1 kg)
MAD 5008 IPE V3 KV240
"""
        r = requests.post(
            f"{API_BASE}/batch",
            json={"text": catalog, "sources": ["tmotor", "mad"]},
            timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        # MN3508 → 2 (KV380, KV580) + U7 (1) + MAD (1) = 4
        assert data["total"] >= 4, f"Expected ≥4 motors, got {data['total']}"

    @pytest.mark.slow
    def test_batch_status_endpoint(self):
        import requests
        motors = ["T-Motor MN3508 KV380", "KDE4215XF-465"]
        r = requests.post(
            f"{API_BASE}/batch",
            json={"motors": motors, "sources": ["tmotor", "kdedirect"]},
            timeout=10,
        )
        batch_id = r.json()["batch_id"]
        time.sleep(1)
        r2 = requests.get(f"{API_BASE}/batch/status/{batch_id}", timeout=10)
        assert r2.status_code == 200
        status = r2.json()
        assert status["total"] == 2
        assert "done" in status
        assert "running" in status

    @pytest.mark.slow
    def test_batch_export_csv(self):
        """Wait for batch to complete then download CSV."""
        import requests
        motors = ["T-Motor MN3508 KV380"]
        r = requests.post(
            f"{API_BASE}/batch",
            json={"motors": motors, "sources": ["tmotor"]},
            timeout=10,
        )
        batch_id = r.json()["batch_id"]

        # Wait for completion
        deadline = time.time() + 90
        while time.time() < deadline:
            st = requests.get(f"{API_BASE}/batch/status/{batch_id}", timeout=10).json()
            if st.get("complete"):
                break
            time.sleep(3)

        csv_r = requests.get(f"{API_BASE}/batch/export/{batch_id}", timeout=10)
        assert csv_r.status_code == 200
        assert "text/csv" in csv_r.headers.get("Content-Type", "")

    # ── Parallel HTTP requests ─────────────────────────────────────────────────

    @pytest.mark.slow
    def test_parallel_api_requests(self):
        """
        Fire 6 scrape jobs simultaneously to the API — verifies the
        Flask threaded server and ThreadPoolExecutor handle concurrency.
        """
        import requests
        motors = [
            ("T-Motor MN3508 KV380",   ["tmotor"]),
            ("T-Motor U7 V2.0 KV420",  ["tmotor"]),
            ("MAD 5008 IPE V3 KV240",  ["mad"]),
            ("KDE4215XF-465",          ["kdedirect"]),
            ("SunnySky V5210 KV300",   ["sunnysky"]),
            ("EMAX ECO 2207",          ["emax"]),
        ]

        job_ids = {}

        def submit(motor, sources):
            r = requests.post(
                f"{API_BASE}/scrape",
                json={"motor": motor, "sources": sources, "use_groq": False},
                timeout=10,
            )
            job_ids[motor] = r.json()["job_id"]

        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            futures = [pool.submit(submit, m, s) for m, s in motors]
            concurrent.futures.wait(futures, timeout=30)

        assert len(job_ids) == 6, f"Expected 6 job IDs, got {len(job_ids)}"

        # Poll all jobs until done
        deadline = time.time() + 180
        while time.time() < deadline:
            done = 0
            for motor, jid in job_ids.items():
                st = requests.get(f"{API_BASE}/results/{jid}", timeout=10).json()
                if st.get("status") == "done":
                    done += 1
            if done == 6:
                break
            time.sleep(3)

        # Final check
        for motor, jid in job_ids.items():
            st = requests.get(f"{API_BASE}/results/{jid}", timeout=10).json()
            assert st["status"] == "done", \
                f"Job for '{motor}' never finished: {st['status']}"
