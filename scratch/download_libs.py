import urllib.request
import os

libs = {
    "lucide.min.js": "https://unpkg.com/lucide@0.294.0/dist/umd/lucide.min.js",
    "supabase.js": "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/dist/umd/supabase.js",
    "chart.umd.js": "https://cdn.jsdelivr.net/npm/chart.js/dist/chart.umd.js",
    "xlsx.full.min.js": "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
}

os.makedirs("libs", exist_ok=True)

for name, url in libs.items():
    path = os.path.join("libs", name)
    print(f"Downloading {url} to {path}...")
    try:
        urllib.request.urlretrieve(url, path)
        print(f"Successfully downloaded {name}")
    except Exception as e:
        print(f"Failed to download {name}: {e}")
