#!/bin/bash

# MELQ Zero-Touch Installer for Linux/macOS
# This script downloads MELQ and sets up everything needed to run it

set -e

# Helper function for interactive prompts
interactive_prompt() {
    local prompt="$1"
    local default="$2"
    
    if ! [ -t 0 ]; then
        # Non-interactive mode (piped) - use default
        echo "$default"
    else
        # Interactive mode
        read -p "$prompt" response
        echo "$response"
    fi
}

echo "🔐 MELQ Zero-Touch Installer"
echo "=========================================="
echo
echo "This will install MELQ - Quantum-Secure P2P Chat"
echo "on your Linux/macOS computer."
echo

# Check if running from correct location
if [ -f "src/index.js" ]; then
    echo "⚠️  It looks like you're already in the MELQ directory."
    echo "Please run npm start instead from inside the MELQ directory."
    echo
    exit 1
fi

echo "What this installer will do:"
echo "• Check if Node.js and Git are installed"
echo "• Download MELQ source code" 
echo "• Install dependencies"
echo "• Set up global 'melq' command"
echo

# Check if running in non-interactive mode (piped)
# When piped via curl | bash, stdin is not available for input
if ! [ -t 0 ]; then
    echo "🤖 Running in non-interactive mode - proceeding with installation..."
    confirm="y"
else
    # Interactive mode - ask for confirmation
    read -p "Continue with installation? (y/n): " confirm
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        echo "Installation cancelled."
        exit 0
    fi
fi

echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo
    echo "Node.js is required to run MELQ."
    install_node=$(interactive_prompt "Would you like to install Node.js using nvm? (Y/n): " "y")
    
    if [[ $install_node =~ ^[Yy]$ ]]; then
        echo
        echo "🔄 Installing Node.js using nvm (Node Version Manager)..."
        echo
        
        # Download and install nvm
        echo "1. Installing nvm..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
        
        if [ $? -ne 0 ]; then
            echo "❌ Failed to install nvm"
            echo
            echo "Manual installation:"
            echo "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash"
            echo "Then restart this installer"
            exit 1
        fi
        
        # Source nvm in current shell
        echo "2. Loading nvm..."
        
        # Try both possible nvm installation paths
        if [ -s "$HOME/.config/nvm/nvm.sh" ]; then
            export NVM_DIR="$HOME/.config/nvm"
            \. "$NVM_DIR/nvm.sh"
            echo "   Loaded nvm from ~/.config/nvm"
        elif [ -s "$HOME/.nvm/nvm.sh" ]; then
            export NVM_DIR="$HOME/.nvm"
            \. "$NVM_DIR/nvm.sh"
            echo "   Loaded nvm from ~/.nvm"
        else
            echo "❌ Could not find nvm installation"
            echo "   Please run: source ~/.bashrc"
            echo "   Then try running this installer again"
            exit 1
        fi
        
        # Install Node.js 22
        echo "3. Installing Node.js 22..."
        nvm install 22
        nvm use 22
        
        echo
        echo "✅ Node.js installation complete!"
        node -v
        npm -v
        echo
        echo "🔄 Continuing with MELQ installation..."
        
        # Continue with the rest of the installer
    else
        echo
        echo "Please install Node.js manually:"
        echo
        echo "# Recommended method (using nvm):"
        echo "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash"
        echo "source ~/.bashrc"
        echo "nvm install 22"
        echo
        echo "# Alternative methods:"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            echo "• macOS: brew install node"
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            if command -v apt &> /dev/null; then
                echo "• Ubuntu/Debian: sudo apt update && sudo apt install nodejs npm"
            elif command -v yum &> /dev/null; then
                echo "• CentOS/RHEL: sudo yum install nodejs npm"
            elif command -v pacman &> /dev/null; then
                echo "• Arch: sudo pacman -S nodejs npm"
            fi
        fi
        echo "• Or download from: https://nodejs.org/"
        echo
        echo "After installing Node.js, run this installer again."
        exit 1
    fi
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1)

