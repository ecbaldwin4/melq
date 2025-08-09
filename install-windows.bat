@echo off
setlocal enabledelayedexpansion

echo ====================================
echo    🔐 MELQ Installation Script
echo ====================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed!
    echo.
    echo Please install Node.js first:
    echo • Download from: https://nodejs.org/
    echo • Choose the LTS version
    echo • Run the installer with default settings
    echo • Restart your computer after installation
    echo.
    pause
    exit /b 1
)

REM Get Node.js version
for /f "tokens=1 delims=v" %%i in ('node --version') do set NODE_VERSION=%%i
for /f "tokens=1 delims=." %%i in ("%NODE_VERSION:v=%") do set MAJOR_VERSION=%%i

if %MAJOR_VERSION% LSS 16 (
    echo ⚠️  Node.js version %NODE_VERSION% is too old
    echo MELQ requires Node.js 16 or newer
    echo Please update Node.js: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo ✅ Node.js %NODE_VERSION% found

REM Check if npm is available
npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ npm is not installed!
    echo Please install npm along with Node.js
    echo.
    pause
    exit /b 1
)

for /f %%i in ('npm --version') do set NPM_VERSION=%%i
echo ✅ npm %NPM_VERSION% found
echo.

REM Install dependencies
echo 📦 Installing dependencies...
call npm install

if errorlevel 1 (
    echo ❌ Failed to install dependencies
    echo Please check your internet connection and try again
    echo.
    pause
    exit /b 1
)

echo ✅ Dependencies installed
echo.

REM Install globally
echo 🔗 Installing MELQ globally...
call npm link

if errorlevel 1 (
    echo ⚠️  Global installation had issues, but you can still use MELQ locally
    echo.
    echo Local usage:
    echo   npm start
    echo.
    goto test_local
)

echo ✅ MELQ installed globally
echo.

REM Test global installation
echo 🧪 Testing installation...
melq --version >nul 2>&1
if not errorlevel 1 (
    echo ✅ Installation successful!
    echo.
    echo 🎉 You can now run MELQ from anywhere with:
    echo    melq                    # Interactive menu
    echo    melq --host             # Host a network
    echo    melq --join ^<code^>      # Join a network  
    echo    melq --help             # Show help
    goto end
)

:test_local
echo.
echo You can run MELQ locally with:
echo   npm start ^(from this directory^)
echo.
echo Or add the npm global bin directory to your PATH to use 'melq' anywhere

:end
echo.
echo 🚀 Ready to start secure P2P chatting!
echo.
pause