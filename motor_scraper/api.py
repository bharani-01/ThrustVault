"""
api.py — Motor Scraper Web API
==============================
Flask backend with Server-Sent Events (SSE) for live scraping status.

Endpoints:
  GET  /                     → serve the UI
  POST /scrape               → start a scrape job, returns job_id
  GET  /stream/<job_id>      → SSE stream of live logs + results
  GET  /results/<job_id>     → get final results as JSON

Run: python api.py
"""

import sys
import json
import queue
import threading
import uuid
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))

from flask import Flask, Response, request, jsonify, send_from_directory
from utils.logger import get_logger
from parsers.motor_parser import normalize_batch
from parsers.groq_parser import groq_parser
from utils.dedup import dedup_motors

# ── Pre-import all scrapers at startup (main thread) to avoid
#    Python _ModuleLock deadlocks when threads import concurrently ──────────
from scrapers.tmotor_scraper import TMotorScraper
from scrapers.getfpv_scraper import GetFPVScraper
from scrapers.rcbenchmark_scraper import RCBenchmarkScraper
from scrapers.emax_scraper import EmaxScraper
from scrapers.speedybee_scraper import SpeedbeeeScraper
from scrapers.mad_scraper import MADScraper
from scrapers.kdedirect_scraper import KDEDirectScraper
from scrapers.sunnysky_scraper import SunnySkyScraper
from scrapers.google.google_scraper import GoogleScraper

log = get_logger("api")

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["SECRET_KEY"] = "thrustvault-scraper-2024"

# ── In-memory job store ────────────────────────────────────────────────────
# job_id → { "queue": Queue, "results": [], "status": "running"|"done"|"error" }
JOBS: dict[str, dict] = {}


# Words that appear in queries but rarely in product names — skip them in matching
_NOISE_WORDS = {
    "motor", "t", "tmotor", "brushless", "bldc", "uav", "drone",
    "outrunner", "inrunner", "fpv", "multi", "rotor", "official"
}


import re as _re

def _sanitize_query(query: str) -> str:
    """
    Strip annotation noise from motor queries before sending to scrapers.
    Examples:
      'T-Motor U7 V2.0 KV420 (*9.1 kg)'  → 'T-Motor U7 V2.0 KV420'
      'MAD 5010 EEE V2.0 KV150 (12S)'    → 'MAD 5010 EEE V2.0 KV150'
      'T-Motor U12 II KV60 — Alpha 120A'  → 'T-Motor U12 II KV60'
      'KDE8218XF-120 (HE) — 30.5 Dual'   → 'KDE8218XF-120'
    """
    q = query.strip()
    # Remove (*...) weight annotations
    q = _re.sub(r'\(\*[^)]*\)', '', q)
    # Remove (12S), (6S), (HE), (Pin), (No Pin) etc.
    q = _re.sub(r'\([^)]{1,20}\)', '', q)
    # Remove trailing — description (em-dash / en-dash / double-hyphen ONLY)
    # Single hyphen must NOT be stripped — part of part numbers like KDE4215XF-465
    q = _re.sub(r'\s*(?:—|–|--)\s*.+$', '', q)
    # Remove trailing * marker
    q = _re.sub(r'\s*\*\s*$', '', q)
    # Collapse whitespace
    q = _re.sub(r'\s+', ' ', q).strip()
    return q


def _tokenize(text: str) -> list[str]:
    """
    Break a motor name/query into searchable tokens.
    e.g. 'MN3508 KV380'         → ['mn3508', 'kv380', '380', '3508']
         'T-Motor U7 V2.0 KV420' → ['u7', 'v2.0', 'kv420', '420', '7']
    """
    text = _sanitize_query(text).lower()
    # Split on spaces, dashes, underscores, slashes (but NOT dots — preserves 'v2.0')
    parts = _re.split(r'[\s\-_/]+', text)
    tokens = set(parts)
    # Also extract bare numbers (e.g. '420' from 'kv420' or '420kv')
    for p in parts:
        nums = _re.findall(r'\d+', p)
        tokens.update(nums)
    # Remove noise words and empty strings
    return [t for t in tokens if t and t not in _NOISE_WORDS]


