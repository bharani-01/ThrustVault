import requests
import json
import time

url_scrape = "http://localhost:5050/scrape"
payload = {
    "motor": "KDE4215XF-465",
    "sources": ["google"],  # Let's test the 'google' source which handles search & delegation
    "use_groq": False
}

print("Triggering scrape...")
r = requests.post(url_scrape, json=payload)
if r.status_code != 200:
    print(f"Failed to start scrape: {r.status_code} {r.text}")
    exit(1)

job_id = r.json()["job_id"]
print(f"Scrape job started. Job ID: {job_id}")

url_stream = f"http://localhost:5050/stream/{job_id}"
print("Streaming log events:")
r_stream = requests.get(url_stream, stream=True)

for line in r_stream.iter_lines():
    if not line:
        continue
    line_decoded = line.decode('utf-8')
    if line_decoded.startswith("event: "):
        event_type = line_decoded[7:]
    elif line_decoded.startswith("data: "):
        data_str = line_decoded[6:]
        try:
            data = json.loads(data_str)
        except Exception:
            data = data_str
        
        if event_type == "log":
            print(f"[{data.get('ts', '')}] {data.get('level', '').upper()}: {data.get('message', '')}")
        elif event_type == "results":
            print(f"\n--- RESULTS RECEIVED ---")
            print(f"Total motors: {data.get('total_motors', 0)}")
            print(f"Total performance points: {data.get('total_performance', 0)}")
            motors = data.get("motors", [])
            if motors:
                print("First Motor images:", motors[0].get("images", []))
                print("First Motor perf_image:", motors[0].get("perf_image", ""))
        elif event_type == "done":
            print(f"\nScrape Job Completed! Total items: {data.get('total')}")
            break
        elif event_type == "end":
            print("\nStream ended.")
            break
        elif event_type == "error":
            print(f"\nERROR: {data}")
            break
