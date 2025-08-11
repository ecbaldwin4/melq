@echo off
setlocal

REM Enable script execution for the current session
powershell -Command "Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force" >nul 2>&1

echo ====================================
echo    MELQ Zero-Touch Installer
echo ====================================
echo.
echo This will install MELQ - Quantum-Secure P2P Chat
echo on your Windows computer.
echo.
echo Note: This installer will attempt automated dependency installation.
echo If you encounter permission errors, please run as Administrator.
echo.

REM Check if running from correct location
if exist "src\index.js" (
    echo ⚠️  It looks like you're already in the MELQ directory.
    echo Please run npm start instead from inside the MELQ directory.
    echo.
    pause
    exit /b 1
)

echo What this installer will do:
echo.
echo - Check if Node.js is installed (install if needed)
echo - Download MELQ source code  
echo - Install dependencies
echo - Set up global 'melq' command
echo.

echo.
echo This installer will run automatically without prompts.
echo Running zero-touch installation - proceeding automatically...
echo.
set "confirm=y"

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo [X] Node.js is not installed!
    echo.
    echo Node.js is required to run MELQ.
    echo.
    echo AUTOMATED INSTALLATION ATTEMPT:
    echo Trying to install Node.js via winget (Windows Package Manager)...
    
    REM Try winget first (available on Windows 10+ with App Installer)
    winget install OpenJS.NodeJS --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
    if not errorlevel 1 (
        echo [OK] Node.js installed successfully via winget!
        echo Please restart this installer to continue.
        pause
        exit /b 0
    )
    
    echo Winget installation failed. Trying chocolatey...
    echo.
    
    REM Check if chocolatey is installed
    choco --version >nul 2>&1
    if not errorlevel 1 (
        echo Installing Node.js via Chocolatey...
        choco install nodejs -y
        if not errorlevel 1 (
            echo [OK] Node.js installed successfully via Chocolatey!
            echo Please restart this installer to continue.
            pause
            exit /b 0
        )
    )
    
    echo.
    echo OPENING NODE.JS DOWNLOAD PAGE:
    echo Automated installation methods failed.
    echo.
    echo Opening Node.js download page automatically...
    echo Please download the LTS version and run the installer.
    echo After installation, restart this installer.
    start https://nodejs.org/
    echo.
    echo The installer will exit so you can install Node.js.
    echo Run this installer again after Node.js is installed.
    pause
    exit /b 1
)

REM Get Node.js version and check if it's new enough
for /f "tokens=*" %%i in ('node --version') do set "NODE_VERSION_FULL=%%i"
REM Extract major version number (skip 'v' prefix) - use findstr to remove 'v'
for /f "tokens=1 delims=." %%a in ('node --version ^| findstr /r "^v[0-9]" ^| findstr /r "[0-9]"') do (
    set "MAJOR_VERSION=%%a"
)
REM If that didn't work, try a different approach
if not defined MAJOR_VERSION (
    for /f "tokens=2 delims=v." %%a in ('node --version') do set "MAJOR_VERSION=%%a"
)

if %MAJOR_VERSION% LSS 16 (
    echo [!] Node.js version %NODE_VERSION_FULL% is too old
    echo MELQ requires Node.js 16 or newer
    echo.
    echo Opening Node.js download page automatically...
    start https://nodejs.org/
    echo Please download and install the LTS version, then restart this installer.
    echo.
    echo The installer will exit so you can upgrade Node.js.
    echo Run this installer again after upgrading Node.js.
    pause
    exit /b 1
)

echo [OK] Node.js %NODE_VERSION_FULL% found
echo.

REM Check for git
git --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ⚠️  Git is not installed.
    echo Git is needed to download MELQ.
    echo.
    echo AUTOMATED INSTALLATION ATTEMPT:
    echo Trying to install Git via winget...
    
    REM Try winget first
    winget install Git.Git --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
    if not errorlevel 1 (
        echo [OK] Git installed successfully via winget!
        echo Please restart this installer to continue.
        pause
        exit /b 0
    )
    
    echo Winget installation failed. Trying chocolatey...
    
    REM Try chocolatey if available
    choco --version >nul 2>&1
    if not errorlevel 1 (
        echo Installing Git via Chocolatey...
        choco install git -y
        if not errorlevel 1 (
            echo [OK] Git installed successfully via Chocolatey!
            echo Please restart this installer to continue.
            pause
            exit /b 0
        )
    )
    
    echo.
    echo OPENING GIT DOWNLOAD PAGE:
    echo Automated installation methods failed.
    echo.
    echo 🌐 Opening Git download page automatically...
    echo Please download and install Git, then restart this installer.
    start https://git-scm.com/download/win
    echo.
    echo Alternative: You can also download MELQ manually from:
    echo https://github.com/ecbaldwin4/melq/archive/refs/heads/master.zip
    echo Extract it and run npm start from inside the folder.
    echo.
    echo The installer will exit so you can install Git.
    echo Run this installer again after installing Git.
    pause
    exit /b 1
)

