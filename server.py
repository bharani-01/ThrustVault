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
from flask import Flask, send_from_directory, jsonify, request, abort, redirect, make_response, session
from functools import wraps

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

app = Flask(__name__, static_folder='public', static_url_path='')
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "thrustvault-default-secure-key-987654321")
app.config['SESSION_COOKIE_NAME'] = 'thrustvault_session'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Strict'


# ---------------------------------------------------------------------------
# Supabase HTTP Client & Auth Decorator Helpers
# ---------------------------------------------------------------------------
def call_supabase_api(path, method='GET', payload=None, query_params=None, headers=None, is_auth=False):
    """
    HTTP client to query Supabase REST and Auth endpoints using urllib.
    """
    supabase_url = os.environ.get("SUPABASE_URL", "")
    # Use SERVICE_ROLE_KEY if available on backend for elevated privileges, fallback to ANON_KEY
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", os.environ.get("service_role", os.environ.get("SUPABASE_ANON_KEY", "")))
    
    if is_auth:
        url = f"{supabase_url}/auth/v1/{path}"
    else:
        url = f"{supabase_url}/rest/v1/{path}"
        
    if query_params:
        encoded_params = []
        for k, v in query_params.items():
            encoded_params.append(f"{k}={urllib.parse.quote(str(v), safe=':()[].,=')}")
        url += "?" + "&".join(encoded_params)
        
    req_headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json"
    }
    if headers:
        req_headers.update(headers)
        
    data_bytes = None
    if payload is not None:
        data_bytes = json.dumps(payload).encode('utf-8')
        
    req = urllib.request.Request(url, data=data_bytes, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15.0) as response:
            res_body = response.read().decode('utf-8')
            return json.loads(res_body) if res_body else None
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        print(f"Supabase request failed: {e.code} - {err_body}")
        try:
            err_json = json.loads(err_body)
            raise Exception(err_json.get('msg') or err_json.get('message') or err_json.get('error_description') or err_body)
        except Exception:
            raise Exception(f"HTTP {e.code}: {err_body}")

