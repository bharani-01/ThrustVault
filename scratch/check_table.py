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
url = f"{env['SUPABASE_URL']}/rest/v1/access_requests"
headers = {
    'apikey': env['SUPABASE_ANON_KEY'],
    'Authorization': f"Bearer {env['SUPABASE_ANON_KEY']}"
}
req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as res:
        print("STATUS:", res.status)
        print("BODY:", res.read().decode())
except Exception as e:
    print("ERROR:", e)
    if hasattr(e, 'read'):
        print("ERROR BODY:", e.read().decode())