def smart_match(query: str, candidate: str) -> bool:
    """
    Returns True if ALL meaningful tokens in the query appear in the candidate.
    Handles:
      'MN3508 KV380'  matching 'MN3508-380KV'  (reversed KV format)
      'MAD 5008 KV240' matching 'MAD 5008 240KV' (same)
    Skips single chars, noise words.
    """
    if not query.strip():
        return True  # no query = match everything

    q_tokens = _tokenize(query)
    c_text   = candidate.lower()

    for tok in q_tokens:
        if len(tok) < 2:
            continue  # skip single chars
        if tok in _NOISE_WORDS:
            continue  # skip brand/category noise
        if tok in c_text:
            continue  # direct hit

        # Handle reversed KV formats:
        #   query token 'kv380'  → also try '380kv', '380'
        #   query token '380'    → also try 'kv380', '380kv'
        kv_fwd = _re.match(r'^kv(\d+)$', tok)   # kv380 → 380
        kv_rev = _re.match(r'^(\d+)kv$', tok)   # 380kv → 380
        if kv_fwd:
            num = kv_fwd.group(1)
            if f"{num}kv" in c_text or num in c_text:
                continue
        elif kv_rev:
            num = kv_rev.group(1)
            if f"kv{num}" in c_text or num in c_text:
                continue
        else:
            return False   # token not found in any form

    return True


# ── Scraper runner (runs in background thread) ─────────────────────────────
def run_scrape_job(job_id: str, motor_query: str, sources: list[str], use_groq: bool):
    job = JOBS[job_id]
    q: queue.Queue = job["queue"]

    def emit(event_type: str, data: dict):
        q.put({"type": event_type, "data": data})

    def log_msg(msg: str, level: str = "info"):
        emit("log", {"message": msg, "level": level, "ts": datetime.now().strftime("%H:%M:%S")})

    try:
        # ── Sanitize query first — strips (*9.1 kg), (12S), — Alpha 80A etc.
        clean_query = _sanitize_query(motor_query)
        if clean_query != motor_query:
            log_msg(f"✂ Query cleaned: '{motor_query}' → '{clean_query}'", "info")
            motor_query = clean_query
            # Also update job so results/export reflect clean query
            job["query"] = clean_query

        log_msg(f"🚀 Starting scrape for: '{motor_query}'", "info")
        log_msg(f"📡 Sources: {', '.join(sources)}", "info")
        if motor_query:
            log_msg(f"🧠 Query tokens: {_tokenize(motor_query)}", "info")

        import concurrent.futures

        all_motors: list[dict] = []
        all_performance: list[dict] = []

        def scrape_source(src):
            log_msg(f"🔍 Scraping [{src}]...", "source")
            src_motors = []
            src_performance = []
            try:
                scraper = _get_scraper(src)
                if scraper is None:
                    log_msg(f"⚠ Unknown source: {src}", "warn")
                    return src_motors, src_performance

                # Pass query so scrapers can use site search URLs
                raw = scraper.scrape(query=motor_query)

                # Smart multi-term filter
                if motor_query.strip():
                    filtered = []
                    for r in raw:
                        is_perf = "throttle" in r or r.get("source") == "rcbenchmark" or "label" in r
                        if is_perf:
                            match_text = r.get("label", "")
                        else:
                            match_text = " ".join(filter(None, [
                                r.get("motor_name", ""),
                                r.get("name", ""),
                                r.get("kv_rating", ""),
                                r.get("stator_size", ""),
                                r.get("source_url", ""),   # URL often contains model code
                                r.get("link_motor", ""),   # same
                            ]))
                        if smart_match(motor_query, match_text):
                            filtered.append(r)
                    log_msg(f"  ✅ [{src}] {len(filtered)}/{len(raw)} match '{motor_query}'", "success")
                    raw = filtered
                else:
                    log_msg(f"  ✅ [{src}] {len(raw)} items found", "success")

                for record in raw:
                    if "throttle" in record or record.get("source") == "rcbenchmark":
                        src_performance.append(record)
                    else:
                        src_motors.append(record)

            except Exception as e:
                # Show root cause (unwrap RetryError if present)
                cause = getattr(e, "__cause__", None) or getattr(e, "last_attempt", None)
                if cause:
                    root = getattr(cause, "exception", cause)
                    log_msg(f"  ❌ [{src}] {type(root).__name__}: {root}", "error")
                else:
                    log_msg(f"  ❌ [{src}] {type(e).__name__}: {e}", "error")
            return src_motors, src_performance

        # 1. Run sources in parallel
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(sources)) as executor:
            future_to_src = {executor.submit(scrape_source, src): src for src in sources}
            for future in concurrent.futures.as_completed(future_to_src):
                src_motors, src_performance = future.result()
                all_motors.extend(src_motors)
                all_performance.extend(src_performance)

        # Normalize
        log_msg(f"⚙ Normalizing {len(all_motors)} motor records...", "info")
        all_motors = normalize_batch(all_motors)
        all_motors = dedup_motors(all_motors)
        log_msg(f"  → {len(all_motors)} unique motors after dedup", "info")

        # Deduplicate performance points: T-Motor tables repeat each row 3×
        seen_perf = set()
        deduped_perf = []
        for p in all_performance:
            key = (
                p.get("label", ""),
                p.get("throttle"),
                p.get("thrust_g"),
                p.get("rpm"),
            )
            if key not in seen_perf:
                seen_perf.add(key)
                deduped_perf.append(p)
        if len(deduped_perf) < len(all_performance):
            log_msg(f"  → Deduped perf: {len(all_performance)} → {len(deduped_perf)} points", "info")
        all_performance = deduped_perf

        # Groq enrichment
        if use_groq and all_motors:
            log_msg("🤖 Running Groq AI enrichment...", "ai")
            indices_to_enrich = [
                i for i, m in enumerate(all_motors)
                if not m.get("max_thrust") or not m.get("company")
            ]
            if indices_to_enrich:
                def enrich_single(idx):
                    return idx, groq_parser.enrich_motor_record(all_motors[idx])

                max_workers = min(10, len(indices_to_enrich))
                with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                    futures = [executor.submit(enrich_single, idx) for idx in indices_to_enrich]
                    enriched_count = 0
                    for future in concurrent.futures.as_completed(futures):
                        idx, enriched_record = future.result()
                        all_motors[idx] = enriched_record
                        enriched_count += 1
                        if enriched_count % 5 == 0:
                            log_msg(f"  → Enriched {enriched_count} motors...", "ai")
                log_msg(f"  ✅ Groq enriched {enriched_count} motors", "success")
            else:
                log_msg("  ✅ No motors required Groq enrichment", "success")

            # AI summary
            if all_motors:
                summary = groq_parser.summarize_batch(all_motors)
                emit("ai_summary", {"summary": summary})
                log_msg(f"📊 AI Summary generated", "ai")

        # Send results
        emit("results", {
            "motors": all_motors,
            "performance": all_performance,
            "total_motors": len(all_motors),
            "total_performance": len(all_performance),
        })

        job["results"] = all_motors
        job["performance"] = all_performance
        job["status"] = "done"
        log_msg(f"✅ Done! {len(all_motors)} motors, {len(all_performance)} performance points.", "success")
        emit("done", {"total": len(all_motors) + len(all_performance)})

    except Exception as e:
        job["status"] = "error"
        log_msg(f"💥 Fatal error: {e}", "error")
        emit("error", {"message": str(e)})
    finally:
        q.put(None)  # Signal end of stream


