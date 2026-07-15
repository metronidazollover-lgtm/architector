@echo off
title Architector Launcher
cd /d "%~dp0"

echo ===================================================
echo   Architector - Visual Logic Node Editor
echo ===================================================
echo.
echo Starting local web server on port 3000...
start "Architector Web Server" /min python server.py 3000

echo Waiting for server to initialize...
timeout /t 2 >nul

echo Opening application in your default web browser...
start http://localhost:3000

echo.
echo Done! You can close this window.
echo (The server runs in a minimized window named "Architector Web Server")
echo ===================================================
timeout /t 3 >nul
exit