echo [OK] Git found
echo.

echo.
REM Create installation directory
set "INSTALL_DIR=%USERPROFILE%\MELQ"
echo 📁 Installing to: %INSTALL_DIR%

if exist "%INSTALL_DIR%" (
    echo.
    echo [!] MELQ directory already exists at %INSTALL_DIR%
    echo Automatically removing existing installation for clean reinstall...
    rmdir /s /q "%INSTALL_DIR%"
    echo ✅ Removed existing installation
)

echo.
echo 🌐 Downloading MELQ...
git clone https://github.com/ecbaldwin4/melq.git "%INSTALL_DIR%"

if errorlevel 1 (
    echo ❌ Failed to download MELQ
    echo Please check your internet connection and try again.
    echo.
    pause
    exit /b 1
)

echo [OK] MELQ downloaded successfully
echo.

REM Change to installation directory
cd /d "%INSTALL_DIR%"

echo 📦 Installing dependencies...
call npm install

if errorlevel 1 (
    echo ❌ Failed to install dependencies
    echo Please check your internet connection and try again
    echo.
    pause
    exit /b 1
)

echo [OK] Dependencies installed
echo.

REM Install globally
echo 🔗 Setting up global 'melq' command...
call npm link

if errorlevel 1 (
    echo [!] Global installation had issues, but MELQ is installed locally
    echo.
    echo You can run MELQ by opening a command prompt in:
    echo %INSTALL_DIR%
    echo And typing: npm start
    echo.
    goto success
)

echo [OK] MELQ installed globally
echo.

REM Test installation
echo Testing installation...
melq --version >nul 2>&1
if not errorlevel 1 (
    echo [OK] Installation successful!
    echo.
    echo You can now run MELQ from anywhere with:
    echo    melq                    # Interactive menu
    echo    melq --host             # Host a network
    echo    melq --join ^<code^>      # Join a network
    echo    melq --help             # Show help
    echo.
    goto success
)

echo ⚠️  Installation completed, but 'melq' command not found
echo.
echo 🔧 Attempting to fix PATH automatically...
echo This will add the npm global directory to your system PATH.
echo.
echo Proceeding with automatic PATH fix...
set "fix_path=y"

if /i "%fix_path%"=="y" (
    echo.
    echo 🔧 Trying to fix PATH automatically...
    
    REM Get npm global bin directory (works with both old and new npm versions)
    for /f "tokens=*" %%i in ('npm bin -g 2^>nul') do set "NPM_BIN=%%i"
    if "%NPM_BIN%"=="" (
        REM Try newer npm method
        for /f "tokens=*" %%i in ('npm prefix -g 2^>nul') do set "NPM_PREFIX=%%i"
        if not "%NPM_PREFIX%"=="" (
            call set "NPM_BIN=%NPM_PREFIX%\bin"
        )
    )
    
    if not "%NPM_BIN%"=="" (
        echo Adding %NPM_BIN% to system PATH...
        
        REM Add to system PATH (requires admin, but we'll try)
        setx PATH "%PATH%;%NPM_BIN%" >nul 2>&1
        
        if not errorlevel 1 (
            echo ✅ Successfully added to system PATH
            echo 🔄 Please restart your command prompt for changes to take effect
            echo.
            echo After restarting, you can use:
            echo   melq                    # Interactive menu
            echo   melq --host             # Host a network
            echo   melq --join ^<code^>      # Join a network
        ) else (
            echo ⚠️  Could not modify system PATH automatically
            echo.
            echo Manual steps:
            echo 1. Open "Environment Variables" in Windows settings
            echo 2. Add this to your PATH: %NPM_BIN%
            echo 3. Restart your command prompt
        )
    ) else (
        echo ❌ Could not determine npm global directory
        echo.
        echo You can run MELQ by opening a command prompt in:
        echo %INSTALL_DIR%
        echo And typing: npm start
    )
) else (
    echo.
    echo You can run MELQ by opening a command prompt in:
    echo %INSTALL_DIR%
    echo And typing: npm start
    echo.
    echo Or manually add npm global directory to your PATH:
    for /f "tokens=*" %%i in ('npm bin -g 2^>nul') do echo   %%i
    REM Try newer npm method if old one didn't work
    for /f "tokens=*" %%i in ('npm prefix -g 2^>nul') do echo   %%i\bin
)
echo.

:success
echo MELQ is ready!
echo.
echo 📁 Installed in: %INSTALL_DIR%
echo 📖 For help visit: https://github.com/ecbaldwin4/melq
echo.
echo Starting MELQ automatically...
echo.
echo Starting MELQ...
melq 2>nul || (
    echo Running locally...
    call npm start
)

echo.
pause