def _get_scraper(name: str):
    """Return a fresh scraper instance for the given source name.
    Classes are pre-imported at startup to avoid threading import deadlocks.
    """
    _registry = {
        "tmotor":      TMotorScraper,
        "getfpv":      GetFPVScraper,
        "rcbenchmark": RCBenchmarkScraper,
        "emax":        EmaxScraper,
        "speedybee":   SpeedbeeeScraper,
        "mad":         MADScraper,
        "kdedirect":   KDEDirectScraper,
        "sunnysky":    SunnySkyScraper,
        "google":      GoogleScraper,
    }
    cls = _registry.get(name)
    if cls is None:
        return None
    try:
        return cls()
    except Exception as e:
        log.error(f"Failed to instantiate scraper '{name}': {e}")
        return None


# ── Routes ─────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory("templates", "index.html")


@app.route("/scrape", methods=["POST"])
def start_scrape():
    data = request.get_json(silent=True) or {}
    motor_query = data.get("motor", "").strip()
    sources     = data.get("sources", ["tmotor", "getfpv", "emax", "speedybee", "rcbenchmark", "mad", "kdedirect", "sunnysky"])
    use_groq    = data.get("use_groq", True)

    job_id = str(uuid.uuid4())
    JOBS[job_id] = {
        "queue":       queue.Queue(),
        "results":     [],
        "performance": [],
        "status":      "running",
        "query":       motor_query,
        "started_at":  datetime.now().isoformat(),
    }

    thread = threading.Thread(
        target=run_scrape_job,
        args=(job_id, motor_query, sources, use_groq),
        daemon=True,
    )
    thread.start()

    return jsonify({"job_id": job_id, "status": "started"})


