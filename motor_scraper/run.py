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

    console.print(Panel.fit(
        f"[bold cyan]🚁 ThrustVault Motor Scraper[/bold cyan]\n"
        f"Sources : [yellow]{', '.join(sources)}[/yellow]\n"
        f"Format  : [green]{args.format}[/green]  |  "
        f"Groq AI : [{'green]enabled' if not args.no_groq else 'red]disabled'}[/]  |  "
        f"Dry run : [{'red]YES' if args.dry_run else 'green]NO'}[/]",
        border_style="cyan",
    ))

    all_motors      : list[dict] = []
    all_performance : list[dict] = []

    # ── Run scrapers ───────────────────────────────────────────────────────
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Scraping...", total=len(sources))

        for src in sources:
            progress.update(task, description=f"[cyan]Scraping {SOURCES.get(src, src)}...")
            try:
                scraper = get_scraper(src)
                results = scraper.scrape()

                # Separate performance data (rcbenchmark) from motor records
                if src == "rcbenchmark":
                    all_performance.extend(results)
                else:
                    all_motors.extend(results)

                console.print(f"  ✅ [green]{src}[/green]: {len(results)} records")
            except Exception as e:
                console.print(f"  ❌ [red]{src}[/red]: Failed — {e}")
            progress.advance(task)

    # ── Normalize ──────────────────────────────────────────────────────────
    console.print(f"\n[bold]Normalizing {len(all_motors)} motor records...[/bold]")
    all_motors = normalize_batch(all_motors)
    all_motors = dedup_motors(all_motors)
    console.print(f"  → {len(all_motors)} unique motors after deduplication")

    # ── Groq AI enrichment ─────────────────────────────────────────────────
    if not args.no_groq and all_motors:
        console.print(f"\n[bold]🤖 Groq AI enrichment...[/bold]")
        enriched_count = 0
        with Progress(SpinnerColumn(), TextColumn("{task.description}"), console=console) as p:
            enrich_task = p.add_task("Enriching...", total=len(all_motors))
            for i, motor in enumerate(all_motors):
                # Only enrich motors with incomplete data
                if not motor.get("max_thrust") or not motor.get("company"):
                    all_motors[i] = groq_parser.enrich_motor_record(motor)
                    enriched_count += 1
                p.advance(enrich_task)
        console.print(f"  → Enriched {enriched_count} motor records with Groq")

        # Print AI summary
        summary = groq_parser.summarize_batch(all_motors)
        console.print(Panel(summary, title="[bold cyan]📊 AI Summary[/bold cyan]", border_style="cyan"))

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
                m.get("motor_name", "")[:35],
                m.get("company", "")[:15],
                m.get("max_thrust", "—"),
                m.get("kv_rating", "—"),
                m.get("stator_size", "—"),
                m.get("recommended_esc", "—")[:15],
                m.get("source", ""),
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
