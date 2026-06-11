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
SUPABASE_URL      = env.get('SUPABASE_URL', os.environ.get('SUPABASE_URL', ''))
SERVICE_ROLE_KEY  = env.get('service_role', os.environ.get('service_role', ''))

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print('ERROR: SUPABASE_URL or service_role not found in .env')
    exit(1)

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

def seed_schema():
    print('=' * 60)
    print('Seeding Default Custom Specification Parameters')
    print('=' * 60)

    # Fields list to seed
    fields = [
        {'field_key': 'motor_diameter_od', 'field_name': 'Motor Diameter (OD)', 'field_type': 'number', 'field_unit': 'mm'},
        {'field_key': 'motor_holes_mount_diameter', 'field_name': 'Motor Holes Mount Diameter', 'field_type': 'text', 'field_unit': 'mm'},
        {'field_key': 'screw_type', 'field_name': 'Screw Type', 'field_type': 'text', 'field_unit': None},
        {'field_key': 'shaft_diameter', 'field_name': 'Shaft Diameter', 'field_type': 'number', 'field_unit': 'mm'}
    ]

    print("\nChecking and inserting fields...")
    for f in fields:
        # Check if field exists
        exists = sb('custom_specs_schema', params=f"field_key=eq.{f['field_key']}")
        if exists:
            print(f"  Field '{f['field_key']}' already exists. Updating...")
            sb('custom_specs_schema', method='PATCH', payload=f, params=f"field_key=eq.{f['field_key']}")
        else:
            print(f"  Field '{f['field_key']}' does not exist. Creating...")
            sb('custom_specs_schema', method='POST', payload=[f])

    print("\nSeeding completed successfully!")
    print('=' * 60)

if __name__ == '__main__':
    seed_schema()
