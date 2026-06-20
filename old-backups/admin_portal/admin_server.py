import os
os.environ["AWS_EC2_METADATA_DISABLED"] = "true"
import json
import urllib.parse
import urllib.request
import time
import threading
import secrets
from functools import wraps
from flask import Flask, send_from_directory, jsonify, request, abort, redirect, make_response, session

# ---------------------------------------------------------------------------
# Local dev: load .env file if it exists
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
                        val = val.strip()
                        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                            val = val[1:-1]
                        os.environ[key] = val

load_env('admin_portal/.env')
load_env('.env')
load_env('../.env')

import ssl
from queue import Queue, Empty
import pg8000.dbapi

# Initialize Flask App
app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "thrustvault_admin_secret_key_998877")
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

# ---------------------------------------------------------------------------
# Direct PostgreSQL Database Connection Pooling & Helper Functions
# ---------------------------------------------------------------------------

class PG8000ConnectionPool:
    def __init__(self, host, port, database, user, password, min_conn=1, max_conn=10):
        self.host = host
        self.port = int(port) if port else 5432
        self.database = database
        self.user = user
        self.password = password
        self.max_conn = max_conn
        self.pool = Queue(maxsize=max_conn)
        self.allocated = 0
        self.lock = threading.Lock()
        
        # Pre-populate min connections
        for _ in range(min_conn):
            try:
                self.pool.put(self._create_connection())
                with self.lock:
                    self.allocated += 1
            except Exception as e:
                print(f"Pool pre-population connection failed for {host}: {e}")
                raise e

    def _create_connection(self):
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        db_pass = self.password
        if os.environ.get("USE_AWS_IAM_AUTH", "false").lower() in ['true', '1', 'yes']:
            try:
                import boto3
                region = os.environ.get("AWS_REGION", "eu-north-1")
                rds_client = boto3.client('rds', region_name=region)
                db_pass = rds_client.generate_db_auth_token(
                    DBHostname=self.host,
                    Port=self.port,
                    DBUsername=self.user,
                    Region=region
                )
            except Exception as iam_err:
                print(f"Failed to generate AWS IAM DB Auth Token: {iam_err}")
        
        try:
            return pg8000.dbapi.connect(
                host=self.host,
                port=self.port,
                database=self.database,
                user=self.user,
                password=db_pass,
                ssl_context=ssl_context,
                timeout=10.0
            )
        except Exception as conn_err:
            print(f"Direct connection failed for {self.host}: {conn_err}")
            raise conn_err

    def getconn(self, timeout=5.0):
        try:
            return self.pool.get(block=False)
        except Empty:
            pass
            
        with self.lock:
            if self.allocated < self.max_conn:
                conn = self._create_connection()
                self.allocated += 1
                return conn
                
        try:
            return self.pool.get(block=True, timeout=timeout)
        except Empty:
            raise Exception(f"Timeout: No database connections available in pool for {self.host}.")

    def putconn(self, conn):
        if conn is None:
            return
        try:
            self.pool.put(conn, block=False)
        except Exception:
            try:
                conn.close()
            except Exception:
                pass
            with self.lock:
                self.allocated -= 1

# Database Configurations
DB_HOST = os.environ.get("DB_HOST")
DB_PORT = os.environ.get("DB_PORT") or "5432"
DB_NAME = os.environ.get("DB_NAME") or "postgres"
DB_USER = os.environ.get("DB_USER") or "postgres"
DB_PASSWORD = os.environ.get("DB_PASSWORD")

AUDIT_DB_HOST = os.environ.get("AUDIT_DB_HOST") or DB_HOST
AUDIT_DB_PORT = os.environ.get("AUDIT_DB_PORT") or DB_PORT
AUDIT_DB_NAME = os.environ.get("AUDIT_DB_NAME") or "postgres"
AUDIT_DB_USER = os.environ.get("AUDIT_DB_USER") or "postgres"
AUDIT_DB_PASSWORD = os.environ.get("AUDIT_DB_PASSWORD") or DB_PASSWORD

db_pool = None
audit_db_pool = None

