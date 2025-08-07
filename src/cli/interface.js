import readline from 'readline';
import chalk from 'chalk';

export class CLIInterface {
  constructor(node) {
    this.node = node;
    this.node.cliInterface = this; // Set reference for prompt restoration
    this.currentPath = '/';
    this.currentChat = null;
    this.messages = new Map(); // chatId -> messages[]
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.getPrompt()
    });

    this.setupEventHandlers();
    this.setupNodeHandlers();
  }

  setupEventHandlers() {
    this.rl.on('line', (input) => {
      this.handleCommand(input.trim());
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
      this.currentPath = '/';
      this.currentChat = null;
    } else {
      // Remove trailing slash if present
      const cleanPath = path.replace(/\/$/, '');
      const chat = Array.from(this.node.chats.values()).find(c => c.name === cleanPath);
      if (chat) {
        this.currentPath = `/${cleanPath}`;
        this.currentChat = chat;
        console.log(chalk.green(`Entered chat: ${cleanPath}`));
        this.showChatHistory();
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

    const targets = Array.from(this.node.peerKeys.keys());
    if (targets.length === 0) {
      console.log(chalk.red('No peers available. Use "discover" to find other nodes.'));
      return;
    }

    targets.forEach(nodeId => {
      this.node.sendMessage(this.currentChat.id, message, nodeId);
    });

    const timestamp = new Date().toLocaleTimeString();
    console.log(chalk.green(`[${timestamp}] You: ${message}`));
    
    if (!this.messages.has(this.currentChat.id)) {
      this.messages.set(this.currentChat.id, []);
    }
    
    this.messages.get(this.currentChat.id).push({
      from: 'You',
      text: message,
      timestamp: Date.now()
    });
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
      console.log(`\n${chalk.blue(`[${timestamp}] ${fromNode}:`)} ${messageData.text}`);
      this.rl.prompt();
    } else {
      const chat = this.node.chats.get(messageData.chatId);
      const chatName = chat ? chat.name : messageData.chatId.slice(-8);
      console.log(`\n${chalk.magenta(`[New message in ${chatName}]`)} ${chalk.blue(fromNode)}: ${messageData.text}`);
      this.rl.prompt();
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
    console.log(chalk.green('╔══════════════════════════════════════╗'));
    console.log(chalk.green('║          MELQ - Secure P2P Chat      ║'));
    console.log(chalk.green('╚══════════════════════════════════════╝'));
    console.log(chalk.gray('Type "help" for available commands.'));
    console.log(chalk.gray('Use directory-like commands to navigate chats.\n'));
    
    this.rl.prompt();
  }
}