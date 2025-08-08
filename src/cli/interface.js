import readline from 'readline';
import chalk from 'chalk';

const CHAT_MODES = {
  DIRECTORY: 'directory',
  CHAT: 'chat'
};

export class CLIInterface {
  constructor(node) {
    this.node = node;
    this.node.cliInterface = this; // Set reference for prompt restoration
    this.currentPath = '/';
    this.currentChat = null;
    this.messages = new Map(); // chatId -> messages[]
    this.chatHeight = process.stdout.rows - 4; // Reserve space for input area
    this.logBuffer = []; // Buffer for messages that need to be shown
    this.isProcessingInput = false; // Flag to track input processing
    this.mode = CHAT_MODES.DIRECTORY; // Start in directory mode
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.getPrompt()
    });

    this.setupEventHandlers();
    this.setupNodeHandlers();
    this.setupScreenResize();
    this.startLogProcessor();
  }

  setupScreenResize() {
    process.stdout.on('resize', () => {
      this.chatHeight = process.stdout.rows - 4;
      if (this.mode === CHAT_MODES.CHAT && this.currentChat) {
        this.refreshChatDisplay();
      }
    });
  }

  // Synchronous logging system to prevent interrupting user input
  startLogProcessor() {
    setInterval(() => {
      this.processLogBuffer();
    }, 100); // Check every 100ms for pending logs
  }

  processLogBuffer() {
    if (this.logBuffer.length === 0 || this.isProcessingInput) {
      return; // Don't interrupt if user is typing or no logs pending
    }

    // Save current line
    const currentLine = this.rl.line;
    const cursorPos = this.rl.cursor;

    // Clear current input line
    this.rl.output.write('\r\x1b[K');

    // Display all buffered messages
    while (this.logBuffer.length > 0) {
      const logMessage = this.logBuffer.shift();
      console.log(logMessage);
    }

    // Restore the input line
    if (currentLine) {
      this.rl.output.write(this.rl.getPrompt() + currentLine);
      this.rl.cursor = cursorPos;
    } else {
      this.rl.prompt();
    }
  }

  // Thread-safe logging method
  log(message, color = null) {
    const formattedMessage = color ? color(message) : message;
    this.logBuffer.push(formattedMessage);
  }

  setupEventHandlers() {
    this.rl.on('line', (input) => {
      this.isProcessingInput = true;
      
      if (this.mode === CHAT_MODES.CHAT) {
        // Clear the input line before processing
        process.stdout.write('\r\x1b[K');
      }
      
      this.handleCommand(input.trim());
      this.isProcessingInput = false;
    });

    this.rl.on('close', () => {
      console.log('\nGoodbye!');
      this.node.disconnect();
      process.exit(0);
    });

    process.on('SIGINT', () => {
      this.rl.close();
    });
  }

  setupNodeHandlers() {
    this.node.onMessage((messageData) => {
      this.handleIncomingMessage(messageData);
    });
  }

  getPrompt() {
    const nodeInfo = chalk.green(`[${this.node.nodeId.slice(-8)}]`);
    const path = chalk.blue(this.currentPath);
    return `${nodeInfo} ${path}$ `;
  }

  updatePrompt() {
    this.rl.setPrompt(this.getPrompt());
  }

  handleCommand(input) {
    if (this.mode === CHAT_MODES.CHAT) {
      this.handleChatInput(input);
    } else {
      this.handleDirectoryCommand(input);
    }
  }

  handleChatInput(input) {
    const trimmedInput = input.trim();
    
    // Handle special commands in chat mode
    if (trimmedInput === '/exit' || trimmedInput === '/quit') {
      this.exitChat();
      return;
    }
    
    if (trimmedInput === '/help') {
      this.showChatHelp();
      this.rl.prompt();
      return;
    }
    
    if (trimmedInput === '/clear') {
      this.clearChatScreen();
      this.rl.prompt();
      return;
    }
    
    if (trimmedInput === '/discover') {
      this.node.discoverNodes();
      this.displaySystemMessage('Discovering nodes...');
      return;
    }
    
    if (trimmedInput === '') {
      this.rl.prompt();
      return;
    }
    
    // Send the message
    this.sendMessage(trimmedInput);
    this.rl.prompt();
  }

  handleDirectoryCommand(input) {
    const args = input.split(' ');
    const command = args[0];

    switch (command) {
      case 'ls':
        this.listContents();
        break;
      
      case 'cd':
        this.changeDirectory(args[1]);
        break;
      
      case 'mkdir':
        this.createChat(args.slice(1).join(' '));
        break;
      
      case 'say':
        this.sendMessage(args.slice(1).join(' '));
        break;
      
      case 'discover':
        this.node.discoverNodes();
        console.log('Discovering nodes...');
        break;
      
      case 'nodes':
        this.showNodes();
        break;
      
      case 'help':
        this.showHelp();
        break;
      
      case 'pwd':
        console.log(this.currentPath);
        break;
      
      case 'clear':
        console.clear();
        break;
      
      case 'history':
        this.showChatHistory();
        break;
      
      case '':
        break;
      
      default:
        console.log(chalk.red(`Command not found: ${command}`));
        console.log('Type "help" for available commands.');
    }

    this.rl.prompt();
  }

  listContents() {
    if (this.currentPath === '/') {
      console.log(chalk.yellow('Available chats:'));
      if (this.node.chats.size === 0) {
        console.log(chalk.gray('  (no chats available)'));
        console.log(chalk.gray('  Use "mkdir <chat_name>" to create a new chat'));
      } else {
        for (const [chatId, chat] of this.node.chats.entries()) {
          const messageCount = this.messages.get(chatId)?.length || 0;
          const unread = messageCount > 0 ? chalk.red(` (${messageCount})`) : '';
          console.log(chalk.cyan(`  ${chat.name}/`) + unread);
        }
      }
    } else {
      this.showChatHistory();
    }
  }

  changeDirectory(path) {
    if (!path) {
      console.log('Usage: cd <directory>');
      return;
    }

    if (path === '..' || path === '/') {
      if (this.mode === CHAT_MODES.CHAT) {
        this.exitChat();
        return;
      }
      this.currentPath = '/';
      this.currentChat = null;
      this.mode = CHAT_MODES.DIRECTORY;
    } else {
      // Remove trailing slash if present
      const cleanPath = path.replace(/\/$/, '');
      const chat = Array.from(this.node.chats.values()).find(c => c.name === cleanPath);
      if (chat) {
        this.enterChat(chat);
        return;
      } else {
        console.log(chalk.red(`Chat not found: ${path}`));
        console.log(chalk.gray('Available chats:'));
        if (this.node.chats.size === 0) {
          console.log(chalk.gray('  (no chats available)'));
        } else {
          for (const [chatId, chat] of this.node.chats.entries()) {
            console.log(chalk.cyan(`  ${chat.name}/`));
          }
        }
      }
    }

    this.updatePrompt();
  }

  createChat(chatName) {
    if (!chatName) {
      console.log('Usage: mkdir <chat_name>');
      return;
    }

    // Check if chat already exists
    const existingChat = Array.from(this.node.chats.values()).find(c => c.name === chatName);
    if (existingChat) {
      console.log(chalk.yellow(`Joining existing chat: ${chatName}`));
      this.node.joinChat(existingChat.id);
      return;
    }

    console.log(chalk.yellow(`Creating chat: ${chatName}`));
    console.log(chalk.gray(`Available chats before creation: ${Array.from(this.node.chats.values()).map(c => c.name).join(', ')}`));
    this.node.createChat(chatName);
  }

  sendMessage(message) {
    if (!this.currentChat) {
      console.log(chalk.red('You must be in a chat to send messages.'));
      console.log('Use "cd <chat_name>" to enter a chat.');
      return;
    }

    if (!message) {
      console.log('Usage: say <message>');
      return;
    }

    // Check if we have established key exchanges with other participants
    const peerCount = this.node.peerKeys.size;
    if (peerCount === 0) {
      if (this.mode === CHAT_MODES.CHAT) {
        this.displaySystemMessage('Waiting for peer discovery and key exchange...');
        this.displaySystemMessage('Use "/discover" if needed, or wait a moment for automatic setup.');
      } else {
        console.log(chalk.red('No peers available. Use "discover" to find other nodes.'));
      }
      return;
    }

    // Send message to the chat (let the server handle distribution to participants)
    if (this.node.sendChatMessage) {
      this.node.sendChatMessage(this.currentChat.id, message);
    } else {
      // Fallback for older API
      const targets = Array.from(this.node.peerKeys.keys());
      targets.forEach(nodeId => {
        this.node.sendMessage(this.currentChat.id, message, nodeId);
      });
    }

    const timestamp = new Date().toLocaleTimeString();
    
    if (!this.messages.has(this.currentChat.id)) {
      this.messages.set(this.currentChat.id, []);
    }
    
    this.messages.get(this.currentChat.id).push({
      from: 'You',
      text: message,
      timestamp: Date.now()
    });

    if (this.mode === CHAT_MODES.CHAT) {
      console.log(chalk.green(`  [${timestamp}] You: ${message}`));
      this.refreshChatDisplay();
    } else {
      console.log(chalk.green(`[${timestamp}] You: ${message}`));
    }
  }

  handleIncomingMessage(messageData) {
    const timestamp = new Date(messageData.timestamp).toLocaleTimeString();
    const fromNode = messageData.fromNodeId.slice(-8);

    if (!this.messages.has(messageData.chatId)) {
      this.messages.set(messageData.chatId, []);
    }

    this.messages.get(messageData.chatId).push({
      from: fromNode,
      text: messageData.text,
      timestamp: messageData.timestamp
    });

    if (this.currentChat && this.currentChat.id === messageData.chatId) {
      if (this.mode === CHAT_MODES.CHAT) {
        this.refreshChatDisplay();
        this.rl.prompt();
      } else {
        console.log(`\n${chalk.blue(`[${timestamp}] ${fromNode}:`)} ${messageData.text}`);
        this.rl.prompt();
      }
    } else {
      const chat = this.node.chats.get(messageData.chatId);
      const chatName = chat ? chat.name : messageData.chatId.slice(-8);
      this.log(`${chalk.magenta(`[New message in ${chatName}]`)} ${chalk.blue(fromNode)}: ${messageData.text}`);
    }
  }

  showChatHistory() {
    if (!this.currentChat) return;

    const chatMessages = this.messages.get(this.currentChat.id) || [];
    
    if (chatMessages.length === 0) {
      console.log(chalk.gray('No messages in this chat yet.'));
      return;
    }

    console.log(chalk.yellow(`--- Chat History for ${this.currentChat.name} ---`));
    chatMessages.forEach(msg => {
      const timestamp = new Date(msg.timestamp).toLocaleTimeString();
      const color = msg.from === 'You' ? chalk.green : chalk.blue;
      console.log(`${color(`[${timestamp}] ${msg.from}:`)} ${msg.text}`);
    });
    console.log(chalk.yellow('--- End of History ---'));
  }

  showNodes() {
    const peerCount = this.node.peerKeys.size;
    console.log(chalk.yellow(`Connected to ${peerCount} peer(s):`));
    
    if (peerCount === 0) {
      console.log(chalk.gray('  No peers connected. Use "discover" to find other nodes.'));
    } else {
      for (const nodeId of this.node.peerKeys.keys()) {
        console.log(chalk.cyan(`  ${nodeId}`));
      }
    }
  }

  enterChat(chat) {
    this.log(`[DEBUG] Entering chat: ${chat.name} (ID: ${chat.id})`, chalk.gray);
    this.currentPath = `/${chat.name}`;
    this.currentChat = chat;
    this.mode = CHAT_MODES.CHAT;
    
    // Automatically join the chat to ensure we receive messages
    if (this.node.joinChat) {
      this.node.joinChat(chat.id);
    }
    
    this.refreshChatDisplay();
    this.showInputArea();
    this.updatePrompt();
  }

  refreshChatDisplay() {
    if (!this.currentChat) return;
    
    console.clear();
    
    // Header
    const chatName = this.currentChat.name.toUpperCase();
    const totalWidth = Math.min(process.stdout.columns - 4, 80);
    const padding = Math.max(0, Math.floor((totalWidth - chatName.length - 6) / 2));
    const leftPadding = '═'.repeat(padding);
    const rightPadding = '═'.repeat(totalWidth - chatName.length - 6 - padding);
    
    console.log(chalk.green('╔' + '═'.repeat(totalWidth - 2) + '╗'));
    console.log(chalk.green('║' + ' '.repeat(totalWidth - 2) + '║'));
    console.log(chalk.green(`║${leftPadding}  ${chatName}  ${rightPadding}║`));
    console.log(chalk.green('║' + ' '.repeat(totalWidth - 2) + '║'));
    console.log(chalk.green('╚' + '═'.repeat(totalWidth - 2) + '╝'));
    
    // Chat messages area
    const chatMessages = this.messages.get(this.currentChat.id) || [];
    const displayMessages = chatMessages.slice(-this.chatHeight);
    
    if (displayMessages.length === 0) {
      console.log(chalk.gray('\n  No messages yet. Start the conversation!\n'));
    } else {
      console.log(); // Empty line after header
      displayMessages.forEach(msg => {
        const timestamp = new Date(msg.timestamp).toLocaleTimeString();
        if (msg.from === 'You') {
          console.log(chalk.green(`  [${timestamp}] You: ${msg.text}`));
        } else {
          console.log(chalk.blue(`  [${timestamp}] ${msg.from}: ${msg.text}`));
        }
      });
      console.log(); // Empty line before input
    }
  }

  showInputArea() {
    // Move cursor to bottom and show input area
    const inputLine = '─'.repeat(Math.min(process.stdout.columns - 4, 60));
    console.log(chalk.gray(inputLine));
    console.log(chalk.gray('Type your message (use /exit to leave, /help for help):'));
  }

  displaySystemMessage(message) {
    if (this.mode === CHAT_MODES.CHAT) {
      console.log(chalk.yellow(`  System: ${message}`));
      this.showInputArea();
    } else {
      console.log(chalk.yellow(message));
    }
  }

  exitChat() {
    this.currentPath = '/';
    this.currentChat = null;
    this.mode = CHAT_MODES.DIRECTORY;
    
    console.clear();
    console.log(chalk.yellow('Left chat. Back to directory mode.'));
    this.updatePrompt();
    this.rl.prompt();
  }

  clearChatScreen() {
    if (this.currentChat) {
      this.refreshChatDisplay();
    }
  }

  showChatHelp() {
    this.displaySystemMessage('Chat commands: /exit (leave chat), /help (this help), /clear (refresh screen), /discover (find peers)');
    this.displaySystemMessage('Just type your message and press Enter to send it!');
  }
  showHelp() {
    console.log(chalk.yellow('Available commands:'));
    console.log(chalk.cyan('  ls') + '           - List chats (or messages if in a chat)');
    console.log(chalk.cyan('  cd <chat>') + '    - Enter a chat directory');
    console.log(chalk.cyan('  cd ..') + '        - Go back to main directory');
    console.log(chalk.cyan('  mkdir <name>') + ' - Create a new chat');
    console.log(chalk.cyan('  say <message>') + ' - Send a message in current chat');
    console.log(chalk.cyan('  discover') + '     - Discover other nodes');
    console.log(chalk.cyan('  nodes') + '        - Show connected peers');
    console.log(chalk.cyan('  history') + '      - Show chat history');
    console.log(chalk.cyan('  pwd') + '          - Show current path');
    console.log(chalk.cyan('  clear') + '        - Clear screen');
    console.log(chalk.cyan('  help') + '         - Show this help');
    console.log(chalk.cyan('  Ctrl+C') + '       - Exit');
  }

  start() {
    // Force interface to start in directory mode
    this.mode = CHAT_MODES.DIRECTORY;
    this.currentChat = null;
    this.currentPath = '/';
    
    // Don't clear screen - preserves host connection info
    console.log('\n' + chalk.green('╔══════════════════════════════════════╗'));
    console.log(chalk.green('║          MELQ - Secure P2P Chat      ║'));
    console.log(chalk.green('╚══════════════════════════════════════╝'));
    console.log(chalk.gray('Type "help" for available commands.'));
    console.log(chalk.gray('Use directory-like commands to navigate chats.\n'));
    
    this.updatePrompt();
    this.rl.prompt();
  }
}