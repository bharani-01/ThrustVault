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
            
    is_static_asset = (
        route.endswith('.js') or 
        route.endswith('.css') or 
        route.startswith('/libs/') or 
        route.startswith('/static/') or 
        route.endswith('.ico') or 
        route.endswith('.png') or 
        route.endswith('.jpg') or 
        route.endswith('.jpeg') or 
        route.endswith('.svg') or
        route.endswith('.gif')
    )
            
    if not route.startswith('/api/audit-logs') and not is_static_asset:
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
# Resend Email Sending API Endpoint (Admin & Request access flow)
# ---------------------------------------------------------------------------
@app.route('/api/send-email', methods=['POST'])
def send_email_api():
    data = request.get_json() or {}
    email_type = data.get('type') # 'received', 'approved', 'rejected'
    recipient = data.get('to')
    
    if not recipient or not email_type:
        return jsonify({"success": False, "error": "Missing recipient or type"}), 400

    # For approved or rejected emails, restrict to logged-in admin users
    if email_type in ['approved', 'rejected']:
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
            
    resend_key = os.environ.get("RESEND_API_KEY", "")
    if not resend_key or resend_key == "re_placeholder_key":
        print("EMAIL SYSTEM WARNING: RESEND_API_KEY is not configured. Email skipped.")
        return jsonify({"success": True, "message": "Email skipped (key missing)"})
        
    subject = ""
    html_content = ""
    
    if email_type == 'received':
        full_name = data.get('full_name', 'User')
        role = data.get('requested_role', 'guest').upper()
        subject = "ThrustVault Access Request Received"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <div style="text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px;">
                <h2 style="color: #2563eb; margin: 0; font-family: 'Outfit', sans-serif;">ThrustVault Access Request</h2>
            </div>
            <p>Hello {full_name},</p>
            <p>Thank you for requesting access to the <strong>ThrustVault UAV Motor Database Console</strong>. We have received your request for the <strong>{role}</strong> role.</p>
            <p>Our administrators are currently reviewing your application. You will receive an email notification once a decision has been made.</p>
            <p style="margin-top: 30px; font-size: 0.82rem; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                This is an automated notification from ThrustVault. Please do not reply directly to this email.
            </p>
        </div>
        """
    elif email_type == 'approved':
        full_name = data.get('full_name', 'User')
        role = data.get('requested_role', 'guest').upper()
        reset_link = data.get('reset_link', '')
        temp_password = data.get('temp_password', '')
        
        subject = "ThrustVault Access Approved"
        
        link_section = ""
        if reset_link:
            link_section = f"""
            <p style="margin: 25px 0; text-align: center;">
                <a href="{reset_link}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Set Your Password & Login</a>
            </p>
            <p style="font-size: 0.85rem; color: #64748b; text-align: center;">If the button above does not work, copy and paste the following link into your browser:<br>
            <a href="{reset_link}" style="color: #2563eb; word-break: break-all;">{reset_link}</a></p>
            """
        
        pass_section = ""
        if temp_password:
            pass_section = f"""
            <p>Alternatively, you can log in using the temporary credentials below:</p>
            <table style="background-color: #f8fafc; padding: 15px; border-radius: 8px; width: 100%; border: 1px solid #e2e8f0; font-family: monospace; margin: 15px 0;">
                <tr><td style="padding: 5px;"><strong>Email:</strong></td><td style="padding: 5px;">{recipient}</td></tr>
                <tr><td style="padding: 5px;"><strong>Default Password:</strong></td><td style="padding: 5px;"><code>{temp_password}</code></td></tr>
            </table>
            """
            
        html_content = f"""
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <div style="text-align: center; border-bottom: 2px solid #059669; padding-bottom: 15px; margin-bottom: 20px;">
                <h2 style="color: #059669; margin: 0; font-family: 'Outfit', sans-serif;">Access Request Approved 🎉</h2>
            </div>
            <p>Hello {full_name},</p>
            <p>Great news! Your access request to the <strong>ThrustVault UAV Motor Database Console</strong> has been approved. You have been assigned the <strong>{role}</strong> role.</p>
            {link_section}
            {pass_section}
            <p>Once you sign in, you can start using the drone motor database and analytics tools.</p>
            <p style="margin-top: 30px; font-size: 0.82rem; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                This is an automated notification from ThrustVault. Please do not reply directly to this email.
            </p>
        </div>
        """
    elif email_type == 'rejected':
        full_name = data.get('full_name', 'User')
        subject = "ThrustVault Access Request Update"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <div style="text-align: center; border-bottom: 2px solid #e11d48; padding-bottom: 15px; margin-bottom: 20px;">
                <h2 style="color: #e11d48; margin: 0; font-family: 'Outfit', sans-serif;">Access Request Status</h2>
            </div>
            <p>Hello {full_name},</p>
            <p>Thank you for your interest in the <strong>ThrustVault UAV Motor Database Console</strong>.</p>
            <p>We have reviewed your request for database access. Unfortunately, your request has not been approved at this time.</p>
            <p>If you believe this is in error or require further assistance, please contact the administrator.</p>
            <p style="margin-top: 30px; font-size: 0.82rem; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                This is an automated notification from ThrustVault. Please do not reply directly to this email.
            </p>
        </div>
        """
        
    # Send email via Resend API
    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {resend_key}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    payload = {
        "from": "ThrustVault <onboarding@bharani-01.xyz>",
        "to": [recipient],
        "subject": subject,
        "html": html_content
    }
    
    try:
        req_obj = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers=headers,
            method='POST'
        )
        with urllib.request.urlopen(req_obj, timeout=5.0) as res_obj:
            res_body = res_obj.read().decode()
            return jsonify({"success": True, "resend": json.loads(res_body)})
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        print("EMAIL SENDING HTTP ERROR via Resend:", e.code, err_body)
        return jsonify({"success": False, "error": f"HTTP {e.code}: {err_body}"})
    except Exception as e:
        print("EMAIL SENDING ERROR via Resend:", e)
        return jsonify({"success": False, "error": str(e)})