def require_role(allowed_roles):
    """
    Decorator to restrict route access to specific user roles.
    """
    if isinstance(allowed_roles, str):
        allowed_roles = [allowed_roles]
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            role = session.get('role')
            timestamp = session.get('timestamp', 0)
            if not role:
                return jsonify({"error": "Unauthorized"}), 401
            current_time_ms = int(time.time() * 1000)
            if current_time_ms - timestamp > 86400 * 1000:
                session.clear()
                return jsonify({"error": "Session expired"}), 401
            if role not in allowed_roles:
                return jsonify({"error": "Forbidden"}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator


# ---------------------------------------------------------------------------
# /api/config  — Deprecated configuration endpoint
# ---------------------------------------------------------------------------
@app.route('/api/config')
def api_config():
    # Deprecated for security. Credentials are now managed server-side.
    return jsonify({
        "SUPABASE_URL": "",
        "SUPABASE_ANON_KEY": ""
    })


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


# Thread-safe in-memory IP rate limiter
rate_limit_lock = threading.Lock()
ip_request_history = {}

def rate_limit(limit=5, period=60):
    """
    Decorator to restrict route access by IP address.
    limit: Max number of requests allowed in the period.
    period: Period in seconds.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            ip = request.headers.get('X-Forwarded-For', request.remote_addr)
            if ip and ',' in ip:
                ip = ip.split(',')[0].strip()
                
            current_time = time.time()
            with rate_limit_lock:
                history = ip_request_history.get(ip, [])
                # Filter timestamps to keep only those within the current window
                valid_timestamps = [t for t in history if current_time - t < period]
                if len(valid_timestamps) >= limit:
                    # Log rate limit violation in the audit log
                    log_audit_event(
                        email='Anonymous',
                        role='Anonymous',
                        route=request.path,
                        method=request.method,
                        status=429,
                        ip_address=ip,
                        user_agent=request.headers.get('User-Agent', ''),
                        details=f"Rate limit exceeded: {len(valid_timestamps)} requests in last {period} seconds."
                    )
                    return jsonify({"error": "Too many requests. Please try again later."}), 429
                
                valid_timestamps.append(current_time)
                ip_request_history[ip] = valid_timestamps
            return f(*args, **kwargs)
        return decorated_function
    return decorator


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
    
    email = session.get('email', 'Anonymous')
    role = session.get('role', 'Anonymous')
    
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
            
    # Only log requests that are errors, access denials, redirects, or critical API modifications
    is_important_log = (
        status >= 400 or
        status in [301, 302, 401, 403] or
        (method in ['POST', 'PUT', 'DELETE'] and route.startswith('/api/'))
    )
    if is_important_log and not route.startswith('/api/audit-logs') and not route.startswith('/api/log-activity') and not is_static_asset:
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
    return send_from_directory('public', '404.html'), 404

@app.errorhandler(403)
def forbidden(e):
    return send_from_directory('public', '404.html'), 404


# ---------------------------------------------------------------------------
# Secure Audit Logs API Endpoint (Admin Only)
# ---------------------------------------------------------------------------
@app.route('/api/log-activity', methods=['POST'])
def log_client_activity():
    email = session.get('email')
    role = session.get('role')
    if not email or not role:
        abort(401)

    data = request.json or {}
    action = data.get('action', '')
    details = data.get('details', '')

    if not action:
        return jsonify({"error": "action parameter is required"}), 400

    ip_address = request.headers.get('X-Forwarded-For', request.remote_addr)
    if ip_address and ',' in ip_address:
        ip_address = ip_address.split(',')[0].strip()
        
    user_agent = request.headers.get('User-Agent', '')

    # For client logs, we prefix the route with DB_FUNCTION to differentiate them from HTTP logs
    log_audit_event(
        email=email,
        role=role,
        route=f"DB_FUNCTION: {action}",
        method="POST",
        status=200,
        ip_address=ip_address,
        user_agent=user_agent,
        details=details
    )

    return jsonify({"success": True}), 200


# ---------------------------------------------------------------------------
# Secure Audit Logs API Endpoint (Admin Only)
# ---------------------------------------------------------------------------
@app.route('/api/audit-logs')
def get_audit_logs():
    role = session.get('role')
    if not role or role != 'admin':
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

    # For approved, rejected, or created emails, restrict to logged-in admin users
    if email_type in ['approved', 'rejected', 'created']:
        role = session.get('role')
        if not role or role != 'admin':
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
    elif email_type == 'created':
        role = data.get('requested_role', 'guest').upper()
        temp_password = data.get('temp_password', '')
        reset_link = data.get('reset_link', '')
        
        subject = "ThrustVault Account Created"
        
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
            <p>You can log in using the temporary credentials below:</p>
            <table style="background-color: #f8fafc; padding: 15px; border-radius: 8px; width: 100%; border: 1px solid #e2e8f0; font-family: monospace; margin: 15px 0;">
                <tr><td style="padding: 5px;"><strong>Email:</strong></td><td style="padding: 5px;">{recipient}</td></tr>
                <tr><td style="padding: 5px;"><strong>Temporary Password:</strong></td><td style="padding: 5px;"><code>{temp_password}</code></td></tr>
            </table>
            """
            
        html_content = f"""
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <div style="text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px;">
                <h2 style="color: #2563eb; margin: 0; font-family: 'Outfit', sans-serif;">Account Created 🎉</h2>
            </div>
            <p>Hello,</p>
            <p>An administrator has created a new account for you on the <strong>ThrustVault UAV Motor Database Console</strong>. You have been assigned the <strong>{role}</strong> role.</p>
            {link_section}
            {pass_section}
            <p>Once you sign in, you can start using the drone motor database and analytics tools.</p>
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
# Request Demo API Endpoint — Saves request in DB & sends confirmation email
# ---------------------------------------------------------------------------
@app.route('/api/request-demo', methods=['POST'])
def request_demo_api():
    data = request.get_json() or {}
    full_name = data.get('name')
    company = data.get('company')
    email = data.get('email')
    usecase = data.get('usecase', 'research')

    if not full_name or not company or not email:
        return jsonify({"success": False, "error": "Missing required fields"}), 400

    # 1. Insert into Supabase 'access_requests' table using REST API
    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_ANON_KEY", "")
    
    db_success = False
    db_message = ""
    if supabase_url and supabase_key:
        url = f"{supabase_url}/rest/v1/access_requests"
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        payload = {
            "full_name": full_name,
            "email": email,
            "requested_role": "guest",
            "justification": f"Demo Request. Company: {company}, Use Case: {usecase}",
            "status": "pending"
        }
        try:
            req_obj = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers=headers,
                method='POST'
            )
            with urllib.request.urlopen(req_obj, timeout=5.0) as res_obj:
                res_obj.read()
                db_success = True
        except Exception as e:
            print("DB INSERT ERROR for demo request:", e)
            db_message = f"Failed to record in DB: {str(e)}"
    else:
        print("DB INSERT WARNING: Supabase credentials missing. Storing in DB skipped.")
        db_message = "Database credentials missing"

    # 2. Send confirmation email via Resend API
    resend_key = os.environ.get("RESEND_API_KEY", "")
    email_success = False
    email_message = ""
    if resend_key and resend_key != "re_placeholder_key":
        url = "https://api.resend.com/emails"
        headers = {
            "Authorization": f"Bearer {resend_key}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0"
        }
        
        # Format the usecase display string
        usecase_display = {
            "delivery": "Autonomous Cargo/Delivery",
            "inspection": "Industrial Inspection & Mapping",
            "defense": "Defense & Public Safety",
            "agriculture": "Precision Agriculture",
            "research": "Academic / R&D Curation"
        }.get(usecase, usecase)

        subject = "ThrustVault Demo Request Confirmation"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <div style="text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px;">
                <h2 style="color: #2563eb; margin: 0; font-family: 'Outfit', sans-serif;">Demo Request Received</h2>
            </div>
            <p>Dear {full_name},</p>
            <p>Thank you for requesting a custom demonstration of the <strong>ThrustVault UAV Motor Database Console</strong>.</p>
            <p>We are excited to help you explore our secure spec catalog and analytics modules. Here are the details we received from your submission:</p>
            <table style="background-color: #f8fafc; padding: 15px; border-radius: 8px; width: 100%; border: 1px solid #e2e8f0; margin: 15px 0;">
                <tr><td style="padding: 5px; width: 130px;"><strong>Company:</strong></td><td style="padding: 5px;">{company}</td></tr>
                <tr><td style="padding: 5px; width: 130px;"><strong>UAV Use Case:</strong></td><td style="padding: 5px;">{usecase_display}</td></tr>
                <tr><td style="padding: 5px; width: 130px;"><strong>Email:</strong></td><td style="padding: 5px;">{email}</td></tr>
            </table>
            <p>A member of our UAV systems validation team will reach out to you shortly to schedule your personalized live demo session and walk you through role-based dashboard telemetry curation.</p>
            <p>If you have any immediate questions in the meantime, please do not hesitate to contact us.</p>
            <p style="margin-bottom: 0;">Best regards,</p>
            <p style="margin-top: 5px; font-weight: bold; color: #2563eb;">The ThrustVault Team</p>
            <p style="margin-top: 30px; font-size: 0.82rem; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center;">
                This is an automated confirmation of your request. Please do not reply directly to this email.
            </p>
        </div>
        """
        
        email_payload = {
            "from": "ThrustVault <demo.thrustvault@bharani-01.xyz>",
            "to": [email],
            "subject": subject,
            "html": html_content
        }
        
        try:
            req_obj = urllib.request.Request(
                url,
                data=json.dumps(email_payload).encode('utf-8'),
                headers=headers,
                method='POST'
            )
            with urllib.request.urlopen(req_obj, timeout=5.0) as res_obj:
                res_obj.read()
                email_success = True
        except Exception as e:
            print("EMAIL SENDING ERROR for demo request:", e)
            email_message = f"Failed to send email: {str(e)}"
    else:
        print("EMAIL SENDING WARNING: RESEND_API_KEY is not configured. Email skipped.")
        email_message = "Resend API key missing"
        email_success = True  # mock success locally so frontend doesn't throw a hard error

    return jsonify({
        "success": db_success or email_success,
        "db_recorded": db_success,
        "db_message": db_message,
        "email_sent": email_success,
        "email_message": email_message
    })


# ---------------------------------------------------------------------------
# Server-Side Dashboard Session & Role Verification
# ---------------------------------------------------------------------------
def validate_session_token_periodic():
    """
    Validates the session token with Supabase every 5 minutes (300 seconds).
    Returns True if valid, False if invalid/revoked.
    """
    role = session.get('role')
    timestamp = session.get('timestamp', 0)
    if not role:
        return False
        
    current_time_ms = int(time.time() * 1000)
    if current_time_ms - timestamp > 86400 * 1000:
        session.clear()
        return False
        
    last_validated = session.get('last_validated', 0)
    current_time = time.time()
    if current_time - last_validated > 300:
        access_token = session.get('access_token')
        if not access_token:
            session.clear()
            return False
        try:
            call_supabase_api("user", method='GET', headers={"Authorization": f"Bearer {access_token}"}, is_auth=True)
            session['last_validated'] = current_time
        except Exception as e:
            print("Dynamic session validation failed:", e)
            session.clear()
            return False
            
    return True

# Server-Side Dashboard Session & Role Verification
# ---------------------------------------------------------------------------
def verify_dashboard_access(required_role, filename):
    if not validate_session_token_periodic():
        if filename.endswith('.js'):
            return make_response(jsonify({"error": "Unauthorized"}), 401)
        return redirect('/login')
    
    role = session.get('role')
    if role != required_role:
        if filename.endswith('.js'):
            return make_response(jsonify({"error": "Forbidden"}), 403)
        if role == 'admin':
            return redirect('/admin/dashboard')
        elif role == 'intern':
            return redirect('/intern/dashboard')
        elif role == 'guest':
            return redirect('/guest/dashboard')
        else:
            return redirect('/login')
            
    return send_from_directory('public', filename)

def verify_dashboard_access_any(filename):
    if not validate_session_token_periodic():
        if filename.endswith('.js'):
            return make_response(jsonify({"error": "Unauthorized"}), 401)
        return redirect('/login')
    
    role = session.get('role')
    if role not in ['admin', 'intern', 'guest']:
        if filename.endswith('.js'):
            return make_response(jsonify({"error": "Forbidden"}), 403)
        return redirect('/login')
            
    return send_from_directory('public', filename)

# Explicit Dashboard and Scripts Routing
@app.route('/admin/dashboard')
@app.route('/admin_dashboard')
@app.route('/admin_dashboard.html')
def admin_dashboard():
    if request.path != '/admin/dashboard':
        return redirect('/admin/dashboard')
    return verify_dashboard_access('admin', 'admin_dashboard.html')

@app.route('/admin_app.js')
def admin_app_js():
    return verify_dashboard_access('admin', 'admin_app.js')

@app.route('/admin/exports')
@app.route('/admin_exports')
@app.route('/admin_exports.html')
def admin_exports():
    if request.path != '/admin/exports':
        return redirect('/admin/exports')
    return verify_dashboard_access('admin', 'admin_exports.html')

@app.route('/admin_exports_app.js')
def admin_exports_app_js():
    return verify_dashboard_access('admin', 'admin_exports_app.js')

@app.route('/admin/imports')
@app.route('/admin_imports')
@app.route('/admin_imports.html')
def admin_imports():
    if request.path != '/admin/imports':
        return redirect('/admin/imports')
    return verify_dashboard_access('admin', 'admin_imports.html')

@app.route('/admin_imports_app.js')
def admin_imports_app_js():
    return verify_dashboard_access('admin', 'admin_imports_app.js')

@app.route('/admin/audit-logs')
@app.route('/admin_audit_logs')
@app.route('/admin_audit_logs.html')
def admin_audit_logs():
    if request.path != '/admin/audit-logs':
        return redirect('/admin/audit-logs')
    return verify_dashboard_access('admin', 'admin_audit_logs.html')

@app.route('/admin_audit_logs_app.js')
def admin_audit_logs_app_js():
    return verify_dashboard_access('admin', 'admin_audit_logs_app.js')


@app.route('/admin/users')
@app.route('/admin_users')
@app.route('/admin_users.html')
def admin_users():
    if request.path != '/admin/users':
        return redirect('/admin/users')
    return verify_dashboard_access('admin', 'admin_users.html')

@app.route('/admin_users_app.js')
def admin_users_app_js():
    return verify_dashboard_access('admin', 'admin_users_app.js')


@app.route('/admin/access-requests')
@app.route('/admin_access_requests')
@app.route('/admin_access_requests.html')
def admin_access_requests():
    if request.path != '/admin/access-requests':
        return redirect('/admin/access-requests')
    return verify_dashboard_access('admin', 'admin_access_requests.html')

@app.route('/admin_access_requests_app.js')
def admin_access_requests_app_js():
    return verify_dashboard_access('admin', 'admin_access_requests_app.js')


@app.route('/admin/schema-customizer')
@app.route('/admin_schema_customizer')
@app.route('/admin_schema_customizer.html')
def admin_schema_customizer():
    if request.path != '/admin/schema-customizer':
        return redirect('/admin/schema-customizer')
    return verify_dashboard_access('admin', 'admin_schema_customizer.html')

@app.route('/admin_schema_app.js')
def admin_schema_app_js():
    return verify_dashboard_access('admin', 'admin_schema_app.js')


@app.route('/intern/dashboard')
@app.route('/intern_dashboard')
@app.route('/intern_dashboard.html')
def intern_dashboard():
    if request.path != '/intern/dashboard':
        return redirect('/intern/dashboard')
    return verify_dashboard_access('intern', 'intern_dashboard.html')

@app.route('/intern_app.js')
def intern_app_js():
    return verify_dashboard_access('intern', 'intern_app.js')

@app.route('/guest/dashboard')
@app.route('/guest_dashboard')
@app.route('/guest_dashboard.html')
def guest_dashboard():
    if request.path != '/guest/dashboard':
        return redirect('/guest/dashboard')
    return verify_dashboard_access('guest', 'guest_dashboard.html')

@app.route('/guest_app.js')
def guest_app_js():
    return verify_dashboard_access('guest', 'guest_app.js')

@app.route('/admin/analytics')
@app.route('/admin_analytics')
@app.route('/performance_analytics')
@app.route('/performance_analytics.html')
def admin_analytics():
    if request.path != '/admin/analytics':
        return redirect('/admin/analytics')
    return verify_dashboard_access('admin', 'performance_analytics.html')

@app.route('/intern/analytics')
@app.route('/intern_analytics')
def intern_analytics():
    if request.path != '/intern/analytics':
        return redirect('/intern/analytics')
    return verify_dashboard_access('intern', 'performance_analytics.html')

@app.route('/guest/analytics')
@app.route('/guest_analytics')
def guest_analytics():
    if request.path != '/guest/analytics':
        return redirect('/guest/analytics')
    return verify_dashboard_access('guest', 'performance_analytics.html')

@app.route('/performance_app.js')
def performance_app_js():
    return verify_dashboard_access_any('performance_app.js')

@app.route('/admin/explorer')
@app.route('/admin_explorer')
@app.route('/motor_explorer')
@app.route('/motor_explorer.html')
def admin_explorer():
    if request.path != '/admin/explorer':
        return redirect('/admin/explorer')
    return verify_dashboard_access('admin', 'motor_explorer.html')

@app.route('/intern/explorer')
@app.route('/intern_explorer')
def intern_explorer():
    if request.path != '/intern/explorer':
        return redirect('/intern/explorer')
    return verify_dashboard_access('intern', 'motor_explorer.html')

@app.route('/guest/explorer')
@app.route('/guest_explorer')
def guest_explorer():
    if request.path != '/guest/explorer':
        return redirect('/guest/explorer')
    return verify_dashboard_access('guest', 'motor_explorer.html')

@app.route('/motor_explorer_app.js')
def motor_explorer_app_js():
    return verify_dashboard_access_any('motor_explorer_app.js')



# Nested Static File Redirects for Clean Paths
@app.route('/admin/<path:filename>')
def admin_static_files(filename):
    return verify_dashboard_access('admin', filename)

@app.route('/intern/<path:filename>')
def intern_static_files(filename):
    return verify_dashboard_access('intern', filename)

@app.route('/guest/<path:filename>')
def guest_static_files(filename):
    return verify_dashboard_access('guest', filename)

# ---------------------------------------------------------------------------
# Authentication API Endpoints
# ---------------------------------------------------------------------------
@app.route('/api/auth/login', methods=['POST'])
@rate_limit(limit=5, period=60)
def auth_login():
    data = request.json or {}
    email = data.get('email')
    password = data.get('password')
    if not email or not password:
        return jsonify({"error": "Missing email or password"}), 400
        
    try:
        # Authenticate against Supabase
        payload = {"email": email, "password": password}
        auth_res = call_supabase_api("token?grant_type=password", method='POST', payload=payload, is_auth=True)
        
        access_token = auth_res.get('access_token')
        user_id = auth_res.get('user', {}).get('id')
        
        # Fetch role from user_profiles table
        profile_res = call_supabase_api("user_profiles", query_params={"id": f"eq.{user_id}"})
        if not profile_res or len(profile_res) == 0:
            return jsonify({"error": "Profile role not found for this user"}), 403
            
        role = profile_res[0].get('role')
        
        # Populate Flask session
        session['email'] = email
        session['role'] = role
        session['uid'] = user_id
        session['access_token'] = access_token
        session['timestamp'] = int(time.time() * 1000)
        
        return jsonify({
            "email": email,
            "role": role,
            "uid": user_id,
            "timestamp": session['timestamp']
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    session.clear()
    return jsonify({"success": True})

@app.route('/api/auth/session', methods=['GET'])
def auth_session():
    if not validate_session_token_periodic():
        return jsonify({"logged_in": False}), 200
        
    return jsonify({
        "logged_in": True,
        "email": session.get('email'),
        "role": session.get('role'),
        "uid": session.get('uid')
    })

@app.route('/api/auth/forgot-password', methods=['POST'])
@rate_limit(limit=5, period=60)
def auth_forgot_password():
    data = request.json or {}
    email = data.get('email')
    if not email:
        return jsonify({"error": "Email is required"}), 400
        
    try:
        payload = {"email": email, "create_user": False}
        call_supabase_api("otp", method='POST', payload=payload, is_auth=True)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/auth/verify-otp', methods=['POST'])
@rate_limit(limit=5, period=60)
def auth_verify_otp():
    data = request.json or {}
    email = data.get('email')
    token = data.get('token')
    if not email or not token:
        return jsonify({"error": "Email and token are required"}), 400
        
    try:
        payload = {"email": email, "token": token, "type": "email"}
        res = call_supabase_api("verify", method='POST', payload=payload, is_auth=True)
        
        session['reset_email'] = email
        session['reset_access_token'] = res.get('access_token')
        session['reset_timestamp'] = int(time.time() * 1000)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/api/auth/reset-password', methods=['POST'])
@rate_limit(limit=5, period=60)
def auth_reset_password():
    reset_token = session.get('reset_access_token')
    reset_timestamp = session.get('reset_timestamp', 0)
    if not reset_token or int(time.time() * 1000) - reset_timestamp > 600 * 1000:
        return jsonify({"error": "Password reset session has expired or is invalid. Please restart the request."}), 400
        
    data = request.json or {}
    password = data.get('password')
    if not password or len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
        
    try:
        payload = {"password": password}
        headers = {"Authorization": f"Bearer {reset_token}"}
        call_supabase_api("user", method='PUT', payload=payload, headers=headers, is_auth=True)
        session.clear()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ---------------------------------------------------------------------------
# Public Request Access Endpoints
# ---------------------------------------------------------------------------
@app.route('/api/public/request-access', methods=['POST'])
@rate_limit(limit=5, period=60)
def public_request_access():
    data = request.json or {}
    full_name = data.get('fullName')
    email = data.get('email')
    requested_role = data.get('requestedRole')
    justification = data.get('justification')
    
    if not full_name or not email or not requested_role or not justification:
        return jsonify({"error": "Missing required fields"}), 400
        
    try:
        # 1. Check if user already exists
        existing_profiles = call_supabase_api("user_profiles", query_params={"email": f"eq.{email}", "select": "id"})
        if existing_profiles and len(existing_profiles) > 0:
            return jsonify({"error": "An active account already exists with this email address."}), 409
            
        # 2. Check if request is already pending
        pending_requests = call_supabase_api("access_requests", query_params={"email": f"eq.{email}", "status": "eq.pending", "select": "status"})
        if pending_requests and len(pending_requests) > 0:
            return jsonify({"error": "An access request is already pending for this email address."}), 409
            
        # 3. Insert new request
        payload = {
            "full_name": full_name,
            "email": email,
            "requested_role": requested_role,
            "justification": justification,
            "status": "pending"
        }
        headers = {"Prefer": "return=representation"}
        call_supabase_api("access_requests", method='POST', payload=payload, headers=headers)
        return jsonify({"success": True})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---------------------------------------------------------------------------
# Unified Database REST Proxy (Role-Based Access Control)
# ---------------------------------------------------------------------------
@app.route('/api/db/<table_name>', methods=['GET', 'POST', 'PATCH', 'PUT', 'DELETE'])
def db_proxy(table_name):
    # Normalize table name (replace dashes with underscores)
    table = table_name.replace('-', '_')
    method = request.method
    if method == 'PUT':
        method = 'PATCH'

    role = session.get('role')
    uid = session.get('uid')

    # Access Control List (ACL) mapping table + method to allowed roles
    ACL = {
        'motors': {
            'GET': ['guest', 'intern', 'admin'],
            'POST': ['intern', 'admin'],
            'PATCH': ['intern', 'admin'],
            'DELETE': ['admin']
        },
        'categories': {
            'GET': ['guest', 'intern', 'admin'],
            'POST': ['intern', 'admin'],
            'PATCH': ['intern', 'admin'],
            'DELETE': ['intern', 'admin']
        },
        'custom_specs_schema': {
            'GET': ['guest', 'intern', 'admin'],
            'POST': ['admin'],
            'PATCH': ['admin'],
            'DELETE': ['admin']
        },
        'user_profiles': {
            'GET': ['admin'],
            'POST': ['admin'],
            'PATCH': ['admin'],
            'DELETE': ['admin']
        },
        'access_requests': {
            'GET': ['admin'],
            'POST': ['Anonymous', 'guest', 'intern', 'admin'],
            'PATCH': ['admin'],
            'DELETE': ['admin']
        },
        'motor_test_runs': {
            'GET': ['guest', 'intern', 'admin'],
            'POST': ['intern', 'admin'],
            'PATCH': ['intern', 'admin'],
            'DELETE': ['intern', 'admin']
        },
        'motor_test_data_points': {
            'GET': ['guest', 'intern', 'admin'],
            'POST': ['intern', 'admin'],
            'PATCH': ['intern', 'admin'],
            'DELETE': ['intern', 'admin']
        },
        'draft_test_runs': {
            'GET': ['guest', 'intern', 'admin'],
            'POST': ['intern', 'admin'],
            'PATCH': ['intern', 'admin'],
            'DELETE': ['intern', 'admin']
        },
        'user_onboarding': {
            'GET': ['guest', 'intern', 'admin'],
            'POST': ['guest', 'intern', 'admin'],
            'PATCH': ['guest', 'intern', 'admin']
        }
    }

    if table not in ACL:
        return jsonify({"error": f"Table '{table}' not supported by proxy"}), 400

    allowed_roles = ACL[table].get(method, [])
    
    # Check if request is anonymous POST to access_requests
    is_anon_post = (table == 'access_requests' and method == 'POST')
    
    if not is_anon_post:
        if not role or not uid:
            return jsonify({"error": "Unauthorized"}), 401
        
        # Enforce session expiration check (24 hours)
        timestamp = session.get('timestamp', 0)
        current_time_ms = int(time.time() * 1000)
        if current_time_ms - timestamp > 86400 * 1000:
            session.clear()
            return jsonify({"error": "Session expired"}), 401
            
        if role not in allowed_roles:
            return jsonify({"error": f"Forbidden: role '{role}' cannot perform {method} on {table}"}), 403

    # Forward to Supabase
    query_params = dict(request.args)
    
    # Enforce tenant isolation for onboarding progress
    if table == 'user_onboarding':
        query_params['user_id'] = f"eq.{uid}"
        if method in ['POST', 'PATCH'] and request.json:
            request.json['user_id'] = uid

    try:
        headers = {"Prefer": "return=representation"}
        payload = request.json if method in ['POST', 'PATCH'] else None
        
        # Handle user_onboarding upsert redirect
        if table == 'user_onboarding' and method == 'POST':
            existing = call_supabase_api("user_onboarding", query_params={"user_id": f"eq.{uid}"})
            if existing and len(existing) > 0:
                method = 'PATCH'
                query_params = {"user_id": f"eq.{uid}"}
                
        data = call_supabase_api(table, method=method, payload=payload, query_params=query_params, headers=headers)
        
        if table == 'user_onboarding' and method == 'GET':
            if data and len(data) > 0:
                return jsonify(data[0])
            return jsonify({"user_id": uid, "pages_progress": {}, "tour_completed": False})
            
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Guest API Endpoints
# ---------------------------------------------------------------------------
@app.route('/api/guest/motors', methods=['GET'])
@require_role(['admin', 'intern', 'guest'])
def guest_get_motors():
    try:
        data = call_supabase_api("motors", query_params=dict(request.args))
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/guest/categories', methods=['GET'])
@require_role(['admin', 'intern', 'guest'])
def guest_get_categories():
    try:
        data = call_supabase_api("categories", query_params=dict(request.args))
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/guest/custom-specs', methods=['GET'])
@require_role(['admin', 'intern', 'guest'])
def guest_get_custom_specs():
    try:
        data = call_supabase_api("custom_specs_schema", query_params=dict(request.args))
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/guest/onboarding', methods=['GET', 'POST'])
@require_role(['admin', 'intern', 'guest'])
def guest_onboarding():
    user_id = session.get('uid')
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    
    if request.method == 'GET':
        try:
            data = call_supabase_api("user_onboarding", query_params={"user_id": f"eq.{user_id}"})
            if data and len(data) > 0:
                return jsonify(data[0])
            else:
                return jsonify({"user_id": user_id, "pages_progress": {}, "tour_completed": False})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    elif request.method == 'POST':
        try:
            req_data = request.json or {}
            pages_progress = req_data.get("pages_progress", {})
            tour_completed = req_data.get("tour_completed", False)
            
            existing = call_supabase_api("user_onboarding", query_params={"user_id": f"eq.{user_id}"})
            payload = {
                "user_id": user_id,
                "pages_progress": pages_progress,
                "tour_completed": tour_completed
            }
            headers = {"Prefer": "return=representation"}
            if existing and len(existing) > 0:
                res = call_supabase_api("user_onboarding", method='PATCH', payload=payload, query_params={"user_id": f"eq.{user_id}"}, headers=headers)
            else:
                res = call_supabase_api("user_onboarding", method='POST', payload=payload, headers=headers)
            
            return jsonify({"success": True, "data": res})
        except Exception as e:
            return jsonify({"error": str(e)}), 500



@app.route('/api/guest/motor-test-runs', methods=['GET'])
@require_role(['admin', 'intern', 'guest'])
def guest_motor_test_runs():
    try:
        data = call_supabase_api("motor_test_runs", query_params=dict(request.args))
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/guest/motor-test-data-points', methods=['GET'])
@require_role(['admin', 'intern', 'guest'])
def guest_motor_test_data_points():
    try:
        data = call_supabase_api("motor_test_data_points", query_params=dict(request.args))
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/guest/draft-test-runs', methods=['GET'])
@require_role(['admin', 'intern', 'guest'])
def guest_draft_test_runs():
    try:
        data = call_supabase_api("draft_test_runs", query_params=dict(request.args))
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Intern API Endpoints
# ---------------------------------------------------------------------------
@app.route('/api/intern/motors', methods=['POST'])
@require_role(['admin', 'intern'])
def intern_add_motor():
    try:
        headers = {"Prefer": "return=representation"}
        data = call_supabase_api("motors", method='POST', payload=request.json, headers=headers)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/intern/motors/<id>', methods=['PATCH', 'PUT'])
@require_role(['admin', 'intern'])
def intern_update_motor_by_id(id):
    try:
        headers = {"Prefer": "return=representation"}
        data = call_supabase_api("motors", method='PATCH', payload=request.json, query_params={"id": f"eq.{id}"}, headers=headers)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/intern/motors', methods=['PUT', 'PATCH'])
@require_role(['admin', 'intern'])
def intern_update_motor():
    try:
        headers = {"Prefer": "return=representation"}
        data = call_supabase_api("motors", method='PATCH', payload=request.json, query_params=dict(request.args), headers=headers)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/intern/categories', methods=['POST', 'PUT', 'PATCH', 'DELETE'])
@require_role(['admin', 'intern'])
def intern_categories():
    method = 'PATCH' if request.method == 'PUT' else request.method
    payload = request.json if method in ['POST', 'PATCH'] else None
    try:
        headers = {"Prefer": "return=representation"}
        data = call_supabase_api("categories", method=method, payload=payload, query_params=dict(request.args), headers=headers)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/intern/categories/<id>', methods=['DELETE'])
@require_role(['admin', 'intern'])
def intern_delete_category_by_id(id):
    try:
        headers = {"Prefer": "return=representation"}
        data = call_supabase_api("categories", method='DELETE', query_params={"id": f"eq.{id}"}, headers=headers)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/intern/motor-test-runs', methods=['POST', 'PUT', 'PATCH', 'DELETE'])
@require_role(['admin', 'intern'])
def intern_motor_test_runs():
    method = 'PATCH' if request.method == 'PUT' else request.method
    payload = request.json if method in ['POST', 'PATCH'] else None
    try:
        headers = {"Prefer": "return=representation"}
        data = call_supabase_api("motor_test_runs", method=method, payload=payload, query_params=dict(request.args), headers=headers)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/intern/motor-test-data-points', methods=['POST', 'PUT', 'PATCH', 'DELETE'])
@require_role(['admin', 'intern'])
def intern_motor_test_data_points():
    method = 'PATCH' if request.method == 'PUT' else request.method
    payload = request.json if method in ['POST', 'PATCH'] else None
    try:
        headers = {"Prefer": "return=representation"}
        data = call_supabase_api("motor_test_data_points", method=method, payload=payload, query_params=dict(request.args), headers=headers)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/intern/draft-test-runs', methods=['POST', 'PUT', 'PATCH', 'DELETE'])
@require_role(['admin', 'intern'])
def intern_draft_test_runs():
    method = 'PATCH' if request.method == 'PUT' else request.method
    payload = request.json if method in ['POST', 'PATCH'] else None
    try:
        headers = {"Prefer": "return=representation"}
        data = call_supabase_api("draft_test_runs", method=method, payload=payload, query_params=dict(request.args), headers=headers)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/intern/draft-test-runs/<id>', methods=['DELETE'])
@require_role(['admin', 'intern'])
def intern_delete_draft_test_run(id):
    try:
        headers = {"Prefer": "return=representation"}
        data = call_supabase_api("draft_test_runs", method='DELETE', query_params={"id": f"eq.{id}"}, headers=headers)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Admin API Endpoints
# ---------------------------------------------------------------------------
@app.route('/api/admin/motors', methods=['DELETE'])
@require_role('admin')
def admin_delete_motor():
    try:
        headers = {"Prefer": "return=representation"}
        data = call_supabase_api("motors", method='DELETE', query_params=dict(request.args), headers=headers)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/motors/<id>', methods=['DELETE'])
@require_role('admin')
def admin_delete_motor_by_id(id):
    try:
        headers = {"Prefer": "return=representation"}
        data = call_supabase_api("motors", method='DELETE', query_params={"id": f"eq.{id}"}, headers=headers)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/schema', methods=['GET', 'POST', 'PATCH', 'PUT', 'DELETE'])
@require_role('admin')
def admin_schema():
    method = 'PATCH' if request.method == 'PUT' else request.method
    payload = request.json if method in ['POST', 'PATCH'] else None
    try:
        headers = {"Prefer": "return=representation"}
        data = call_supabase_api("custom_specs_schema", method=method, payload=payload, query_params=dict(request.args), headers=headers)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/schema/<field_key>', methods=['DELETE'])
@require_role('admin')
def admin_delete_schema_field(field_key):
    try:
        headers = {"Prefer": "return=representation"}
        data = call_supabase_api("custom_specs_schema", method='DELETE', query_params={"field_key": f"eq.{field_key}"}, headers=headers)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/users', methods=['GET', 'POST', 'PATCH', 'PUT', 'DELETE'])
@require_role('admin')
def api_admin_users():
    method = 'PATCH' if request.method == 'PUT' else request.method
    try:
        headers = {"Prefer": "return=representation"}
        if request.method == 'DELETE':
            data = call_supabase_api("user_profiles", method='DELETE', query_params=dict(request.args), headers=headers)
            return jsonify(data)
        elif request.method == 'POST':
            data = call_supabase_api("user_profiles", method='POST', payload=request.json, headers=headers)
            return jsonify(data)
        else: # GET, PATCH
            payload = request.json if method == 'PATCH' else None
            data = call_supabase_api("user_profiles", method=method, payload=payload, query_params=dict(request.args), headers=headers)
            return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/users/<id>', methods=['PATCH', 'PUT', 'DELETE'])
@require_role('admin')
def admin_user_by_id(id):
    method = 'PATCH' if request.method in ['PUT', 'PATCH'] else request.method
    try:
        headers = {"Prefer": "return=representation"}
        if method == 'DELETE':
            data = call_supabase_api("user_profiles", method='DELETE', query_params={"id": f"eq.{id}"}, headers=headers)
        else: # PATCH
            data = call_supabase_api("user_profiles", method='PATCH', payload=request.json, query_params={"id": f"eq.{id}"}, headers=headers)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/rpc/<name>', methods=['POST'])
@require_role('admin')
def admin_rpc(name):
    try:
        data = call_supabase_api(f"rpc/{name}", method='POST', payload=request.json)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/auth/generate-link', methods=['POST'])
@require_role('admin')
def admin_generate_link():
    try:
        data = call_supabase_api("admin/generate_link", method='POST', payload=request.json, is_auth=True)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/access-requests', methods=['GET', 'POST', 'PATCH', 'PUT', 'DELETE'])
@require_role('admin')
def api_admin_access_requests():
    method = 'PATCH' if request.method == 'PUT' else request.method
    payload = request.json if method in ['POST', 'PATCH'] else None
    try:
        headers = {"Prefer": "return=representation"}
        data = call_supabase_api("access_requests", method=method, payload=payload, query_params=dict(request.args), headers=headers)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/access-requests/<id>', methods=['PATCH', 'PUT'])
@require_role('admin')
def admin_update_access_request_by_id(id):
    try:
        headers = {"Prefer": "return=representation"}
        data = call_supabase_api("access_requests", method='PATCH', payload=request.json, query_params={"id": f"eq.{id}"}, headers=headers)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Serve index.html at root
# ---------------------------------------------------------------------------
@app.route('/')
@app.route('/index.html')
def root():
    if request.path.endswith('.html'):
        return redirect('/')
    return send_from_directory('public', 'index.html')

@app.route('/login')
@app.route('/login.html')
def login_page():
    if request.path.endswith('.html'):
        return redirect('/login')
    return send_from_directory('public', 'login.html')

@app.route('/request_access')
@app.route('/request_access.html')
def request_access_page():
    if request.path.endswith('.html'):
        return redirect('/request_access')
    return send_from_directory('public', 'request_access.html')

@app.route('/thrustvault_presentation')
@app.route('/thrustvault_presentation.html')
def presentation_page():
    if request.path.endswith('.html'):
        return redirect('/thrustvault_presentation')
    return send_from_directory('public', 'thrustvault_presentation.html')


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
        'page-loader.js',
        'request_access.html',
        'style.css',
        'thrustvault_presentation.html',
        'motor_explorer.html',
        'motor_explorer_app.js',
        'sidebar_admin.html',
        'sidebar_intern.html',
        'sidebar_guest.html',
        'logo.png',
        'thrustvault_logo_bgremoved_dark.png',
        'thrustvault_logo_bgremoved_light.png'
    }
    
    PUBLIC_LIBS = {
        'libs/chart.umd.js',
        'libs/lucide.min.js',
        'libs/xlsx.full.min.js'
    }
    
    if safe_path in PUBLIC_FILES or safe_path in PUBLIC_LIBS:
        return send_from_directory('public', safe_path)
        
    # Block any other files
    abort(403)



# ---------------------------------------------------------------------------
# Entry point for local development
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    print(f"ThrustVault server running on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
