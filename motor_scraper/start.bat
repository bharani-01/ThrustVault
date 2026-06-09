@echo off
setlocal EnableDelayedExpansion
title ThrustVault Launcher
color 0A

echo.
echo  ================================================================
echo   ThrustVault - Motor Performance Intelligence Platform v2.0.0
echo  ================================================================
echo.

:: ── Set project root (handles spaces in path) ────────────────────────────────
set "ROOT=%~dp0"

:: ── Check Python venv ─────────────────────────────────────────────────────────
echo  [CHECK] Verifying virtual environment...
if not exist "%ROOT%venv\Scripts\activate.bat" (
    echo.
    echo  [ERROR] Virtual environment not found!
    echo  Run this in PowerShell first:
    echo    python -m venv venv
    echo    venv\Scripts\activate
    echo    pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)
echo         OK - venv found.

:: ── Check ngrok ───────────────────────────────────────────────────────────────
echo  [CHECK] Verifying ngrok...
where ngrok >nul 2>&1
if !errorlevel! neq 0 (
    echo.
    echo  [ERROR] ngrok not found in PATH.
    echo  Download from: https://ngrok.com/download
    echo.
    pause
    exit /b 1
)
echo         OK - ngrok found.

:: ── Kill anything on port 5050 ───────────────────────────────────────────────
echo.
echo  [1/3] Freeing port 5050...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5050 "') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo        Done.

:: ── Start Flask in a new window ──────────────────────────────────────────────
echo  [2/3] Starting Flask server...
start "ThrustVault Flask" cmd /k "cd /d "%ROOT%" && call venv\Scripts\activate && python api.py"
echo        Waiting for Flask to start...
timeout /t 4 /nobreak >nul

:: ── Start ngrok in a new window ──────────────────────────────────────────────
echo  [3/3] Starting ngrok tunnel on port 5050...
start "ThrustVault ngrok" cmd /k "ngrok http 5050"
timeout /t 3 /nobreak >nul

:: ── Open browser ─────────────────────────────────────────────────────────────
echo.
echo  Opening browser...
start "" "http://localhost:5050"

:: ── Summary ───────────────────────────────────────────────────────────────────
echo.
echo  ================================================================
echo   ThrustVault is LIVE!
echo  ----------------------------------------------------------------
echo   Local URL  :  http://localhost:5050
echo   ngrok UI   :  http://localhost:4040
echo   Public URL :  See the "ThrustVault ngrok" window
echo  ================================================================
echo.
echo  Press any key to close this launcher window...
echo  (Flask and ngrok will keep running in their own windows)
echo.
pause >nul
