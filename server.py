"""
ThrustVault - Flask Static Server
Compatible with Render.com Web Service deployment.
Serves all static HTML/CSS/JS files and exposes /api/config for Supabase credentials.
"""

import os
import json
import urllib.parse
import urllib.request
import time
import threading
from flask import Flask, send_from_directory, jsonify, request, abort, redirect, make_response



# ---------------------------------------------------------------------------
# Local dev: load .env file if it exists (Render injects env vars directly)
# ---------------------------------------------------------------------------
def load_env(env_path='.env'):
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    key = key.strip()
                    if key not in os.environ:          # don't override real env vars
                        os.environ[key] = val.strip()

load_env()

app = Flask(__name__, static_folder='.', static_url_path='')


# ---------------------------------------------------------------------------
# /api/config  — Returns Supabase credentials to the frontend.
#   On Render: set SUPABASE_URL and SUPABASE_ANON_KEY as Environment Variables
#   Locally:   reads from .env automatically if you use python-dotenv,
#              or just export them in your shell.
# ---------------------------------------------------------------------------
@app.route('/api/config')
def api_config():
    # Enforce Origin/Referer verification to prevent direct access (e.g. typing in browser address bar)
    referer = request.headers.get('Referer', '')
    origin = request.headers.get('Origin', '')
    host = request.headers.get('Host', '')

    allowed_domains = ['localhost', '127.0.0.1', 'thrustvault.onrender.com']

    # 1. Check if the request is initiated from an allowed domain
    is_valid = False
    for domain in allowed_domains:
        if domain in referer or domain in origin:
            is_valid = True
            break

    # 2. Allow local direct access for ease of local development if Host matches local
    if not is_valid:
        if any(local in host for local in ['localhost', '127.0.0.1']) and not referer and not origin:
            is_valid = True

    if not is_valid:
        abort(403, description="Forbidden: Direct configuration access is restricted.")

    config = {
        "SUPABASE_URL":      os.environ.get("SUPABASE_URL", ""),
        "SUPABASE_ANON_KEY": os.environ.get("SUPABASE_ANON_KEY", "")
    }
    response = jsonify(config)
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
    return response


# ---------------------------------------------------------------------------
# Advanced Geolocation and Audit Log Helpers
# ---------------------------------------------------------------------------
def get_location_prediction(ip):
    # Predict location of IP
    if not ip or ip in ['127.0.0.1', 'localhost', '::1'] or ip.startswith('192.168.') or ip.startswith('10.') or ip.startswith('172.16.'):
        return "Local Loopback (Development)"
    try:
        url = f"http://ip-api.com/json/{ip}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=1.0) as response:
            data = json.loads(response.read().decode('utf-8'))
            if data.get('status') == 'success':
                return f"{data.get('city', 'Unknown')}, {data.get('regionName', '')}, {data.get('country', '')}"
    except Exception as e:
        print("Geolocation prediction error:", e)
    return "Unknown Location"

def post_log_to_supabase(payload):
    audit_url = os.environ.get("AUDIT_SUPABASE_URL", "")
    audit_key = os.environ.get("AUDIT_SUPABASE_ANON_KEY", "")
    if not audit_url or not audit_key:
        print("AUDIT SYSTEM WARNING: Secondary Supabase credentials missing.")
        return
        
    url = f"{audit_url}/rest/v1/audit_logs"
    headers = {
        'apikey': audit_key,
        'Authorization': f'Bearer {audit_key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    }
    
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers=headers,
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=3.0) as response:
            response.read()
    except Exception as e:
        print("AUDIT SYSTEM ERROR: Failed to write log to secondary Supabase:", e)

def log_audit_event(email, role, route, method, status, ip_address, user_agent, details=None):
    location = get_location_prediction(ip_address)
    
    risk_level = 'info'
    if status in [403, 401]:
        risk_level = 'suspicious'
    elif status >= 400 or method in ['POST', 'PUT', 'DELETE']:
        risk_level = 'warning'
        
    if '..' in route or '.env' in route or 'server.py' in route:
        risk_level = 'suspicious'
        details = details or "Directory traversal or restricted file access attempted."
        
    payload = {
        'email': email or 'Anonymous',
        'role': role or 'Anonymous',
        'route': route,
        'method': method,
        'status': status,
        'ip_address': ip_address,
        'user_agent': user_agent,
        'location': location,
        'risk_level': risk_level,
        'details': details or ''
    }
    
    thread = threading.Thread(target=post_log_to_supabase, args=(payload,))
    thread.daemon = True
    thread.start()


