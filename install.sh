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
    echo "Please run install-linux.sh instead."
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
    install_node=$(interactive_prompt "Would you like installation instructions? (y/n): " "n")
    
    if [[ $install_node =~ ^[Yy]$ ]]; then
        echo
        echo "Please install Node.js using one of these methods:"
        echo
        
        # Detect OS and show appropriate instructions
        if [[ "$OSTYPE" == "darwin"* ]]; then
            echo "macOS:"
            echo "• Using Homebrew: brew install node"
            echo "• Or download from: https://nodejs.org/"
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            echo "Linux:"
            if command -v apt &> /dev/null; then
                echo "• Ubuntu/Debian: sudo apt update && sudo apt install nodejs npm"
            elif command -v yum &> /dev/null; then
                echo "• CentOS/RHEL: sudo yum install nodejs npm"
            elif command -v pacman &> /dev/null; then
                echo "• Arch: sudo pacman -S nodejs npm"
            else
                echo "• Or download from: https://nodejs.org/"
            fi
            echo "• Or download from: https://nodejs.org/"
        fi
        echo
        echo "After installing Node.js, run this installer again."
    else
        echo "Please install Node.js first: https://nodejs.org/"
    fi
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1)

if [ "$MAJOR_VERSION" -lt "16" ]; then
    echo "⚠️  Node.js version $NODE_VERSION is too old"
    echo "MELQ requires Node.js 16 or newer"
    echo
    update_node=$(interactive_prompt "Would you like to open the Node.js download page? (y/n): " "n")
    
    if [[ $update_node =~ ^[Yy]$ ]]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            open https://nodejs.org/
        else
            xdg-open https://nodejs.org/ 2>/dev/null || echo "Please visit: https://nodejs.org/"
        fi
        echo "Please update Node.js and run this installer again."
    else
        echo "Please update Node.js: https://nodejs.org/"
    fi
    exit 1
fi

echo "✅ Node.js $(node --version) found"

# Check for git
if ! command -v git &> /dev/null; then
    echo
    echo "⚠️  Git is not installed."
    echo "Git is needed to download MELQ."
    echo
    install_git=$(interactive_prompt "Would you like installation instructions? (y/n): " "n")
    
    if [[ $install_git =~ ^[Yy]$ ]]; then
        echo
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
    else
        echo
        echo "Alternative: You can also download MELQ manually from:"
        echo "https://github.com/ecbaldwin4/melq/archive/refs/heads/master.zip"
        echo "Extract it and run install-linux.sh from inside the folder."
    fi
    exit 1
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

echo "✅ Dependencies installed"
echo

# Install globally (link to current directory)
echo "🔗 Setting up global 'melq' command..."
if npm link 2>/dev/null; then
    echo "✅ MELQ installed globally"
else
    echo "❌ Failed to install globally. Trying with sudo..."
    
    # Try with sudo
    if sudo npm link 2>/dev/null; then
        echo "✅ MELQ installed globally (with sudo)"
    else
        echo "⚠️  Global installation failed"
        echo
        echo "You can run MELQ by opening a terminal in:"
        echo "$INSTALL_DIR"
        echo "And typing: npm start"
        echo
        echo "Or add this directory to your PATH"
        goto_success="true"
    fi
fi

echo

# Test installation
echo "🧪 Testing installation..."
if command -v melq &> /dev/null && [ -z "$goto_success" ]; then
    echo "✅ Installation successful!"
    echo
    echo "🎉 You can now run MELQ from anywhere with:"
    echo "   melq                    # Interactive menu"
    echo "   melq --host             # Host a network"  
    echo "   melq --join <code>      # Join a network"
    echo "   melq --help             # Show help"
    echo
else
    if [ -z "$goto_success" ]; then
        echo "⚠️  Installation completed, but 'melq' command not found in PATH"
        echo
        echo "🔧 Trying to fix PATH automatically..."
        
        # Get npm global bin directory
        NPM_BIN=$(npm bin -g 2>/dev/null || echo "")
        
        if [ -n "$NPM_BIN" ]; then
            echo "Adding $NPM_BIN to PATH..."
            
            # Add to current session
            export PATH="$NPM_BIN:$PATH"
            
            # Try to add to shell profile
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
                if ! grep -q "export PATH.*npm bin -g" "$SHELL_PROFILE" 2>/dev/null; then
                    add_to_profile=$(interactive_prompt "Add to $SHELL_PROFILE for future terminals? (y/n): " "y")
                    if [[ $add_to_profile =~ ^[Yy]$ ]]; then
                        echo "" >> "$SHELL_PROFILE"
                        echo "# Added by MELQ installer" >> "$SHELL_PROFILE"
                        echo "export PATH=\"\$(npm bin -g 2>/dev/null):\$PATH\"" >> "$SHELL_PROFILE"
                        echo "✅ Added to $SHELL_PROFILE"
                        echo "   (will take effect in new terminals)"
                    fi
                fi
            fi
            
            # Test if melq command now works
            if command -v melq &> /dev/null; then
                echo "✅ 'melq' command is now available!"
            else
                echo "⚠️  Please restart your terminal or run:"
                echo "   export PATH=\"\$(npm bin -g):\$PATH\""
            fi
        else
            echo "❌ Could not determine npm global bin directory"
            echo "   Please run: npm start (from $INSTALL_DIR)"
        fi
    fi
fi

echo "🚀 MELQ is ready!"
echo
echo "📁 Installed in: $INSTALL_DIR"
echo "📖 For help visit: https://github.com/ecbaldwin4/melq"
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