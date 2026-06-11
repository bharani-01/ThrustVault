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

print("Categories:")
categories = supabase_request("categories")
for cat in categories:
    print(f"ID: {cat['id']}, Name: {cat['name']}, Description: {cat['description']}")
    # wait, standard count query is select=count in supabase/postgrest or we can just count the list returned
    m_list = supabase_request("motors", query_params=f"category_id=eq.{cat['id']}")
    print(f"  Motor count: {len(m_list)}")
    if m_list:
        print(f"  Sample motor: {m_list[0]['motor_name']} by {m_list[0]['company']}")
