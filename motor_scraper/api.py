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

log = get_logger("api")

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["SECRET_KEY"] = "thrustvault-scraper-2024"

# ── In-memory job store ────────────────────────────────────────────────────
# job_id → { "queue": Queue, "results": [], "status": "running"|"done"|"error" }
JOBS: dict[str, dict] = {}


# ── Smart multi-term query matcher ────────────────────────────────────────
def _tokenize(text: str) -> list[str]:
    """
    Break a motor name/query into searchable tokens.
    e.g. 'MN3508 KV380' → ['mn3508', 'kv380', '380', '3508']
         'MN3508-380KV' → ['mn3508', '380kv', '380', '3508']
    """
    import re
    text = text.lower()
    # Split on spaces, dashes, underscores
    parts = re.split(r'[\s\-_/]+', text)
    tokens = set(parts)
    # Also extract bare numbers (e.g. '380' from 'kv380' or '380kv')
    for p in parts:
        nums = re.findall(r'\d+', p)
        tokens.update(nums)
    return [t for t in tokens if t]


def smart_match(query: str, candidate: str) -> bool:
    """
    Returns True if ALL meaningful tokens in the query appear in the candidate.
    Handles: 'MN3508 KV380' matching 'MN3508-380KV', 'MN 3508 380 KV', etc.
    Ignores pure KV/kv prefix tokens (too generic) unless paired with a number.
    """
    import re
    if not query.strip():
        return True  # no query = match everything

    q_tokens = _tokenize(query)
    c_text   = candidate.lower()

    # Every query token must appear somewhere in candidate text
    for tok in q_tokens:
        if len(tok) < 2:
            continue  # skip single chars
        if tok not in c_text:
            return False
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
        log_msg(f"🚀 Starting scrape for: '{motor_query}'", "info")
        log_msg(f"📡 Sources: {', '.join(sources)}", "info")
        if motor_query:
            log_msg(f"🧠 Query tokens: {_tokenize(motor_query)}", "info")

        all_motors: list[dict] = []
        all_performance: list[dict] = []

        for src in sources:
            log_msg(f"🔍 Scraping [{src}]...", "source")
            try:
                scraper = _get_scraper(src)
                if scraper is None:
                    log_msg(f"⚠ Unknown source: {src}", "warn")
                    continue

                # Pass query so scrapers can use site search URLs
                raw = scraper.scrape(query=motor_query)

                # Smart multi-term filter
                if motor_query.strip():
                    filtered = []
                    for r in raw:
                        if "throttle" in r or r.get("source") == "rcbenchmark" or "label" in r:
                            match_text = r.get("label", "")
                        else:
                            match_text = " ".join(filter(None, [
                                r.get("motor_name", ""),
                                r.get("name", ""),
                                r.get("kv_rating", ""),
                                r.get("stator_size", ""),
                            ]))
                        if smart_match(motor_query, match_text):
                            filtered.append(r)
                    log_msg(f"  ✅ [{src}] {len(filtered)}/{len(raw)} match '{motor_query}'", "success")
                    raw = filtered
                else:
                    log_msg(f"  ✅ [{src}] {len(raw)} items found", "success")

                for record in raw:
                    if "throttle" in record or record.get("source") == "rcbenchmark":
                        all_performance.append(record)
                    else:
                        all_motors.append(record)

            except Exception as e:
                # Show root cause (unwrap RetryError if present)
                cause = getattr(e, "__cause__", None) or getattr(e, "last_attempt", None)
                if cause:
                    root = getattr(cause, "exception", cause)
                    log_msg(f"  ❌ [{src}] {type(root).__name__}: {root}", "error")
                else:
                    log_msg(f"  ❌ [{src}] {type(e).__name__}: {e}", "error")


        # Normalize
        log_msg(f"⚙ Normalizing {len(all_motors)} motor records...", "info")
        all_motors = normalize_batch(all_motors)
        all_motors = dedup_motors(all_motors)
        log_msg(f"  → {len(all_motors)} unique motors after dedup", "info")

        # Groq enrichment
        if use_groq and all_motors:
            log_msg("🤖 Running Groq AI enrichment...", "ai")
            enriched = 0
            for i, motor in enumerate(all_motors):
                if not motor.get("max_thrust") or not motor.get("company"):
                    all_motors[i] = groq_parser.enrich_motor_record(motor)
                    enriched += 1
                    if enriched % 5 == 0:
                        log_msg(f"  → Enriched {enriched} motors...", "ai")
            log_msg(f"  ✅ Groq enriched {enriched} motors", "success")

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
    try:
        if name == "tmotor":
            from scrapers.tmotor_scraper import TMotorScraper
            return TMotorScraper()
        elif name == "getfpv":
            from scrapers.getfpv_scraper import GetFPVScraper
            return GetFPVScraper()
        elif name == "rcbenchmark":
            from scrapers.rcbenchmark_scraper import RCBenchmarkScraper
            return RCBenchmarkScraper()
        elif name == "emax":
            from scrapers.emax_scraper import EmaxScraper
            return EmaxScraper()
        elif name == "speedybee":
            from scrapers.speedybee_scraper import SpeedbeeeScraper
            return SpeedbeeeScraper()
    except Exception as e:
        log.error(f"Failed to load scraper {name}: {e}")
    return None


# ── Routes ─────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory("templates", "index.html")


@app.route("/scrape", methods=["POST"])
def start_scrape():
    data = request.get_json(silent=True) or {}
    motor_query = data.get("motor", "").strip()
    sources     = data.get("sources", ["tmotor", "getfpv", "emax", "speedybee", "rcbenchmark"])
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


if __name__ == "__main__":
    print("\n🚁 Motor Scraper Web UI")
    print("   → http://localhost:5050\n")
    app.run(host="0.0.0.0", port=5050, debug=False, threaded=True)
