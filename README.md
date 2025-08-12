# MELQ - Secure Chat Network

A quantum-secure chat system with a beautiful terminal interface. Uses post-quantum ML-KEM-768 encryption and a centralized host architecture for reliable, private communication.

## Installation

```bash
npm install -g melq
melq
```

**If you get permission errors on Linux/macOS:**
```bash
# Option 1: Use sudo (quick fix)
sudo npm install -g melq

# Option 2: Fix npm permissions (recommended)
npm config set prefix ~/.local
echo 'export PATH=~/.local/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install -g melq
```

## Quick Start

### Host a Chat Network
```bash
melq --host                    # Local network only
melq --host --internet         # Accessible over internet  
melq --host --password secret  # Password protected
```

### Join a Chat Network
```bash
melq --join <connection-code>
```

## How It Works

MELQ uses a **host-based architecture** where one person runs a host node and others connect as clients:

```
┌─────────┐    ┌─────────┐    ┌─────────┐
│ Client  │───▶│  Host   │◀───│ Client  │
│  Alice  │    │   Bob   │    │ Charlie │
└─────────┘    └─────────┘    └─────────┘
```

- **Host**: Runs the central server, manages chats and routes messages
- **Clients**: Connect to the host to participate in chats
- **Internet Access**: Optional tunneling through localtunnel, ngrok, or serveo

## Security Architecture

### 🔐 Post-Quantum Encryption

**Key Exchange: ML-KEM-768**
- NIST-standardized quantum-resistant algorithm (FIPS 203)
- 192-bit security level against quantum computers
- Each client establishes a unique shared secret with the host

**Message Encryption: AES-256-GCM**
- All messages encrypted with authenticated encryption
- Keys derived from ML-KEM shared secrets using PBKDF2
- Perfect forward secrecy per session

### 🔒 Security Model

**What's Protected:**
- ✅ All chat messages (encrypted end-to-end through host)
- ✅ User authentication (password protection available)
- ✅ Connection metadata and user lists
- ✅ Quantum-resistant against future attacks

**Trust Model:**
- Host can see message metadata (sender, timestamp, chat room)
- Host cannot read message content (encrypted with client keys)
- Clients must trust the host operator for message routing
- Network traffic encrypted with transport-layer security

**Password Protection:**
- Optional session passwords prevent unauthorized access
- Passwords encrypted using ML-KEM asymmetric encryption for initial auth
- Failed authentication attempts result in connection termination

### 🛡️ Technical Implementation

1. **Client Connection**: Client connects to host WebSocket server
2. **Key Exchange**: ML-KEM-768 establishes quantum-secure shared secret
3. **Authentication**: Optional password verification using encrypted challenge/response
4. **Message Flow**: All messages wrapped in AES-256-GCM encryption using derived keys
5. **Message Routing**: Host decrypts, routes, and re-encrypts messages for recipients

**Unencrypted Messages** (handshake only):
- Connection establishment, key exchange, authentication challenges
- All chat content and user data is encrypted

## Usage

### Basic Commands

```bash
melq                           # Interactive menu
melq --host                    # Host a local network
melq --host --internet         # Host with internet access
melq --host --password mypass  # Host with password protection
melq --join melq://host:port   # Join a network
melq --update                  # Update to latest version
melq --help                    # Show all options
```

### Chat Interface

Once connected, MELQ provides a directory-like chat interface:

```bash
[node_abc12345] /$ ls                    # List available chats
[node_abc12345] /$ mkdir general         # Create new chat
[node_abc12345] /$ cd general           # Enter chat room
[node_abc12345] /general$ Hello world!  # Send message
[node_abc12345] /general$ /exit         # Leave chat
```

**Chat Commands:**
- `ls` - List chats with activity indicators  
- `mkdir <name>` - Create new chat room
- `cd <chat>` - Enter chat room
- `<message>` - Send message (in chat)
- `/exit` - Leave current chat
- `/help` - Show help
- `discover` - Find other users
- `nodes` - Show connected users

## Internet Connectivity

MELQ can automatically expose your chat to the internet using free tunneling services:

**Automatic Tunneling:**
- **localtunnel** (recommended): No account needed, instant setup
- **ngrok**: Requires account for persistent URLs
- **serveo**: Alternative free service
- **Manual**: Port forwarding setup

**Connection Sharing:**
```bash
📋 Connection Codes:
🏠 Local (same network): melq://192.168.1.100:3000
🌐 Internet (anywhere): melq://abc123.loca.lt

Share these codes so others can join!
```

## Password Protection

Secure your chat sessions with optional password protection:

```bash
# Create password-protected session
melq --host --password mysecret

# Users joining will be prompted:
🔒 Password Required
Enter password: _
```

**Security Features:**
- Passwords encrypted with ML-KEM before transmission
- Failed attempts terminate connection
- Host never prompted for their own password
- Works with both local and internet-exposed sessions

## Advanced Usage

### Multiple Instances
```bash
# Run multiple MELQ instances on different ports
melq --host --port 3001
melq --host --port 3002
```

### Scripted Hosting
```bash
# Automated hosting for scripts/services
melq --host --internet --password $CHAT_PASSWORD
```

### Development
```bash
# If installing from source instead of npm
git clone https://github.com/ecbaldwin4/melq.git
cd melq && npm install && npm link
```

## Requirements

- **Node.js**: 16.0.0 or higher
- **Network**: Local network or internet connection
- **Platform**: Windows, macOS, Linux

## Troubleshooting

**Permission denied (EACCES) during installation:**
```bash
# Quick fix:
sudo npm install -g melq

# Better fix (prevents future issues):
npm config set prefix ~/.local
echo 'export PATH=~/.local/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install -g melq
```

**Command not found after installation:**
```bash
# Restart terminal, then try running:
melq
# If still not found:
echo $PATH  # Check if npm global bin is in PATH
```

**Connection issues:**
- Check firewall settings for the host port
- Ensure internet connection for tunneling services
- Verify connection codes are copied correctly

## Contributing

MELQ is open source! Visit [github.com/ecbaldwin4/melq](https://github.com/ecbaldwin4/melq) for:
- Source code and development
- Bug reports and feature requests
- Contribution guidelines

## License

MIT License - see repository for details.

---

**Built with post-quantum security in mind.** 🔐