# ---------------------------------------------------------------------------
# Server-Side Dashboard Session & Role Verification
# ---------------------------------------------------------------------------
def verify_dashboard_access(required_role, filename):
    cookie_val = request.cookies.get('thrustvault_session')
    if not cookie_val:
        return redirect('/login')
    
    try:
        session_data = json.loads(urllib.parse.unquote(cookie_val))
        role = session_data.get('role')
        timestamp = session_data.get('timestamp', 0)
        
        # Enforce session validity within 24 hours (86400 seconds)
        current_time_ms = int(time.time() * 1000)
        if current_time_ms - timestamp > 86400 * 1000:
            response = make_response(redirect('/login'))
            response.set_cookie('thrustvault_session', '', expires=0, path='/')
            return response
            
        if role != required_role:
            if role == 'admin':
                return redirect('/admin_dashboard')
            elif role == 'intern':
                return redirect('/intern_dashboard')
            elif role == 'guest':
                return redirect('/guest_dashboard')
            else:
                return redirect('/login')
                
        return send_from_directory('.', filename)
    except Exception as e:
        print("Error verifying session cookie:", e)
        return redirect('/login')

def verify_dashboard_access_any(filename):
    cookie_val = request.cookies.get('thrustvault_session')
    if not cookie_val:
        return redirect('/login')
    
    try:
        session_data = json.loads(urllib.parse.unquote(cookie_val))
        role = session_data.get('role')
        timestamp = session_data.get('timestamp', 0)
        
        # Enforce session validity within 24 hours (86400 seconds)
        current_time_ms = int(time.time() * 1000)
        if current_time_ms - timestamp > 86400 * 1000:
            response = make_response(redirect('/login'))
            response.set_cookie('thrustvault_session', '', expires=0, path='/')
            return response
            
        if role not in ['admin', 'intern', 'guest']:
            return redirect('/login')
                
        return send_from_directory('.', filename)
    except Exception as e:
        print("Error verifying session cookie:", e)
        return redirect('/login')

# Explicit Dashboard and Scripts Routing
@app.route('/admin_dashboard')
@app.route('/admin_dashboard.html')
def admin_dashboard():
    if request.path.endswith('.html'):
        return redirect('/admin_dashboard')
    return verify_dashboard_access('admin', 'admin_dashboard.html')

@app.route('/admin_app.js')
def admin_app_js():
    return verify_dashboard_access('admin', 'admin_app.js')

@app.route('/admin_exports')
@app.route('/admin_exports.html')
def admin_exports():
    if request.path.endswith('.html'):
        return redirect('/admin_exports')
    return verify_dashboard_access('admin', 'admin_exports.html')

@app.route('/admin_exports_app.js')
def admin_exports_app_js():
    return verify_dashboard_access('admin', 'admin_exports_app.js')

@app.route('/admin_audit_logs')
@app.route('/admin_audit_logs.html')
def admin_audit_logs():
    if request.path.endswith('.html'):
        return redirect('/admin_audit_logs')
    return verify_dashboard_access('admin', 'admin_audit_logs.html')

@app.route('/admin_audit_logs_app.js')
def admin_audit_logs_app_js():
    return verify_dashboard_access('admin', 'admin_audit_logs_app.js')


@app.route('/intern_dashboard')
@app.route('/intern_dashboard.html')
def intern_dashboard():
    if request.path.endswith('.html'):
        return redirect('/intern_dashboard')
    return verify_dashboard_access('intern', 'intern_dashboard.html')

@app.route('/intern_app.js')
def intern_app_js():
    return verify_dashboard_access('intern', 'intern_app.js')

@app.route('/guest_dashboard')
@app.route('/guest_dashboard.html')
def guest_dashboard():
    if request.path.endswith('.html'):
        return redirect('/guest_dashboard')
    return verify_dashboard_access('guest', 'guest_dashboard.html')

@app.route('/guest_app.js')
def guest_app_js():
    return verify_dashboard_access('guest', 'guest_app.js')

@app.route('/performance_analytics')
@app.route('/performance_analytics.html')
def performance_analytics():
    if request.path.endswith('.html'):
        return redirect('/performance_analytics')
    return verify_dashboard_access_any('performance_analytics.html')

@app.route('/performance_app.js')
def performance_app_js():
    return verify_dashboard_access_any('performance_app.js')


# ---------------------------------------------------------------------------
# Serve index.html at root
# ---------------------------------------------------------------------------
@app.route('/')
@app.route('/index.html')
def root():
    if request.path.endswith('.html'):
        return redirect('/')
    return send_from_directory('.', 'index.html')

@app.route('/login')
@app.route('/login.html')
def login_page():
    if request.path.endswith('.html'):
        return redirect('/login')
    return send_from_directory('.', 'login.html')

@app.route('/request_access')
@app.route('/request_access.html')
def request_access_page():
    if request.path.endswith('.html'):
        return redirect('/request_access')
    return send_from_directory('.', 'request_access.html')

@app.route('/thrustvault_presentation')
@app.route('/thrustvault_presentation.html')
def presentation_page():
    if request.path.endswith('.html'):
        return redirect('/thrustvault_presentation')
    return send_from_directory('.', 'thrustvault_presentation.html')


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
        'onboarding.js',
        'request_access.html',
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