# ---------------------------------------------------------------------------
# HTTPS Enforcer, Security Headers, and Request Logger Middleware
# ---------------------------------------------------------------------------
@app.before_request
def force_https():
    if not request.is_secure and request.headers.get('X-Forwarded-Proto', 'http') != 'https':
        host = request.headers.get('Host', '')
        if not any(local in host for local in ['localhost', '127.0.0.1']):
            url = request.url.replace('http://', 'https://', 1)
            return redirect(url, code=301)

@app.after_request
def add_security_headers_and_log(response):
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    
    route = request.path
    method = request.method
    status = response.status_code
    
    ip_address = request.headers.get('X-Forwarded-For', request.remote_addr)
    if ip_address and ',' in ip_address:
        ip_address = ip_address.split(',')[0].strip()
        
    user_agent = request.headers.get('User-Agent', '')
    
    email = 'Anonymous'
    role = 'Anonymous'
    cookie_val = request.cookies.get('thrustvault_session')
    if cookie_val:
        try:
            session_data = json.loads(urllib.parse.unquote(cookie_val))
            email = session_data.get('email', 'Anonymous')
            role = session_data.get('role', 'Anonymous')
        except Exception:
            pass
            
    if not route.startswith('/api/audit-logs') and not route.startswith('/static') and not route.endswith('.ico'):
        details = None
        if status == 301 or status == 302:
            details = f"Redirected to {response.headers.get('Location', '')}"
        elif status == 403:
            details = "Access Denied / Forbidden"
        elif status == 404:
            details = "Page or Resource Not Found"
            
        log_audit_event(email, role, route, method, status, ip_address, user_agent, details)
        
    return response

# ---------------------------------------------------------------------------
# Custom Error Handlers
# ---------------------------------------------------------------------------
@app.errorhandler(404)
def page_not_found(e):
    return send_from_directory('.', '404.html'), 404

@app.errorhandler(403)
def forbidden(e):
    return send_from_directory('.', '404.html'), 404


# ---------------------------------------------------------------------------
# Secure Audit Logs API Endpoint (Admin Only)
# ---------------------------------------------------------------------------
@app.route('/api/audit-logs')
def get_audit_logs():
    cookie_val = request.cookies.get('thrustvault_session')
    if not cookie_val:
        abort(403)
        
    try:
        session_data = json.loads(urllib.parse.unquote(cookie_val))
        role = session_data.get('role')
        if role != 'admin':
            abort(403)
    except Exception:
        abort(403)
        
    audit_url = os.environ.get("AUDIT_SUPABASE_URL", "")
    audit_key = os.environ.get("AUDIT_SUPABASE_ANON_KEY", "")
    if not audit_url or not audit_key:
        return jsonify([])
        
    url = f"{audit_url}/rest/v1/audit_logs?order=timestamp.desc&limit=200"
    headers = {
        'apikey': audit_key,
        'Authorization': f'Bearer {audit_key}',
        'Content-Type': 'application/json'
    }
    
    try:
        req = urllib.request.Request(url, headers=headers, method='GET')
        with urllib.request.urlopen(req, timeout=3.0) as response:
            logs = json.loads(response.read().decode('utf-8'))
            return jsonify(logs)
    except Exception as e:
        print("Failed to fetch audit logs from secondary Supabase:", e)
        return jsonify([])



# ---------------------------------------------------------------------------
# Server-Side Dashboard Session & Role Verification
# ---------------------------------------------------------------------------
def verify_dashboard_access(required_role, filename):
    cookie_val = request.cookies.get('thrustvault_session')
    if not cookie_val:
        return redirect('/login.html')
    
    try:
        session_data = json.loads(urllib.parse.unquote(cookie_val))
        role = session_data.get('role')
        timestamp = session_data.get('timestamp', 0)
        
        # Enforce session validity within 24 hours (86400 seconds)
        current_time_ms = int(time.time() * 1000)
        if current_time_ms - timestamp > 86400 * 1000:
            response = make_response(redirect('/login.html'))
            response.set_cookie('thrustvault_session', '', expires=0, path='/')
            return response
            
        if role != required_role:
            if role == 'admin':
                return redirect('/admin_dashboard.html')
            elif role == 'intern':
                return redirect('/intern_dashboard.html')
            elif role == 'guest':
                return redirect('/guest_dashboard.html')
            else:
                return redirect('/login.html')
                
        return send_from_directory('.', filename)
    except Exception as e:
        print("Error verifying session cookie:", e)
        return redirect('/login.html')

