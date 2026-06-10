"""
ThrustVault - Flask Static Server
Compatible with Render.com Web Service deployment.
Serves all static HTML/CSS/JS files and exposes /api/config for Supabase credentials.
"""

import os
import json
import urllib.parse
import time
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

@app.route('/admin_dashboard.html')
def admin_dashboard():
    return verify_dashboard_access('admin', 'admin_dashboard.html')

@app.route('/intern_dashboard.html')
def intern_dashboard():
    return verify_dashboard_access('intern', 'intern_dashboard.html')

@app.route('/guest_dashboard.html')
def guest_dashboard():
    return verify_dashboard_access('guest', 'guest_dashboard.html')


# ---------------------------------------------------------------------------
# Serve index.html at root
# ---------------------------------------------------------------------------
@app.route('/')
def root():
    return send_from_directory('.', 'index.html')


# ---------------------------------------------------------------------------
# Catch-all: serve any static file (HTML, CSS, JS, xlsx, etc.)
# ---------------------------------------------------------------------------
@app.route('/<path:filename>')
def static_files(filename):
    # Guard against bypassing server-side validation on dashboard pages
    if filename in ['admin_dashboard.html', 'intern_dashboard.html', 'guest_dashboard.html']:
        return redirect('/' + filename)
    return send_from_directory('.', filename)


# ---------------------------------------------------------------------------
# Entry point for local development
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    print(f"ThrustVault server running on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
