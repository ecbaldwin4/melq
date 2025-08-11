import readline from 'readline';
import chalk from 'chalk';
import logger from '../utils/async-logger.js';

const CHAT_MODES = {
  DIRECTORY: 'directory',
  CHAT: 'chat',
  ERROR: 'error',
  LOADING: 'loading'
};

const CONNECTION_STATUS = {
  CONNECTED: 'connected',
  CONNECTING: 'connecting', 
  DISCONNECTED: 'disconnected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
};

const UI_THEMES = {
  SUCCESS: { icon: '✅', color: chalk.green },
  ERROR: { icon: '❌', color: chalk.red },
  WARNING: { icon: '⚠️', color: chalk.yellow },
  INFO: { icon: 'ℹ️', color: chalk.blue },
  LOADING: { icon: '⏳', color: chalk.cyan },
  NETWORK: { icon: '🌐', color: chalk.magenta }
};

export class CLIInterface {
  constructor(node) {
    this.node = node;
    this.node.cliInterface = this; // Set reference for prompt restoration
    this.currentPath = '/';
    this.currentChat = null;
    this.mode = CHAT_MODES.DIRECTORY;
    this.messages = new Map(); // chatId -> messages[]
    this.chatColorAssignments = new Map(); // chatId -> { username -> colorName }
    this.customNames = new Map(); // chatId -> Map(nodeId -> custom name)
    this.maxMessagesPerChat = 100; // Maximum messages to keep per chat
    this.chatHeight = Math.max(10, process.stdout.rows - 6); // Reserve space for input area
    
    // Enhanced connection management
    this.connectionStatus = CONNECTION_STATUS.DISCONNECTED;
    this.connectionAttempts = 0;
    this.maxRetries = 3;
    this.lastError = null;
    this.isShuttingDown = false;
    
    // UI state management  
    this.isConnecting = false;
    this.lastActivity = Date.now();
    this.statusInterval = null;
    this.spinnerFrame = 0;
    this.spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.connectionInfo = null;
    this.refreshTimeout = null;
    
    // Error handling and recovery
    this.errorHistory = [];
    this.maxErrorHistory = 10;
    this.lastSuccessfulCommand = null;
    
    // Professional UI enhancements
    this.terminalWidth = process.stdout.columns || 80;
    this.notifications = [];
    this.maxNotifications = 5;
    // Enhanced readline with better error handling
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.getPrompt(),
      completer: this.completer.bind(this),
      history: []
    });
    
    // Set up comprehensive error handling
    this.setupErrorHandling();

    this.setupEventHandlers();
    this.setupNodeHandlers();
    this.setupScreenResize();
  }

  // ===============================
  // ERROR HANDLING & RECOVERY
  // ===============================
  
  setupErrorHandling() {
    // Handle uncaught exceptions gracefully
    process.on('uncaughtException', (error) => {
      this.handleCriticalError('System Error', error);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      this.handleCriticalError('Promise Rejection', new Error(reason));
    });
    
    // Handle readline errors
    this.rl.on('error', (error) => {
      this.logError('Input Error', error);
      this.showError('Input error occurred. Please try again.');
    });
  }
  
  handleCriticalError(type, error) {
    try {
      console.clear();
      this.showCriticalErrorScreen(type, error);
      
      // Attempt graceful shutdown
      setTimeout(() => {
        this.performEmergencyShutdown();
      }, 3000);
    } catch (shutdownError) {
      // Last resort
      console.error('CRITICAL ERROR:', error.message);
      process.exit(1);
    }
  }
  
  logError(type, error) {
    const errorEntry = {
      type,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      context: {
        mode: this.mode,
        currentChat: this.currentChat?.name,
        connectionStatus: this.connectionStatus
      }
    };
    
    this.errorHistory.push(errorEntry);
    if (this.errorHistory.length > this.maxErrorHistory) {
      this.errorHistory.shift();
    }
    
    this.lastError = errorEntry;
  }
  
  showCriticalErrorScreen(type, error) {
    const width = this.terminalWidth;
    const border = '═'.repeat(width - 2);
    
    console.log(chalk.red('╔' + border + '╗'));
    console.log(chalk.red('║') + chalk.bold.white(' '.repeat(Math.floor((width - 16) / 2)) + 'CRITICAL ERROR' + ' '.repeat(Math.ceil((width - 16) / 2))) + chalk.red('║'));
    console.log(chalk.red('╠' + border + '╣'));
    console.log(chalk.red('║') + ' '.repeat(width - 2) + chalk.red('║'));
    console.log(chalk.red('║') + chalk.yellow(` Type: ${type}`.padEnd(width - 3)) + chalk.red('║'));
    console.log(chalk.red('║') + chalk.white(` Error: ${error.message}`.padEnd(width - 3)) + chalk.red('║'));
    console.log(chalk.red('║') + ' '.repeat(width - 2) + chalk.red('║'));
    console.log(chalk.red('║') + chalk.dim(` Attempting graceful shutdown...`.padEnd(width - 3)) + chalk.red('║'));
    console.log(chalk.red('║') + chalk.dim(` Please wait 3 seconds...`.padEnd(width - 3)) + chalk.red('║'));
    console.log(chalk.red('║') + ' '.repeat(width - 2) + chalk.red('║'));
    console.log(chalk.red('╚' + border + '╝'));
  }
  
  performEmergencyShutdown() {
    try {
      // Exit alternative screen if in chat
      if (this.mode === CHAT_MODES.CHAT) {
        process.stdout.write('\x1b[?1049l');
      }
      
      // Disconnect node
      if (this.node) {
        this.node.disconnect();
      }
      
      console.log(chalk.red('\n🚫 Emergency shutdown completed.'));
      process.exit(1);
    } catch {
      process.exit(1);
    }
  }
  
  // ===============================
  // INPUT VALIDATION & COMPLETION
  // ===============================
  
  completer(line) {
    const commands = {
      [CHAT_MODES.DIRECTORY]: ['ls', 'cd', 'mkdir', 'discover', 'nodes', 'help', 'clear', 'connect', 'status'],
      [CHAT_MODES.CHAT]: ['/exit', '/help', '/clear', '/colors', '/name', '/status', '/reconnect']
    };
    
    const availableCommands = commands[this.mode] || [];
    const hits = availableCommands.filter(cmd => cmd.startsWith(line));
    return [hits.length ? hits : availableCommands, line];
  }
  
  validateInput(input, mode = this.mode) {
    try {
      if (!input || typeof input !== 'string') {
        return { valid: false, error: 'Invalid input type' };
      }
      
      const trimmed = input.trim();
      if (trimmed.length === 0) {
        return { valid: true, input: trimmed };
      }
      
      // Check for dangerous patterns
      const dangerousPatterns = [
        /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/, // Control characters
        /\x1b\[[0-9;]*[mGKH]/, // ANSI escape sequences
        /__[A-Z_]+__:/, // System message patterns
      ];
      
      for (const pattern of dangerousPatterns) {
        if (pattern.test(trimmed)) {
          return { valid: false, error: 'Input contains invalid characters' };
        }
      }
      
      // Mode-specific validation
      if (mode === CHAT_MODES.CHAT) {
        if (trimmed.length > 1000) {
          return { valid: false, error: 'Message too long (max 1000 characters)' };
        }
        
        if (trimmed.startsWith('/')) {
          const validChatCommands = ['/exit', '/help', '/clear', '/colors', '/name', '/status', '/reconnect'];
          const command = trimmed.split(' ')[0];
          if (!validChatCommands.includes(command)) {
            return { valid: false, error: `Unknown command: ${command}` };
          }
        }
      }
      
      return { valid: true, input: trimmed };
    } catch (error) {
      this.logError('Input Validation', error);
      return { valid: false, error: 'Input validation failed' };
    }
  }
  
  showError(message, details = null) {
    const theme = UI_THEMES.ERROR;
    const errorMessage = `${theme.icon} ${message}`;
    
    if (this.mode === CHAT_MODES.CHAT) {
      this.displaySystemMessage(theme.color(errorMessage), false);
      if (details) {
        this.displaySystemMessage(chalk.dim(`   Details: ${details}`), false);
      }
    } else {
      logger.log(theme.color(errorMessage));
      if (details) {
        logger.log(chalk.dim(`   Details: ${details}`));
      }
    }
  }
  
  showSuccess(message) {
    const theme = UI_THEMES.SUCCESS;
    const successMessage = `${theme.icon} ${message}`;
    
    if (this.mode === CHAT_MODES.CHAT) {
      this.displaySystemMessage(theme.color(successMessage));
    } else {
      logger.log(theme.color(successMessage));
    }
  }
  
  showWarning(message) {
    const theme = UI_THEMES.WARNING;
    const warningMessage = `${theme.icon} ${message}`;
    
    if (this.mode === CHAT_MODES.CHAT) {
      this.displaySystemMessage(theme.color(warningMessage));
    } else {
      logger.log(theme.color(warningMessage));
    }
  }

  setupEventHandlers() {
    this.rl.on('line', (input) => {
      try {
        if (this.mode === CHAT_MODES.CHAT) {
          // Clear the input line before processing
          process.stdout.write('\r\x1b[K');
        }
        
        // Validate input before processing
        const validation = this.validateInput(input);
        if (!validation.valid) {
          // If in chat mode with no peers, silently ignore invalid input to prevent spam
          if (this.mode === CHAT_MODES.CHAT && this.node.peerKeys && this.node.peerKeys.size === 0) {
            this.rl.prompt();
            return;
          }
          this.showError(validation.error);
          this.rl.prompt();
          return;
        }
        
        this.lastSuccessfulCommand = validation.input;
        this.handleCommand(validation.input);
      } catch (error) {
        this.logError('Command Processing', error);
        this.showError('An error occurred processing your command');
        this.rl.prompt();
      }
    });

    this.rl.on('close', () => {
      this.performGracefulShutdown();
    });

    process.on('SIGINT', () => {
      this.performGracefulShutdown();
    });
    
    // Handle terminal resize
    process.stdout.on('resize', () => {
      this.terminalWidth = process.stdout.columns || 80;
      this.chatHeight = Math.max(10, process.stdout.rows - 6);
      if (this.mode === CHAT_MODES.CHAT && this.currentChat) {
        this.debouncedRefresh();
      }
    });
  }
  
  performGracefulShutdown() {
    try {
      this.isShuttingDown = true;
      
      // Exit alternative screen buffer if we're in a chat
      if (this.mode === CHAT_MODES.CHAT) {
        process.stdout.write('\x1b[?1049l');
      }
      
      // Clear any intervals
      if (this.statusInterval) {
        clearInterval(this.statusInterval);
      }
      if (this.refreshTimeout) {
        clearTimeout(this.refreshTimeout);
      }
      
      // Show professional goodbye message
      console.clear();
      const width = Math.min(process.stdout.columns || 80, 100);
      const border = '═'.repeat(Math.max(0, width - 2));
      
      // Title line
      const title = 'GOODBYE!';
      const titlePadding = Math.max(0, Math.floor((width - title.length - 2) / 2));
      const titleLeft = ' '.repeat(titlePadding);
      const titleRight = ' '.repeat(Math.max(0, width - title.length - titlePadding - 2));
      
      // Message lines with proper padding
      const msg1 = '  Thank you for using MELQ - Quantum-Secure Chat';
      const msg2 = '  Your connection has been securely closed.';
      
      // Ensure messages fit and pad properly
      const msg1Padded = msg1.length < width - 2 ? msg1 + ' '.repeat(width - msg1.length - 2) : msg1.substring(0, width - 2);
      const msg2Padded = msg2.length < width - 2 ? msg2 + ' '.repeat(width - msg2.length - 2) : msg2.substring(0, width - 2);
      
      console.log(chalk.cyan('╔' + border + '╗'));
      console.log(chalk.cyan('║') + titleLeft + chalk.bold.white(title) + titleRight + chalk.cyan('║'));
      console.log(chalk.cyan('║') + ' '.repeat(Math.max(0, width - 2)) + chalk.cyan('║'));
      console.log(chalk.cyan('║') + chalk.dim(msg1Padded) + chalk.cyan('║'));
      console.log(chalk.cyan('║') + chalk.dim(msg2Padded) + chalk.cyan('║'));
      console.log(chalk.cyan('║') + ' '.repeat(Math.max(0, width - 2)) + chalk.cyan('║'));
      console.log(chalk.cyan('╚' + border + '╝'));
      
      // Disconnect node gracefully
      if (this.node && !this.isShuttingDown) {
        this.node.disconnect();
      }
      
      setTimeout(() => process.exit(0), 500);
    } catch (error) {
      console.log(chalk.yellow('\n👋 Goodbye!'));
      process.exit(0);
    }
  }

  setupScreenResize() {
    process.stdout.on('resize', () => {
      this.chatHeight = Math.max(10, process.stdout.rows - 6);
      if (this.mode === CHAT_MODES.CHAT && this.currentChat) {
        this.debouncedRefresh();
      }
    });
  }

  startSpinner(message = 'Connecting') {
    if (this.statusInterval) {
      this.stopSpinner();
    }
    
    this.isConnecting = true;
    this.statusInterval = setInterval(() => {
      const spinner = this.spinnerChars[this.spinnerFrame % this.spinnerChars.length];
      this.spinnerFrame++;
      
      // Clear current line and show spinner
      process.stdout.write(`\r${chalk.yellow(spinner + ' ' + message + '...')}`);
    }, 100);
  }

  stopSpinner(successMessage = null) {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
    
    this.isConnecting = false;
    
    // Clear the spinner line
    process.stdout.write('\r' + ' '.repeat(50) + '\r');
    
    if (successMessage) {
      logger.log(chalk.green('✅ ' + successMessage));
    }
  }

  setupNodeHandlers() {
    this.node.onMessage((messageData) => {
      this.handleIncomingMessage(messageData);
    });
  }

  // Method called by UnifiedNode.safeLog() for synchronous/asynchronous logging
  log(message, color = null) {
    // Use synchronous logging when in home menu mode to prevent prompt disruption
    if (this.mode === CHAT_MODES.DIRECTORY) {
      const output = color ? color(message) : message;
      console.log(output);
      // Re-prompt in home menu to keep interface clean
      if (this.rl) {
        this.rl.prompt();
      }
    } else {
      // Use async logger in chat mode to prevent display corruption
      const outputMessage = color ? color(message) : message;
      logger.log(outputMessage);
    }
  }

  getPrompt() {
    const nodeInfo = chalk.green(`[${this.node.nodeId.slice(-8)}]`);
    
    if (this.mode === CHAT_MODES.CHAT && this.currentChat) {
      const peerCount = this.node.peerKeys ? this.node.peerKeys.size : 0;
      const status = peerCount > 0 ? chalk.green('●') : chalk.red('●');
      return `${status} > `;
    } else {
      const path = chalk.blue(this.currentPath);
      const peerCount = this.node.peerKeys ? this.node.peerKeys.size : 0;
      const peerInfo = peerCount > 0 ? chalk.gray(`(${peerCount})`) : '';
      return `${nodeInfo}${peerInfo} ${path}$ `;
    }
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
    
    if (trimmedInput === '/colors') {
      this.showColorAssignments();
      this.rl.prompt();
      return;
    }
    
    if (trimmedInput.startsWith('/name ')) {
      this.setCustomName(trimmedInput.substring(6).trim());
      this.rl.prompt();
      return;
    }
    
    if (trimmedInput === '/name') {
      this.displaySystemMessage('Usage: /name <your_name>');
      this.displaySystemMessage('Set a custom name for this chat (max 25 characters)');
      this.rl.prompt();
      return;
    }
    
    if (trimmedInput === '') {
      this.rl.prompt();
      return;
    }
    
    // Send the message
    const messageSent = this.sendMessage(trimmedInput);
    
    // If no message was sent (no peers), refresh display to keep chat clean
    if (!messageSent && this.node.peerKeys && this.node.peerKeys.size === 0) {
      this.refreshChatDisplay();
    }
    
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
      
      case 'discover':
        this.startSpinner('Discovering peers');
        this.node.discoverNodes();
        setTimeout(() => {
          this.stopSpinner('Discovery request sent');
          this.rl.prompt();
        }, 2000);
        return;
      
      case 'nodes':
        this.showNodes();
        break;
      
      case 'help':
        this.showHelp();
        break;
      
      case 'clear':
        console.clear();
        break;
      
      case '':
        break;
      
      default:
        if (command) {
          logger.log(chalk.red(`❌ Command "${command}" not found.`));
          logger.log(chalk.dim.gray('💡 Type "help" to see available commands.'));
        }
    }

    this.rl.prompt();
  }

  listContents() {
    const terminalWidth = Math.min(process.stdout.columns || 80, 80);
    
    // Beautiful header for chat list
    console.log(chalk.bold.yellow('📁 Available Chats:'));
    console.log(chalk.dim('─'.repeat(terminalWidth - 2)));
    
    if (this.node.chats.size === 0) {
      const emptyIcon = '📭';
      console.log(chalk.dim.gray(`  ${emptyIcon} No chats available`));
      console.log(chalk.dim.gray('  💡 Use "mkdir <chat_name>" to create a new chat'));
    } else {
      for (const [chatId, chat] of this.node.chats.entries()) {
        const messageCount = this.messages.get(chatId)?.length || 0;
        const unreadBadge = messageCount > 0 ? chalk.bgRed.white(` ${messageCount} `) : '';
        const chatIcon = messageCount > 0 ? '💬' : '📁';
        const lastActivity = this.getLastActivity(chatId);
        
        console.log(`  ${chatIcon} ${chalk.cyan.bold(chat.name)} ${unreadBadge} ${chalk.dim.gray(lastActivity)}`);
      }
    }
    console.log();
  }
  
  getLastActivity(chatId) {
    const messages = this.messages.get(chatId);
    if (!messages || messages.length === 0) return '(empty)';
    
    const lastMessage = messages[messages.length - 1];
    const timeDiff = Date.now() - lastMessage.timestamp;
    
    if (timeDiff < 60000) return 'just now';
    if (timeDiff < 3600000) return `${Math.floor(timeDiff / 60000)}m ago`;
    if (timeDiff < 86400000) return `${Math.floor(timeDiff / 3600000)}h ago`;
    return `${Math.floor(timeDiff / 86400000)}d ago`;
  }

  changeDirectory(path) {
    if (!path) {
      console.log('Usage: cd <directory>');
      return;
    }

    if (path === '..' || path === '/') {
      this.exitChat();
    } else {
      // Remove trailing slash if present
      const cleanPath = path.replace(/\/$/, '');
      const chat = Array.from(this.node.chats.values()).find(c => c.name === cleanPath);
      if (chat) {
        this.enterChat(chat);
      } else {
        console.log(chalk.red(`❌ Chat "${path}" not found.`));
        console.log(chalk.yellow('📁 Available chats:'));
        if (this.node.chats.size === 0) {
          console.log(chalk.dim.gray('  📭 No chats available'));
          console.log(chalk.dim.gray('  💡 Use "mkdir <name>" to create a new chat'));
        } else {
          for (const [chatId, chat] of this.node.chats.entries()) {
            console.log(chalk.cyan(`  📁 ${chat.name}`));
          }
          console.log(chalk.dim.gray('  💡 Use "cd <chat_name>" to enter a chat'));
        }
      }
    }
  }

  createChat(chatName) {
    if (!chatName) {
      console.log(chalk.red('❌ Usage: mkdir <chat_name>'));
      console.log(chalk.dim.gray('💡 Example: mkdir general'));
      return;
    }

    // Validate chat name
    if (chatName.length > 20) {
      console.log(chalk.red('❌ Chat name too long (max 20 characters)'));
      return;
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(chatName)) {
      console.log(chalk.red('❌ Chat name can only contain letters, numbers, hyphens, and underscores'));
      return;
    }

    // Check if chat already exists
    const existingChat = Array.from(this.node.chats.values()).find(c => c.name === chatName);
    if (existingChat) {
      console.log(chalk.blue(`📁 Chat "${chatName}" already exists. Entering...`));
      this.enterChat(existingChat);
      return;
    }

    console.log(chalk.yellow(`🔨 Creating chat: "${chatName}"...`));
    
    try {
      this.node.createChat(chatName);
      console.log(chalk.green(`✅ Successfully created chat "${chatName}"`));
      console.log(chalk.dim.gray('💡 Use "cd ' + chatName + '" to enter the chat'));
    } catch (error) {
      console.log(chalk.red(`❌ Failed to create chat: ${error.message}`));
    }
  }

  sendMessage(message) {
    if (!this.currentChat) {
      this.displaySystemMessage('❌ You must be in a chat to send messages.');
      this.displaySystemMessage('💡 Use "cd <chat_name>" to enter a chat.');
      return false;
    }

    if (!message || message.trim().length === 0) {
      return false;
    }

    // Check message length
    if (message.length > 500) {
      this.displaySystemMessage('❌ Message too long (max 500 characters)');
      return false;
    }

    const targets = Array.from(this.node.peerKeys.keys());
    if (targets.length === 0) {
      // Don't add to chat history - just show temporary notification
      // The message was not sent, so don't store it anywhere
      return false;
    }

    try {
      // Send to peers
      targets.forEach(nodeId => {
        this.node.sendMessage(this.currentChat.id, message, nodeId);
      });

      // Add to local message history
      if (!this.messages.has(this.currentChat.id)) {
        this.messages.set(this.currentChat.id, []);
      }
      
      this.messages.get(this.currentChat.id).push({
        from: 'You',
        text: message.trim(),
        timestamp: Date.now()
      });

      // Enforce message limit for this chat
      this.enforceMessageLimit(this.currentChat.id);

      // Ensure "You" gets a color assignment in this chat
      this.getColorForUser(this.currentChat.id, 'You');

      // Refresh the chat display to show the new message
      this.refreshChatDisplay();
      
      return true; // Message was successfully sent
      
    } catch (error) {
      this.displaySystemMessage(`❌ Failed to send message: ${error.message}`);
      return false;
    }
  }

  handleIncomingMessage(messageData) {
    const fromNode = messageData.fromNodeId.slice(-8);

    // Check if this is a name change notification
    if (messageData.text && messageData.text.startsWith('__NAME_CHANGE__:')) {
      const customName = messageData.text.substring('__NAME_CHANGE__:'.length).trim();
      this.handleNameChange(messageData.chatId, fromNode, customName);
      return; // Don't add name change messages to chat history
    }

    if (!this.messages.has(messageData.chatId)) {
      this.messages.set(messageData.chatId, []);
    }

    this.messages.get(messageData.chatId).push({
      from: fromNode,
      text: messageData.text,
      timestamp: messageData.timestamp
    });

    // Enforce message limit for this chat
    this.enforceMessageLimit(messageData.chatId);

    // Ensure sender gets a color assignment in this chat
    this.getColorForUser(messageData.chatId, fromNode);

    // Only refresh display if we're in the same chat in chat mode
    if (this.mode === CHAT_MODES.CHAT && this.currentChat && this.currentChat.id === messageData.chatId) {
      // Preserve current input line and cursor position
      const currentInput = this.rl.line;
      const currentCursor = this.rl.cursor;
      
      // Use debounced refresh to prevent display corruption from rapid messages
      this.debouncedRefresh();
      
      // Small delay to let display refresh complete before restoring input
      setTimeout(() => {
        
        
        // Restore the input line and cursor position properly
        this.rl.line = currentInput;
        this.rl.cursor = currentCursor;
        
        // Clear the current line and rewrite with proper cursor position
        process.stdout.write('\r\x1b[K'); // Clear current line
        this.rl._refreshLine(); // Use readline's internal refresh method
      }, 60); // Slightly longer than debounce delay
    }
    // In directory mode, don't show any message notifications
  }


  showNodes() {
    const peerCount = this.node.peerKeys.size;
    const terminalWidth = Math.min(process.stdout.columns || 80, 80);
    
    console.log(chalk.bold.blue(`🌐 Network Status - Connected to ${peerCount} peer(s):`));
    console.log(chalk.dim('─'.repeat(terminalWidth - 2)));
    
    // Show connection info if available
    if (this.connectionInfo) {
      if (this.connectionInfo.isHost) {
        console.log(chalk.dim.gray(`  🏠 Role: ${chalk.green('Hosting')} this network`));
      }
      
      if (this.connectionInfo.connectionCode) {
        const displayCode = this.connectionInfo.connectionCode.length > 50 
          ? this.connectionInfo.connectionCode.substring(0, 47) + '...'
          : this.connectionInfo.connectionCode;
        console.log(chalk.dim.gray(`  📍 Network: ${chalk.white(displayCode)}`));
      }
    }
    
    if (peerCount === 0) {
      console.log(chalk.dim.gray('  🔍 No peers connected. Use "discover" to find other nodes.'));
      console.log(chalk.dim.gray('  🚀 Or share your connection code with others!'));
    } else {
      console.log();
      let index = 1;
      for (const nodeId of this.node.peerKeys.keys()) {
        const nodeShort = nodeId.slice(-8);
        const statusIcon = '🟢';
        console.log(`  ${statusIcon} ${chalk.cyan.bold(`Peer ${index}`)}: ${chalk.dim(nodeShort)}`);
        index++;
      }
    }
    console.log();
  }

  enterChat(chat) {
    this.currentPath = `/${chat.name}`;
    this.currentChat = chat;
    this.mode = CHAT_MODES.CHAT;
    
    // Enter alternative screen buffer to prevent scroll-up access to previous content
    process.stdout.write('\x1b[?1049h');
    
    this.refreshChatDisplay();
    
    this.updatePrompt();
  }

  // Debounced refresh to prevent rapid updates
  debouncedRefresh() {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }
    this.refreshTimeout = setTimeout(() => {
      this.refreshChatDisplay();
    }, 50); // 50ms debounce
  }

  refreshChatDisplay() {
    if (!this.currentChat) return;
    
    // Get actual terminal dimensions
    const terminalWidth = process.stdout.columns || 80;
    const terminalHeight = process.stdout.rows || 30;
    
    // Clear screen completely and ensure cursor is at top-left
    process.stdout.write('\x1b[2J');  // Clear entire screen
    process.stdout.write('\x1b[1;1H'); // Move cursor to row 1, column 1
    
    // Add a small buffer line to ensure header is visible at top
    console.log(''); // Empty line to push content down slightly
    
    // Create responsive chat header with commands
    this.drawChatHeader(terminalWidth);
    
    // Calculate available space for messages (header + footer)
    const headerHeight = 6; // Header has 6 lines: buffer line + ╔═══╗, ║title║, ║empty║, ║commands║, ╚═══╝
    const footerHeight = 1; // Input line
    const availableHeight = Math.max(5, terminalHeight - headerHeight - footerHeight);
    
    // Get messages to display (limit by actual rendered lines, not message count)
    const chatMessages = this.messages.get(this.currentChat.id) || [];
    const displayMessages = this.selectMessagesToFit(chatMessages, terminalWidth, availableHeight);
    
    // Display messages with proper formatting
    const renderedLines = this.drawChatMessages(displayMessages, terminalWidth, availableHeight);
    
    // Fill remaining space to prevent scrolling
    const remainingLines = availableHeight - renderedLines;
    if (remainingLines > 0) {
      console.log('\n'.repeat(remainingLines));
    }
  }
  
  drawChatHeader(terminalWidth) {
    const chatName = this.currentChat.name.toUpperCase();
    const peerCount = this.node.peerKeys ? this.node.peerKeys.size : 0;
    const statusIcon = peerCount > 0 ? '🟢' : '🔴';
    const headerTitle = `${statusIcon} ${chatName} (${peerCount} peers)`;
    const commands = '/exit /help /clear /colors /name';
    const commandsHint = `Commands: ${commands}`;
    
    // Use the same pattern as showWelcomeBanner for consistent rendering
    const banner = '═'.repeat(terminalWidth - 2);
    const titlePadding = Math.max(0, Math.floor((terminalWidth - headerTitle.length - 2) / 2));
    const cmdPadding = Math.max(0, Math.floor((terminalWidth - commandsHint.length - 2) / 2));

    console.log(chalk.cyan('╔' + banner + '╗'));
    console.log(chalk.cyan('║') + ' '.repeat(titlePadding) + chalk.bold.white(headerTitle) + ' '.repeat(terminalWidth - headerTitle.length - titlePadding - 2) + chalk.cyan('║'));
    console.log(chalk.cyan('║') + ' '.repeat(terminalWidth - 2) + chalk.cyan('║'));
    console.log(chalk.cyan('║') + ' '.repeat(cmdPadding) + chalk.dim.gray(commandsHint) + ' '.repeat(terminalWidth - commandsHint.length - cmdPadding - 2) + chalk.cyan('║'));
    console.log(chalk.cyan('╚' + banner + '╝'));
  }

  // Select messages that will fit in the available height without scrolling
  selectMessagesToFit(messages, terminalWidth, availableHeight) {
    if (messages.length === 0) return [];
    
    const timeStampWidth = 8; // [HH:MM]
    const nameMaxWidth = 15; // Reasonable max for display names
    const prefixWidth = timeStampWidth + nameMaxWidth + 6; // spacing and colons
    const maxTextWidth = Math.max(40, terminalWidth - prefixWidth);
    
    let totalLines = 1; // Start with 1 for the space after header
    const selectedMessages = [];
    
    // Go backwards through messages to fit as many as possible
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      
      // Calculate lines this message will take
      const wrappedText = this.wrapText(msg.text, maxTextWidth);
      const messageLines = wrappedText.split('\n').length;
      
      // Add spacing between message groups
      let spacingLines = 0;
      if (selectedMessages.length > 0) {
        const nextMsg = selectedMessages[0]; // Most recent selected message
        const timeDiff = nextMsg.timestamp - msg.timestamp;
        const differentUser = nextMsg.from !== msg.from;
        
        if (differentUser || timeDiff > 300000) { // 5 minutes
          spacingLines = 1;
        }
      }
      
      const neededLines = messageLines + spacingLines;
      
      // Check if this message will fit
      if (totalLines + neededLines <= availableHeight) {
        totalLines += neededLines;
        selectedMessages.unshift(msg); // Add to beginning to maintain order
      } else {
        break; // Can't fit more messages
      }
    }
    
    return selectedMessages;
  }

  
  // Helper function to get plain text length without ANSI codes and emojis
  getPlainTextLength(text) {
    // Remove ANSI escape sequences and emojis for accurate length calculation
    return text.replace(/\u001b\[[0-9;]*[mGKH]/g, '').replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, 'E').length;
  }
  
  // Legacy method (keeping for compatibility)
  getTextLength(text) {
    return this.getPlainTextLength(text);
  }
  
  drawChatMessages(displayMessages, terminalWidth, availableHeight) {
    if (displayMessages.length === 0) {
      // Show different message based on whether peers are connected
      const peerCount = this.node.peerKeys ? this.node.peerKeys.size : 0;
      let emptyMsg, subMsg;
      
      if (peerCount === 0) {
        emptyMsg = 'No messages yet. Waiting for peers to connect... 🔍';
        subMsg = 'Messages can\'t be sent until a peer connects to the chat.';
      } else {
        emptyMsg = 'No messages yet. Start the conversation! 💬';
        subMsg = null;
      }
      
      const emptyPadding = Math.max(0, Math.floor((terminalWidth - emptyMsg.length) / 2));
      let verticalPadding = Math.floor(availableHeight / 2) - 1;
      
      // Adjust vertical padding if we have a subtitle
      if (subMsg) {
        verticalPadding = Math.floor(availableHeight / 2) - 2;
      }
      
      console.log('\n'.repeat(Math.max(0, verticalPadding)));
      console.log(chalk.dim.gray(' '.repeat(emptyPadding) + emptyMsg));
      
      if (subMsg) {
        const subPadding = Math.max(0, Math.floor((terminalWidth - subMsg.length) / 2));
        console.log(chalk.dim.gray(' '.repeat(subPadding) + subMsg));
        console.log('\n'.repeat(Math.max(0, availableHeight - verticalPadding - 3)));
      } else {
        console.log('\n'.repeat(Math.max(0, availableHeight - verticalPadding - 2)));
      }
      
      return availableHeight; // Return total lines used
    }
    
    // Display messages with smart text wrapping
    console.log(); // Space after header
    let linesRendered = 1; // Count the space after header
    
    displayMessages.forEach((msg, index) => {
      const timestamp = new Date(msg.timestamp).toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      // Calculate available width for message text
      const timeStampWidth = 8; // [HH:MM] 
      const nameMaxWidth = 15; // Reasonable max for display names
      const prefixWidth = timeStampWidth + nameMaxWidth + 6; // spacing and colons
      const maxTextWidth = Math.max(40, terminalWidth - prefixWidth);
      
      const timeColor = chalk.dim.gray;
      
      let msgText;
      if (msg.from === 'System') {
        msgText = this.wrapText(msg.text, maxTextWidth);
        console.log(chalk.yellow(`  ${timeColor(`[${timestamp}]`)} ${chalk.bold('System')}: ${msgText}`));
      } else if (msg.from === 'You') {
        const displayName = this.getDisplayName(this.currentChat.id, 'You');
        msgText = this.wrapText(msg.text, maxTextWidth);
        console.log(chalk.green(`  ${timeColor(`[${timestamp}]`)} ${chalk.bold(displayName)}: ${msgText}`));
      } else {
        const displayName = this.getDisplayName(this.currentChat.id, msg.from);
        const userColor = this.getColorForUser(this.currentChat.id, displayName);
        msgText = this.wrapText(msg.text, maxTextWidth);
        console.log(`  ${timeColor(`[${timestamp}]`)} ${userColor(chalk.bold(displayName))}: ${msgText}`);
      }
      
      // Count lines for this message (wrapped text can be multiple lines)
      const messageLines = msgText.split('\n').length;
      linesRendered += messageLines;
      
      // Add spacing between message groups (different users or time gaps)
      if (index < displayMessages.length - 1) {
        const nextMsg = displayMessages[index + 1];
        const timeDiff = nextMsg.timestamp - msg.timestamp;
        const differentUser = nextMsg.from !== msg.from;
        
        if (timeDiff > 300000 || (differentUser && timeDiff > 60000)) { // 5 min gap or 1 min + different user
          console.log();
          linesRendered += 1; // Count the spacing line
        }
      }
    });
    
    return linesRendered;
  }
  
  wrapText(text, maxWidth) {
    if (text.length <= maxWidth) return text;
    
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    
    words.forEach(word => {
      if ((currentLine + word).length <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    });
    
    if (currentLine) lines.push(currentLine);
    return lines.join('\n    '); // Add indent for wrapped lines
  }
  
  getColorForUser(chatId, username) {
    // Get or assign a unique color for this user in this specific chat
    if (!this.chatColorAssignments.has(chatId)) {
      this.chatColorAssignments.set(chatId, new Map());
    }
    
    const chatAssignments = this.chatColorAssignments.get(chatId);
    
    if (chatAssignments.has(username)) {
      return chatAssignments.get(username);
    }
    
    // Available colors
    const availableColors = [
      chalk.blue,
      chalk.red, 
      chalk.green,
      chalk.yellow,
      chalk.magenta,
      chalk.cyan,
      chalk.hex('#FFA500'), // Orange
      chalk.hex('#9370DB'), // Purple
      chalk.hex('#FF69B4'), // Pink
      chalk.hex('#32CD32'), // Lime
      chalk.hex('#008080'), // Teal
      chalk.hex('#FFD700')  // Gold
    ];
    
    // Assign colors in order to ensure each person gets a different color
    const colorIndex = chatAssignments.size % availableColors.length;
    const selectedColor = availableColors[colorIndex];
    
    // Assign this color to the user in this chat
    chatAssignments.set(username, selectedColor);
    
    return selectedColor;
  }

  getUserColor(username) {
    // Use per-chat color assignment if we're in a chat
    if (this.currentChat) {
      return this.getColorForUser(this.currentChat.id, username);
    }
    
    // Original color system as fallback
    const colors = [
      chalk.blue, chalk.magenta, chalk.yellow, 
      chalk.cyan, chalk.red, chalk.green
    ];
    
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
  }


  // Helper method to check if we should store persistent messages
  shouldStorePersistentMessages() {
    return this.mode === CHAT_MODES.CHAT && 
           this.node.peerKeys && 
           this.node.peerKeys.size > 0;
  }

  displaySystemMessage(message, refresh = true) {
    if (this.mode === CHAT_MODES.CHAT) {
      // Only store messages if we have peers connected
      if (this.shouldStorePersistentMessages()) {
        // Add system message to chat and refresh display
        if (!this.messages.has(this.currentChat.id)) {
          this.messages.set(this.currentChat.id, []);
        }
        
        this.messages.get(this.currentChat.id).push({
          from: 'System',
          text: message,
          timestamp: Date.now()
        });
        
        if (refresh) {
          this.refreshChatDisplay();
        }
      }
      // If no peers, the message is ignored (not stored in history)
      // This keeps the chat clean when no one is connected
    } else {
      logger.log(chalk.yellow(message));
    }
  }

  exitChat() {
    const chatName = this.currentChat ? this.currentChat.name : 'chat';
    
    // Exit alternative screen buffer to return to main terminal
    process.stdout.write('\x1b[?1049l');
    
    this.currentPath = '/';
    this.currentChat = null;
    this.mode = CHAT_MODES.DIRECTORY;
    
    console.clear();
    
    // Show the full welcome banner when returning from a chat
    this.showWelcomeBanner();
    
    // Force synchronous display of exit message
    logger.sync('log', chalk.green(`✅ Left chat "${chatName}"`));
    logger.sync('log', '');
    
    this.updatePrompt();
    this.rl.prompt();
  }

  clearChatScreen() {
    if (this.currentChat) {
      this.refreshChatDisplay();
      
    }
  }

  setCustomName(name) {
    if (!this.currentChat) {
      this.displaySystemMessage('❌ You must be in a chat to set a name.');
      return;
    }
    
    if (!name || name.length === 0) {
      this.displaySystemMessage('❌ Name cannot be empty.');
      return;
    }
    
    if (name.length > 25) {
      this.displaySystemMessage('❌ Name too long (max 25 characters).');
      return;
    }
    
    // Basic validation - only allow letters, numbers, spaces, and common punctuation
    if (!/^[a-zA-Z0-9\s\-_.!?]+$/.test(name)) {
      this.displaySystemMessage('❌ Name contains invalid characters. Use letters, numbers, spaces, and basic punctuation only.');
      return;
    }
    
    // Store the name locally
    if (!this.customNames.has(this.currentChat.id)) {
      this.customNames.set(this.currentChat.id, new Map());
    }
    this.customNames.get(this.currentChat.id).set('You', name);
    
    // Broadcast name change to all participants
    this.broadcastNameChange(name);
    
    this.displaySystemMessage(`✅ Name set to "${name}" for this chat.`);
  }

  handleNameChange(chatId, fromNode, customName) {
    // Store the custom name for this user in this chat
    if (!this.customNames.has(chatId)) {
      this.customNames.set(chatId, new Map());
    }
    
    const chatNames = this.customNames.get(chatId);
    const previousName = chatNames.get(fromNode);
    chatNames.set(fromNode, customName);
    
    // Show notification if we're currently in this chat
    if (this.currentChat && this.currentChat.id === chatId) {
      if (previousName) {
        this.displaySystemMessage(`✨ ${previousName} is now known as ${customName}`);
      } else {
        this.displaySystemMessage(`✨ ${fromNode} is now known as ${customName}`);
      }
    }
  }

  getDisplayName(chatId, nodeId) {
    if (!this.customNames.has(chatId)) {
      return nodeId === 'You' ? 'You' : nodeId;
    }
    
    const chatNames = this.customNames.get(chatId);
    return chatNames.get(nodeId) || (nodeId === 'You' ? 'You' : nodeId);
  }

  enforceMessageLimit(chatId) {
    if (!this.messages.has(chatId)) return;
    
    const messages = this.messages.get(chatId);
    if (messages.length > this.maxMessagesPerChat) {
      // Remove oldest messages to stay within limit
      const messagesToRemove = messages.length - this.maxMessagesPerChat;
      messages.splice(0, messagesToRemove);
    }
  }

  broadcastNameChange(name) {
    if (!this.currentChat) return;
    
    const targets = Array.from(this.node.peerKeys.keys());
    if (targets.length === 0) return;
    
    try {
      // Send name change notification to all peers
      const nameChangeMessage = `__NAME_CHANGE__:${name}`;
      targets.forEach(nodeId => {
        this.node.sendMessage(this.currentChat.id, nameChangeMessage, nodeId);
      });
    } catch (error) {
      console.error('Failed to broadcast name change:', error);
    }
  }

  showColorAssignments() {
    if (!this.currentChat || !this.chatColorAssignments.has(this.currentChat.id)) {
      this.displaySystemMessage('No color assignments yet in this chat.');
      return;
    }
    
    const assignments = this.chatColorAssignments.get(this.currentChat.id);
    if (assignments.size === 0) {
      this.displaySystemMessage('No participants with assigned colors yet.');
      return;
    }
    
    this.displaySystemMessage('Current participants with their assigned colors:', false);
    for (const [username, colorFunc] of assignments.entries()) {
      const displayName = this.getDisplayName(this.currentChat.id, username);
      // Get color for display name to match message display
      const displayColor = this.getColorForUser(this.currentChat.id, displayName);
      const coloredName = displayColor(displayName);
      this.displaySystemMessage(`  ${coloredName}`, false);
    }
    // Refresh display to show all color assignments
    if (this.mode === CHAT_MODES.CHAT) {
      this.refreshChatDisplay();
    }
  }

  showChatHelp() {
    this.displaySystemMessage('Chat commands: /exit (leave chat), /help (this help), /clear (refresh screen)', false);
    this.displaySystemMessage('/colors (show participants), /name <name> (set custom name for this chat)', false);
    this.displaySystemMessage('Just type your message and press Enter to send it!', false);
    if (this.mode === CHAT_MODES.CHAT) {
      this.refreshChatDisplay();
    }
    this.rl.prompt();
  }

  showHelp() {
    const terminalWidth = process.stdout.columns || 80;
    
    console.log(chalk.bold.yellow('📖 MELQ Help & Commands'));
    console.log(chalk.dim('═'.repeat(terminalWidth - 2)));
    
    console.log(chalk.bold.cyan('\n🗂️  Navigation:'));
    console.log(chalk.cyan('  ls') + '              - ' + chalk.gray('List available chats with activity'));
    console.log(chalk.cyan('  cd <chat>') + '       - ' + chalk.gray('Enter a chat room'));
    
    console.log(chalk.bold.cyan('\n💬 Chat Management:'));
    console.log(chalk.cyan('  mkdir <name>') + '    - ' + chalk.gray('Create a new chat room'));
    console.log(chalk.cyan('  /exit') + '           - ' + chalk.gray('Leave current chat (when in chat mode)'));
    console.log(chalk.cyan('  /clear') + '          - ' + chalk.gray('Clear chat screen (when in chat mode)'));
    
    console.log(chalk.bold.cyan('\n🌐 Network:'));
    console.log(chalk.cyan('  discover') + '        - ' + chalk.gray('Find other MELQ nodes on network'));
    console.log(chalk.cyan('  nodes') + '           - ' + chalk.gray('Show connected peers and status'));
    
    console.log(chalk.bold.cyan('\n🔧 Utilities:'));
    console.log(chalk.cyan('  clear') + '           - ' + chalk.gray('Clear terminal screen'));
    console.log(chalk.cyan('  help') + '            - ' + chalk.gray('Show this help message'));
    console.log(chalk.cyan('  Ctrl+C') + '          - ' + chalk.gray('Exit MELQ'));
    
    console.log(chalk.dim('\n💡 Pro tip: Use filesystem-like commands to navigate chats!'));
    console.log();
  }

  setConnectionInfo(connectionInfo) {
    this.connectionInfo = connectionInfo;
  }

  showConnectionInfo() {
    if (!this.connectionInfo) return;
    
    const terminalWidth = Math.min(process.stdout.columns || 80, 80);
    console.log(chalk.blue('\n📡 Connection Details:'));
    console.log(chalk.dim('─'.repeat(terminalWidth - 2)));
    
    // Show hosting status if applicable
    if (this.connectionInfo.isHost) {
      console.log(chalk.dim.gray(`  🏠 Role: ${chalk.green('Hosting')} (you started this network)`));
      
      if (this.connectionInfo.hasInternet) {
        console.log(chalk.dim.gray(`  🌍 Access: ${chalk.white('Local + Internet')} (both connection codes active)`));
      } else {
        console.log(chalk.dim.gray(`  🏠 Access: ${chalk.white('Local Network Only')}`));
      }
    }
    
    // Show connection codes (local and internet if available)
    if (this.connectionInfo.localConnectionCode) {
      const displayCode = this.connectionInfo.localConnectionCode.length > 40 
        ? this.connectionInfo.localConnectionCode.substring(0, 37) + '...'
        : this.connectionInfo.localConnectionCode;
      console.log(chalk.dim.gray(`  🏠 Local: ${chalk.white(displayCode)}`));
    }
    
    if (this.connectionInfo.internetConnectionCode) {
      const displayCode = this.connectionInfo.internetConnectionCode.length > 40 
        ? this.connectionInfo.internetConnectionCode.substring(0, 37) + '...'
        : this.connectionInfo.internetConnectionCode;
      console.log(chalk.dim.gray(`  🌐 Internet: ${chalk.white(displayCode)}`));
    }
    
    // Fallback for older single connectionCode format
    if (this.connectionInfo.connectionCode && !this.connectionInfo.localConnectionCode && !this.connectionInfo.internetConnectionCode) {
      const displayCode = this.connectionInfo.connectionCode.length > 40 
        ? this.connectionInfo.connectionCode.substring(0, 37) + '...'
        : this.connectionInfo.connectionCode;
      console.log(chalk.dim.gray(`  📍 Connected to: ${chalk.white(displayCode)}`));
    }
    
    // Only show method for non-host connections (clients)
    if (this.connectionInfo.method && !this.connectionInfo.isHost) {
      const methodIcon = this.connectionInfo.method === 'local' ? '🏠' : '🌐';
      const methodText = this.connectionInfo.method === 'local' ? 'Local Network' : 
                        this.connectionInfo.method === 'internet' ? 'Internet' : 
                        this.connectionInfo.method;
      console.log(chalk.dim.gray(`  ${methodIcon} Access: ${chalk.white(methodText)}`));
    }
    
    if (this.connectionInfo.tunnelMethod && this.connectionInfo.tunnelMethod !== 'local') {
      const tunnelIcon = '🚇';
      console.log(chalk.dim.gray(`  ${tunnelIcon} Tunnel: ${chalk.white(this.connectionInfo.tunnelMethod)}`));
    }
    
    const peerCount = this.node.peerKeys ? this.node.peerKeys.size : 0;
    const peerStatus = peerCount > 0 ? chalk.green(`${peerCount} peers`) : chalk.yellow('No peers yet');
    console.log(chalk.dim.gray(`  👥 Network: ${peerStatus}`));
    console.log();
  }

  showWelcomeBanner() {
    const terminalWidth = process.stdout.columns || 80;
    const title = '🔐 MELQ - Quantum-Secure P2P Chat';
    const subtitle = 'Connected as: ' + this.node.nodeId.slice(-8);
    const peerCount = this.node.peerKeys ? this.node.peerKeys.size : 0;
    const status = `Status: ${peerCount > 0 ? '🟢 Connected' : '🔴 Waiting for peers'}`;
    
    // Create beautiful welcome banner
    const banner = '═'.repeat(terminalWidth - 2);
    const titlePadding = Math.max(0, Math.floor((terminalWidth - title.length - 2) / 2));
    const subtitlePadding = Math.max(0, Math.floor((terminalWidth - subtitle.length - 2) / 2));
    const statusPadding = Math.max(0, Math.floor((terminalWidth - status.length - 2) / 2));
    
    console.log(chalk.cyan('╔' + banner + '╗'));
    console.log(chalk.cyan('║') + ' '.repeat(titlePadding) + chalk.bold.white(title) + ' '.repeat(terminalWidth - title.length - titlePadding - 2) + chalk.cyan('║'));
    console.log(chalk.cyan('║') + ' '.repeat(terminalWidth - 2) + chalk.cyan('║'));
    console.log(chalk.cyan('║') + ' '.repeat(subtitlePadding) + chalk.dim.gray(subtitle) + ' '.repeat(terminalWidth - subtitle.length - subtitlePadding - 2) + chalk.cyan('║'));
    console.log(chalk.cyan('║') + ' '.repeat(statusPadding) + (peerCount > 0 ? chalk.green(status) : chalk.yellow(status)) + ' '.repeat(terminalWidth - status.length - statusPadding - 2) + chalk.cyan('║'));
    console.log(chalk.cyan('╚' + banner + '╝'));
    
    // Show connection info if available (client mode)
    this.showConnectionInfo();
    
    console.log(chalk.dim.gray('💡 Type "help" for available commands or "ls" to see chats.'));
    console.log(chalk.dim.gray('🗂️  Use directory-like commands to navigate: cd, ls, mkdir\n'));
  }
  
  centerText(text, width, colorFunc = null) {
    // Remove ANSI codes for length calculation
    const plainText = text.replace(/\u001b\[[0-9;]*m/g, '');
    const padding = Math.max(0, width - plainText.length);
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    
    const processedText = colorFunc ? colorFunc(plainText) : text;
    return ' '.repeat(leftPad) + processedText + ' '.repeat(rightPad);
  }
  
  getUptime() {
    const uptimeMs = Date.now() - this.lastActivity;
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  start() {
    this.lastActivity = Date.now(); // Set initial start time
    this.showWelcomeBanner();
    this.rl.prompt();
  }

  // ===============================
  // HOST SHUTDOWN & CONNECTION HANDLING
  // ===============================

  handleHostShutdown() {
    try {
      // Exit alternative screen if in chat mode
      if (this.mode === CHAT_MODES.CHAT) {
        process.stdout.write('\x1b[?1049l');
        this.mode = CHAT_MODES.DIRECTORY;
        this.currentChat = null;
      }

      // Clear all local data
      this.messages.clear();
      this.chatColorAssignments.clear();
      this.customNames.clear();
      
      // Update connection status
      this.connectionStatus = CONNECTION_STATUS.DISCONNECTED;
      
      console.clear();
      this.showHostShutdownScreen();
      
      // Return to main menu after delay
      setTimeout(() => {
        console.clear();
        this.showWelcomeBanner();
        this.updatePrompt();
        this.rl.prompt();
      }, 3000);
      
    } catch (error) {
      this.logError('Host Shutdown Handler', error);
      this.showError('Error handling host shutdown');
    }
  }

  showHostShutdownScreen() {
    const width = this.terminalWidth;
    const border = '═'.repeat(width - 2);
    
    console.log(chalk.red('╔' + border + '╗'));
    console.log(chalk.red('║') + chalk.bold.white(this.centerText('HOST DISCONNECTED', width - 2)) + chalk.red('║'));
    console.log(chalk.red('╠' + border + '╣'));
    console.log(chalk.red('║') + ' '.repeat(width - 2) + chalk.red('║'));
    console.log(chalk.red('║') + chalk.yellow('  📡 The host has shut down the network').padEnd(width - 1) + chalk.red('║'));
    console.log(chalk.red('║') + chalk.white('  🧹 All chat history has been cleared').padEnd(width - 1) + chalk.red('║'));
    console.log(chalk.red('║') + chalk.dim('  🔒 Your data remains secure and private').padEnd(width - 1) + chalk.red('║'));
    console.log(chalk.red('║') + ' '.repeat(width - 2) + chalk.red('║'));
    console.log(chalk.red('║') + chalk.cyan('  ⏳ Returning to main menu in 3 seconds...').padEnd(width - 1) + chalk.red('║'));
    console.log(chalk.red('║') + ' '.repeat(width - 2) + chalk.red('║'));
    console.log(chalk.red('╚' + border + '╝'));
  }

  handleConnectionLoss(code, reason) {
    this.connectionStatus = CONNECTION_STATUS.ERROR;
    this.lastError = { code, reason, timestamp: new Date().toISOString() };
    
    if (this.mode === CHAT_MODES.CHAT) {
      this.showError(`Connection lost (${code}). Attempting to reconnect...`);
      this.attemptReconnection();
    } else {
      this.showError(`Network connection lost (${code}): ${reason}`);
      console.log(chalk.yellow('💡 Use "connect" command to reconnect to a network'));
      this.rl.prompt();
    }
  }

  attemptReconnection() {
    if (this.connectionAttempts >= this.maxRetries) {
      this.showError('Maximum reconnection attempts reached. Returning to main menu.');
      this.exitChat();
      return;
    }

    this.connectionAttempts++;
    this.connectionStatus = CONNECTION_STATUS.RECONNECTING;
    
    this.showWarning(`Reconnection attempt ${this.connectionAttempts}/${this.maxRetries}...`);
    
    // Attempt to reconnect after a delay
    setTimeout(() => {
      try {
        // This would trigger the node to attempt reconnection
        if (this.node && this.node.coordinatorWs) {
          // Reset and attempt connection
          this.connectionStatus = CONNECTION_STATUS.CONNECTING;
          this.showWarning('Establishing connection...');
        }
      } catch (error) {
        this.logError('Reconnection Attempt', error);
        this.showError('Reconnection failed');
        this.exitChat();
      }
    }, 2000 * this.connectionAttempts); // Progressive delay
  }
}