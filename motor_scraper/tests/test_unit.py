"""
tests/test_unit.py
==================
Unit tests for query processing: _sanitize_query, _tokenize, smart_match.
These run entirely offline — no network needed.
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from api import _sanitize_query, _tokenize, smart_match, _parse_motor_list


# ── _sanitize_query ───────────────────────────────────────────────────────────

class TestSanitizeQuery:
    def test_strips_weight_annotation(self):
        assert _sanitize_query("T-Motor U7 V2.0 KV420 (*9.1 kg)") == "T-Motor U7 V2.0 KV420"

    def test_strips_cell_count(self):
        assert _sanitize_query("MAD 5010 EEE V2.0 KV150 (12S)") == "MAD 5010 EEE V2.0 KV150"

    def test_strips_em_dash_annotation(self):
        assert _sanitize_query("T-Motor U12 II KV60 — Alpha 120A") == "T-Motor U12 II KV60"

    def test_strips_triple_prop_annotation(self):
        assert _sanitize_query("KDE8218XF-120 (HE) — 30.5\" Triple") == "KDE8218XF-120"

    def test_strips_he_annotation(self):
        assert _sanitize_query("KDE6213XF-185 (HE)") == "KDE6213XF-185"

    def test_strips_pin_annotation(self):
        assert _sanitize_query("T-Motor P80 III KV100 (Pin)") == "T-Motor P80 III KV100"

    def test_strips_no_pin_annotation(self):
        assert _sanitize_query("T-Motor P80 III KV120 (No Pin)") == "T-Motor P80 III KV120"

    def test_strips_star_weight(self):
        assert _sanitize_query("T-Motor U8 II Lite KV100 (*9.1 kg)") == "T-Motor U8 II Lite KV100"

    def test_clean_query_unchanged(self):
        assert _sanitize_query("MN3508 KV380") == "MN3508 KV380"

    def test_collapses_extra_whitespace(self):
        result = _sanitize_query("T-Motor  U7   V2.0  KV420")
        assert "  " not in result

    def test_empty_string(self):
        assert _sanitize_query("") == ""


# ── _tokenize ─────────────────────────────────────────────────────────────────

class TestTokenize:
    def test_basic_model_kv(self):
        tokens = _tokenize("MN3508 KV380")
        assert "mn3508" in tokens
        assert "kv380" in tokens
        assert "380" in tokens

    def test_u7_v2_preserved(self):
        tokens = _tokenize("T-Motor U7 V2.0 KV420")
        assert "u7" in tokens
        assert "v2.0" in tokens
        assert "kv420" in tokens
        assert "420" in tokens

    def test_noise_words_excluded(self):
        tokens = _tokenize("T-Motor MN3508 KV380")
        assert "motor" not in tokens
        assert "t" not in tokens

    def test_kde_model(self):
        tokens = _tokenize("KDE4215XF-465")
        assert "kde4215xf" in tokens

    def test_mad_model(self):
        tokens = _tokenize("MAD 5008 IPE V3 KV240")
        assert "5008" in tokens
        assert "240" in tokens


# ── smart_match ───────────────────────────────────────────────────────────────

class TestSmartMatch:
    # Positive cases — should match
    def test_mn3508_matches_full_name(self):
        assert smart_match("MN3508 KV380", "T-Motor MN3508 KV380 Multi-Rotor Motor")

    def test_mn3508_matches_variant_format(self):
        assert smart_match("MN3508 KV380", "MN3508-380KV")

    def test_u7_matches_v2_name(self):
        assert smart_match("T-Motor U7 V2.0 KV420", "U7 V2.0 KV420 Motor Page")

    def test_kde_matches_part_number(self):
        assert smart_match("KDE4215XF-465", "KDE4215XF-465 Brushless Motor")

    def test_mad_5008_matches(self):
        assert smart_match("MAD 5008 IPE V3 KV240", "MAD 5008 IPE V3 240KV")

    def test_empty_query_matches_everything(self):
        assert smart_match("", "Any motor name here")

    def test_sunnysky_matches(self):
        assert smart_match("SunnySky V5210 KV300", "SunnySky V5210-KV300 Drone Motor")

    def test_annotation_stripped_before_match(self):
        # Sanitizer runs inside tokenize now
        assert smart_match("T-Motor U7 V2.0 KV420 (*9.1 kg)", "U7 V2.0 KV420")

    # Negative cases — should NOT match
    def test_wrong_model_no_match(self):
        assert not smart_match("MN3508 KV380", "MN4010 KV370")

    def test_wrong_kv_no_match(self):
        # '3508' in candidate, but '380' is not → should fail
        assert not smart_match("MN3508 KV380", "MN3508 KV700")

    def test_completely_different_no_match(self):
        assert not smart_match("U7 V2.0 KV420", "Foxtech 4008 Motor")


# ── _parse_motor_list ─────────────────────────────────────────────────────────

class TestParseMotorList:
    SAMPLE = """
2KG Thrust Stand Motors
MOTOR
MN3508 KV380/KV580/KV700
T-Motor U7 V2.0 KV420 (*9.1 kg)
MAD 5008 IPE V3 KV240
KDE4215XF-465
T-Motor U10 II KV100 — Alpha 80A
MAD 5010 EEE V2.0 KV150 (12S)
"""

    def test_expands_kv_variants(self):
        motors = _parse_motor_list(self.SAMPLE)
        names = [m for m in motors if "MN3508" in m]
        assert len(names) == 3
        assert any("KV380" in n for n in names)
        assert any("KV580" in n for n in names)
        assert any("KV700" in n for n in names)

    def test_strips_weight_annotation(self):
        motors = _parse_motor_list(self.SAMPLE)
        for m in motors:
            assert "(*9.1 kg)" not in m
            assert "*9.1" not in m

    def test_strips_cell_count(self):
        motors = _parse_motor_list(self.SAMPLE)
        for m in motors:
            assert "(12S)" not in m

    def test_strips_em_dash_annotation(self):
        motors = _parse_motor_list(self.SAMPLE)
        for m in motors:
            assert "Alpha 80A" not in m

    def test_skips_header_lines(self):
        motors = _parse_motor_list(self.SAMPLE)
        for m in motors:
            assert m.lower() not in ("motor", "company", "esc")
            assert "thrust stand" not in m.lower()

    def test_kde_single_kv_preserved(self):
        motors = _parse_motor_list(self.SAMPLE)
        assert "KDE4215XF-465" in motors

    def test_mad_preserved(self):
        motors = _parse_motor_list(self.SAMPLE)
        assert any("MAD 5008 IPE V3 KV240" in m for m in motors)