# Initialize Primary Database Pool
if DB_HOST and DB_PASSWORD:
    try:
        db_pool = PG8000ConnectionPool(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            min_conn=1,
            max_conn=10
        )
        print(f"ADMIN DATABASE CONNECTION SUCCESS: Initialized direct connection pool to {DB_HOST}:{DB_PORT}")
    except Exception as e:
        print(f"ADMIN DATABASE CONNECTION ERROR: Failed to initialize pool to {DB_HOST}. Error: {e}")
else:
    print("ADMIN DATABASE CONNECTION INFO: Direct DB connection credentials not configured.")

# Initialize Audit Database Pool
if AUDIT_DB_HOST and AUDIT_DB_PASSWORD:
    try:
        audit_db_pool = PG8000ConnectionPool(
            host=AUDIT_DB_HOST,
            port=AUDIT_DB_PORT,
            database=AUDIT_DB_NAME,
            user=AUDIT_DB_USER,
            password=AUDIT_DB_PASSWORD,
            min_conn=1,
            max_conn=5
        )
        print(f"ADMIN AUDIT DATABASE CONNECTION SUCCESS: Initialized direct connection pool to {AUDIT_DB_HOST}:{AUDIT_DB_PORT}")
    except Exception as e:
        print(f"ADMIN AUDIT DATABASE CONNECTION ERROR: Failed to initialize pool to {AUDIT_DB_HOST}. Error: {e}")
else:
    print("ADMIN AUDIT DATABASE CONNECTION INFO: Direct audit DB credentials not configured.")

# PostgREST to direct SQL translator
def parse_postgrest_filter(column, val):
    if val == "is.null":
        return f"{column} IS NULL", []
    elif val == "is.not.null":
        return f"{column} IS NOT NULL", []
    
    parts = val.split('.', 1)
    if len(parts) == 2:
        op, real_val = parts
        if op == "eq":
            return f"{column} = %s", [real_val]
        elif op == "neq":
            return f"{column} != %s", [real_val]
        elif op == "gt":
            return f"{column} > %s", [real_val]
        elif op == "gte":
            return f"{column} >= %s", [real_val]
        elif op == "lt":
            return f"{column} < %s", [real_val]
        elif op == "lte":
            return f"{column} <= %s", [real_val]
        elif op == "like":
            return f"{column} LIKE %s", [real_val.replace('*', '%')]
        elif op == "ilike":
            return f"{column} ILIKE %s", [real_val.replace('*', '%')]
        elif op == "in" and real_val.startswith("(") and real_val.endswith(")"):
            items_str = real_val[1:-1]
            items = [x.strip() for x in items_str.split(",")]
            placeholders = ", ".join(["%s"] * len(items))
            return f"{column} IN ({placeholders})", items
            
    return f"{column} = %s", [val]

