"""
run.py — Motor Scraper CLI
==========================

Usage:
  python run.py --all                      # Run all scrapers
  python run.py --source tmotor            # Run only T-Motor scraper
  python run.py --source getfpv emax       # Run multiple sources
  python run.py --all --no-groq            # Skip Groq AI enrichment
  python run.py --all --format json        # Output JSON instead of CSV
  python run.py --all --format both        # Output both CSV and JSON
  python run.py --all --dry-run            # Scrape but don't save files

Available sources: tmotor, getfpv, rcbenchmark, emax, speedybee, mad, kdedirect, sunnysky
"""

import sys
import argparse
from pathlib import Path

# Ensure imports resolve from motor_scraper/ directory
sys.path.insert(0, str(Path(__file__).parent))

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from rich import print as rprint

from utils.logger import get_logger
from utils.dedup import dedup_motors
from parsers.motor_parser import normalize_batch
from parsers.groq_parser import groq_parser
from storage.csv_exporter import export_motors, export_performance
from storage.json_exporter import export_json
from config import SOURCES
from utils.cache import get_cached_results, set_cached_results

log     = get_logger("run")
console = Console()


# ── Scraper registry ───────────────────────────────────────────────────────
def get_scraper(name: str):
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
    elif name == "mad":
        from scrapers.mad_scraper import MADScraper
        return MADScraper()
    elif name == "kdedirect":
        from scrapers.kdedirect_scraper import KDEDirectScraper
        return KDEDirectScraper()
    elif name == "sunnysky":
        from scrapers.sunnysky_scraper import SunnySkyScraper
        return SunnySkyScraper()
    else:
        raise ValueError(f"Unknown source: '{name}'. Available: {list(SOURCES.keys())}")


