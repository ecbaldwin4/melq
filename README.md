# MELQ - Secure P2P Chat

A secure peer-to-peer chat system with a directory-like CLI interface. Uses ngrok as a coordination server, MLKEM for key exchange, and AES-256 for message encryption.

## Features

- **🔐 Quantum-Secure**: MLKEM-768 key exchange + AES-256 encryption
- **🌐 P2P Architecture**: Direct encrypted messaging between nodes
- **🗂️ Beautiful TUI**: Filesystem-like interface with emojis and colors
- **🚀 Multiple Connection Methods**: localtunnel (no account!), ngrok, serveo, or manual setup
- **💬 Real-time Chat**: WebSocket-based with typing indicators
- **📱 Responsive Design**: Adapts to different terminal sizes
- **⚡ Smart Discovery**: Automatic peer discovery and connection
- **🎨 Rich Interface**: Loading animations, status indicators, and intuitive commands

## Quick Start

### 🚀 Zero-Touch Installation (Recommended)

**Windows Users:**
```cmd
curl -o install.bat https://raw.githubusercontent.com/ecbaldwin4/melq/master/install.bat && install.bat
```
Or download and run: https://raw.githubusercontent.com/ecbaldwin4/melq/master/install.bat

**Linux/macOS Users:**
```bash
curl -fsSL https://raw.githubusercontent.com/ecbaldwin4/melq/master/install.sh | bash
```
Or download and run: https://raw.githubusercontent.com/ecbaldwin4/melq/master/install.sh

This single command will:
- ✅ Check if you have Node.js (helps you install if needed)
- ⬇️ Download MELQ automatically
- 📦 Install all dependencies including localtunnel for instant internet access
- 🔗 Set up the global `melq` command
- 🧪 Test everything works

### 📦 Manual Installation

If the quick install doesn't work:

1. Install Node.js (version 16 or newer) from https://nodejs.org/
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start MELQ:
   ```bash
   npm start
   ```

## Usage

After installation, simply run:
```bash
melq
```

This opens the beautiful interactive menu:
```
🔐 MELQ - Quantum-Secure P2P Chat
══════════════════════════════════════════════════

What would you like to do?
1. 🏠 Host a new network (others can join you)
2. 🔗 Join an existing network  
3. 🔍 Discover local networks
4. ❓ Help
```

### Advanced Usage

```bash
melq --host          # Directly host a network
melq --join <code>   # Join with connection code
melq --update        # Update to latest version
melq --help          # Show all options
```

## Internet Connectivity (No Account Required!)

MELQ makes it incredibly easy to connect with friends anywhere in the world:

### 🌐 Automatic Internet Access

When you host a network and choose "Local + Internet", MELQ automatically:

1. **Prefers Localtunnel** - Instantly creates a secure tunnel with no signup required
2. **Provides Connection Code** - Share the generated `https://abcd123.loca.lt` URL
3. **Fallback Options** - If localtunnel fails, tries ngrok, serveo, or manual setup
4. **Works Everywhere** - No router configuration or port forwarding needed

### 🚀 Hosting Options

When you run `melq --host`, you'll see:

```
Network Access Options:
1. 🏠 Local network only (same WiFi/LAN)
2. 🌐 Local + Internet (anyone can join) ← Choose this!
3. 🔧 Advanced options

Tunneling Method:
1. Auto (prefer localtunnel - instant, no signup!) ← Recommended  
2. Localtunnel only (recommended - no account needed)
3. ngrok only (requires account for persistent URLs)
4. Manual setup (port forwarding)
```

**Recommendation**: Choose option 2 (Local + Internet) with option 1 (Auto) for the easiest setup! Auto mode prioritizes localtunnel for instant, no-signup access.

### 🔗 Connection Codes

After setup, MELQ shows you connection codes to share:

```
📋 Connection Codes:
🏠 Local (same network):
 melq://192.168.1.100:3000 

🌐 Internet (anywhere):
 melq://abcd123.loca.lt 

Share these codes with others so they can join!
Command: melq --join <connection_code>
```

## Commands

The interface works like a Linux CLI:

- `ls` - List available chats (or messages if in a chat)
- `cd <chat_name>` - Enter a chat directory
- `cd ..` - Go back to main directory  
- `mkdir <chat_name>` - Create a new chat
- `say <message>` - Send a message in current chat
- `discover` - Find other nodes
- `nodes` - Show connected peers
- `history` - Show chat message history
- `pwd` - Show current path
- `clear` - Clear screen
- `help` - Show available commands
- `Ctrl+C` - Exit

## Beautiful TUI Interface

MELQ features a modern, emoji-rich terminal interface that makes secure chatting delightful:

### Main Menu
```
🔐 MELQ - Quantum-Secure P2P Chat
══════════════════════════════════════════════════

What would you like to do?
1. 🏠 Host a new network (others can join you)
2. 🔗 Join an existing network
3. 🔍 Discover local networks
4. ❓ Help
```

### Directory Navigation
```
╔══════════════════════════════════════════════════════════════╗
║          🔐 MELQ - Quantum-Secure P2P Chat                  ║
║                                                              ║
║              Connected as: abc12345                          ║
║              Status: 🟢 Connected                            ║
╚══════════════════════════════════════════════════════════════╝

📁 Available Chats:
──────────────────────────────────────────────────────────────
  💬 general [2] 5m ago
  📁 random (empty)

[abc12345](2) /$ 
```

