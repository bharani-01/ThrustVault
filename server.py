"""
ThrustVault - Flask Static Server
Compatible with Render.com Web Service deployment.
Serves all static HTML/CSS/JS files and exposes /api/config for Supabase credentials.
"""

import os
from flask import Flask, send_from_directory, jsonify


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
    config = {
        "SUPABASE_URL":      os.environ.get("SUPABASE_URL", ""),
        "SUPABASE_ANON_KEY": os.environ.get("SUPABASE_ANON_KEY", "")
    }
    response = jsonify(config)
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
    return response


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
    return send_from_directory('.', filename)


# ---------------------------------------------------------------------------
# Entry point for local development
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    print(f"ThrustVault server running on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
