@echo off
title MELQ - Secure P2P Chat
echo ====================================
echo    🔐 MELQ - Secure P2P Chat
echo ====================================
echo.

REM Check if Node.js is available
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js not found! Please run setup-windows.bat first.
    pause
    exit /b 1
)

REM Start MELQ
echo Starting MELQ...
echo.
call npm start

pause