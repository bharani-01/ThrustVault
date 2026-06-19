"""
parsers/groq_parser.py — AI-powered motor spec extractor using Groq.

Rate limit strategy
-------------------
Groq has TWO separate rate limit types — they must be handled differently:

  TPD  (tokens per day)    — daily quota exhausted.
       → NEVER retry or sleep. Fail immediately and block ALL subsequent
         calls for the rest of the cooldown window. Sleeping 5 minutes
         then retrying just hits the same wall.

  RPM  (requests per minute) — too many calls per minute.
       → 1 retry after a short sleep (typically 10–60s) is appropriate.

Thread safety
-------------
`_rate_limited_until` is protected by `_lock` so the first thread that
hits a 429 immediately guards ALL parallel enrichment threads without
each one independently attempting + sleeping.
"""

import json
import re
import time
import threading
from typing import Optional
from utils.logger import get_logger

log = get_logger(__name__)


class GroqParser:
    def __init__(self):
        self._client = None
        self._model  = None
        self._lock   = threading.Lock()
        # Epoch timestamp after which calls are allowed again (0 = unrestricted)
        self._rate_limited_until: float = 0
        # True when the daily (TPD) limit is hit — no retry until tomorrow
        self._tpd_exhausted: bool = False

    def _get_client(self):
        if self._client is not None:
            return self._client
        try:
            from groq import Groq
            from config import GROQ_API_KEY, GROQ_MODEL
            if not GROQ_API_KEY or GROQ_API_KEY == "your_groq_api_key_here":
                log.warning("[groq] GROQ_API_KEY not set — AI parsing disabled.")
                return None
            self._client = Groq(api_key=GROQ_API_KEY)
            self._model  = GROQ_MODEL
            log.info(f"[groq] Connected — model: {GROQ_MODEL}")
            return self._client
        except ImportError:
            log.warning("[groq] groq package not installed. Run: pip install groq")
            return None

    # ── Rate-limit helpers ──────────────────────────────────────────────────

    def _is_rate_limited(self) -> tuple[bool, int]:
        """
        Thread-safe check.
        Returns (is_limited, remaining_seconds).
        """
        with self._lock:
            if self._rate_limited_until > 0 and time.time() < self._rate_limited_until:
                remaining = int(self._rate_limited_until - time.time())
                return True, remaining
            # Window expired — reset
            if self._rate_limited_until > 0:
                self._rate_limited_until = 0
                self._tpd_exhausted = False
            return False, 0

    def _parse_retry_after(self, error_msg: str) -> int:
        """Extract retry-after seconds from Groq error message."""
        m = re.search(r'try again in\s+(?:(\d+)m\s*)?(\d+(?:\.\d+)?)s', error_msg, re.IGNORECASE)
        if m:
            minutes = int(m.group(1) or 0)
            seconds = float(m.group(2) or 0)
            return int(minutes * 60 + seconds) + 5   # +5s safety buffer
        return 60

    def _classify_rate_limit(self, error_msg: str) -> str:
        """
        Returns 'tpd' for daily token limit, 'rpm' for per-minute limit,
        or 'other' if not a rate limit error.
        """
        lower = error_msg.lower()
        if "tokens per day" in lower or "tpd" in lower or "per day" in lower:
            return "tpd"
        if "requests per minute" in lower or "rpm" in lower or "rate_limit" in lower or "429" in error_msg:
            return "rpm"
        return "other"

    def _set_cooldown(self, wait_sec: int, is_tpd: bool) -> None:
        """Thread-safe cooldown setter."""
        with self._lock:
            # Only extend cooldown, never shorten it
            new_deadline = time.time() + wait_sec
            if new_deadline > self._rate_limited_until:
                self._rate_limited_until = new_deadline
            if is_tpd:
                self._tpd_exhausted = True

    # ── Core API call ───────────────────────────────────────────────────────

    def _call_groq(self, prompt: str, max_tokens: int = 200) -> Optional[str]:
        """
        Make a Groq API call.

        - TPD limit → fail immediately, no sleep, no retry.
        - RPM limit → sleep the retry_after duration, then retry once.
        - Other error → fail immediately.

        Returns response text or None.
        """
        client = self._get_client()
        if not client:
            return None

        is_limited, remaining = self._is_rate_limited()
        if is_limited:
            log.debug(f"[groq] Blocked by cooldown — {remaining}s remaining")
            return None

        for attempt in range(2):   # max 2 attempts: initial + 1 RPM retry
            try:
                response = client.chat.completions.create(
                    model=self._model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.1,
                    max_tokens=max_tokens,
                )
                return response.choices[0].message.content.strip()

            except Exception as e:
                err_str = str(e)
                limit_type = self._classify_rate_limit(err_str)

                if limit_type == "tpd":
                    # Daily budget exhausted — block immediately, DO NOT sleep or retry
                    wait_sec = self._parse_retry_after(err_str)
                    self._set_cooldown(wait_sec, is_tpd=True)
                    log.warning(
                        f"[groq] ⛔ Daily token limit (TPD) exhausted. "
                        f"All Groq calls disabled for ~{wait_sec // 60}m {wait_sec % 60}s. "
                        f"No retry."
                    )
                    return None

                elif limit_type == "rpm" and attempt == 0:
                    # Per-minute rate limit — sleep and retry once
                    wait_sec = self._parse_retry_after(err_str)
                    self._set_cooldown(wait_sec, is_tpd=False)
                    log.warning(f"[groq] RPM rate limit — sleeping {wait_sec}s before retry...")
                    time.sleep(wait_sec)
                    # Reset window so the retry can proceed
                    with self._lock:
                        self._rate_limited_until = 0

                else:
                    log.warning(f"[groq] API call failed: {e}")
                    return None

        return None

    # ── Public API ──────────────────────────────────────────────────────────

    def extract_motor_specs(self, raw_text: str, product_name: str = "") -> dict:
        """Extract motor specs from text via Groq. Keeps prompt short to save TPD budget."""
        # Hard-trim — most specs are near the top of product pages
        trimmed = raw_text.strip()[:800]

        prompt = (
            f"Extract motor specs from: {product_name}\n"
            f"Text: {trimmed}\n\n"
            "Return ONLY valid JSON with these fields (null if unknown):\n"
            '{"motor_name":null,"company":null,"max_thrust":null,"kv_rating":null,'
            '"stator_size":null,"weight_g":null,"recommended_esc":null,'
            '"recommended_propeller":null,"battery_config":null,"max_current":null}'
        )

        text = self._call_groq(prompt, max_tokens=200)
        if not text:
            return {}
        try:
            json_match = re.search(r"\{.*\}", text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group())
        except Exception as e:
            log.debug(f"[groq] JSON parse error: {e}")
        return {}

    def enrich_motor_record(self, record: dict, raw_page_text: str = "") -> dict:
        """
        Enrich a scraped motor record using Groq.
        Only fills empty fields. Skips if record is already complete or if rate-limited.
        """
        # Skip if already well-populated — saves tokens
        if all([record.get("motor_name"), record.get("company"), record.get("kv_rating"),
                record.get("max_thrust"), record.get("recommended_esc")]):
            log.debug(f"[groq] Already complete, skipping: {record.get('motor_name')}")
            return record

        # Fast-fail if rate limited (thread-safe check)
        is_limited, _ = self._is_rate_limited()
        if is_limited:
            return record

        if not raw_page_text:
            raw_page_text = " ".join(filter(None, [
                record.get("motor_name", ""),
                record.get("description", ""),
                record.get("stator_size", ""),
                record.get("kv_rating", ""),
            ]))

        extracted = self.extract_motor_specs(raw_page_text, record.get("motor_name", ""))
        if not extracted:
            return record

        # Merge: only fill empty fields — never overwrite existing data
        enriched = dict(record)
        for field in ["motor_name", "company", "max_thrust", "recommended_esc",
                      "recommended_propeller", "kv_rating", "stator_size",
                      "weight_g", "battery_config", "max_current"]:
            if not enriched.get(field) and extracted.get(field):
                enriched[field] = extracted[field]

        return enriched

    def summarize_batch(self, motors: list[dict]) -> str:
        """
        Generate a concise summary of scraped motors.
        Falls back to a data-derived summary if Groq is unavailable.
        """
        if not motors:
            return "No motors scraped."

        is_limited, remaining = self._is_rate_limited()
        if is_limited:
            mins, secs = remaining // 60, remaining % 60
            companies = sorted({m.get("company", "") for m in motors if m.get("company")})
            brand_str = ", ".join(companies[:5]) + ("..." if len(companies) > 5 else "")
            return (
                f"Scraped {len(motors)} motors from {len(companies)} brand(s): {brand_str}. "
                f"(Groq AI summary unavailable — daily token limit reached. "
                f"Resets in ~{mins}m {secs}s)"
            )

        # Compact prompt — just motor names to minimise token spend
        sample = motors[:15]
        names = ", ".join(m.get("motor_name", "?")[:40] for m in sample)
        total = len(motors)
        extra = f" (+{total - len(sample)} more)" if total > len(sample) else ""

        prompt = (
            f"Drone motors scraped ({total} total): {names}{extra}\n\n"
            "Write 2-3 sentences: brands found, KV/thrust range, notable motors. "
            "Be technical and concise."
        )

        text = self._call_groq(prompt, max_tokens=150)
        if text:
            return f"Scraped {total} motors. {text}"

        # Final fallback — no AI, just data
        companies = sorted({m.get("company", "") for m in motors if m.get("company")})
        brand_str = ", ".join(companies[:5]) + ("..." if len(companies) > 5 else "")
        return (
            f"Scraped {total} motors from {len(companies)} brand(s): {brand_str}. "
            f"(Groq AI summary unavailable)"
        )

    @property
    def is_available(self) -> bool:
        """True if Groq is configured and not currently rate-limited."""
        if not self._get_client():
            return False
        limited, _ = self._is_rate_limited()
        return not limited


# Singleton instance
groq_parser = GroqParser()