def execute_sql_on_pool(pool, table, method, payload, query_params):
    if pool is None:
        raise Exception("Database connection pool is not initialized.")
        
    conn = pool.getconn()
    try:
        cursor = conn.cursor()
        try:
            # Set request.jwt.claim.sub context if session has uid, so auth.uid() function works in DB
            from flask import has_request_context, session
            if has_request_context() and session and session.get('uid'):
                try:
                    cursor.execute("SET LOCAL request.jwt.claim.sub = %s", [session.get('uid')])
                except Exception:
                    pass

            method = method.upper()
            query_params = query_params or {}
            result = None
            
            if table.startswith('rpc/'):
                rpc_name = table.split('/', 1)[1]
                if method == 'POST' and payload:
                    param_names = list(payload.keys())
                    param_placeholders = ", ".join([f"{name} => %s" for name in param_names])
                    sql = f"SELECT * FROM public.{rpc_name}({param_placeholders})"
                    params = list(payload.values())
                else:
                    sql = f"SELECT * FROM public.{rpc_name}()"
                    params = []
                    
                cursor.execute(sql, params)
                if cursor.description:
                    columns = [desc[0] for desc in cursor.description]
                    results = []
                    for row in cursor.fetchall():
                        results.append(dict(zip(columns, row)))
                    if len(results) == 1 and len(columns) == 1 and columns[0] == rpc_name:
                        result = results[0][columns[0]]
                    else:
                        result = results
                else:
                    result = None
            elif method == 'GET':
                select_cols = "*"
                if 'select' in query_params:
                    select_cols = query_params['select']
                    
                where_clauses = []
                where_params = []
                for k, v in query_params.items():
                    if k in ['select', 'limit', 'offset', 'order']:
                        continue
                    clause, p = parse_postgrest_filter(k, v)
                    where_clauses.append(clause)
                    where_params.extend(p)
                    
                sql = f"SELECT {select_cols} FROM {table}"
                if where_clauses:
                    sql += " WHERE " + " AND ".join(where_clauses)
                    
                if 'order' in query_params:
                    order_val = query_params['order']
                    order_parts = order_val.split('.')
                    if len(order_parts) == 2:
                        col, direction = order_parts
                        direction = direction.upper()
                        if direction in ['ASC', 'DESC']:
                            sql += f" ORDER BY {col} {direction}"
                    elif len(order_parts) == 1:
                        sql += f" ORDER BY {order_parts[0]} ASC"
                        
                if 'limit' in query_params:
                    try:
                        limit_val = int(query_params['limit'])
                        sql += f" LIMIT {limit_val}"
                    except ValueError:
                        pass
                        
                if 'offset' in query_params:
                    try:
                        offset_val = int(query_params['offset'])
                        sql += f" OFFSET {offset_val}"
                    except ValueError:
                        pass
                        
                cursor.execute(sql, where_params)
                
                if cursor.description:
                    columns = [desc[0] for desc in cursor.description]
                    results = []
                    for row in cursor.fetchall():
                        results.append(dict(zip(columns, row)))
                    result = results
                else:
                    result = []
                
            elif method == 'POST':
                if not payload:
                    result = []
                else:
                    items = payload if isinstance(payload, list) else [payload]
                    inserted_rows = []
                    for item in items:
                        columns = list(item.keys())
                        placeholders = ", ".join(["%s"] * len(columns))
                        sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders}) RETURNING *"
                        params = list(item.values())
                        cursor.execute(sql, params)
                        if cursor.description:
                            columns_desc = [desc[0] for desc in cursor.description]
                            row = cursor.fetchone()
                            if row:
                                inserted_rows.append(dict(zip(columns_desc, row)))
                    result = inserted_rows
                
            elif method in ['PATCH', 'PUT']:
                if not payload:
                    result = []
                else:
                    columns = list(payload.keys())
                    set_clause = ", ".join([f"{col} = %s" for col in columns])
                    params = list(payload.values())
                    
                    where_clauses = []
                    where_params = []
                    for k, v in query_params.items():
                        if k in ['select', 'limit', 'offset', 'order']:
                            continue
                        clause, p = parse_postgrest_filter(k, v)
                        where_clauses.append(clause)
                        where_params.extend(p)
                        
                    sql = f"UPDATE {table} SET {set_clause}"
                    if where_clauses:
                        sql += " WHERE " + " AND ".join(where_clauses)
                    sql += " RETURNING *"
                    
                    cursor.execute(sql, params + where_params)
                    
                    updated_rows = []
                    if cursor.description:
                        columns_desc = [desc[0] for desc in cursor.description]
                        for row in cursor.fetchall():
                            updated_rows.append(dict(zip(columns_desc, row)))
                    result = updated_rows
                
            elif method == 'DELETE':
                where_clauses = []
                where_params = []
                for k, v in query_params.items():
                    if k in ['select', 'limit', 'offset', 'order']:
                        continue
                    clause, p = parse_postgrest_filter(k, v)
                    where_clauses.append(clause)
                    where_params.extend(p)
                    
                sql = f"DELETE FROM {table}"
                if where_clauses:
                    sql += " WHERE " + " AND ".join(where_clauses)
                sql += " RETURNING *"
                
                cursor.execute(sql, where_params)
                
                deleted_rows = []
                if cursor.description:
                    columns_desc = [desc[0] for desc in cursor.description]
                    for row in cursor.fetchall():
                        deleted_rows.append(dict(zip(columns_desc, row)))
                result = deleted_rows
                
            else:
                raise Exception(f"Unsupported SQL method: {method}")
                
            conn.commit()
            return result
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            cursor.close()
    finally:
        pool.putconn(conn)

