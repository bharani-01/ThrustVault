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
url = f"{env['SUPABASE_URL']}/rest/v1/"
headers = {
    'apikey': env['service_role'],
    'Authorization': f"Bearer {env['service_role']}"
}
req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as res:
        spec = json.loads(res.read().decode())
        print("TABLES & VIEWS:")
        for t in spec.get('definitions', {}).keys():
            print(" -", t)
        print("\nPATHS:")
        for p in spec.get('paths', {}).keys():
            print(" -", p)
except Exception as e:
    print("ERROR:", e)
    if hasattr(e, 'read'):
        print("ERROR BODY:", e.read().decode())
