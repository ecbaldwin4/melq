@echo off
echo ====================================
echo    MELQ Setup for Windows
echo ====================================
echo.

echo Checking Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js not found!
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo Download the LTS version and run the installer.
    echo.
    pause
    exit /b 1
) else (
    echo ✅ Node.js found: 
    node --version
)

echo.
echo Installing MELQ dependencies...
call npm install
if errorlevel 1 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo ✅ Setup complete!
echo.
echo To join a network, run:
echo   npm start
echo.
echo Or use the connection code directly:
echo   npm start -- --join YOUR_CONNECTION_CODE
echo.
pause