def call_supabase_api(path, method='GET', payload=None, query_params=None, headers=None, is_auth=False):
    if db_pool is not None:
        return execute_sql_on_pool(db_pool, path, method, payload, query_params)
    raise Exception("Database connection pool is not initialized.")

# ---------------------------------------------------------------------------
# Decorator to restrict route access
# ---------------------------------------------------------------------------
def require_role(allowed_roles):
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
# Geolocation and Audit Log Helpers
# ---------------------------------------------------------------------------
def get_location_prediction(ip):
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
    if audit_db_pool is not None:
        try:
            execute_sql_on_pool(audit_db_pool, "audit_logs", 'POST', payload, None)
        except Exception as e:
            print("Direct SQL audit log insert failed. Error:", e)

def log_audit_event(email, role, route, method, status, ip_address, user_agent, details=None):
    audit_enabled = os.environ.get("AUDIT_LOG", os.environ.get("auditlog", "true")).lower()
    if audit_enabled in ['false', '0', 'no', 'off']:
        return

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
# AWS Cognito OAuth Helpers
# ---------------------------------------------------------------------------
def get_cognito_client():
    import boto3
    from botocore.config import Config
    region = os.environ.get("COGNITO_REGION", "eu-north-1")
    config = Config(
        connect_timeout=1.0,
        read_timeout=1.0,
        retries={'max_attempts': 0}
    )
    if 'AWS_PROFILE' not in os.environ and 'AWS_ACCESS_KEY_ID' not in os.environ:
        try:
            profiles = boto3.Session().available_profiles
            for profile in ['ThrustVault', 'Bharani-Claude-api']:
                if profile in profiles:
                    session = boto3.Session(profile_name=profile)
                    return session.client('cognito-idp', region_name=region, config=config)
        except Exception as profile_err:
            print("Warning: failed to read available profiles:", profile_err)
    return boto3.client('cognito-idp', region_name=region, config=config)

def get_cognito_secret_hash(username: str):
    import hmac
    import hashlib
    import base64
    client_id = os.environ.get("COGNITO_CLIENT_ID", "")
    client_secret = os.environ.get("COGNITO_CLIENT_SECRET", "")
    if not client_secret or client_secret == "YOUR_COGNITO_CLIENT_SECRET_HERE":
        return None
    message = username + client_id
    dig = hmac.new(
        client_secret.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).digest()
    return base64.b64encode(dig).decode()

# ---------------------------------------------------------------------------
# Dynamic Session Validation Helper (Bypassable for Offline/Sandbox testing)
# ---------------------------------------------------------------------------
def validate_session_token_periodic():
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
            
        # Bypass Cognito check for mock tokens
        if access_token.startswith('mock_'):
            session['last_validated'] = current_time
            return True
            
        try:
            cognito_client = get_cognito_client()
            cognito_client.get_user(AccessToken=access_token)
            session['last_validated'] = current_time
        except Exception as e:
            print("Dynamic Cognito session validation failed:", e)
            # If it's a network timeout, let's keep the session alive in development
            if "connect timeout" in str(e).lower() or "endpoint connection" in str(e).lower() or "timeout" in str(e).lower():
                print("AWS network timeout detected. Bypassing Cognito check to keep session alive in sandbox.")
                session['last_validated'] = current_time
                return True
            session.clear()
            return False
            
    return True

def verify_dashboard_access(required_role, filename):
    # Allow public non-sensitive assets to bypass authentication check to prevent unstyled flashes or loading blocks
    is_public = (
        filename == 'style.css' or 
        filename.startswith('libs/') or 
        filename == 'page-loader.js' or
        filename.endswith(('.png', '.ico', '.svg', '.jpg', '.jpeg'))
    )
    if is_public:
        return send_from_directory('public', filename)

    if not validate_session_token_periodic():
        if filename.endswith('.js'):
            return make_response(jsonify({"error": "Unauthorized"}), 401)
        return redirect('/login')
    
    role = session.get('role')
    if role != 'admin':
        if filename.endswith('.js'):
            return make_response(jsonify({"error": "Forbidden"}), 403)
        return redirect('/login')
        
    return send_from_directory('public', filename)

