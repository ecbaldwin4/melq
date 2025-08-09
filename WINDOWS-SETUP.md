# MELQ for Windows - Setup Guide

## 📋 Requirements

Your friend needs:
1. **Windows 10/11** (any edition)
2. **Node.js** (free download from nodejs.org)
3. **The MELQ files** (this folder)

## 🚀 Quick Setup (5 minutes)

### Step 1: Install Node.js
1. Go to [https://nodejs.org](https://nodejs.org)
2. Download the **LTS version** (green button)
3. Run the installer with default settings
4. Restart computer if prompted

### Step 2: Setup MELQ
1. Open the MELQ folder you received
2. **Double-click** `setup-windows.bat`
3. Wait for installation to complete
4. Press any key when it says "Setup complete!"

### Step 3: Run MELQ
1. **Double-click** `run-windows.bat` to start MELQ
2. Choose option **2** to join a network
3. Enter the connection code you provide

## 🎯 Simple Usage

### To Join Your Network:
```
What would you like to do?
1. 🏠 Host a new network
2. 🔗 Join an existing network  ← Choose this
3. 🔍 Discover local networks
4. ❓ Help

Choose an option (1-4): 2
Connection code: [PASTE YOUR CODE HERE]
```

### Chat Commands:
- Type messages normally and press Enter
- `help` - Show all commands
- `ls` - See available chat rooms
- `cd room_name` - Enter a chat room
- `mkdir room_name` - Create new chat room
- **Ctrl+C** - Exit

## 🔧 Troubleshooting

### "Node.js not found"
- Install Node.js from nodejs.org
- Restart computer
- Try again

### "Failed to install dependencies"  
- Check internet connection
- Right-click `setup-windows.bat` → "Run as administrator"

### "Connection failed"
- Check the connection code is correct
- Make sure the host is running
- Try again in a few seconds

### Terminal looks weird
- Use **Windows Terminal** from Microsoft Store (optional, but prettier)
- Or use **PowerShell** instead of Command Prompt

## 📱 What Your Friend Will See

```
🔐 MELQ - Quantum-Secure P2P Chat
════════════════════════════════════════════════
           Connected as: abc12345
        Status: 🟢 Connected

📡 Connection Details:
──────────────────────────────────────────────────────
  📍 Connected to: your-connection-code
  🌐 Access: Internet
  🚇 Tunnel: ngrok
  👥 Network: 1 peers

💡 Type "help" for available commands or "ls" to see chats.
🗂️  Use directory-like commands to navigate: cd, ls, mkdir

[abc12345](1) /$ 
```

## 🎉 That's It!

Your friend can now:
- ✅ Join your secure chat network
- ✅ Create and join chat rooms  
- ✅ Send encrypted messages
- ✅ See who's online
- ✅ Use simple filesystem-like commands

The interface is designed to be intuitive even for non-technical users!