# app.py — Render.com entry point
# Render auto-detects 'gunicorn app:app' so this file must exist.
# It simply re-exports the Flask app defined in server.py.

from server import app  # noqa: F401
