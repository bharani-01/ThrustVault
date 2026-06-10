import urllib.request
import json

url = "http://localhost:8000/api/send-email"
payload = {
    "type": "received",
    "to": "bharanisri73@gmail.com",
    "full_name": "Bharani Sri",
    "requested_role": "intern"
}

headers = {
    "Content-Type": "application/json"
}

req = urllib.request.Request(
    url,
    data=json.dumps(payload).encode('utf-8'),
    headers=headers,
    method='POST'
)

try:
    with urllib.request.urlopen(req) as res:
        print("STATUS:", res.status)
        print("BODY:", res.read().decode())
except Exception as e:
    print("ERROR:", e)
    if hasattr(e, 'read'):
        print("ERROR BODY:", e.read().decode())