# ── CLI ────────────────────────────────────────────────────────────────────
def parse_args():
    parser = argparse.ArgumentParser(
        description="🚁 ThrustVault Motor Scraper",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    src_group = parser.add_mutually_exclusive_group(required=True)
    src_group.add_argument("--all",    action="store_true", help="Run all scrapers")
    src_group.add_argument("--source", nargs="+", metavar="SOURCE",
                           choices=list(SOURCES.keys()),
                           help="One or more sources to scrape")

    parser.add_argument("--query", "-q", default="", help="Motor query to search for")
    parser.add_argument("--no-cache", action="store_true", help="Disable caching")
    parser.add_argument("--format",   choices=["csv", "json", "both"], default="csv",
                        help="Output format (default: csv)")
    parser.add_argument("--no-groq",  action="store_true",
                        help="Disable Groq AI enrichment (faster, less accurate)")
    parser.add_argument("--dry-run",  action="store_true",
                        help="Scrape and parse but don't write any output files")
    return parser.parse_args()


# ── Main ───────────────────────────────────────────────────────────────────
def main():
    args = parse_args()
    sources = list(SOURCES.keys()) if args.all else args.source
    query = args.query.strip() if args.query else ""
    use_cache = not args.no_cache

    console.print(Panel.fit(
        f"[bold cyan]🚁 ThrustVault Motor Scraper[/bold cyan]\n"
        f"Query   : [yellow]{repr(query)}[/yellow]\n"
        f"Sources : [yellow]{', '.join(sources)}[/yellow]\n"
        f"Format  : [green]{args.format}[/green]  |  "
        f"Groq AI : [{'green]enabled' if not args.no_groq else 'red]disabled'}[/]  |  "
        f"Dry run : [{'red]YES' if args.dry_run else 'green]NO'}[/]  |  "
        f"Cache   : [{'green]enabled' if use_cache else 'red]disabled'}[/]",
        border_style="cyan",
    ))

    all_motors      : list[dict] = []
    all_performance : list[dict] = []
    ai_summary      : str = ""
    cache_loaded    = False

    # ── Cache Check ────────────────────────────────────────────────────────
    if use_cache:
        cached = get_cached_results(query, sources)
        if cached:
            all_motors = cached.get("motors", [])
            all_performance = cached.get("performance", [])
            ai_summary = cached.get("ai_summary", "")
            console.print(f"[bold green]💾 Cache HIT for query '{query}'[/bold green]")
            console.print(f"  Loaded {len(all_motors)} motors, {len(all_performance)} performance points from cache.")
            cache_loaded = True

    if not cache_loaded:
        import concurrent.futures
        from api import smart_match  # Import from api.py to keep parsing logic unified

        # ── Run scrapers in parallel ───────────────────────────────────────
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            console=console,
        ) as progress:
            task = progress.add_task("Scraping...", total=len(sources))

            def run_one_scraper(src):
                progress.update(task, description=f"[cyan]Scraping {SOURCES.get(src, src)}...")
                try:
                    scraper = get_scraper(src)
                    results = scraper.scrape(query=query)

                    # Apply query match logic if query exists (similar to api.py)
                    if query:
                        filtered = []
                        for r in results:
                            is_perf = "throttle" in r or r.get("source") == "rcbenchmark" or "label" in r
                            if is_perf:
                                match_text = r.get("label", "")
                            else:
                                match_text = " ".join(filter(None, [
                                    r.get("motor_name", ""),
                                    r.get("name", ""),
                                    r.get("kv_rating", ""),
                                    r.get("stator_size", ""),
                                    r.get("source_url", ""),
                                    r.get("link_motor", ""),
                                ]))
                            if smart_match(query, match_text):
                                filtered.append(r)
                        results = filtered

                    console.print(f"  ✅ [green]{src}[/green]: {len(results)} records")
                    return src, results
                except Exception as e:
                    console.print(f"  ❌ [red]{src}[/red]: Failed — {e}")
                    return src, []
                finally:
                    # Clean up thread-local Playwright browser
                    try:
                        from utils.browser_manager import browser_manager
                        browser_manager.close_thread_browser()
                    except Exception:
                        pass
                    progress.advance(task)

            with concurrent.futures.ThreadPoolExecutor(max_workers=len(sources)) as executor:
                futures = {executor.submit(run_one_scraper, src): src for src in sources}
                for future in concurrent.futures.as_completed(futures):
                    src, results = future.result()
                    if src == "rcbenchmark":
                        all_performance.extend(results)
                    else:
                        all_motors.extend(results)

        # ── Normalize ──────────────────────────────────────────────────────────
        if all_motors:
            console.print(f"\n[bold]Normalizing {len(all_motors)} motor records...[/bold]")
            all_motors = normalize_batch(all_motors)
            all_motors = dedup_motors(all_motors)
            console.print(f"  → {len(all_motors)} unique motors after deduplication")

        # Deduplicate performance points
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
        all_performance = deduped_perf

        # ── Groq AI enrichment (parallel) ──────────────────────────────────────
        if not args.no_groq and all_motors:
            console.print(f"\n[bold]🤖 Groq AI enrichment...[/bold]")
            indices_to_enrich = [
                i for i, m in enumerate(all_motors)
                if not m.get("max_thrust") or not m.get("company")
            ]
            if indices_to_enrich:
                def enrich_single(idx):
                    return idx, groq_parser.enrich_motor_record(all_motors[idx])

                max_workers = min(10, len(indices_to_enrich))
                with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                    futures = {executor.submit(enrich_single, idx): idx for idx in indices_to_enrich}
                    enriched_count = 0
                    with Progress(SpinnerColumn(), TextColumn("{task.description}"), console=console) as p:
                        enrich_task = p.add_task("Enriching...", total=len(indices_to_enrich))
                        for future in concurrent.futures.as_completed(futures):
                            idx, enriched_record = future.result()
                            all_motors[idx] = enriched_record
                            enriched_count += 1
                            p.advance(enrich_task)
                console.print(f"  → Enriched {enriched_count} motor records with Groq")
            else:
                console.print("  → No motors required Groq enrichment")

            # Generate AI summary
            if all_motors:
                ai_summary = groq_parser.summarize_batch(all_motors)

        # Save to cache
        if use_cache:
            set_cached_results(query, sources, {
                "motors": all_motors,
                "performance": all_performance,
                "ai_summary": ai_summary
            })

    # Print AI summary if available
    if ai_summary:
        console.print(Panel(ai_summary, title="[bold cyan]📊 AI Summary[/bold cyan]", border_style="cyan"))

    # ── Print preview table ────────────────────────────────────────────────
    if all_motors:
        table = Table(title=f"Motor Scrape Results (showing first 20 of {len(all_motors)})",
                      border_style="bright_blue")
        table.add_column("Motor Name",     style="cyan",  max_width=35)
        table.add_column("Company",        style="green", max_width=15)
        table.add_column("Max Thrust",     style="yellow")
        table.add_column("KV",             style="magenta")
        table.add_column("Stator",         style="blue")
        table.add_column("Rec. ESC",       style="white", max_width=15)
        table.add_column("Source",         style="dim")

        for m in all_motors[:20]:
            table.add_row(
                m.get("motor_name", "")[:35] if m.get("motor_name") else "",
                m.get("company", "")[:15] if m.get("company") else "",
                m.get("max_thrust", "—") if m.get("max_thrust") else "—",
                m.get("kv_rating", "—") if m.get("kv_rating") else "—",
                m.get("stator_size", "—") if m.get("stator_size") else "—",
                m.get("recommended_esc", "—")[:15] if m.get("recommended_esc") else "—",
                m.get("source", "") if m.get("source") else "",
            )
        console.print(table)

    # ── Export ─────────────────────────────────────────────────────────────
    if args.dry_run:
        console.print("\n[yellow]⚠ Dry run — no files written.[/yellow]")
    else:
        console.print(f"\n[bold]💾 Saving output...[/bold]")
        if all_motors:
            if args.format in ("csv", "both"):
                path = export_motors(all_motors)
                console.print(f"  ✅ CSV → [link={path}]{path}[/link]")
            if args.format in ("json", "both"):
                path = export_json(all_motors, label="motors")
                console.print(f"  ✅ JSON → [link={path}]{path}[/link]")
        if all_performance:
            if args.format in ("csv", "both"):
                path = export_performance(all_performance)
                console.print(f"  ✅ Performance CSV → [link={path}]{path}[/link]")
            if args.format in ("json", "both"):
                path = export_json(all_performance, label="performance")
                console.print(f"  ✅ Performance JSON → [link={path}]{path}[/link]")

    console.print(f"\n[bold green]✅ Done! {len(all_motors)} motors, {len(all_performance)} performance points.[/bold green]")


if __name__ == "__main__":
    main()
