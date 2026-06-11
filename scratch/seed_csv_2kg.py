import csv
import urllib.request
import json
import os
import re

# ── Load .env ─────────────────────────────────────────────────────────────────
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
SUPABASE_URL      = env.get('SUPABASE_URL', os.environ.get('SUPABASE_URL', ''))
SERVICE_ROLE_KEY  = env.get('service_role', os.environ.get('service_role', ''))

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print('ERROR: SUPABASE_URL or service_role not found in .env')
    exit(1)

# ── Supabase REST helper ──────────────────────────────────────────────────────
def sb(table, method='GET', payload=None, params=''):
    url = f'{SUPABASE_URL}/rest/v1/{table}'
    if params:
        url += '?' + params
    headers = {
        'apikey':        SERVICE_ROLE_KEY,
        'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
        'Content-Type':  'application/json',
        'Prefer':        'return=representation'
    }
    data = json.dumps(payload).encode() if payload is not None else None
    req  = urllib.request.Request(url, headers=headers, method=method, data=data)
    try:
        with urllib.request.urlopen(req) as res:
            body = res.read().decode()
            return json.loads(body) if body else []
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f'  HTTP {e.code} on {method} {table}: {body}')
        raise

def is_valid_url(url_str):
    if not url_str:
        return False
    # Check if it starts with http:// or https:// (case insensitive)
    return bool(re.match(r'^https?://', url_str.strip(), re.IGNORECASE))

def seed_csv():
    print('=' * 60)
    print('ThrustVault CSV Seed Script (2kg Motors)')
    print('=' * 60)

    # 1. Ensure category "1-2 kg" exists
    category_name = "1-2 kg"
    category_desc = "Standard multirotor and inspection drones (typically 3S – 4S LiPo)"
    
    print(f"\n[1/3] Checking if category '{category_name}' exists...")
    cats = sb('categories', params=f'name=eq.{urllib.parse.quote(category_name)}')
    
    if cats:
        cat_id = cats[0]['id']
        print(f"  Category found: ID={cat_id}")
    else:
        print(f"  Category not found. Creating category '{category_name}'...")
        new_cat = sb('categories', method='POST', payload=[{
            'name': category_name,
            'description': category_desc
        }])
        cat_id = new_cat[0]['id']
        print(f"  Created category: ID={cat_id}")

    # 2. Clear existing motors in this category to prevent duplicates
    print(f"\n[2/3] Deleting existing motors in category '{category_name}'...")
    sb('motors', method='DELETE', params=f'category_id=eq.{cat_id}')
    print("  Deleted existing motors.")

    # 3. Read and parse CSV file
    csv_path = r'd:\motor data\Motor List - 2kg.csv'
    print(f"\n[3/3] Reading {csv_path}...")
    
    motors = []
    with open(csv_path, mode='r', encoding='utf-8') as f:
        reader = csv.reader(f)
        rows = list(reader)
        
    # Skip rows until headers are found
    header_idx = -1
    for idx, row in enumerate(rows):
        if row and row[0].upper() == 'MOTOR':
            header_idx = idx
            break
            
    if header_idx == -1:
        print("ERROR: Header row starting with 'MOTOR' not found in CSV.")
        return

    print(f"  Found headers at row {header_idx + 1}")
    
    for row in rows[header_idx + 1:]:
        if not row or not row[0].strip() or row[0].strip().upper() in ('MOTOR', ''):
            continue
            
        motor_name = row[0].strip()
        company = row[1].strip() if len(row) > 1 else ''
        max_thrust = row[2].strip() if len(row) > 2 else ''
        rec_esc = row[3].strip() if len(row) > 3 else ''
        rec_prop = row[4].strip() if len(row) > 4 else ''
        
        link_m = row[5].strip() if len(row) > 5 else ''
        link_e = row[6].strip() if len(row) > 6 else ''
        link_p = row[7].strip() if len(row) > 7 else ''
        
        # Clean Propeller field (newlines)
        rec_prop = rec_prop.replace('\n', ' ').strip()
        
        # Validate URLs
        link_motor_val = link_m if is_valid_url(link_m) else None
        link_esc_val = link_e if is_valid_url(link_e) else None
        link_prop_val = link_p if is_valid_url(link_p) else None
        
        if link_m and not link_motor_val:
            print(f"  [Warning] Invalid motor link ignored for '{motor_name}': {link_m}")
        if link_e and not link_esc_val:
            print(f"  [Warning] Invalid ESC link ignored for '{motor_name}': {link_e}")
        if link_p and not link_prop_val:
            print(f"  [Warning] Invalid propeller link ignored for '{motor_name}': {link_p}")
            
        motors.append({
            'category_id': cat_id,
            'motor_name': motor_name,
            'company': company,
            'max_thrust': max_thrust,
            'recommended_esc': rec_esc or None,
            'recommended_propeller': rec_prop or None,
            'link_motor': link_motor_val,
            'link_esc': link_esc_val,
            'link_propeller': link_prop_val
        })

    print(f"  Parsed {len(motors)} motors. Inserting in batches...")
    
    # Insert in batches of 20
    batch_size = 20
    for i in range(0, len(motors), batch_size):
        batch = motors[i:i + batch_size]
        sb('motors', method='POST', payload=batch)
        print(f"    Inserted motors {i+1}–{i+len(batch)} of {len(motors)}")

    print('=' * 60)
    print('Seeding completed successfully!')
    print(f'  Category: {category_name}')
    print(f'  Motors seeded: {len(motors)}')
    print('=' * 60)

if __name__ == '__main__':
    seed_csv()