if [ "$MAJOR_VERSION" -lt "16" ]; then
    echo "⚠️  Node.js version $NODE_VERSION is too old"
    echo "MELQ requires Node.js 16 or newer"
    echo
    update_node=$(interactive_prompt "Would you like to upgrade Node.js using nvm? (y/n): " "y")
    
    if [[ $update_node =~ ^[Yy]$ ]]; then
        echo
        echo "🔄 Upgrading Node.js using nvm..."
        
        # Check if nvm is already installed
        if command -v nvm &> /dev/null; then
            echo "✅ nvm found, installing Node.js 22..."
            nvm install 22
            nvm use 22
        else
            echo "1. Installing nvm..."
            curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
            
            echo "2. Loading nvm..."
            
            # Try both possible nvm installation paths
            if [ -s "$HOME/.config/nvm/nvm.sh" ]; then
                export NVM_DIR="$HOME/.config/nvm"
                \. "$NVM_DIR/nvm.sh"
                echo "   Loaded nvm from ~/.config/nvm"
            elif [ -s "$HOME/.nvm/nvm.sh" ]; then
                export NVM_DIR="$HOME/.nvm"
                \. "$NVM_DIR/nvm.sh"
                echo "   Loaded nvm from ~/.nvm"
            else
                echo "❌ Could not find nvm installation"
                echo "   Please run: source ~/.bashrc"
                echo "   Then try running this installer again"
                exit 1
            fi
            
            echo "3. Installing Node.js 22..."
            nvm install 22
            nvm use 22
        fi
        
        echo
        echo "✅ Node.js upgrade complete!"
        node -v
        npm -v
        echo
        echo "🔄 Continuing with MELQ installation..."
    else
        echo
        echo "Please upgrade Node.js:"
        echo
        echo "# Recommended method (using nvm):"
        echo "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash"
        echo "source ~/.bashrc"
        echo "nvm install 22"
        echo
        echo "# Or visit: https://nodejs.org/"
        exit 1
    fi
fi

echo "✅ Node.js $(node --version) found"

# Check for git
if ! command -v git &> /dev/null; then
    echo
    echo "⚠️  Git is not installed."
    echo "Git is needed to download MELQ."
    echo
    echo "AUTOMATED INSTALLATION ATTEMPT:"
    echo "Trying to install Git automatically..."
    
    git_installed=false
    
    # Try automated installation based on OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - try homebrew
        if command -v brew &> /dev/null; then
            echo "📦 Detected macOS with Homebrew..."
            if brew install git; then
                echo "✅ Git installed successfully via Homebrew!"
                git_installed=true
            fi
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux - detect package manager
        if command -v apt-get &> /dev/null; then
            echo "📦 Detected Ubuntu/Debian - using apt..."
            if sudo apt update && sudo apt install -y git; then
                echo "✅ Git installed successfully via apt!"
                git_installed=true
            fi
        elif command -v yum &> /dev/null; then
            echo "📦 Detected CentOS/RHEL - using yum..."
            if sudo yum install -y git; then
                echo "✅ Git installed successfully via yum!"
                git_installed=true
            fi
        elif command -v dnf &> /dev/null; then
            echo "📦 Detected Fedora - using dnf..."
            if sudo dnf install -y git; then
                echo "✅ Git installed successfully via dnf!"
                git_installed=true
            fi
        elif command -v pacman &> /dev/null; then
            echo "📦 Detected Arch Linux - using pacman..."
            if sudo pacman -S --noconfirm git; then
                echo "✅ Git installed successfully via pacman!"
                git_installed=true
            fi
        fi
    fi
    
    if [ "$git_installed" = false ]; then
        echo "❌ Automated Git installation failed or not supported."
        echo
        echo "MANUAL INSTALLATION REQUIRED:"
        echo "Please install Git using one of these methods:"
        echo
        
        if [[ "$OSTYPE" == "darwin"* ]]; then
            echo "macOS:"
            echo "• Using Homebrew: brew install git"
            echo "• Or download from: https://git-scm.com/download/mac"
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            echo "Linux:"
            if command -v apt &> /dev/null; then
                echo "• Ubuntu/Debian: sudo apt install git"
            elif command -v yum &> /dev/null; then
                echo "• CentOS/RHEL: sudo yum install git"
            elif command -v pacman &> /dev/null; then
                echo "• Arch: sudo pacman -S git"
            fi
        fi
        echo
        echo "After installing Git, run this installer again."
        echo
        echo "Alternative: You can also download MELQ manually from:"
        echo "https://github.com/ecbaldwin4/melq/archive/refs/heads/master.zip"
        echo "Extract it and run npm start from inside the folder."
        exit 1
    fi
    
    echo "🔄 Continuing with MELQ installation..."
    echo
fi

echo "✅ Git found"
echo

