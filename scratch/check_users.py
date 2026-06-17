import os
import json
import urllib.parse
import urllib.request

# Load env variables
if os.path.exists('.env'):
    with open('.env', 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, val = line.split('=', 1)
                os.environ[key.strip()] = val.strip()

def call_supabase_api(path, method='GET', payload=None, query_params=None, headers=None, is_auth=False):
    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", os.environ.get("service_role", os.environ.get("SUPABASE_ANON_KEY", "")))
    
    if is_auth:
        url = f"{supabase_url}/auth/v1/{path}"
    else:
        url = f"{supabase_url}/rest/v1/{path}"
        
    if query_params:
        encoded_params = []
        for k, v in query_params.items():
            encoded_params.append(f"{k}={urllib.parse.quote(str(v), safe=':()[].,=')}")
        url += "?" + "&".join(encoded_params)
        
    req_headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json"
    }
    if headers:
        req_headers.update(headers)
        
    data_bytes = None
    if payload is not None:
        data_bytes = json.dumps(payload).encode('utf-8')
        
    req = urllib.request.Request(url, data=data_bytes, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15.0) as response:
            res_body = response.read().decode('utf-8')
            return json.loads(res_body) if res_body else None
    except Exception as e:
        print(f"Error: {e}")
        return None

profiles = call_supabase_api("user_profiles")
print("User Profiles:")
print(json.dumps(profiles, indent=2))
