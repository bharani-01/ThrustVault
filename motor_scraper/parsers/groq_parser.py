"""
parsers/groq_parser.py — AI-powered motor spec extractor using Groq.

Groq runs llama3-70b at ~800 tokens/sec, making it fast enough to process
product pages in near real-time.

What it does:
  - Takes raw scraped text (product description, specs table, etc.)
  - Asks Groq to extract structured motor/ESC/prop data
  - Returns a clean dict matching the ThrustVault schema
  - Falls back to raw scraped values if Groq fails or key is missing
"""

import json
import re
from typing import Optional
from utils.logger import get_logger

log = get_logger(__name__)


class GroqParser:
    def __init__(self):
        self._client = None
        self._model  = None

    def _get_client(self):
        if self._client is not None:
            return self._client
        try:
            from groq import Groq
            from config import GROQ_API_KEY, GROQ_MODEL
            if not GROQ_API_KEY or GROQ_API_KEY == "your_groq_api_key_here":
                log.warning("[groq] GROQ_API_KEY not set — AI parsing disabled. Falling back to raw data.")
                return None
            self._client = Groq(api_key=GROQ_API_KEY)
            self._model  = GROQ_MODEL
            log.info(f"[groq] Connected — model: {GROQ_MODEL}")
            return self._client
        except ImportError:
            log.warning("[groq] groq package not installed. Run: pip install groq")
            return None

    # ── Public API ─────────────────────────────────────────────────────────

    def extract_motor_specs(self, raw_text: str, product_name: str = "") -> dict:
        """
        Feed raw product page text to Groq and get back a clean motor spec dict.
        Returns a dict with schema-compatible fields.
        """
        client = self._get_client()
        if not client:
            return {}

        prompt = f"""You are a drone motor database assistant. 
Extract structured motor specifications from the product text below.

Product name: {product_name}

Product text:
\"\"\"
{raw_text[:4000]}
\"\"\"

Return ONLY a valid JSON object with these exact fields (use null if unknown):
{{
  "motor_name": "full motor model name",
  "company": "manufacturer brand name",
  "max_thrust": "maximum thrust in grams, e.g. 1200g or 1.2kg",
  "kv_rating": "KV rating number, e.g. 2300KV",
  "stator_size": "stator size, e.g. 2207 or 2306",
  "weight_g": "motor weight in grams",
  "shaft_diameter": "shaft diameter in mm",
  "recommended_esc": "recommended ESC model or amperage, e.g. 30A ESC",
  "recommended_propeller": "recommended propeller size, e.g. 5inch 3-blade",
  "battery_config": "battery cell count, e.g. 3S-4S or 6S",
  "max_current": "max current in Amps",
  "description_summary": "1-2 sentence summary of what this motor is best for"
}}

Return ONLY the JSON, no explanation, no markdown.
"""
        try:
            response = client.chat.completions.create(
                model=self._model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=512,
            )
            text = response.choices[0].message.content.strip()
            # Extract JSON even if wrapped in markdown code blocks
            json_match = re.search(r"\{.*\}", text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group())
        except Exception as e:
            log.warning(f"[groq] extract_motor_specs failed: {e}")
        return {}

    def enrich_motor_record(self, record: dict, raw_page_text: str = "") -> dict:
        """
        Takes an existing scraped motor record and enriches it using Groq.
        Only overwrites empty fields — never replaces already-filled ones.
        """
        if not raw_page_text:
            raw_page_text = record.get("motor_name", "") + " " + record.get("description", "")

        extracted = self.extract_motor_specs(raw_page_text, record.get("motor_name", ""))
        if not extracted:
            return record

        # Merge: only fill in empty fields
        enriched = dict(record)
        field_map = {
            "motor_name":            "motor_name",
            "company":               "company",
            "max_thrust":            "max_thrust",
            "recommended_esc":       "recommended_esc",
            "recommended_propeller": "recommended_propeller",
        }
        for schema_field, groq_field in field_map.items():
            if not enriched.get(schema_field) and extracted.get(groq_field):
                enriched[schema_field] = extracted[groq_field]

        # Store extra enriched data
        for extra_field in ["kv_rating", "stator_size", "weight_g", "battery_config",
                            "max_current", "description_summary"]:
            if extracted.get(extra_field):
                enriched[extra_field] = extracted[extra_field]

        return enriched

    def summarize_batch(self, motors: list[dict]) -> str:
        """
        Generate a human-readable summary of a batch of scraped motors.
        Useful for a quick report after scraping.
        """
        client = self._get_client()
        if not client or not motors:
            return f"Scraped {len(motors)} motors. (Groq summarization disabled)"

        # Build a compact table for Groq
        sample = motors[:20]  # summarize first 20
        lines = [f"- {m.get('motor_name','?')} by {m.get('company','?')} | Thrust: {m.get('max_thrust','?')} | ESC: {m.get('recommended_esc','?')}" for m in sample]
        table = "\n".join(lines)

        prompt = f"""You are a drone engineer reviewing motor data.
Here are the latest motors scraped from the web ({len(motors)} total, showing first {len(sample)}):

{table}

Write a concise 3-4 sentence summary covering:
- The range of motor types/brands found
- Thrust ranges observed
- Any interesting patterns or notable motors
Keep it technical and useful for a drone engineer.
"""
        try:
            response = client.chat.completions.create(
                model=self._model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=256,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            log.warning(f"[groq] summarize_batch failed: {e}")
            return f"Scraped {len(motors)} motors. (Groq summary failed: {e})"


# Singleton instance
groq_parser = GroqParser()
