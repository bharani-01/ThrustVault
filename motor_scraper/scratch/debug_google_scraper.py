import sys
sys.path.insert(0, 'd:/motor data/motor_scraper')
from scrapers.google.google_scraper import GoogleScraper

scraper = GoogleScraper()
results = scraper.scrape("KDE4215XF-465")

print(f"Total results: {len(results)}")
motors = [r for r in results if "throttle" not in r]
perf = [r for r in results if "throttle" in r]
print(f"Motors: {len(motors)}")
print(f"Performance points: {len(perf)}")
if motors:
    print("Motor fields:", list(motors[0].keys()))
if perf:
    print("Perf point example:", perf[0])