### Chat Interface
```
╭──────────────────────────────────────────────────────────────╮
│              🟢 GENERAL (2 peers)                           │
╰──────────────────────────────────────────────────────────────╯

  [15:30] You: Hello everyone! 👋
  
  [15:31] Alice: Hey there! How's everyone doing?
  
  [15:32] Bob: Great to see you all here!

╭──────────────────────────────────────────────────────────────╮
│            Commands: /exit /help /clear /discover           │
╰──────────────────────────────────────────────────────────────╯
🟢 > 
```

## Getting Started

### For Non-Technical Users

**The Really Easy Way:**

1. **Copy and paste one command** (choose your system):
   
   **Windows:** Open Command Prompt and paste:
   ```cmd
   curl -o install.bat https://raw.githubusercontent.com/ecbaldwin4/melq/master/install.bat && install.bat
   ```
   
   **Mac/Linux:** Open Terminal and paste:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/ecbaldwin4/melq/master/install.sh | bash
   ```

2. **Follow the prompts**: The installer will ask before doing anything and guide you through any needed steps

3. **Start chatting**: Once installed, just type `melq` anywhere to start!

**What the installer does for you:**
- Checks if you have everything needed (Node.js, Git)
- Offers to help you install missing requirements  
- Downloads MELQ automatically
- Sets up the `melq` command globally
- Tests that everything works

### Example Session

```bash
# Start MELQ (after installation)
melq

# Choose "Host a network" from menu
# MELQ automatically sets up secure connection and shows your connection code
# Share the code with friends so they can join!

# Navigate and create chats
[abc12345] /$ ls
📁 Available chats:
  📭 No chats available
  💡 Use "mkdir <chat_name>" to create a new chat

[abc12345] /$ mkdir general
🔨 Creating chat: "general"...
✅ Successfully created chat "general"

[abc12345] /$ cd general
# Beautiful chat interface opens with real-time messaging

🟢 > Hello everyone!
  [15:30] You: Hello everyone!

# Exit back to directory
/exit
✅ Left chat "general"
💡 You're back in the main directory. Use "ls" to see all chats.
```

## Security Features ✅ **VALIDATED**

**Post-Quantum Security Implementation:**
- **MLKEM-768 Key Exchange**: NIST FIPS 203 compliant post-quantum cryptography (192-bit security level)
- **AES-256-GCM Encryption**: All messages encrypted end-to-end with authenticated encryption
- **Perfect Forward Secrecy**: Each session uses unique keys derived from MLKEM shared secrets
- **PBKDF2 Key Derivation**: Secure key derivation from quantum-resistant shared secrets
- **No Plaintext Storage**: Messages only stored encrypted, never in plaintext
- **Automatic Key Exchange**: Seamless post-quantum key establishment between all peers
- **Message Authentication**: GCM mode provides both confidentiality and authenticity

**Security Validation Report (Latest):**
- ✅ ML-KEM-768 implementation verified using official `mlkem` v2.3.1 package
- ✅ All node-to-node communication secured with post-quantum cryptography
- ✅ No insecure communication channels detected
- ✅ Proper cryptographic key management and lifecycle
- ✅ NIST-approved algorithms throughout the security stack

## Architecture

- **Coordinator Server**: Central discovery service (runs on ngrok)
- **P2P Nodes**: Individual chat clients with encryption
- **CLI Interface**: Directory-like navigation for chats
- **Crypto Layer**: MLKEM + AES-256 for security

## Troubleshooting

### Installation Issues

**"Node.js not found"**
- Install Node.js from https://nodejs.org/ (choose LTS version)
- Restart your terminal/command prompt after installation

**"melq command not found"**
- Run the install script again
- Try restarting your terminal
- On Linux/macOS, you may need: `export PATH=$(npm bin -g):$PATH`

**"Permission denied" (Linux/macOS)**
- The install script will try `sudo npm link` automatically
- Or if already downloaded: `cd melq && npm start`

### Connection Issues

**"Failed to create tunnel"**
- Check your internet connection  
- MELQ prefers localtunnel first (no account required), then tries ngrok, serveo
- If all tunnel services fail, MELQ provides manual setup instructions
- Localtunnel is the preferred option for instant, no-signup access

## Development

For developers who want to modify MELQ:

```bash
# Clone the repository
git clone <repo-url>
cd melq

# Install dependencies
npm install

# Run in development mode
npm run dev
```

The system consists of:
- `src/coordinator.js` - Central coordination server
- `src/network/node.js` - P2P node implementation  
- `src/crypto/mlkem.js` - MLKEM key exchange
- `src/crypto/aes.js` - AES encryption
- `src/cli/interface.js` - CLI interface
- `src/index.js` - Main application
- `bin/melq.js` - Global CLI entry point

## Security Compliance & Standards

MELQ implements enterprise-grade security following industry best practices:

**Cryptographic Standards:**
- **NIST FIPS 203**: ML-KEM (Module-Lattice-Based Key Encapsulation Mechanism) - Official post-quantum standard
- **NIST FIPS 197**: AES-256 Advanced Encryption Standard
- **RFC 5869**: PBKDF2 Key Derivation Function
- **RFC 5116**: GCM Authenticated Encryption mode

**Security Architecture:**
- All traffic goes through coordinator for initial discovery only
- Direct P2P encrypted connections established after quantum-safe key exchange  
- End-to-end encryption ensures coordinator cannot access message content
- Forward secrecy protects against future quantum computer attacks

**Production Ready:**
- Uses official, audited cryptographic libraries
- Implements full MLKEM-768 specification (not simplified)
- Suitable for production deployments requiring quantum-resistant security