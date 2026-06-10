import urllib.request
import json
import os

def load_env(path='.env'):
    env = {}
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip()
    return env

env = load_env()
SUPABASE_URL = env.get('SUPABASE_URL', '')
ANON_KEY = env.get('SUPABASE_ANON_KEY', '')

print("Checking primary Supabase:")
print("URL:", SUPABASE_URL)

url = f"{SUPABASE_URL}/rest/v1/custom_specs_schema"
headers = {
    'apikey': ANON_KEY,
    'Authorization': f'Bearer {ANON_KEY}'
}

try:
    req = urllib.request.Request(url, headers=headers, method='GET')
    with urllib.request.urlopen(req, timeout=5) as res:
        print("Success! Status code:", res.status)
        data = json.loads(res.read().decode())
        print("Data loaded:", data)
except Exception as e:
    print("Error querying custom_specs_schema:")
    if hasattr(e, 'read'):
        print(e.read().decode())
    else:
        print(e)
