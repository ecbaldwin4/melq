#!/bin/bash

# MELQ Installation Script for Linux/macOS
# This script installs MELQ globally so you can run it from anywhere

set -e

echo "🔐 MELQ Installation Script"
echo "=========================================="
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo
    echo "Please install Node.js first:"
    echo "• Ubuntu/Debian: sudo apt update && sudo apt install nodejs npm"
    echo "• CentOS/RHEL: sudo yum install nodejs npm"
    echo "• Arch: sudo pacman -S nodejs npm"  
    echo "• macOS: brew install node"
    echo "• Or download from: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1)

if [ "$MAJOR_VERSION" -lt "16" ]; then
    echo "⚠️  Node.js version $NODE_VERSION is too old"
    echo "MELQ requires Node.js 16 or newer"
    echo "Please update Node.js: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js $(node --version) found"

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed!"
    echo "Please install npm along with Node.js"
    exit 1
fi

echo "✅ npm $(npm --version) found"
echo

# Install dependencies
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
echo "🔗 Installing MELQ globally..."
npm link

if [ $? -ne 0 ]; then
    echo "❌ Failed to install globally. Trying with sudo..."
    
    # Try with sudo
    sudo npm link
    
    if [ $? -ne 0 ]; then
        echo "❌ Global installation failed"
        echo
        echo "You can still use MELQ locally with:"
        echo "  npm start"
        echo
        echo "Or add this directory to your PATH to use 'melq' command"
        exit 1
    fi
fi

echo "✅ MELQ installed globally"
echo

# Test installation
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
    echo "⚠️  Installation completed, but 'melq' command not found in PATH"
    echo
    echo "You may need to:"
    echo "• Restart your terminal"
    echo "• Add npm global bin to PATH: export PATH=\$(npm bin -g):\$PATH"
    echo
    echo "Or use: npm start (from this directory)"
fi

echo "🚀 Ready to start secure P2P chatting!"