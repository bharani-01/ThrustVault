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

def supabase_request(table):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode('utf-8'))

runs = supabase_request("motor_test_runs")
motors = supabase_request("motors")
motor_map = {m["id"]: m["motor_name"] for m in motors}

print(f"Total runs: {len(runs)}")
for r in runs:
    m_name = motor_map.get(r["motor_id"], "Unknown")
    print(f"Run ID: {r['id']}, Motor: {m_name}, Propeller: {r['propeller_model']}, Tester: {r['test_conducted_by']}")
