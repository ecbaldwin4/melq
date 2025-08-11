import readline from 'readline';
import chalk from 'chalk';
import logger from '../utils/async-logger.js';

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
    this.mode = CHAT_MODES.DIRECTORY;
    this.messages = new Map(); // chatId -> messages[]
    this.chatColorAssignments = new Map(); // chatId -> { username -> colorName }
    this.customNames = new Map(); // chatId -> custom name for "You"
    this.chatHeight = Math.max(10, process.stdout.rows - 6); // Reserve space for input area
    this.isConnecting = false;
    this.connectionStatus = 'disconnected';
    this.typingUsers = new Set();
    this.lastActivity = Date.now();
    this.statusInterval = null;
    this.spinnerFrame = 0;
    this.spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.connectionInfo = null; // Store connection details for display
    this.refreshTimeout = null; // Debounce rapid refreshes
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.getPrompt()
    });

    this.setupEventHandlers();
    this.setupNodeHandlers();
    this.setupScreenResize();
  }

  setupEventHandlers() {
    this.rl.on('line', (input) => {
      if (this.mode === CHAT_MODES.CHAT) {
        // Clear the input line before processing
        process.stdout.write('\r\x1b[K');
      }
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
      
      case 'pwd':
        console.log(this.currentPath);
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
      return;
    }

    if (!message || message.trim().length === 0) {
      return;
    }

    // Check message length
    if (message.length > 500) {
      this.displaySystemMessage('❌ Message too long (max 500 characters)');
      return;
    }

    const targets = Array.from(this.node.peerKeys.keys());
    if (targets.length === 0) {
      this.displaySystemMessage('⚠️  No peers connected. Attempting to discover...');
      this.node.discoverNodes();
      setTimeout(() => {
        if (this.node.peerKeys.size === 0) {
          this.displaySystemMessage('❌ Still no peers found. Use "/discover" or wait for others to connect.');
        }
      }, 3000);
      return;
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

      // Ensure "You" gets a color assignment in this chat
      this.getColorForUser(this.currentChat.id, 'You');

      // Refresh the chat display to show the new message
      this.refreshChatDisplay();
      this.showInputArea();
      
    } catch (error) {
      this.displaySystemMessage(`❌ Failed to send message: ${error.message}`);
    }
  }

  handleIncomingMessage(messageData) {
    const fromNode = messageData.fromNodeId.slice(-8);

    if (!this.messages.has(messageData.chatId)) {
      this.messages.set(messageData.chatId, []);
    }

    this.messages.get(messageData.chatId).push({
      from: fromNode,
      text: messageData.text,
      timestamp: messageData.timestamp
    });

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
        this.showInputArea();
        
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
    
    this.refreshChatDisplay();
    this.showInputArea();
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
    
    // More robust terminal clearing
    process.stdout.write('\x1b[2J\x1b[H'); // Clear entire screen and move cursor to top-left
    
    // Responsive header
    const terminalWidth = Math.min(process.stdout.columns || 80, 80);
    const chatName = this.currentChat.name.toUpperCase();
    const peerCount = this.node.peerKeys ? this.node.peerKeys.size : 0;
    const statusIcon = peerCount > 0 ? '🟢' : '🔴';
    const headerTitle = `${statusIcon} ${chatName} (${peerCount} peers)`;
    
    // Calculate padding for centered header
    const contentWidth = terminalWidth - 4;
    const padding = Math.max(0, Math.floor((contentWidth - headerTitle.length) / 2));
    const leftPadding = ' '.repeat(padding);
    const rightPadding = ' '.repeat(contentWidth - headerTitle.length - padding);
    
    // Beautiful gradient header
    console.log(chalk.cyan('╭' + '─'.repeat(terminalWidth - 2) + '╮'));
    console.log(chalk.cyan('│') + leftPadding + chalk.bold.white(headerTitle) + rightPadding + chalk.cyan('│'));
    console.log(chalk.cyan('╰' + '─'.repeat(terminalWidth - 2) + '╯'));
    
    // Chat messages area - ensure we have proper height calculation
    const availableHeight = Math.max(10, (process.stdout.rows || 25) - 8); // Header + input area
    const chatMessages = this.messages.get(this.currentChat.id) || [];
    const displayMessages = chatMessages.slice(-availableHeight);
    
    if (displayMessages.length === 0) {
      const emptyMsg = 'No messages yet. Start the conversation! 💬';
      const emptyPadding = Math.floor((terminalWidth - emptyMsg.length) / 2);
      console.log(chalk.gray('\n' + ' '.repeat(emptyPadding) + emptyMsg + '\n'));
    } else {
      console.log(); // Empty line after header
      displayMessages.forEach((msg, index) => {
        const timestamp = new Date(msg.timestamp).toLocaleTimeString('en-US', { 
          hour12: false, 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        
        const timeColor = chalk.dim.gray;
        const maxTextWidth = terminalWidth - 20; // Reserve space for timestamp and padding
        
        if (msg.from === 'You') {
          const msgText = this.wrapText(msg.text, maxTextWidth);
          const displayName = this.customNames.has(this.currentChat.id) 
            ? this.customNames.get(this.currentChat.id) 
            : 'You';
          console.log(chalk.green(`  ${timeColor(`[${timestamp}]`)} ${chalk.bold(displayName)}: ${msgText}`));
        } else {
          const msgText = this.wrapText(msg.text, maxTextWidth);
          const userColor = this.getColorForUser(this.currentChat.id, msg.from);
          console.log(`  ${timeColor(`[${timestamp}]`)} ${userColor(chalk.bold(msg.from))}: ${msgText}`);
        }
        
        // Add some spacing between message groups
        if (index < displayMessages.length - 1) {
          const nextMsg = displayMessages[index + 1];
          const timeDiff = nextMsg.timestamp - msg.timestamp;
          if (timeDiff > 60000) { // More than 1 minute gap
            console.log();
          }
        }
      });
      
      // Show typing indicators if any
      if (this.typingUsers.size > 0) {
        const typingList = Array.from(this.typingUsers).join(', ');
        console.log(chalk.dim.italic(`  ${typingList} ${this.typingUsers.size === 1 ? 'is' : 'are'} typing...`));
      }
      
      console.log(); // Empty line before input
    }
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

  showInputArea() {
    // Beautiful input area with responsive design
    const terminalWidth = Math.min(process.stdout.columns || 80, 80);
    const inputLine = '─'.repeat(terminalWidth - 2);
    
    console.log(chalk.dim.cyan('╭' + inputLine + '╮'));
    
    // Show helpful commands
    const commands = '/exit /help /clear /colors /name';
    const commandsText = `Commands: ${commands}`;
    const commandsPadding = Math.max(0, terminalWidth - commandsText.length - 4);
    const leftPad = Math.floor(commandsPadding / 2);
    const rightPad = commandsPadding - leftPad;
    
    console.log(chalk.dim.cyan('│') + ' '.repeat(leftPad) + chalk.dim.gray(commandsText) + ' '.repeat(rightPad) + chalk.dim.cyan('│'));
    console.log(chalk.dim.cyan('╰' + inputLine + '╯'));
  }

  displaySystemMessage(message) {
    if (this.mode === CHAT_MODES.CHAT) {
      logger.log(chalk.yellow(`  System: ${message}`));
      this.showInputArea();
    } else {
      logger.log(chalk.yellow(message));
    }
  }

  exitChat() {
    const chatName = this.currentChat ? this.currentChat.name : 'chat';
    
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
      this.showInputArea();
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
    
    this.customNames.set(this.currentChat.id, name);
    this.displaySystemMessage(`✅ Name set to "${name}" for this chat.`);
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
    
    this.displaySystemMessage('Current participants with their assigned colors:');
    for (const [username, colorFunc] of assignments.entries()) {
      let displayName = username;
      if (username === 'You' && this.customNames.has(this.currentChat.id)) {
        displayName = this.customNames.get(this.currentChat.id);
      }
      const coloredName = colorFunc(displayName);
      this.displaySystemMessage(`  ${coloredName}`);
    }
  }

  showChatHelp() {
    this.displaySystemMessage('Chat commands: /exit (leave chat), /help (this help), /clear (refresh screen)');
    this.displaySystemMessage('/colors (show participants), /name <name> (set custom name for this chat)');
    this.displaySystemMessage('Just type your message and press Enter to send it!');
    this.rl.prompt();
  }

  showHelp() {
    const terminalWidth = Math.min(process.stdout.columns || 80, 80);
    
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
    const terminalWidth = Math.min(process.stdout.columns || 80, 80);
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

  start() {
    this.showWelcomeBanner();
    this.rl.prompt();
  }
}