def verify_dashboard_access_any(filename):
    cookie_val = request.cookies.get('thrustvault_session')
    if not cookie_val:
        return redirect('/login.html')
    
    try:
        session_data = json.loads(urllib.parse.unquote(cookie_val))
        role = session_data.get('role')
        timestamp = session_data.get('timestamp', 0)
        
        # Enforce session validity within 24 hours (86400 seconds)
        current_time_ms = int(time.time() * 1000)
        if current_time_ms - timestamp > 86400 * 1000:
            response = make_response(redirect('/login.html'))
            response.set_cookie('thrustvault_session', '', expires=0, path='/')
            return response
            
        if role not in ['admin', 'intern', 'guest']:
            return redirect('/login.html')
                
        return send_from_directory('.', filename)
    except Exception as e:
        print("Error verifying session cookie:", e)
        return redirect('/login.html')

# Explicit Dashboard and Scripts Routing
@app.route('/admin_dashboard.html')
def admin_dashboard():
    return verify_dashboard_access('admin', 'admin_dashboard.html')

@app.route('/admin_app.js')
def admin_app_js():
    return verify_dashboard_access('admin', 'admin_app.js')

@app.route('/admin_exports.html')
def admin_exports():
    return verify_dashboard_access('admin', 'admin_exports.html')

@app.route('/admin_exports_app.js')
def admin_exports_app_js():
    return verify_dashboard_access('admin', 'admin_exports_app.js')

@app.route('/admin_audit_logs.html')
def admin_audit_logs():
    return verify_dashboard_access('admin', 'admin_audit_logs.html')

@app.route('/admin_audit_logs_app.js')
def admin_audit_logs_app_js():
    return verify_dashboard_access('admin', 'admin_audit_logs_app.js')


@app.route('/intern_dashboard.html')
def intern_dashboard():
    return verify_dashboard_access('intern', 'intern_dashboard.html')

@app.route('/intern_app.js')
def intern_app_js():
    return verify_dashboard_access('intern', 'intern_app.js')

@app.route('/guest_dashboard.html')
def guest_dashboard():
    return verify_dashboard_access('guest', 'guest_dashboard.html')

@app.route('/guest_app.js')
def guest_app_js():
    return verify_dashboard_access('guest', 'guest_app.js')

@app.route('/performance_analytics.html')
def performance_analytics():
    return verify_dashboard_access_any('performance_analytics.html')

@app.route('/performance_app.js')
def performance_app_js():
    return verify_dashboard_access_any('performance_app.js')


# ---------------------------------------------------------------------------
# Serve index.html at root
# ---------------------------------------------------------------------------
@app.route('/')
def root():
    return send_from_directory('.', 'index.html')


# ---------------------------------------------------------------------------
# Catch-all: serve only whitelisted public static files
# ---------------------------------------------------------------------------
@app.route('/<path:filename>')
def static_files(filename):
    # Normalize the path to prevent traversal
    safe_path = os.path.normpath(filename).replace('\\', '/')
    
    # Block traversal attempts
    if '..' in safe_path or safe_path.startswith('/') or safe_path.startswith('../'):
        abort(403)
        
    PUBLIC_FILES = {
        'index.html',
        'login.html',
        'login.js',
        'style.css',
        'thrustvault_presentation.html'
    }
    
    PUBLIC_LIBS = {
        'libs/chart.umd.js',
        'libs/lucide.min.js',
        'libs/supabase.js',
        'libs/xlsx.full.min.js'
    }
    
    if safe_path in PUBLIC_FILES or safe_path in PUBLIC_LIBS:
        return send_from_directory('.', safe_path)
        
    # Block any other files
    abort(403)



# ---------------------------------------------------------------------------
# Entry point for local development
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    print(f"ThrustVault server running on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