# ---------------------------------------------------------------------------
# Authentication endpoints
# ---------------------------------------------------------------------------
@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    data = request.json or {}
    email = data.get('email')
    password = data.get('password')
    if not email or not password:
        return jsonify({"error": "Missing email or password"}), 400
        
    try:
        client_id = os.environ.get("COGNITO_CLIENT_ID", "")
        cognito_client = get_cognito_client()
        
        auth_params = {
            'USERNAME': email,
            'PASSWORD': password
        }
        secret_hash = get_cognito_secret_hash(email)
        if secret_hash:
            auth_params['SECRET_HASH'] = secret_hash
            
        auth_res = cognito_client.initiate_auth(
            ClientId=client_id,
            AuthFlow='USER_PASSWORD_AUTH',
            AuthParameters=auth_params
        )
        
        auth_result = auth_res.get('AuthenticationResult', {})
        access_token = auth_result.get('AccessToken')
        
        user_res = cognito_client.get_user(AccessToken=access_token)
        user_id = None
        for attr in user_res.get('UserAttributes', []):
            if attr['Name'] == 'sub':
                user_id = attr['Value']
                break
                
        if not user_id:
            raise Exception("Cognito sub (UUID) attribute not found.")
            
        # Fetch role from user_profiles table
        profile_res = call_supabase_api("user_profiles", query_params={"email": f"eq.{email}"})
        if not profile_res or len(profile_res) == 0:
            return jsonify({"error": "Profile role not found for this user in database."}), 403
            
        role = profile_res[0].get('role')
        if role != 'admin':
            return jsonify({"error": "Forbidden: Access restricted to Administrators."}), 403
            
        session['email'] = email
        session['role'] = role
        session['uid'] = user_id
        session['access_token'] = access_token
        session['timestamp'] = int(time.time() * 1000)
        session['last_validated'] = time.time()
        
        return jsonify({
            "email": email,
            "role": role,
            "uid": user_id,
            "timestamp": session['timestamp']
        })
        
    except Exception as e:
        err_msg = str(e)
        print("Login exception:", err_msg)
        
        # OFFLINE/SANDBOX FALLBACK: If Cognito fails/times out, verify credentials locally
        if "timeout" in err_msg.lower() or "connect" in err_msg.lower() or "endpoint" in err_msg.lower():
            print("Cognito server connection timed out. Falling back to offline database check...")
            if db_pool is not None:
                conn = db_pool.getconn()
                try:
                    cursor = conn.cursor()
                    query = """
                        SELECT u.id, p.role 
                        FROM auth.users u
                        JOIN public.user_profiles p ON u.id = p.id
                        WHERE u.email = %s AND u.encrypted_password = crypt(%s, u.encrypted_password)
                    """
                    cursor.execute(query, [email, password])
                    row = cursor.fetchone()
                    cursor.close()
                    
                    if row:
                        user_id = row[0]
                        role = row[1]
                        if role != 'admin':
                            return jsonify({"error": "Forbidden: Access restricted to Administrators."}), 403
                        
                        session['email'] = email
                        session['role'] = role
                        session['uid'] = user_id
                        session['access_token'] = 'mock_access_token_' + secrets.token_hex(16)
                        session['timestamp'] = int(time.time() * 1000)
                        session['last_validated'] = time.time()
                        
                        return jsonify({
                            "email": email,
                            "role": role,
                            "uid": user_id,
                            "timestamp": session['timestamp']
                        })
                    else:
                        return jsonify({"error": "Invalid email or password"}), 400
                except Exception as db_err:
                    print("Offline db lookup failed:", db_err)
                    return jsonify({"error": "Database authentication failed"}), 400
                finally:
                    db_pool.putconn(conn)
            else:
                return jsonify({"error": "Database connection pool not initialized"}), 500
                
        if "NotAuthorizedException" in err_msg or "UserNotFoundException" in err_msg:
            return jsonify({"error": "Invalid email or password"}), 400
        return jsonify({"error": err_msg}), 400

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