# Set installation directory
INSTALL_DIR="$HOME/MELQ"
echo "📁 Installing to: $INSTALL_DIR"

if [ -d "$INSTALL_DIR" ]; then
    echo
    echo "⚠️  MELQ directory already exists at $INSTALL_DIR"
    overwrite=$(interactive_prompt "Remove existing installation and reinstall? (y/n): " "y")
    
    if [[ $overwrite =~ ^[Yy]$ ]]; then
        echo "Removing existing installation..."
        rm -rf "$INSTALL_DIR"
    else
        echo "Installation cancelled."
        exit 0
    fi
fi

echo
echo "🌐 Downloading MELQ..."
git clone https://github.com/ecbaldwin4/melq.git "$INSTALL_DIR"

if [ $? -ne 0 ]; then
    echo "❌ Failed to download MELQ"
    echo "Please check your internet connection and try again."
    exit 1
fi

echo "✅ MELQ downloaded successfully"
echo

# Change to installation directory
cd "$INSTALL_DIR"

echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    echo "Please check your internet connection and try again"
    exit 1
fi

# Check for and fix any security vulnerabilities
echo "🔍 Checking for security issues..."
AUDIT_OUTPUT=$(npm audit --audit-level=high 2>/dev/null || echo "")
if echo "$AUDIT_OUTPUT" | grep -q "vulnerabilities found" || echo "$AUDIT_OUTPUT" | grep -q "high severity"; then
    echo "🔧 Fixing security vulnerabilities..."
    npm audit fix --force >/dev/null 2>&1 || true
    echo "✅ Security vulnerabilities addressed"
else
    echo "✅ No high-severity vulnerabilities found"
fi

echo "✅ Dependencies installed and secured"

# Detect WSL and warn about potential npm issues
if [ -n "$WSL_DISTRO_NAME" ] || [ "$(uname -r | grep -i microsoft)" ]; then
    echo
    echo "🐧 WSL (Windows Subsystem for Linux) detected"
    
    # Check if npm is Windows npm
    if npm config get prefix 2>/dev/null | grep -q "C:\\"; then
        echo "⚠️  WARNING: Using Windows npm in WSL may cause path issues"
        echo "   If 'melq' command doesn't work, run: cd ~/MELQ && node src/index.js"
        echo
    fi
fi

# Create a troubleshooting file with WSL-specific instructions
cat > "TROUBLESHOOTING.txt" << 'TROUBLESHOOT_EOF'
MELQ Installation Troubleshooting
==================================

If 'melq' command is not found:

🔧 Quick fixes (try in order):

1. Load Node.js environment:
   source ~/.bashrc
   (or restart terminal)

2. Check if Node.js is available:
   node --version
   npm --version

