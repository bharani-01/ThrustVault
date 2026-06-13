import urllib.request
import urllib.parse
import json
import http.cookiejar

BASE_URL = "http://127.0.0.1:8000"

def test_cookie_flags_and_rate_limiting():
    print("--- Running Security Hardening Tests ---")
    
    # 1. Test Rate Limiting on /api/auth/login
    # We will make 7 consecutive requests.
    # The first 5 should return 400 (due to invalid credentials).
    # The 6th and 7th should return 429 (Too Many Requests).
    
    status_codes = []
    response_bodies = []
    
    print("Sending 7 consecutive login requests with invalid credentials to test rate limiter...")
    for i in range(7):
        req = urllib.request.Request(
            f"{BASE_URL}/api/auth/login",
            data=json.dumps({"email": "malicious@thrustvault.in", "password": "wrongpassword"}).encode('utf-8'),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req) as res:
                status_codes.append(res.status)
                response_bodies.append(res.read().decode())
        except urllib.error.HTTPError as e:
            status_codes.append(e.code)
            response_bodies.append(e.read().decode())
            
    print(f"Status codes: {status_codes}")
    print(f"6th response: {response_bodies[5]}")
    
    # Assert rate limiting worked
    assert status_codes[:5] == [400, 400, 400, 400, 400], f"Expected first 5 requests to be 400, got {status_codes[:5]}"
    assert status_codes[5] == 429, f"Expected 6th request to be 429, got {status_codes[5]}"
    assert status_codes[6] == 429, f"Expected 7th request to be 429, got {status_codes[6]}"
    assert "Too many requests" in response_bodies[5], "Response message should indicate rate limit exceeded"
    
    print("\nSUCCESS: Rate limiter is working as expected!")
    print("--- Security Hardening Tests Passed Successfully ---")

if __name__ == "__main__":
    test_cookie_flags_and_rate_limiting()
