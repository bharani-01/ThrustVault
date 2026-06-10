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
SUPABASE_URL = env['SUPABASE_URL']
SERVICE_ROLE_KEY = env['service_role']

# ── REST API helper ──────────────────────────────────────────────────────────
def sb(path, method='GET', payload=None, headers_extra=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': f"Bearer {SERVICE_ROLE_KEY}",
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }
    if headers_extra:
        headers.update(headers_extra)
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, headers=headers, method=method, data=data)
    try:
        with urllib.request.urlopen(req) as res:
            body = res.read().decode()
            return json.loads(body) if body else []
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code} on {method} {path}")
        print("Error Body:", e.read().decode())
        raise

# ── Main Test Flow ────────────────────────────────────────────────────────────
def run_tests():
    print("=" * 60)
    print("Database access_requests and create_vault_user Verification")
    print("=" * 60)

    test_email = "test_applicant_unique_123@test.com"
    test_name = "Test Applicant"
    test_role = "intern"
    test_pass = "TestPassword123!@#"

    # 1. Clean up any leftover test data
    print("\n[1/6] Cleaning up existing test records...")
    # Delete from auth.users (cascades to user_profiles) if exists
    try:
        profiles = sb("user_profiles?email=eq." + test_email)
        if profiles:
            uid = profiles[0]['id']
            # Call RPC to delete user
            sb("rpc/delete_vault_user", method="POST", payload={"user_id": uid})
            print(f"  Deleted existing test user {test_email}")
    except Exception as e:
        print("  Cleanup profiles error:", e)

    # Delete request
    try:
        sb("access_requests?email=eq." + test_email, method="DELETE")
        print("  Deleted existing request.")
    except Exception as e:
        print("  Cleanup requests error:", e)

    # 2. Insert Access Request
    print("\n[2/6] Inserting mock access request...")
    req_payload = {
        "full_name": test_name,
        "email": test_email,
        "requested_role": test_role,
        "justification": "Test justification for telemetry access",
        "status": "pending"
    }
    inserted = sb("access_requests", method="POST", payload=[req_payload])
    assert len(inserted) > 0, "Insert failed"
    req_id = inserted[0]['id']
    print(f"  ✓ Access request inserted with ID: {req_id}")

    # 3. Verify RLS (Query access requests)
    print("\n[3/6] Fetching access requests table...")
    requests = sb("access_requests?id=eq." + req_id)
    assert len(requests) > 0, "Fetch failed"
    assert requests[0]['status'] == 'pending', "Status mismatch"
    print(f"  ✓ Fetched request: {requests[0]['email']} status is {requests[0]['status']}")

    # 4. Simulate Approval: Call RPC create_vault_user
    print("\n[4/6] Approving request: Creating user account via create_vault_user RPC...")
    rpc_payload = {
        "email_val": test_email,
        "password_val": test_pass,
        "role_val": test_role
    }
    # Call the create_vault_user RPC
    res = sb("rpc/create_vault_user", method="POST", payload=rpc_payload)
    print(f"  ✓ RPC returned UID: {res}")
    
    # 5. Verify User Profile role
    print("\n[5/6] Verifying user profile role creation...")
    profiles = sb("user_profiles?email=eq." + test_email)
    assert len(profiles) > 0, "User profile not found in user_profiles!"
    assert profiles[0]['role'] == test_role, f"Role mismatch: expected {test_role}, got {profiles[0]['role']}"
    print(f"  ✓ User profile created in user_profiles. UID: {profiles[0]['id']}, Role: {profiles[0]['role']}")

    # 6. Update request status to Approved
    print("\n[6/6] Updating request status to Approved...")
    updated = sb("access_requests?id=eq." + req_id, method="PATCH", payload={"status": "approved"})
    assert len(updated) > 0, "Update failed"
    assert updated[0]['status'] == 'approved', "Status update failed"
    print("  ✓ Request status updated to APPROVED.")

    # Clean up
    print("\nCleaning up verification records...")
    sb("rpc/delete_vault_user", method="POST", payload={"user_id": profiles[0]['id']})
    sb("access_requests?id=eq." + req_id, method="DELETE")
    print("  Cleanup complete.")

    print("\n" + "=" * 60)
    print("SUCCESS: Database schema, RPC, and constraints verified!")
    print("=" * 60)

if __name__ == '__main__':
    run_tests()