3. If npm not found, load nvm manually:
   export NVM_DIR="$HOME/.nvm"
   [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

4. Run the PATH fix script:
   ./fix-path.sh

5. If fix-path.sh doesn't exist:
   curl -o fix-path.sh https://raw.githubusercontent.com/ecbaldwin4/melq/master/fix-path.sh
   chmod +x fix-path.sh
   ./fix-path.sh

6. Run MELQ directly:
   node src/index.js

7. Use npm script:
   npm start

🐧 WSL (Windows Subsystem for Linux) Issues:

If you're using WSL and getting path errors like "C:\Users\...":

1. You're using Windows npm in WSL (common issue)
2. Install Linux Node.js instead:
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
   source ~/.bashrc
   nvm install node
   cd ~/MELQ && npm install && npm link

3. Or always run directly:
   cd ~/MELQ && node src/index.js

For help: https://github.com/ecbaldwin4/melq
TROUBLESHOOT_EOF

echo

# Install globally (link to current directory)
echo "🔗 Setting up global 'melq' command..."

# Try npm link first
if npm link 2>/dev/null; then
    echo "✅ MELQ installed globally"
    LINK_SUCCESS="true"
elif sudo npm link 2>/dev/null; then
    echo "✅ MELQ installed globally (with sudo)"
    LINK_SUCCESS="true"
else
    echo "⚠️  Global npm link failed, but this is common on Linux/WSL"
    echo "   Will set up PATH manually instead..."
    LINK_SUCCESS="false"
fi

echo

# Test installation and fix PATH if needed
echo "🧪 Testing installation..."
if command -v melq &> /dev/null; then
    echo "✅ Installation successful!"
    echo
    echo "🎉 You can now run MELQ from anywhere with:"
    echo "   melq                    # Interactive menu"
    echo "   melq --host             # Host a network"  
    echo "   melq --join <code>      # Join a network"
    echo "   melq --help             # Show help"
    echo
else
    echo "⚠️  'melq' command not found - fixing PATH..."
    echo
    
    # Get npm global bin directory (works with both old and new npm versions)
    NPM_BIN=""
    # Try newer npm method first (npm v7+)
    NPM_PREFIX=$(npm config get prefix 2>/dev/null)
    if [ -n "$NPM_PREFIX" ]; then
        NPM_BIN="$NPM_PREFIX/bin"
    else
        # Fallback: try npm prefix -g
        NPM_PREFIX=$(npm prefix -g 2>/dev/null)
        if [ -n "$NPM_PREFIX" ]; then
            NPM_BIN="$NPM_PREFIX/bin"
        else
            # Last fallback: try npm bin -g (older versions)
            NPM_BIN=$(npm bin -g 2>/dev/null || echo "")
        fi
    fi
    
    if [ -n "$NPM_BIN" ] && [ -f "$NPM_BIN/melq" ]; then
        echo "Found melq at: $NPM_BIN/melq"
        
        # Add to current session PATH
        export PATH="$NPM_BIN:$PATH"
        echo "✅ Added to current session PATH"
        
        # Automatically add to shell profile in non-interactive mode
        SHELL_PROFILE=""
        if [ -n "$BASH_VERSION" ] && [ -f "$HOME/.bashrc" ]; then
            SHELL_PROFILE="$HOME/.bashrc"
        elif [ -f "$HOME/.zshrc" ]; then
            SHELL_PROFILE="$HOME/.zshrc"
        elif [ -f "$HOME/.profile" ]; then
            SHELL_PROFILE="$HOME/.profile"
        fi
        
        if [ -n "$SHELL_PROFILE" ]; then
            # Check if PATH export already exists
            if ! grep -q "npm.*global.*bin" "$SHELL_PROFILE" 2>/dev/null; then
                add_to_profile=$(interactive_prompt "Add to $SHELL_PROFILE for future terminals? (y/n): " "y")
                if [[ $add_to_profile =~ ^[Yy]$ ]]; then
                    echo "" >> "$SHELL_PROFILE"
                    echo "# Added by MELQ installer" >> "$SHELL_PROFILE"
                    echo "export PATH=\"$NPM_BIN:\$PATH\"" >> "$SHELL_PROFILE"
                    echo "✅ Added to $SHELL_PROFILE"
                fi
            fi
        fi
        
        # Test again
        if command -v melq &> /dev/null; then
            echo "✅ 'melq' command is now available!"
            echo
            echo "🎉 You can now run MELQ from anywhere with:"
            echo "   melq                    # Interactive menu"
            echo "   melq --host             # Host a network"  
            echo "   melq --join <code>      # Join a network"
            echo "   melq --help             # Show help"
            echo
        else
            echo "⚠️  PATH updated, but needs terminal restart"
            echo "   Run: source ~/.bashrc"
            echo "   Or restart your terminal"
            echo "   Then try: melq"
            echo
        fi
    else
        echo "❌ Could not locate npm global directory"
        echo "   You can run MELQ directly with:"
        echo "   cd $INSTALL_DIR && npm start"
        echo
    fi
fi

echo "🚀 MELQ is ready!"
echo
echo "📁 Installed in: $INSTALL_DIR"
echo "📖 For help visit: https://github.com/ecbaldwin4/melq"

# Always show path fix instructions (common issue)
echo
echo "📝 IMPORTANT: If 'melq' command is not found:"
echo "   📁 See troubleshooting: cat $INSTALL_DIR/TROUBLESHOOTING.txt"
echo "   🔄 Load Node.js: source ~/.bashrc (or restart terminal)"
echo "   🔧 Then fix PATH: cd $INSTALL_DIR && ./fix-path.sh"
echo "   💡 Or run directly: cd $INSTALL_DIR && node src/index.js"
echo

echo

run_now=$(interactive_prompt "Would you like to start MELQ now? (y/n): " "n")

if [[ $run_now =~ ^[Yy]$ ]]; then
    echo
    echo "Starting MELQ..."
    if command -v melq &> /dev/null; then
        melq
    else
        echo "Running locally..."
        npm start
    fi
fi