@app.route("/stream/<job_id>")
def stream(job_id: str):
    if job_id not in JOBS:
        return jsonify({"error": "Job not found"}), 404

    def generate():
        q = JOBS[job_id]["queue"]
        while True:
            try:
                event = q.get(timeout=60)
                if event is None:
                    yield "event: end\ndata: {}\n\n"
                    break
                yield f"event: {event['type']}\ndata: {json.dumps(event['data'])}\n\n"
            except queue.Empty:
                yield "event: heartbeat\ndata: {}\n\n"

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/results/<job_id>")
def get_results(job_id: str):
    if job_id not in JOBS:
        return jsonify({"error": "Job not found"}), 404
    job = JOBS[job_id]
    return jsonify({
        "status":      job["status"],
        "query":       job.get("query", ""),
        "motors":      job.get("results", []),
        "performance": job.get("performance", []),
    })


@app.route("/sources")
def list_sources():
    from config import SOURCES
    return jsonify(SOURCES)


@app.route("/export/<job_id>")
def export_job_csv(job_id: str):
    if job_id not in JOBS:
        return jsonify({"error": "Job not found"}), 404
        
    job = JOBS[job_id]
    motors = job.get("results", [])
    
    import io
    import csv
    
    output = io.StringIO()
    # UTF-8 BOM for Excel compatibility
    output.write('\ufeff')
    
    fieldnames = [
        "MOTOR", "Company", "Max Thrust", "Recommended ESC", "Recommended Propeller",
        "LINK - Motor ", "LINK - ESC", "LINK - Propeller"
    ]
    
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    
    for m in motors:
        writer.writerow({
            "MOTOR":                 m.get("motor_name", ""),
            "Company":               m.get("company", ""),
            "Max Thrust":            m.get("max_thrust", ""),
            "Recommended ESC":       m.get("recommended_esc", ""),
            "Recommended Propeller": m.get("recommended_propeller", ""),
            "LINK - Motor ":         m.get("link_motor", ""),
            "LINK - ESC":            m.get("link_esc", ""),
            "LINK - Propeller":      m.get("link_propeller", ""),
        })
        
    response = Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-disposition": f"attachment; filename=motor_list_export.csv"}
    )
    return response


# ── Batch scrape endpoint ───────────────────────────────────────────────────
@app.route("/batch", methods=["POST"])
def start_batch():
    """
    POST /batch
    Body: { "motors": ["MN3508 KV380", "U7 V2.0 KV420", ...],
            "sources": [...],
            "use_groq": true }

    OR pass raw text (one motor per line) as "text" key.
    Returns: { "batch_id": ..., "jobs": {motor: job_id}, "total": N }
    """
    data = request.get_json(silent=True) or {}
    sources  = data.get("sources",  ["tmotor", "getfpv", "emax", "speedybee", "rcbenchmark", "mad", "kdedirect", "sunnysky"])
    use_groq = data.get("use_groq", False)          # default OFF for speed in batch mode

    # Accept either a list or a raw text block
    motors_list = data.get("motors", [])
    raw_text    = data.get("text", "")

    if raw_text and not motors_list:
        motors_list = _parse_motor_list(raw_text)

    if not motors_list:
        return jsonify({"error": "No motors provided. Send 'motors' list or 'text' block."}), 400

    batch_id = str(uuid.uuid4())[:8]
    jobs = {}

    for motor in motors_list:
        motor = motor.strip()
        if not motor:
            continue
        job_id = str(uuid.uuid4())
        JOBS[job_id] = {
            "queue":       queue.Queue(),
            "results":     [],
            "performance": [],
            "status":      "running",
            "query":       motor,
            "batch_id":    batch_id,
            "started_at":  datetime.now().isoformat(),
        }
        thread = threading.Thread(
            target=run_scrape_job,
            args=(job_id, motor, sources, use_groq),
            daemon=True,
        )
        thread.start()
        jobs[motor] = job_id

    return jsonify({
        "batch_id": batch_id,
        "total":    len(jobs),
        "jobs":     jobs,
        "message":  f"Batch of {len(jobs)} motors started. Poll /batch/status/{batch_id} for progress.",
    })


