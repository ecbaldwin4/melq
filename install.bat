@echo off
setlocal enabledelayedexpansion

echo ====================================
echo    🔐 MELQ Zero-Touch Installer
echo ====================================
echo.
echo This will install MELQ - Quantum-Secure P2P Chat
echo on your Windows computer.
echo.

REM Check if running from correct location
if exist "src\index.js" (
    echo ⚠️  It looks like you're already in the MELQ directory.
    echo Please run install-windows.bat instead.
    echo.
    pause
    exit /b 1
)

echo What this installer will do:
echo • Check if Node.js is installed (install if needed)
echo • Download MELQ source code
echo • Install dependencies
echo • Set up global 'melq' command
echo.

echo Note: For automated installation, you can pass any argument to skip prompts
if "%~1"=="" (
    set /p confirm="Continue with installation? (y/n): "
    if /i not "!confirm!"=="y" (
        echo Installation cancelled.
        pause
        exit /b 0
    )
) else (
    echo Running in automated mode - proceeding with installation...
    set confirm=y
)

echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed!
    echo.
    echo Node.js is required to run MELQ.
    set /p install_node="Would you like to download and install Node.js? (y/n): "
    
    if /i "!install_node!"=="y" (
        echo.
        echo 🌐 Opening Node.js download page...
        echo Please download the LTS version and run the installer.
        echo After installation, restart this installer.
        start https://nodejs.org/
        echo.
        pause
        exit /b 1
    ) else (
        echo.
        echo Please install Node.js first: https://nodejs.org/
        echo Choose the LTS version and restart this installer after.
        echo.
        pause
        exit /b 1
    )
)

REM Get Node.js version and check if it's new enough
for /f "tokens=1 delims=v" %%i in ('node --version') do set NODE_VERSION=%%i
for /f "tokens=1 delims=." %%i in ("%NODE_VERSION:v=%") do set MAJOR_VERSION=%%i

if %MAJOR_VERSION% LSS 16 (
    echo ⚠️  Node.js version %NODE_VERSION% is too old
    echo MELQ requires Node.js 16 or newer
    echo.
    set /p update_node="Would you like to download the latest Node.js? (y/n): "
    
    if /i "!update_node!"=="y" (
        echo 🌐 Opening Node.js download page...
        start https://nodejs.org/
        echo Please download and install the LTS version, then restart this installer.
        echo.
        pause
        exit /b 1
    ) else (
        echo Please update Node.js: https://nodejs.org/
        pause
        exit /b 1
    )
)

echo ✅ Node.js %NODE_VERSION% found

REM Check for git
git --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ⚠️  Git is not installed.
    echo Git is needed to download MELQ.
    echo.
    set /p install_git="Would you like to download and install Git? (y/n): "
    
    if /i "!install_git!"=="y" (
        echo 🌐 Opening Git download page...
        echo Please download and install Git, then restart this installer.
        start https://git-scm.com/download/win
        echo.
        pause
        exit /b 1
    ) else (
        echo.
        echo Alternative: You can also download MELQ manually from:
        echo https://github.com/ecbaldwin4/melq/archive/refs/heads/master.zip
        echo Extract it and run install-windows.bat from inside the folder.
        echo.
        pause
        exit /b 1
    )
)

echo ✅ Git found
echo.

REM Create installation directory
set INSTALL_DIR=%USERPROFILE%\MELQ
echo 📁 Installing to: %INSTALL_DIR%

if exist "%INSTALL_DIR%" (
    echo.
    echo ⚠️  MELQ directory already exists at %INSTALL_DIR%
    set /p overwrite="Remove existing installation and reinstall? (y/n): "
    
    if /i "!overwrite!"=="y" (
        echo Removing existing installation...
        rmdir /s /q "%INSTALL_DIR%"
    ) else (
        echo Installation cancelled.
        pause
        exit /b 0
    )
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

echo ✅ MELQ downloaded successfully
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

echo ✅ Dependencies installed
echo.

REM Install globally
echo 🔗 Setting up global 'melq' command...
call npm link

if errorlevel 1 (
    echo ⚠️  Global installation had issues, but MELQ is installed locally
    echo.
    echo You can run MELQ by opening a command prompt in:
    echo %INSTALL_DIR%
    echo And typing: npm start
    echo.
    goto success
)

echo ✅ MELQ installed globally
echo.

REM Test installation
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
    echo.
    goto success
)

echo ⚠️  Installation completed, but 'melq' command not found
echo.
echo 🔧 Would you like me to try fixing the PATH automatically?
echo This will add the npm global directory to your system PATH.
echo.
if "%~1"=="" (
    set /p fix_path="Add npm global directory to PATH? (y/n): "
) else (
    echo Running in automated mode - will attempt PATH fix...
    set fix_path=y
)

if /i "%fix_path%"=="y" (
    echo.
    echo 🔧 Trying to fix PATH automatically...
    
    REM Get npm global bin directory (works with both old and new npm versions)
    for /f "tokens=*" %%i in ('npm bin -g 2^>nul') do set NPM_BIN=%%i
    if "!NPM_BIN!"=="" (
        REM Try newer npm method
        for /f "tokens=*" %%i in ('npm prefix -g 2^>nul') do set NPM_PREFIX=%%i
        if not "!NPM_PREFIX!"=="" (
            set NPM_BIN=!NPM_PREFIX!\bin
        )
    )
    
    if not "!NPM_BIN!"=="" (
        echo Adding !NPM_BIN! to system PATH...
        
        REM Add to system PATH (requires admin, but we'll try)
        setx PATH "%PATH%;!NPM_BIN!" >nul 2>&1
        
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
            echo 2. Add this to your PATH: !NPM_BIN!
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
echo 🚀 MELQ is ready!
echo.
echo 📁 Installed in: %INSTALL_DIR%
echo 📖 For help visit: https://github.com/ecbaldwin4/melq
echo.
set /p run_now="Would you like to start MELQ now? (y/n): "

if /i "%run_now%"=="y" (
    echo.
    echo Starting MELQ...
    melq 2>nul || (
        echo Running locally...
        call npm start
    )
)

echo.
pause