# ---------------------------------------------------------------------------
# Admin Catalog & Spec APIs (needed for dashboard populations & mutations)
# ---------------------------------------------------------------------------
@app.route('/api/admin/motors', methods=['GET'])
@require_role('admin')
def admin_get_motors():
    try:
        data = call_supabase_api("motors", query_params=dict(request.args))
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/categories', methods=['GET'])
@require_role('admin')
def admin_get_categories():
    try:
        data = call_supabase_api("categories", query_params=dict(request.args))
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/custom-specs', methods=['GET'])
@require_role('admin')
def admin_get_custom_specs():
    try:
        data = call_supabase_api("custom_specs_schema", query_params=dict(request.args))
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/motor-test-runs', methods=['GET'])
@require_role('admin')
def admin_motor_test_runs():
    try:
        data = call_supabase_api("motor_test_runs", query_params=dict(request.args))
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/motor-test-data-points', methods=['GET'])
@require_role('admin')
def admin_motor_test_data_points():
    try:
        data = call_supabase_api("motor_test_data_points", query_params=dict(request.args))
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/motors', methods=['POST'])
@require_role('admin')
def admin_add_motor():
    try:
        headers = {"Prefer": "return=representation"}
        data = call_supabase_api("motors", method='POST', payload=request.json, headers=headers)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/motors/<id>', methods=['PATCH', 'PUT'])
@require_role('admin')
def admin_update_motor_by_id(id):
    try:
        headers = {"Prefer": "return=representation"}
        data = call_supabase_api("motors", method='PATCH', payload=request.json, query_params={"id": f"eq.{id}"}, headers=headers)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/categories', methods=['POST', 'PUT', 'PATCH', 'DELETE'])
@require_role('admin')
def admin_categories():
    method = 'PATCH' if request.method == 'PUT' else request.method
    payload = request.json if method in ['POST', 'PATCH'] else None
    try:
        headers = {"Prefer": "return=representation"}
        data = call_supabase_api("categories", method=method, payload=payload, query_params=dict(request.args), headers=headers)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/categories/<id>', methods=['DELETE'])
