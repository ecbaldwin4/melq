# MELQ - Secure P2P Chat

A secure peer-to-peer chat system with a directory-like CLI interface. Uses ngrok as a coordination server, MLKEM for key exchange, and AES-256 for message encryption.

## Features

- **Secure Communication**: MLKEM key exchange + AES-256 encryption
- **P2P Architecture**: Direct encrypted messaging between nodes
- **Directory-like Interface**: Navigate chats like a Linux filesystem
- **Coordination Server**: Uses ngrok for node discovery
- **Real-time Messaging**: WebSocket-based communication

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

## Example Session

```bash
[node_abc12345] /$ ls
Available chats:
  (no chats available)
  Use "mkdir <chat_name>" to create a new chat

[node_abc12345] /$ discover
Discovering nodes...

[node_abc12345] /$ mkdir general
Creating chat: general

[node_abc12345] /$ cd general
Entered chat: general

[node_abc12345] /general$ say Hello everyone!
[10:30:25] You: Hello everyone!

[node_abc12345] /general$ ls
--- Chat History for general ---
[10:30:25] You: Hello everyone!
--- End of History ---
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