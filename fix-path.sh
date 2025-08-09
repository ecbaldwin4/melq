#!/bin/bash

# MELQ PATH Fix Script
# This script fixes the PATH issue where melq command is not found after installation

echo "🔧 MELQ PATH Fix Script"
echo "======================="
echo

# Check if we're in the MELQ directory
if [ ! -f "package.json" ] || ! grep -q '"name": "melq"' package.json 2>/dev/null; then
    echo "❌ Please run this script from the MELQ directory:"
    echo "   cd ~/MELQ && ./fix-path.sh"
    exit 1
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "⚠️  npm not found. Trying to load Node.js environment..."
    
    # Try to load nvm
    export NVM_DIR="$HOME/.nvm"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        echo "🔄 Loading nvm..."
        \. "$NVM_DIR/nvm.sh"
        
        # Check if npm is now available
        if command -v npm &> /dev/null; then
            echo "✅ npm loaded successfully!"
            
            # Check if nvm is already in shell profile
            SHELL_PROFILE=""
            if [ -n "$BASH_VERSION" ] && [ -f "$HOME/.bashrc" ]; then
                SHELL_PROFILE="$HOME/.bashrc"
            elif [ -f "$HOME/.zshrc" ]; then
                SHELL_PROFILE="$HOME/.zshrc"
            elif [ -f "$HOME/.profile" ]; then
                SHELL_PROFILE="$HOME/.profile"
            fi
            
            if [ -n "$SHELL_PROFILE" ]; then
                if ! grep -q "NVM_DIR.*nvm" "$SHELL_PROFILE" 2>/dev/null; then
                    echo "🔄 Adding nvm to $SHELL_PROFILE for future sessions..."
                    echo "" >> "$SHELL_PROFILE"
                    echo "# Added by MELQ fix-path script" >> "$SHELL_PROFILE"
                    echo 'export NVM_DIR="$HOME/.nvm"' >> "$SHELL_PROFILE"
                    echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> "$SHELL_PROFILE"
                    echo "✅ nvm will be available in new terminal sessions"
                else
                    echo "✅ nvm already configured in $SHELL_PROFILE"
                fi
            fi
        else
            echo "❌ npm still not found after loading nvm."
            echo "💡 Please run: source ~/.bashrc"
            echo "   Then try: ./fix-path.sh again"
            echo "   Or run directly: node src/index.js"
            exit 1
        fi
    else
        echo "❌ nvm not found. Please install Node.js first."
        echo "💡 Or run directly: node src/index.js"
        exit 1
    fi
fi

# Get npm global prefix
NPM_PREFIX=$(npm config get prefix 2>/dev/null)
if [ -z "$NPM_PREFIX" ]; then
    echo "❌ Could not get npm prefix"
    exit 1
fi

NPM_BIN="$NPM_PREFIX/bin"
echo "📁 npm global bin directory: $NPM_BIN"

# Check if melq exists in npm global bin
if [ ! -f "$NPM_BIN/melq" ]; then
    echo "❌ melq not found in $NPM_BIN"
    echo "🔄 Running npm link to install melq globally..."
    npm link
    
    if [ ! -f "$NPM_BIN/melq" ]; then
        echo "❌ Failed to install melq globally"
        echo "💡 You can run MELQ directly with: node src/index.js"
        exit 1
    fi
    echo "✅ melq installed globally"
fi

# Check if npm bin is already in PATH
if echo "$PATH" | grep -q "$NPM_BIN"; then
    echo "✅ npm global bin already in PATH"
    echo "🧪 Testing melq command..."
    if command -v melq &> /dev/null; then
        echo "✅ melq command is working!"
        melq --help
        exit 0
    else
        echo "⚠️  melq still not found, trying reload..."
    fi
fi

# Add to PATH
echo "🔄 Adding npm global bin to PATH..."
export PATH="$NPM_BIN:$PATH"

# Test if melq works now
if command -v melq &> /dev/null; then
    echo "✅ melq command is now working!"
    echo
    echo "🔄 Making this permanent..."
    
    # Determine shell profile
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
        if grep -q "npm.*global.*bin\|$NPM_BIN" "$SHELL_PROFILE" 2>/dev/null; then
            echo "✅ PATH already configured in $SHELL_PROFILE"
        else
            echo "" >> "$SHELL_PROFILE"
            echo "# Added by MELQ PATH fix script" >> "$SHELL_PROFILE"
            echo "export PATH=\"$NPM_BIN:\$PATH\"" >> "$SHELL_PROFILE"
            echo "✅ Added to $SHELL_PROFILE"
        fi
        
        echo
        echo "🎉 MELQ is now ready!"
        echo "   Current session: melq command available"
        echo "   Future sessions: restart terminal or run 'source $SHELL_PROFILE'"
    else
        echo "⚠️  Could not determine shell profile"
        echo "   Add this to your shell profile manually:"
        echo "   export PATH=\"$NPM_BIN:\$PATH\""
    fi
    
    echo
    echo "🧪 Testing melq..."
    melq --help
    
    echo
    echo "🎉 SUCCESS! melq is working in the fix-path script environment."
    echo
    echo "⚠️  IMPORTANT: To use 'melq' command in your main shell:"
    echo "   1. Restart your terminal: exit and reconnect"
    echo "   2. Or reload shell: exec bash"
    echo "   3. Or source profile: source ~/.bashrc"
    echo
    echo "💡 Alternative: Always run from this directory:"
    echo "   cd ~/MELQ && node src/index.js"
    
else
    echo "❌ melq command still not working"
    echo "💡 Manual workaround:"
    echo "   Run: export PATH=\"$NPM_BIN:\$PATH\""
    echo "   Or use: node src/index.js"
fi