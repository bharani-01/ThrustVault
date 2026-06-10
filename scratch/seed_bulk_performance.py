# seed_bulk_performance.py
import urllib.request
import json
import os
import random
from datetime import datetime, timedelta

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

def generate_bulk_data():
    print("Fetching categories...")
    categories = supabase_request("categories")
    cat_map = {c["name"]: c["id"] for c in categories}
    
    # Ensure standard categories exist or use the first available ones
    cat_18_22 = cat_map.get("18-22 kg")
    cat_10 = cat_map.get("10 kg")
    cat_1_2 = cat_map.get("1-2 kg")
    
    # Fallback to whatever categories exist if standard ones are missing
    if not cat_18_22 and categories:
        cat_18_22 = categories[0]["id"]
    if not cat_10 and categories:
        cat_10 = categories[min(1, len(categories)-1)]["id"]
    if not cat_1_2 and categories:
        cat_1_2 = categories[min(2, len(categories)-1)]["id"]

    # 1. Create some new motors
    print("Checking and seeding new motor models...")
    new_motors_to_seed = [
        {"category_id": cat_18_22, "motor_name": "T-Motor U8 LITE KV85", "company": "T-Motor", "max_thrust": "18.5 kg", "recommended_esc": "Alpha 80A 12S", "recommended_propeller": "CF30x10.5"},
        {"category_id": cat_18_22, "motor_name": "MAD M10 C15 KV120", "company": "MAD Components", "max_thrust": "19.8 kg", "recommended_esc": "MAD 120A 12S", "recommended_propeller": "32x10 Prop"},
        {"category_id": cat_10, "motor_name": "KDE5215XF-435", "company": "KDE Direct", "max_thrust": "9.2 kg", "recommended_esc": "KDE-UAS125UVC", "recommended_propeller": "24.5\" Prop"},
        {"category_id": cat_10, "motor_name": "Tarot 5008 KV340", "company": "Tarot", "max_thrust": "8.5 kg", "recommended_esc": "XRotor 60A", "recommended_propeller": "22\" Folding"},
        {"category_id": cat_1_2, "motor_name": "MN3508 KV450", "company": "T-Motor", "max_thrust": "1.45 kg", "recommended_esc": "Air 20A 3-4S", "recommended_propeller": "14*4.8CF"},
        {"category_id": cat_1_2, "motor_name": "XRotor X6", "company": "Hobbywing", "max_thrust": "1.95 kg", "recommended_esc": "XRotor 40A", "recommended_propeller": "15*5.5CF"},
        {"category_id": cat_1_2, "motor_name": "SII-4035 KV250", "company": "Scorpion", "max_thrust": "2.1 kg", "recommended_esc": "Tribunus 06-80A", "recommended_propeller": "16*5CF"}
    ]
    
    existing_motors = supabase_request("motors")
    existing_motor_names = {m["motor_name"] for m in existing_motors}
    
    for nm in new_motors_to_seed:
        if nm["motor_name"] not in existing_motor_names:
            print(f"Inserting new motor: {nm['motor_name']}")
            supabase_request("motors", method="POST", payload=[nm])
            
    # Re-fetch motors to get complete pool (existing + new)
    all_motors = supabase_request("motors")
    print(f"Total motors available for testing: {len(all_motors)}")
    
    # 2. Prepare test runs (250 runs target)
    print("Generating 250 performance test runs...")
    propellers_pool = [
        "T-MOTOR 14*4.8CF", "T-MOTOR P15*5 Prop", "T-MOTOR 16*5.4CF", "T-MOTOR 13*4.4CF", 
        "CF30x10.5 folding", "CF40x13", "3090 Folding", "G40x13.1 folding", "24.5\" Prop",
        "22\" Folding", "15*5.5CF", "16*5CF", "HQProp 10x4.5", "Gemfan 12x4.5"
    ]
    escs_pool = [
        "Air 20A 3-4S ESC", "FLAME 100A 12S", "FLAME 100A 14S", "Alpha 120A 12S",
        "Integrated 80A", "Alpha 80A 12S", "MAD 120A 12S", "KDE-UAS125UVC", "XRotor 60A",
        "XRotor 40A", "Tribunus 06-80A", "Hobbywing FlyFun 60A"
    ]
    batteries_pool = [
        "4S LiPo", "6S LiPo", "12S LiPo", "14S LiPo", "Solid State 12S", "3S LiPo"
    ]
    testers_pool = [
        "Bala", "Alice Smith", "David Chen", "Sarah Jenkins", "Emily Watson", 
        "Hiroshi Tanaka", "Marcus Vance", "Carlos Mendez"
    ]
    device_names = [
        "Rotrix thrust stand V2", "Custom lab cell stand", "Hobbywing Dyno stand",
        "Aerodynamics test rig v1.2"
    ]
    
    runs_to_insert = []
    base_date = datetime.utcnow()
    
    for i in range(250):
        motor = random.choice(all_motors)
        tested_date = base_date - timedelta(days=random.randint(1, 90), hours=random.randint(0, 23))
        
        runs_to_insert.append({
            "motor_id": motor["id"],
            "propeller_model": random.choice(propellers_pool),
            "esc_model": random.choice(escs_pool),
            "battery_info": random.choice(batteries_pool),
            "test_conducted_by": random.choice(testers_pool),
            "tested_at": tested_date.isoformat() + "Z",
            "created_at": tested_date.isoformat() + "Z"
        })
        
    print(f"Bulk inserting {len(runs_to_insert)} test runs...")
    # Chunk inserts of runs to be safe (chunks of 100)
    inserted_runs = []
    for i in range(0, len(runs_to_insert), 100):
        chunk = runs_to_insert[i:i+100]
        res = supabase_request("motor_test_runs", method="POST", payload=chunk)
        inserted_runs.extend(res)
        
    print(f"Successfully inserted {len(inserted_runs)} test runs into database.")
    
    # 3. Generate data points for each run
    print("Generating telemetry data points...")
    data_points_to_insert = []
    
    # Standard throttle steps
    throttle_steps = [0.50, 0.65, 0.75, 0.85, 1.00]
    
    for run in inserted_runs:
        run_id = run["id"]
        motor_id = run["motor_id"]
        motor = next((m for m in all_motors if m["id"] == motor_id), None)
        
        # Determine battery voltage based on battery info
        battery_info = run["battery_info"]
        if "14S" in battery_info:
            base_volts = 51.8
        elif "12S" in battery_info:
            base_volts = 44.4
        elif "6S" in battery_info:
            base_volts = 22.2
        elif "4S" in battery_info:
            base_volts = 14.8
        elif "3S" in battery_info:
            base_volts = 11.1
        else:
            base_volts = 22.2
            
        # Classify motor size based on max_thrust
        max_thrust_str = motor["max_thrust"] if motor and motor.get("max_thrust") else "2 kg"
        import re
        thrust_match = re.search(r"([0-9\.]+)", max_thrust_str)
        max_thrust_val = float(thrust_match.group(1)) if thrust_match else 2.0
        is_kg = "kg" in max_thrust_str.lower()
        max_thrust_g_val = max_thrust_val * 1000.0 if is_kg else max_thrust_val
        
        is_heavy = max_thrust_g_val > 12000.0
        is_medium = 5000.0 <= max_thrust_g_val <= 12000.0
        
        if is_heavy:
            max_thrust_g = random.randint(18000, 23000)
            max_current = random.randint(80, 110)
            base_rpm = random.randint(3000, 4500)
        elif is_medium:
            max_thrust_g = random.randint(8000, 11000)
            max_current = random.randint(45, 65)
            base_rpm = random.randint(5000, 6500)
        else:
            max_thrust_g = random.randint(1000, 2200)
            max_current = random.randint(8, 22)
            base_rpm = random.randint(7000, 11000)
            
        ambient_temp = random.randint(22, 28)
        
        for step in throttle_steps:
            # Voltage sag increases with throttle
            sag = (step ** 2) * random.uniform(0.5, 2.0)
            voltage = round(base_volts - sag, 2)
            
            # Current increases exponentially with throttle
            current = round(max_current * (step ** 2.2) + random.uniform(0.1, 0.5), 2)
            power = round(voltage * current, 2)
            
            # Thrust increases quadratically with throttle
            thrust_g = int(max_thrust_g * (step ** 2.0) - random.randint(10, 50))
            thrust_g = max(50, thrust_g) # Minimum thrust
            
            # RPM increases with throttle
            rpm = int(base_rpm * step + random.randint(-100, 100))
            
            # Efficiency
            efficiency = round(thrust_g / power, 2) if power > 0 else 0
            
            # Temperature rises
            temperature = round(ambient_temp + (step ** 2) * random.randint(15, 45), 1)
            
            data_points_to_insert.append({
                "test_run_id": run_id,
                "throttle": step,
                "voltage": voltage,
                "current": current,
                "power": power,
                "thrust_g": thrust_g,
                "rpm": rpm,
                "efficiency": efficiency,
                "temperature": temperature,
                "extra_data": {
                    "device_name": random.choice(device_names),
                    "room_humidity_pct": random.randint(40, 60),
                    "barometric_pressure_hpa": random.randint(990, 1020)
                }
            })
            
    print(f"Prepared {len(data_points_to_insert)} total telemetry data points.")
    print("Bulk inserting data points in chunks of 500...")
    
    inserted_points_count = 0
    for i in range(0, len(data_points_to_insert), 500):
        chunk = data_points_to_insert[i:i+500]
        res = supabase_request("motor_test_data_points", method="POST", payload=chunk)
        inserted_points_count += len(res)
        
    print(f"Successfully inserted {inserted_points_count} telemetry data points.")
    print("Database seeding of 250 performance tests completed successfully!")

if __name__ == "__main__":
    generate_bulk_data()
