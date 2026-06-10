import urllib.request
import json
import os

def load_env(env_path=".env"):
    env_data = {}
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    if '=' in line:
                        key, val = line.split('=', 1)
                        env_data[key.strip()] = val.strip()
    return env_data

env = load_env()
SUPABASE_URL = env.get("SUPABASE_URL")
SERVICE_ROLE_KEY = env.get("service_role")

if not SERVICE_ROLE_KEY:
    # try SUPABASE_SERVICE_ROLE_KEY
    SERVICE_ROLE_KEY = env.get("SUPABASE_SERVICE_ROLE_KEY")

def supabase_request(table, method="GET", payload=None, query_params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if query_params:
        url += f"?{query_params}"
    
    headers = {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    
    data = None
    if payload:
        data = json.dumps(payload).encode('utf-8')
        
    req = urllib.request.Request(url, headers=headers, method=method, data=data)
    try:
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read().decode('utf-8'))
    except Exception as e:
        print(f"Error: {e}")
        if hasattr(e, 'read'):
            print("Response body:", e.read().decode('utf-8'))
        raise e

try:
    print("User Profiles:")
    profiles = supabase_request("user_profiles")
    for p in profiles:
        print(f"ID: {p.get('id')}, Email: {p.get('email')}, Role: {p.get('role')}")
except Exception as e:
    print("Error listing profiles:", e)
