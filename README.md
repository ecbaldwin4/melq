# MELQ - Secure P2P Chat

A secure peer-to-peer chat system with a directory-like CLI interface. Uses ngrok as a coordination server, MLKEM for key exchange, and AES-256 for message encryption.

## Features

- **🔐 Quantum-Secure**: MLKEM-768 key exchange + AES-256 encryption
- **🌐 P2P Architecture**: Direct encrypted messaging between nodes
- **🗂️ Beautiful TUI**: Filesystem-like interface with emojis and colors
- **🚀 Multiple Connection Methods**: ngrok, localtunnel, serveo, or manual setup
- **💬 Real-time Chat**: WebSocket-based with typing indicators
- **📱 Responsive Design**: Adapts to different terminal sizes
- **⚡ Smart Discovery**: Automatic peer discovery and connection
- **🎨 Rich Interface**: Loading animations, status indicators, and intuitive commands

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Install ngrok (if not already installed):
   ```bash
   # Download from https://ngrok.com/download
   # Or use package managers:
   npm install -g ngrok
   # or
   brew install ngrok
   ```

## Usage

### 1. Start the Coordination Server

In one terminal:
```bash
npm run coordinator
```

This starts the coordination server on port 3000.

### 2. Expose Server with ngrok

In another terminal:
```bash
ngrok http 3000
```

Note the ngrok URL (e.g., `https://abc123.ngrok.io`)

### 3. Start Chat Clients

In separate terminals, start chat clients:
```bash
# Client 1
npm start -- --coordinator wss://abc123.ngrok.io/ws

# Client 2  
npm start -- --coordinator wss://abc123.ngrok.io/ws
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

## Example Session

```bash
# Start MELQ
npm start

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

## Security Features

- **MLKEM Key Exchange**: Post-quantum cryptographic key exchange
- **AES-256-GCM Encryption**: All messages encrypted end-to-end
- **Perfect Forward Secrecy**: Each session uses unique keys
- **No Plaintext Storage**: Messages only stored encrypted

## Architecture

- **Coordinator Server**: Central discovery service (runs on ngrok)
- **P2P Nodes**: Individual chat clients with encryption
- **CLI Interface**: Directory-like navigation for chats
- **Crypto Layer**: MLKEM + AES-256 for security

## Development

Run in development mode:
```bash
npm run dev
```

The system consists of:
- `src/coordinator.js` - Central coordination server
- `src/network/node.js` - P2P node implementation  
- `src/crypto/mlkem.js` - MLKEM key exchange
- `src/crypto/aes.js` - AES encryption
- `src/cli/interface.js` - CLI interface
- `src/index.js` - Main application

## Notes

- The MLKEM implementation is simplified for demonstration
- For production use, implement proper MLKEM-768/1024
- All traffic goes through ngrok coordinator for discovery
- Direct P2P connections are established after key exchange