@app.route("/batch/status/<batch_id>")
def batch_status(batch_id: str):
    """Returns aggregate status of all jobs belonging to a batch."""
    batch_jobs = {jid: job for jid, job in JOBS.items() if job.get("batch_id") == batch_id}
    if not batch_jobs:
        return jsonify({"error": "Batch not found"}), 404

    total    = len(batch_jobs)
    done     = sum(1 for j in batch_jobs.values() if j["status"] == "done")
    running  = sum(1 for j in batch_jobs.values() if j["status"] == "running")
    errored  = sum(1 for j in batch_jobs.values() if j["status"] == "error")
    found    = sum(len(j.get("results", [])) for j in batch_jobs.values())
    perf_pts = sum(len(j.get("performance", [])) for j in batch_jobs.values())

    return jsonify({
        "batch_id":     batch_id,
        "total":        total,
        "done":         done,
        "running":      running,
        "errored":      errored,
        "motors_found": found,
        "perf_points":  perf_pts,
        "complete":     done + errored == total,
    })


@app.route("/batch/export/<batch_id>")
def batch_export(batch_id: str):
    """Exports all results from a batch as a single CSV."""
    import io, csv
    batch_jobs = {jid: job for jid, job in JOBS.items() if job.get("batch_id") == batch_id}
    if not batch_jobs:
        return jsonify({"error": "Batch not found"}), 404

    output = io.StringIO()
    output.write('\ufeff')  # UTF-8 BOM for Excel
    fieldnames = [
        "Query", "MOTOR", "Company", "KV Rating", "Max Thrust",
        "Recommended ESC", "Recommended Propeller",
        "LINK - Motor", "LINK - ESC", "LINK - Propeller", "Source"
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()

    for job_id, job in batch_jobs.items():
        query = job.get("query", "")
        for m in job.get("results", []):
            writer.writerow({
                "Query":                 query,
                "MOTOR":                 m.get("motor_name", ""),
                "Company":               m.get("company", ""),
                "KV Rating":             m.get("kv_rating", ""),
                "Max Thrust":            m.get("max_thrust", ""),
                "Recommended ESC":       m.get("recommended_esc", ""),
                "Recommended Propeller": m.get("recommended_propeller", ""),
                "LINK - Motor":          m.get("link_motor", ""),
                "LINK - ESC":            m.get("link_esc", ""),
                "LINK - Propeller":      m.get("link_propeller", ""),
                "Source":                m.get("source", ""),
            })

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename=batch_{batch_id}_export.csv"}
    )


def _parse_motor_list(text: str) -> list[str]:
    """
    Parse a pasted motor list (like the user's catalog) into clean motor names.
    Handles:
      - "MN3508 KV380/KV580/KV700"  → ["MN3508 KV380", "MN3508 KV580", "MN3508 KV700"]
      - "T-Motor U7 V2.0 KV420"     → ["T-Motor U7 V2.0 KV420"]
      - "KDE4215XF-465"             → ["KDE4215XF-465"]
      - Lines starting with headers like "MOTOR", "2KG Thrust..." → skipped
    """
    import re
    motors = []
    skip_patterns = re.compile(
        r'^(motor|company|esc|propeller|\d+\s*kg\s*thrust|thrust\s*stand|#)',
        re.IGNORECASE
    )

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or skip_patterns.match(line):
            continue
        # Remove trailing annotations — only em-dash (—), en-dash (–), or double-hyphen (--)
        # Single hyphen (-) must NOT be stripped — it's part of part numbers like KDE4215XF-465
        line = re.sub(r'\s*(?:—|–|--)\s*.+$', '', line).strip()
        line = re.sub(r'\s*\(\*[^)]+\)', '', line).strip()       # (*9.1 kg)
        line = re.sub(r'\s*\(\d+[Ss]\)', '', line).strip()       # (12S), (6S)
        line = re.sub(r'\s*\([A-Za-z][^)]{0,15}\)', '', line).strip()  # (HE), (Pin), (No Pin)

        # Expand KV variants: "MN3508 KV380/KV580/KV700" → 3 motors
        kv_variants = re.findall(r'[Kk][Vv]\s*(\d{2,5})', line)
        base = re.sub(r'\s*[Kk][Vv][\d/\s]+.*$', '', line).strip()

        if len(kv_variants) > 1:
            for kv in kv_variants:
                motors.append(f"{base} KV{kv}")
        elif line:
            motors.append(line)

    return [m for m in motors if len(m) >= 3]


if __name__ == "__main__":
    print("\n🚁 Motor Scraper Web UI")
    print("   → http://localhost:5050\n")
    app.run(host="0.0.0.0", port=5050, debug=False, threaded=True)
