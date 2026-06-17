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

def update_user_password(user_id, new_password):
    supabase_url = os.environ.get("SUPABASE_URL", "")
    service_role_key = os.environ.get("service_role", "")
    
    url = f"{supabase_url}/auth/v1/admin/users/{user_id}"
    
    req_headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "password": new_password
    }
    data_bytes = json.dumps(payload).encode('utf-8')
    
    req = urllib.request.Request(url, data=data_bytes, headers=req_headers, method='PUT')
    try:
        with urllib.request.urlopen(req, timeout=15.0) as response:
            res_body = response.read().decode('utf-8')
            return json.loads(res_body) if res_body else None
    except Exception as e:
        print(f"Error: {e}")
        if hasattr(e, 'read'):
            print(e.read().decode('utf-8'))
        return None

# admindemo ID is f1d236b6-eb02-4ed9-9964-433a634a8ef5
res = update_user_password("f1d236b6-eb02-4ed9-9964-433a634a8ef5", "AdminDemo123!")
if res:
    print("Password updated successfully!")
else:
    print("Failed to update password.")
