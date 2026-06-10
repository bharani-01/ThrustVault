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
SUPABASE_URL = env.get('SUPABASE_URL')
SERVICE_ROLE_KEY = env.get('service_role')

url = f'{SUPABASE_URL}/rest/v1/user_profiles'
headers = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
    'Content-Type': 'application/json'
}

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as res:
        profiles = json.loads(res.read().decode())
        print("User Profiles:")
        for p in profiles:
            print(f"ID: {p['id']}, Email: {p['email']}, Role: {p['role']}")
except Exception as e:
    print("Error:", e)
    if hasattr(e, 'read'):
        print(e.read().decode())