@require_role('admin')
def admin_delete_category_by_id(id):
    try:
        headers = {"Prefer": "return=representation"}
        data = call_supabase_api("categories", method='DELETE', query_params={"id": f"eq.{id}"}, headers=headers)
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
        payload = request.json or {}
        email = payload.get('email', '')
        origin = request.headers.get('Origin') or request.host_url.replace('8001', '8000')
        action_link = f"{origin.rstrip('/')}/login?email={urllib.parse.quote(email)}"
        return jsonify({
            "properties": {
                "action_link": action_link
            }
        })
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
# Secure Audit Logs API Endpoint (Admin Only)
# ---------------------------------------------------------------------------
@app.route('/api/audit-logs')
@require_role('admin')
def get_audit_logs():
    if audit_db_pool is not None:
        try:
            data = execute_sql_on_pool(audit_db_pool, "audit_logs", 'GET', None, {"order": "timestamp.desc", "limit": 200})
            # Convert any datetime objects to string representation
            for log_dict in data:
                if isinstance(log_dict.get('timestamp'), datetime):
                    log_dict['timestamp'] = log_dict['timestamp'].isoformat()
            return jsonify(data)
        except Exception as e:
            print("Failed to fetch audit logs from database:", e)
            return jsonify([])
    return jsonify([])

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
# Resend Email Sending API Endpoint
# ---------------------------------------------------------------------------
@app.route('/api/send-email', methods=['POST'])
@require_role('admin')
def send_email_api():
    data = request.get_json() or {}
    email_type = data.get('type') # 'received', 'approved', 'rejected'
    recipient = data.get('to')
    
    if not recipient or not email_type:
        return jsonify({"success": False, "error": "Missing recipient or type"}), 400

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
                <h2 style="color: #059669; margin: 0; font-family: 'Outfit', sans-serif;">Access Approved</h2>
            </div>
            <p>Hello {full_name},</p>
            <p>We are pleased to inform you that your access request to the <strong>ThrustVault UAV Motor Database Console</strong> as <strong>{role}</strong> has been approved.</p>
            {link_section}
            {pass_section}
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
            <div style="text-align: center; border-bottom: 2px solid #dc2626; padding-bottom: 15px; margin-bottom: 20px;">
                <h2 style="color: #dc2626; margin: 0; font-family: 'Outfit', sans-serif;">Access Request Update</h2>
            </div>
            <p>Hello {full_name},</p>
            <p>We have reviewed your request for access to the <strong>ThrustVault UAV Motor Database Console</strong>.</p>
            <p>Regrettably, we are unable to approve your access request at this time.</p>
            <p style="margin-top: 30px; font-size: 0.82rem; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                This is an automated notification from ThrustVault. Please do not reply directly to this email.
            </p>
        </div>
        """

    payload = {
        "from": "ThrustVault <onboarding@resend.dev>",
        "to": [recipient],
        "subject": subject,
        "html": html_content
    }
    
    headers = {
        "Authorization": f"Bearer {resend_key}",
        "Content-Type": "application/json"
    }
    
    try:
        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=json.dumps(payload).encode('utf-8'),
            headers=headers,
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=10.0) as response:
            res_body = response.read().decode('utf-8')
            return jsonify({"success": True, "data": json.loads(res_body)})
    except Exception as e:
        print("Failed to send email via Resend:", e)
        return jsonify({"success": False, "error": str(e)}), 500

# ---------------------------------------------------------------------------
# System Settings API Endpoints
# ---------------------------------------------------------------------------
@app.route('/api/admin/settings', methods=['GET'])
@require_role('admin')
def get_system_settings():
    if db_pool is not None:
        conn = db_pool.getconn()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT key, value FROM public.system_settings")
            rows = cursor.fetchall()
            cursor.close()
            settings = {row[0]: json.loads(row[1]) if isinstance(row[1], str) else row[1] for row in rows}
            return jsonify(settings)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
        finally:
            db_pool.putconn(conn)
    else:
        return jsonify({"error": "Database not initialized"}), 500

@app.route('/api/admin/settings', methods=['POST'])
@require_role('admin')
def update_system_settings():
    payload = request.json or {}
    key = payload.get("key")
    val = payload.get("value")
    if not key:
        return jsonify({"error": "Missing key"}), 400
        
    if db_pool is not None:
        conn = db_pool.getconn()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO public.system_settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
                [key, json.dumps(val)]
            )
            conn.commit()
            cursor.close()
            return jsonify({"success": True})
        except Exception as e:
            conn.rollback()
            return jsonify({"error": str(e)}), 500
        finally:
            db_pool.putconn(conn)
    else:
        return jsonify({"error": "Database not initialized"}), 500

# ---------------------------------------------------------------------------
# Page route mappings
# ---------------------------------------------------------------------------
@app.route('/')
def root():
    if validate_session_token_periodic():
        return redirect('/admin/dashboard')
    return redirect('/login')

@app.route('/login')
def login_page():
    if validate_session_token_periodic():
        return redirect('/admin/dashboard')
    return send_from_directory('public', 'login.html')

@app.route('/admin/dashboard')
def admin_dashboard():
    return verify_dashboard_access('admin', 'admin_dashboard.html')

@app.route('/admin/exports')
def admin_exports():
    return verify_dashboard_access('admin', 'admin_exports.html')

@app.route('/admin/imports')
def admin_imports():
    return verify_dashboard_access('admin', 'admin_imports.html')

@app.route('/admin/audit-logs')
def admin_audit_logs():
    return verify_dashboard_access('admin', 'admin_audit_logs.html')

@app.route('/admin/users')
def admin_users():
    return verify_dashboard_access('admin', 'admin_users.html')

@app.route('/admin/access-requests')
def admin_access_requests():
    return verify_dashboard_access('admin', 'admin_access_requests.html')

@app.route('/admin/schema-customizer')
def admin_schema_customizer():
    return verify_dashboard_access('admin', 'admin_schema_customizer.html')

@app.route('/admin/analytics')
def admin_analytics():
    return verify_dashboard_access('admin', 'performance_analytics.html')

@app.route('/admin/explorer')
def admin_explorer():
    return verify_dashboard_access('admin', 'motor_explorer.html')

# Whitelist route fallbacks
@app.route('/admin/admin_dashboard')
@app.route('/admin/admin_dashboard.html')
def admin_dashboard_fallback():
    return redirect('/admin/dashboard')

@app.route('/admin/admin_users')
@app.route('/admin/admin_users.html')
def admin_users_fallback():
    return redirect('/admin/users')

@app.route('/admin/admin_imports')
@app.route('/admin/admin_imports.html')
def admin_imports_fallback():
    return redirect('/admin/imports')

@app.route('/admin/admin_exports')
@app.route('/admin/admin_exports.html')
def admin_exports_fallback():
    return redirect('/admin/exports')

@app.route('/admin/admin_audit_logs')
@app.route('/admin/admin_audit_logs.html')
def admin_audit_logs_fallback():
    return redirect('/admin/audit-logs')

@app.route('/admin/admin_access_requests')
@app.route('/admin/admin_access_requests.html')
def admin_access_requests_fallback():
    return redirect('/admin/access-requests')

@app.route('/admin/admin_schema_customizer')
@app.route('/admin/admin_schema_customizer.html')
def admin_schema_customizer_fallback():
    return redirect('/admin/schema-customizer')

@app.route('/admin/performance_analytics')
@app.route('/admin/performance_analytics.html')
def admin_performance_analytics_fallback():
    return redirect('/admin/analytics')

@app.route('/admin/<path:filename>')
def serve_admin_assets(filename):
    safe_path = os.path.normpath(filename).replace('\\', '/')
    if '..' in safe_path or safe_path.startswith('/') or safe_path.startswith('../'):
        abort(403)
    return verify_dashboard_access('admin', safe_path)

# Catch-all: serve only whitelisted admin portal static files
@app.route('/<path:filename>')
def serve_static_files(filename):
    safe_path = os.path.normpath(filename).replace('\\', '/')
    if '..' in safe_path or safe_path.startswith('/') or safe_path.startswith('../'):
        abort(403)
        
    ADMIN_FILES = {
        'admin_dashboard.html',
        'admin_app.js',
        'admin_exports.html',
        'admin_exports_app.js',
        'admin_imports.html',
        'admin_imports_app.js',
        'admin_audit_logs.html',
        'admin_audit_logs_app.js',
        'admin_users.html',
        'admin_users_app.js',
        'admin_access_requests.html',
        'admin_access_requests_app.js',
        'admin_schema_customizer.html',
        'admin_schema_app.js',
        'sidebar_admin.html',
        'style.css',
        'page-loader.js',
        'onboarding.js',
        'logo_light.png',
        'logo_dark.png',
        'favicon_light.png',
        'favicon_dark.png',
        '404.html',
        'login.html',
        'login.js',
        'performance_analytics.html',
        'performance_app.js',
        'motor_explorer.html',
        'motor_explorer_app.js',
        'libs/chart.umd.js',
        'libs/lucide.min.js',
        'libs/xlsx.full.min.js'
    }
    
    if safe_path in ADMIN_FILES:
        # Determine if the file is public
        is_public = (
            safe_path in ['login.html', 'login.js', '404.html', 'favicon_light.png', 'favicon_dark.png', 'logo_light.png', 'logo_dark.png'] or
            safe_path == 'style.css' or
            safe_path == 'page-loader.js' or
            safe_path.startswith('libs/')
        )
        if is_public:
            return send_from_directory('public', safe_path)
            
        return verify_dashboard_access('admin', safe_path)
        
    abort(403)

@app.errorhandler(404)
def page_not_found(e):
    return send_from_directory('public', '404.html'), 404

@app.errorhandler(403)
def forbidden(e):
    return send_from_directory('public', '404.html'), 404

if __name__ == '__main__':
    port = int(os.environ.get('ADMIN_PORT', 8001))
    print(f"ThrustVault Admin Server running on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
