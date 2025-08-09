@echo off
title MELQ - Secure P2P Chat
echo ====================================
echo    🔐 MELQ - Secure P2P Chat
echo ====================================
echo.

REM Try global melq command first
melq --version >nul 2>&1
if not errorlevel 1 (
    echo Using globally installed MELQ...
    melq
    goto end
)

REM Fall back to local npm start
echo Global MELQ not found. Checking local installation...

node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js not found! Please run install-windows.bat or setup-windows.bat first.
    pause
    exit /b 1
)

echo Starting MELQ locally...
echo.
call npm start

:end
pause