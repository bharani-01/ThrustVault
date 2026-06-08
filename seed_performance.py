# seed_performance.py
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

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("Error: SUPABASE_URL or service_role key not found in .env file.")
    exit(1)

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
        print(f"Error during Supabase request to {table}: {e}")
        if hasattr(e, 'read'):
            print("Response body:", e.read().decode('utf-8'))
        raise e

def seed():
    print("Starting database seeding...")
    
    # 1. Create base categories if they don't exist
    print("Checking categories...")
    existing_cats = supabase_request("categories")
    cat_map = {c["name"]: c["id"] for c in existing_cats}
    
    categories_to_seed = [
        {"name": "18-22 kg", "description": "Heavy industrial, mapping, and large agricultural drones (typically 12S - 14S LiPo)"},
        {"name": "10 kg", "description": "Medium lift commercial drones and quadcopters (typically 12S)"},
        {"name": "1-2 kg", "description": "Standard multirotor and inspection drones (typically 4S - 6S)"}
    ]
    
    for cat in categories_to_seed:
        if cat["name"] not in cat_map:
            print(f"Creating category: {cat['name']}")
            res = supabase_request("categories", method="POST", payload=[cat])
            cat_map[cat["name"]] = res[0]["id"]
            
    cat_18_22 = cat_map["18-22 kg"]
    cat_10 = cat_map["10 kg"]
    cat_1_2 = cat_map["1-2 kg"]

    # 2. Create base motors if they don't exist
    print("Checking motors...")
    existing_motors = supabase_request("motors")
    motor_map = {m["motor_name"]: m["id"] for m in existing_motors}
    
    motors_to_seed = [
        # 18-22 kg Class
        {"category_id": cat_18_22, "motor_name": "U15 II KV80", "company": "T-Motor", "max_thrust": "21.2 kg", "recommended_esc": "FLAME 100A 12S", "recommended_propeller": "G40x13.1 folding"},
        {"category_id": cat_18_22, "motor_name": "U15 XXL KV60", "company": "T-Motor", "max_thrust": "22.5 kg", "recommended_esc": "FLAME 100A 14S", "recommended_propeller": "CF40x13"},
        # 10 kg Class
        {"category_id": cat_10, "motor_name": "U12 II KV120", "company": "T-Motor", "max_thrust": "10.5 kg", "recommended_esc": "Alpha 120A 12S", "recommended_propeller": "CF30x10.5 folding"},
        {"category_id": cat_10, "motor_name": "XRotor X8", "company": "Hobbywing", "max_thrust": "9.8 kg", "recommended_esc": "Integrated 80A", "recommended_propeller": "3090 Folding"},
        # 1-2 kg Class
        {"category_id": cat_1_2, "motor_name": "MN3508 KV380", "company": "T-Motor", "max_thrust": "1.22 kg", "recommended_esc": "Air 20A 3-4S ESC", "recommended_propeller": "T-MOTOR 16*5.4CF"},
        {"category_id": cat_1_2, "motor_name": "MN3508 KV580", "company": "T-Motor", "max_thrust": "1.60 kg", "recommended_esc": "Air 20A 3-4S ESC", "recommended_propeller": "T-MOTOR 13*4.4CF"},
        {"category_id": cat_1_2, "motor_name": "MN3508 KV700", "company": "T-Motor", "max_thrust": "1.80 kg", "recommended_esc": "Air 20A 3-4S ESC", "recommended_propeller": "T-MOTOR 11*3.7"}
    ]
    
    for m in motors_to_seed:
        if m["motor_name"] not in motor_map:
            print(f"Creating motor: {m['motor_name']}")
            res = supabase_request("motors", method="POST", payload=[m])
            motor_map[m["motor_name"]] = res[0]["id"]
            
    motor_380 = motor_map["MN3508 KV380"]
    motor_580 = motor_map["MN3508 KV580"]

    # 3. Clear existing test runs to avoid duplicate seeding
    print("Clearing existing performance test runs...")
    supabase_request("motor_test_runs", method="DELETE", query_params="motor_id=in.(" + ",".join([motor_380, motor_580]) + ")")

    # 4. Seed test runs and data points for MN3508 KV380
    print("Seeding test runs for MN3508 KV380...")
    
    # Run 1
    run1 = supabase_request("motor_test_runs", method="POST", payload=[{
        "motor_id": motor_380,
        "propeller_model": "T-MOTOR 14*4.8CF",
        "esc_model": "Air 20A 3-4S ESC",
        "battery_info": "4S LiPo",
        "test_conducted_by": "Bala"
    }])[0]
    
    pts1 = [
        {"test_run_id": run1["id"], "throttle": 0.50, "voltage": 14.8, "current": 1.3, "power": 19.24, "thrust_g": 350, "rpm": 2700, "efficiency": 18.19, "temperature": 43},
        {"test_run_id": run1["id"], "throttle": 0.65, "voltage": 14.8, "current": 2.9, "power": 42.92, "thrust_g": 560, "rpm": 3500, "efficiency": 13.05, "temperature": 43},
        {"test_run_id": run1["id"], "throttle": 0.75, "voltage": 14.8, "current": 4.0, "power": 59.20, "thrust_g": 700, "rpm": 4000, "efficiency": 11.82, "temperature": 43},
        {"test_run_id": run1["id"], "throttle": 0.85, "voltage": 14.8, "current": 5.2, "power": 76.96, "thrust_g": 840, "rpm": 4500, "efficiency": 10.91, "temperature": 43},
        {"test_run_id": run1["id"], "throttle": 1.00, "voltage": 14.8, "current": 6.3, "power": 93.24, "thrust_g": 940, "rpm": 4700, "efficiency": 10.08, "temperature": 43}
    ]
    supabase_request("motor_test_data_points", method="POST", payload=pts1)

    # Run 2
    run2 = supabase_request("motor_test_runs", method="POST", payload=[{
        "motor_id": motor_380,
        "propeller_model": "T-MOTOR P15*5 Prop",
        "esc_model": "Air 20A 3-4S ESC",
        "battery_info": "4S LiPo",
        "test_conducted_by": "Bala"
    }])[0]
    
    pts2 = [
        {"test_run_id": run2["id"], "throttle": 0.50, "voltage": 14.8, "current": 1.6, "power": 23.68, "thrust_g": 430, "rpm": 2600, "efficiency": 18.16, "temperature": 45},
        {"test_run_id": run2["id"], "throttle": 0.65, "voltage": 14.8, "current": 3.4, "power": 50.32, "thrust_g": 670, "rpm": 3400, "efficiency": 13.31, "temperature": 45},
        {"test_run_id": run2["id"], "throttle": 0.75, "voltage": 14.8, "current": 5.0, "power": 74.00, "thrust_g": 820, "rpm": 3800, "efficiency": 11.08, "temperature": 45},
        {"test_run_id": run2["id"], "throttle": 0.85, "voltage": 14.8, "current": 6.4, "power": 94.72, "thrust_g": 1000, "rpm": 4200, "efficiency": 10.56, "temperature": 45},
        {"test_run_id": run2["id"], "throttle": 1.00, "voltage": 14.8, "current": 7.5, "power": 111.00, "thrust_g": 1100, "rpm": 4500, "efficiency": 9.91, "temperature": 45}
    ]
    supabase_request("motor_test_data_points", method="POST", payload=pts2)

    # Run 3
    run3 = supabase_request("motor_test_runs", method="POST", payload=[{
        "motor_id": motor_380,
        "propeller_model": "T-MOTOR 16*5.4CF",
        "esc_model": "Air 20A 3-4S ESC",
        "battery_info": "4S LiPo",
        "test_conducted_by": "Bala"
    }])[0]
    
    pts3 = [
        {"test_run_id": run3["id"], "throttle": 0.50, "voltage": 14.8, "current": 2.0, "power": 29.60, "thrust_g": 440, "rpm": 2500, "efficiency": 14.86, "temperature": 46},
        {"test_run_id": run3["id"], "throttle": 0.65, "voltage": 14.8, "current": 3.9, "power": 57.72, "thrust_g": 700, "rpm": 3300, "efficiency": 12.13, "temperature": 46},
        {"test_run_id": run3["id"], "throttle": 0.75, "voltage": 14.8, "current": 5.9, "power": 87.32, "thrust_g": 900, "rpm": 4000, "efficiency": 10.31, "temperature": 46},
        {"test_run_id": run3["id"], "throttle": 0.85, "voltage": 14.8, "current": 7.6, "power": 112.48, "thrust_g": 1100, "rpm": 4500, "efficiency": 9.78, "temperature": 46},
        {"test_run_id": run3["id"], "throttle": 1.00, "voltage": 14.8, "current": 9.0, "power": 133.20, "thrust_g": 1220, "rpm": 4800, "efficiency": 9.16, "temperature": 46}
    ]
    supabase_request("motor_test_data_points", method="POST", payload=pts3)

    # 5. Seed test runs and data points for MN3508 KV580
    print("Seeding test runs for MN3508 KV580...")
    
    # Run 1
    run580_1 = supabase_request("motor_test_runs", method="POST", payload=[{
        "motor_id": motor_580,
        "propeller_model": "T-MOTOR 13*4.4CF",
        "esc_model": "Air 20A 3-4S ESC",
        "battery_info": "4S LiPo",
        "test_conducted_by": "Bala"
    }])[0]
    
    pts580_1 = [
        {"test_run_id": run580_1["id"], "throttle": 0.50, "voltage": 14.8, "current": 2.2, "power": 32.56, "thrust_g": 360, "rpm": 4000, "efficiency": 11.06, "temperature": 43},
        {"test_run_id": run580_1["id"], "throttle": 0.65, "voltage": 14.8, "current": 4.2, "power": 62.16, "thrust_g": 600, "rpm": 5200, "efficiency": 9.65, "temperature": 43},
        {"test_run_id": run580_1["id"], "throttle": 0.75, "voltage": 14.8, "current": 6.1, "power": 90.28, "thrust_g": 770, "rpm": 5900, "efficiency": 8.53, "temperature": 43},
        {"test_run_id": run580_1["id"], "throttle": 0.85, "voltage": 14.8, "current": 8.0, "power": 118.40, "thrust_g": 910, "rpm": 6500, "efficiency": 7.69, "temperature": 43},
        {"test_run_id": run580_1["id"], "throttle": 1.00, "voltage": 14.8, "current": 9.6, "power": 142.08, "thrust_g": 1050, "rpm": 7000, "efficiency": 7.39, "temperature": 43}
    ]
    supabase_request("motor_test_data_points", method="POST", payload=pts580_1)

    print("Database seeding completed successfully!")

if __name__ == "__main__":
    seed()
