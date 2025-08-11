import WebSocket, { WebSocketServer } from 'ws';
import Fastify from 'fastify';
import crypto from 'crypto';
import { networkInterfaces } from 'os';
import { MLKEM } from '../crypto/mlkem.js';
import { AESCrypto } from '../crypto/aes.js';
import { NetworkDiscovery } from './discovery.js';
import { TunnelingService, parseConnectionCode } from './tunneling.js';
import chalk from 'chalk';

const NODE_MODES = {
  HOST: 'host',
  CLIENT: 'client'
};

export class UnifiedNode {
  constructor() {
    this.nodeId = this.generateNodeId();
    this.mode = null;
    this.mlkem = new MLKEM();
    this.aesCrypto = new AESCrypto();
    this.keyPair = null;
    
    // Common properties
    this.peerKeys = new Map(); // nodeId -> shared secret
    this.chats = new Map(); // chatId -> chat info
    this.messageHandlers = new Map();
    this.cliInterface = null;
    
    // Host mode properties
    this.server = null;
    this.wss = null;
    this.connectedNodes = new Map(); // nodeId -> node info
    this.chatRooms = new Map(); // chatId -> room info
    this.chatHistory = new Map(); // chatId -> messages[]
    this.hostPort = null;
    
    // Client mode properties
    this.coordinatorWs = null;
    this.heartbeatInterval = null;
    
    // Discovery and tunneling
    this.discovery = new NetworkDiscovery();
    this.tunneling = new TunnelingService();
  }

  // Safe logging method that uses CLI interface if available
  safeLog(message, color = null) {
    if (this.cliInterface && this.cliInterface.log) {
      this.cliInterface.log(message, color);
    } else {
      // Fallback to console.log when CLI interface is not available
      const output = color ? color(message) : message;
      console.log(output);
    }
  }

  generateNodeId() {
    return `node_${crypto.randomBytes(8).toString('hex')}`;
  }

  async initialize() {
    console.log('Generating ML-KEM-768 keypair...');
    this.keyPair = await this.mlkem.generateKeyPair();
    console.log('✓ Post-quantum cryptographic keys generated');
  }

  // HOST MODE METHODS
  async startAsHost(port = 0, options = {}) {
    const { exposeToInternet = false, tunnelMethod = 'auto', customDomain } = options;
    console.log(chalk.gray(`🔧 Host options: exposeToInternet=${exposeToInternet}, tunnelMethod=${tunnelMethod}`));
    await this.initialize();
    this.mode = NODE_MODES.HOST;
    
    // Find available port if default port is in use (multi-node support)
    const requestedPort = port || 42045;
    const availablePort = await this.findAvailablePort(requestedPort, requestedPort + 50);
    
    if (!availablePort) {
      throw new Error(`No available ports found in range ${requestedPort}-${requestedPort + 50}. Please try a different port range.`);
    }
    
    if (availablePort !== requestedPort) {
      console.log(chalk.yellow(`🔄 Port ${requestedPort} is busy, using port ${availablePort} instead`));
    }
    
    // Use the found available port
    port = availablePort;
    
    // Create Fastify server
    this.server = Fastify({ logger: false });
    
    // Setup WebSocket server
    await this.server.register(async (fastify) => {
      this.wss = new WebSocketServer({ 
        server: fastify.server,
        path: '/ws'
      });
      
      this.wss.on('connection', (ws) => {
        this.handleHostConnection(ws);
      });
    });

    // Add health endpoint
    this.server.get('/health', async () => ({
      status: 'healthy',
      nodeId: this.nodeId,
      nodes: this.connectedNodes.size,
      chats: this.chatRooms.size,
      mode: 'host'
    }));

    // Start server
    const address = await this.server.listen({ 
      port, 
      host: '0.0.0.0' 
    });
    
    this.hostPort = this.server.server.address().port;
    const localIp = this.getLocalIP();
    
    const localConnectionCode = `melq://${localIp}:${this.hostPort}`;
    let internetConnectionCode = null;
    let internetUrl = null;
    
    console.log(`🏠 MELQ server started on ${localIp}:${this.hostPort}`);
    console.log(`🔗 Local connection code: ${localConnectionCode}`);
    
    // Start advertising this network for local discovery
    try {
      await this.discovery.startAdvertising({
        nodeId: this.nodeId,
        port: this.hostPort
      });
      console.log(chalk.gray('✓ Local network discovery active'));
    } catch (error) {
      console.log(chalk.gray('Network discovery advertising failed (this is OK):'), error.message);
    }
    
    // Expose to internet if requested
    if (exposeToInternet) {
      try {
        console.log(chalk.yellow(`🌐 Setting up internet access with ${tunnelMethod} tunnel for port ${this.hostPort}...`));
        const internetInfo = await this.tunneling.exposeToInternet(this.hostPort, {
          preferredMethod: tunnelMethod,
          customDomain
        });
        
        if (internetInfo) {
          internetConnectionCode = internetInfo.connectionCode;
          internetUrl = internetInfo.publicUrl;
          
          console.log(chalk.green('\n🌐 Network exposed to internet!'));
          console.log(chalk.blue(`📡 Internet connection code: ${internetConnectionCode}`));
          
          if (internetInfo.requiresPortForwarding) {
            console.log(chalk.yellow('⚠️  Port forwarding required on your router'));
          }
        }
      } catch (error) {
        console.log(chalk.yellow('⚠️  Failed to expose to internet:'), error.message);
        console.log(chalk.gray('Network is still available locally'));
      }
    }
    
    return {
      port: this.hostPort,
      ip: localIp,
      localConnectionCode,
      internetConnectionCode,
      internetUrl,
      hasInternet: !!internetConnectionCode
    };
  }

  handleHostConnection(ws) {
    this.safeLog('Node connected to hosted network');
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleHostMessage(ws, message);
      } catch (error) {
        this.safeLog(`Invalid message: ${error.message}`, chalk.red);
      }
    });

    ws.on('close', () => {
      const nodeId = this.getNodeIdBySocket(ws);
      if (nodeId) {
        this.connectedNodes.delete(nodeId);
        this.peerKeys.delete(nodeId);
        this.safeLog(`Node ${nodeId} disconnected`);
        
        // Notify CLI interface to update UI
        if (this.cliInterface) {
          this.cliInterface.updatePrompt();
        }
      }
    });
  }

  handleHostMessage(ws, message) {
    switch (message.type) {
      case 'register':
        if (ws) {
          this.connectedNodes.set(message.nodeId, {
            socket: ws,
            publicKey: message.publicKey,
            address: message.address,
            timestamp: Date.now()
          });
          ws.send(JSON.stringify({ type: 'registered', nodeId: message.nodeId }));
        }
        break;

      case 'discover_nodes':
        const nodeList = Array.from(this.connectedNodes.entries())
          .filter(([id]) => id !== message.nodeId)
          .map(([id, node]) => ({
            nodeId: id,
            publicKey: node.publicKey,
            address: node.address
          }));
        
        if (ws) {
          ws.send(JSON.stringify({ type: 'node_list', nodes: nodeList }));
        } else {
          // Internal call - handle directly
          this.handleNodeList(nodeList);
        }
        break;

      case 'get_chats':
        const availableChats = Array.from(this.chatRooms.entries()).map(([chatId, chat]) => ({
          chatId,
          chatName: chat.name,
          creator: chat.creator,
          participants: chat.participants
        }));
        
        if (ws) {
          ws.send(JSON.stringify({ type: 'chat_list', chats: availableChats }));
        } else {
          // Internal call - handle directly
          this.handleChatList(availableChats);
        }
        break;

      case 'create_chat':
        const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.chatRooms.set(chatId, {
          creator: message.nodeId,
          name: message.chatName,
          participants: [message.nodeId],
          created: Date.now()
        });
        
        // Add to local chats
        this.chats.set(chatId, {
          id: chatId,
          name: message.chatName,
          participants: [message.nodeId]
        });
        
        if (ws) {
          ws.send(JSON.stringify({ type: 'chat_created', chatId, chatName: message.chatName }));
          this.broadcastToAllNodes({ 
            type: 'chat_available', 
            chatId, 
            chatName: message.chatName, 
            creator: message.nodeId 
          }, message.nodeId);
        } else {
          // Internal call - notify CLI directly
          this.safeLog(`Chat created: ${message.chatName} (ID: ${chatId})`, chalk.yellow);
          if (this.cliInterface) this.cliInterface.rl.prompt();
        }
        break;

      case 'join_chat':
        const chat = this.chatRooms.get(message.chatId);
        if (chat && !chat.participants.includes(message.nodeId)) {
          chat.participants.push(message.nodeId);
          
          // Send chat history to the new participant
          this.sendChatHistoryToParticipant(message.nodeId, message.chatId);
          
          // Notify other participants
          this.broadcastToChatParticipants(message.chatId, {
            type: 'user_joined',
            chatId: message.chatId,
            nodeId: message.nodeId
          }, message.nodeId);
          
          // Ensure the new participant can communicate with existing participants
          this.ensureKeyExchangesForNewParticipant(message.chatId, message.nodeId);
        }
        break;

      case 'send_chat_message':
        this.handleChatMessage(message);
        break;

      case 'relay_message':
        this.relayEncryptedMessage(message);
        break;

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
    }
  }

  async handleChatMessage(message) {
    const chat = this.chatRooms.get(message.chatId);
    if (!chat) {
      this.safeLog(`Chat not found: ${message.chatId}`, chalk.red);
      return;
    }

    // Create message data
    const messageData = {
      chatId: message.chatId,
      text: message.messageText,
      timestamp: message.timestamp,
      fromNodeId: message.nodeId,
      senderAlias: message.nodeId.slice(-8)
    };

    // Store message in chat history
    if (!this.chatHistory.has(message.chatId)) {
      this.chatHistory.set(message.chatId, []);
    }
    this.chatHistory.get(message.chatId).push(messageData);

    // Ensure all participants have key exchanges with the sender
    await this.ensureKeyExchangesForChat(message.chatId, message.nodeId);

    // Send encrypted message to each participant
    for (const participantId of chat.participants) {
      if (participantId !== message.nodeId) { // Don't send to sender
        const participantNode = this.connectedNodes.get(participantId);
        if (participantNode && participantNode.socket.readyState === WebSocket.OPEN) {
          // Check if we have a shared key with this participant
          if (this.peerKeys.has(participantId)) {
            const sharedSecret = this.peerKeys.get(participantId);
            const encryptionKey = this.aesCrypto.deriveKeyFromSharedSecret(sharedSecret);
            const encryptedData = this.aesCrypto.encrypt(JSON.stringify(messageData), encryptionKey);

            // Send encrypted message directly to participant
            participantNode.socket.send(JSON.stringify({
              type: 'encrypted_message',
              fromNodeId: message.nodeId,
              chatId: message.chatId,
              encryptedData: encryptedData,
              timestamp: message.timestamp
            }));
          } else {
            this.safeLog(`No shared key with participant ${participantId}, initiating key exchange...`, chalk.yellow);
            // Try to initiate key exchange
            await this.initiateKeyExchangeWithParticipant(participantId);
          }
        } else {
          this.safeLog(`Participant ${participantId} not connected`, chalk.gray);
        }
      }
    }

    // If the sender is the host, handle the message locally
    if (message.nodeId === this.nodeId && this.messageHandlers.has('message')) {
      this.messageHandlers.get('message')(messageData);
    }
  }

  async ensureKeyExchangesForChat(chatId, senderId) {
    const chat = this.chatRooms.get(chatId);
    if (!chat) return;

    // Ensure sender has key exchanges with all other participants
    for (const participantId of chat.participants) {
      if (participantId !== senderId) {
        const senderNode = this.connectedNodes.get(senderId);
        const participantNode = this.connectedNodes.get(participantId);
        
        if (senderNode && participantNode) {
          // Check if sender has key exchange with participant (from sender's perspective)
          if (!this.peerKeys.has(participantId) || this.peerKeys.get(participantId) === 'pending') {
            this.safeLog(`Ensuring key exchange between ${senderId.slice(-8)} and ${participantId.slice(-8)}`, chalk.cyan);
            await this.facilitateKeyExchange(senderId, participantId);
          }
        }
      }
    }
  }

  async facilitateKeyExchange(nodeId1, nodeId2) {
    // Check if key exchange already exists
    const keyId = `${nodeId1}-${nodeId2}`;
    const reverseKeyId = `${nodeId2}-${nodeId1}`;
    
    if (this.peerKeys.has(keyId) || this.peerKeys.has(reverseKeyId)) {
      this.safeLog(`Key exchange already exists between ${nodeId1.slice(-8)} and ${nodeId2.slice(-8)}`, chalk.gray);
      return;
    }
    
    // Get node info
    const node1 = this.connectedNodes.get(nodeId1);
    const node2 = this.connectedNodes.get(nodeId2);
    
    if (node1 && node2) {
      this.safeLog(`Facilitating key exchange between ${nodeId1.slice(-8)} and ${nodeId2.slice(-8)}`, chalk.cyan);
      
      // Send each node the other's public key for key exchange
      node1.socket.send(JSON.stringify({
        type: 'peer_info',
        nodeId: nodeId2,
        publicKey: node2.publicKey,
        address: node2.address
      }));
      
      node2.socket.send(JSON.stringify({
        type: 'peer_info', 
        nodeId: nodeId1,
        publicKey: node1.publicKey,
        address: node1.address
      }));
      
      // Mark that we initiated this exchange to prevent duplicates
      this.peerKeys.set(keyId, 'pending');
    }
  }

  async initiateKeyExchangeWithParticipant(participantId) {
    const participantNode = this.connectedNodes.get(participantId);
    if (participantNode && !this.peerKeys.has(participantId)) {
      try {
        await this.initiateKeyExchange({
          nodeId: participantId,
          publicKey: participantNode.publicKey,
          address: participantNode.address
        });
      } catch (error) {
        this.safeLog(`Key exchange failed with ${participantId}: ${error.message}`, chalk.red);
      }
    }
  }

  sendChatHistoryToParticipant(participantId, chatId) {
    const participantNode = this.connectedNodes.get(participantId);
    const chatHistory = this.chatHistory.get(chatId) || [];
    
    if (participantNode && participantNode.socket.readyState === WebSocket.OPEN) {
      participantNode.socket.send(JSON.stringify({
        type: 'chat_history',
        chatId: chatId,
        messages: chatHistory
      }));
    }
  }

  async ensureKeyExchangesForNewParticipant(chatId, newParticipantId) {
    const chat = this.chatRooms.get(chatId);
    if (!chat) return;

    // Set up key exchanges between new participant and all existing participants
    for (const existingParticipantId of chat.participants) {
      if (existingParticipantId !== newParticipantId) {
        await this.facilitateKeyExchange(newParticipantId, existingParticipantId);
      }
    }
  }

  // CLIENT MODE METHODS
  async joinNetwork(connectionCode) {
    await this.initialize();
    this.mode = NODE_MODES.CLIENT;
    
    let coordinatorUrl;
    try {
      coordinatorUrl = parseConnectionCode(connectionCode);
    } catch (error) {
      throw new Error(`Invalid connection code: ${error.message}`);
    }
    
    return new Promise((resolve, reject) => {
      // Add headers for ngrok-free.app compatibility
      const wsOptions = {
        headers: {
          'User-Agent': 'MELQ-P2P-Client/1.0.0'
        }
      };
      
      // Handle ngrok-free.app warning bypass
      if (coordinatorUrl.includes('.ngrok-free.app')) {
        wsOptions.headers['ngrok-skip-browser-warning'] = 'true';
      }
      
      this.coordinatorWs = new WebSocket(coordinatorUrl, wsOptions);

      this.coordinatorWs.on('open', async () => {
        console.log(`📡 Joined network: ${coordinatorUrl}`);
        this.startHeartbeat();
        
        try {
          // Wait for registration to complete before auto-discovery
          await this.register();
          this.safeLog('✅ Registration completed', chalk.green);
          
          // Now immediately discover peers and get chats
          await this.discoverNodes();
          await this.getChats();
          
          this.safeLog('✅ Auto-discovery completed', chalk.green);
        } catch (error) {
          this.safeLog(`Auto-discovery failed: ${error.message}`, chalk.red);
        }
        
        resolve();
      });

      this.coordinatorWs.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(message);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      });

      this.coordinatorWs.on('close', (code, reason) => {
        this.handleHostDisconnection(code, reason);
      });

      this.coordinatorWs.on('error', (error) => {
        console.error('Connection error:', error);
        console.error(`Attempted connection to: ${coordinatorUrl}`);
        
        // Provide more helpful error messages
        if (error.message.includes('400')) {
          console.error('\\n🔍 HTTP 400 Error - This usually means:');
          console.error('• The host is not running MELQ (most likely)');
          console.error('• The ngrok tunnel points to wrong port');
          console.error('• The host is running something else on that port');
          console.error('• WebSocket upgrade failed');
        }
        
        if (coordinatorUrl.includes('.ngrok-free.app')) {
          console.error('\\n💡 For ngrok-free.app, ask the host to:');
          console.error('1. Confirm they ran: melq --host --internet');
          console.error('2. Share the exact URL shown by MELQ');
          console.error('3. Ensure ngrok is forwarding to the MELQ port');
        }
        
        reject(error);
      });
    });
  }


  handleClientMessage(message) {
    switch (message.type) {
      case 'registered':
        this.safeLog(`Registered in network as ${message.nodeId}`, chalk.green);
        
        // Resolve registration promise if waiting
        if (this.registrationResolver) {
          clearTimeout(this.registrationTimeout);
          this.registrationResolver();
          this.registrationResolver = null;
        }
        
        if (this.cliInterface) this.cliInterface.rl.prompt();
        break;

      case 'node_list':
        // Resolve discovery promise if waiting
        if (this.discoveryResolver) {
          clearTimeout(this.discoveryTimeout);
          this.discoveryResolver();
          this.discoveryResolver = null;
        }
        
        this.handleNodeList(message.nodes);
        break;

      case 'chat_created':
        this.safeLog(`Chat created: ${message.chatName}`, chalk.yellow);
        this.chats.set(message.chatId, {
          id: message.chatId,
          name: message.chatName,
          participants: [this.nodeId]
        });
        if (this.cliInterface) this.cliInterface.rl.prompt();
        break;

      case 'chat_available':
        this.safeLog(`New chat available: ${message.chatName}`, chalk.yellow);
        this.chats.set(message.chatId, {
          id: message.chatId,
          name: message.chatName,
          participants: [message.creator]
        });
        if (this.cliInterface) this.cliInterface.rl.prompt();
        break;

      case 'user_joined':
        const chatName = this.chats.get(message.chatId)?.name || 'Unknown Chat';
        this.safeLog(`${message.nodeId.slice(-8)} joined chat: ${chatName}`, chalk.green);
        if (this.cliInterface) this.cliInterface.rl.prompt();
        break;

      case 'encrypted_message':
        this.handleEncryptedMessage(message);
        break;

      case 'key_exchange_request':
        this.handleKeyExchangeRequest(message).catch(console.error);
        break;

      case 'key_exchange_response':
        this.handleKeyExchangeResponse(message);
        break;

      case 'chat_list':
        // Resolve chat list promise if waiting
        if (this.chatListResolver) {
          clearTimeout(this.chatListTimeout);
          this.chatListResolver();
          this.chatListResolver = null;
        }
        
        this.handleChatList(message.chats);
        break;

      case 'peer_info':
        // Received peer info for key exchange
        this.handlePeerInfo(message);
        break;

      case 'chat_history':
        // Received chat history when joining a chat
        this.handleChatHistory(message);
        break;

      case 'pong':
        // Heartbeat response - no action needed
        break;

      default:
        console.log(`Unknown message type: ${message.type}`, message);
    }
  }

  // COMMON METHODS (used by both host and client modes)
  send(message) {
    if (this.mode === NODE_MODES.HOST) {
      // In host mode, handle messages directly
      this.handleHostMessage(null, message);
    } else if (this.coordinatorWs && this.coordinatorWs.readyState === WebSocket.OPEN) {
      this.coordinatorWs.send(JSON.stringify(message));
    }
  }

  register() {
    return new Promise((resolve, reject) => {
      // Set up a one-time listener for registration confirmation
      this.registrationResolver = resolve;
      this.registrationTimeout = setTimeout(() => {
        this.registrationResolver = null;
        reject(new Error('Registration timeout'));
      }, 10000);
      
      this.send({
        type: 'register',
        nodeId: this.nodeId,
        publicKey: this.keyPair.publicKey,
        address: `direct://${this.nodeId}`
      });
    });
  }

  async discoverNodes() {
    return new Promise((resolve, reject) => {
      // Set up a one-time listener for node list response
      this.discoveryResolver = resolve;
      this.discoveryTimeout = setTimeout(() => {
        this.discoveryResolver = null;
        reject(new Error('Node discovery timeout'));
      }, 5000);
      
      this.send({
        type: 'discover_nodes',
        nodeId: this.nodeId
      });
    });
  }

  createChat(chatName) {
    this.send({
      type: 'create_chat',
      nodeId: this.nodeId,
      chatName
    });
  }

  getChats() {
    return new Promise((resolve, reject) => {
      // Set up a one-time listener for chat list response
      this.chatListResolver = resolve;
      this.chatListTimeout = setTimeout(() => {
        this.chatListResolver = null;
        reject(new Error('Chat list timeout'));
      }, 5000);
      
      this.send({
        type: 'get_chats',
        nodeId: this.nodeId
      });
    });
  }

  joinChat(chatId) {
    this.send({
      type: 'join_chat',
      nodeId: this.nodeId,
      chatId: chatId
    });
  }

  sendChatMessage(chatId, messageText) {
    this.send({
      type: 'send_chat_message',
      nodeId: this.nodeId,
      chatId: chatId,
      messageText: messageText,
      timestamp: Date.now()
    });
  }

  // UTILITY METHODS
  getLocalIP() {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
    return '127.0.0.1';
  }

  getNodeIdBySocket(socket) {
    for (const [nodeId, node] of this.connectedNodes.entries()) {
      if (node.socket === socket) return nodeId;
    }
    return null;
  }

  broadcastToAllNodes(message, excludeNodeId = null) {
    this.connectedNodes.forEach((node, nodeId) => {
      if (nodeId !== excludeNodeId && node.socket.readyState === WebSocket.OPEN) {
        node.socket.send(JSON.stringify(message));
      }
    });
  }

  broadcastToChatParticipants(chatId, message, excludeNodeId = null) {
    const chat = this.chatRooms.get(chatId);
    if (!chat) return;

    chat.participants.forEach(nodeId => {
      if (nodeId !== excludeNodeId) {
        const node = this.connectedNodes.get(nodeId);
        if (node && node.socket.readyState === WebSocket.OPEN) {
          node.socket.send(JSON.stringify(message));
        }
      }
    });
  }

  relayEncryptedMessage(message) {
    if (this.mode === NODE_MODES.HOST) {
      const targetNode = this.connectedNodes.get(message.targetNodeId);
      if (targetNode && targetNode.socket.readyState === WebSocket.OPEN) {
        if (message.messageType) {
          // Key exchange or other special messages
          targetNode.socket.send(JSON.stringify({
            type: message.messageType,
            fromNodeId: message.fromNodeId,
            ciphertext: message.ciphertext,
            acknowledged: message.acknowledged
          }));
        } else {
          // Regular encrypted message
          targetNode.socket.send(JSON.stringify({
            type: 'encrypted_message',
            fromNodeId: message.fromNodeId,
            chatId: message.chatId,
            encryptedData: message.encryptedData,
            timestamp: Date.now()
          }));
        }
      }
    } else {
      // In client mode, send to coordinator for relay
      this.send(message);
    }
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.coordinatorWs && this.coordinatorWs.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', nodeId: this.nodeId });
      }
    }, 30000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  async discoverLocalNetworks() {
    return await this.discovery.discoverNetworks(5000);
  }

  async disconnect() {
    this.safeLog('🔄 Shutting down node...', chalk.yellow);
    
    this.stopHeartbeat();
    
    if (this.discovery) {
      try {
        this.discovery.stop();
        this.safeLog('✓ Network discovery stopped', chalk.gray);
      } catch (error) {
        this.safeLog(`Warning: Discovery stop failed: ${error.message}`, chalk.yellow);
      }
    }
    
    if (this.tunneling) {
      try {
        this.tunneling.cleanup();
        this.safeLog('✓ Tunneling service cleaned up', chalk.gray);
      } catch (error) {
        this.safeLog(`Warning: Tunneling cleanup failed: ${error.message}`, chalk.yellow);
      }
    }
    
    if (this.mode === NODE_MODES.HOST && this.server) {
      try {
        // Close all WebSocket connections first
        if (this.wss) {
          this.wss.clients.forEach((ws) => {
            if (ws.readyState === 1) { // OPEN
              ws.terminate();
            }
          });
          this.safeLog('✓ WebSocket connections terminated', chalk.gray);
        }
        
        // Close the HTTP server
        await new Promise((resolve, reject) => {
          this.server.close((error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
        
        this.safeLog(`✓ Server on port ${this.hostPort} shut down`, chalk.gray);
        
        // Force close any remaining port bindings
        await this.forcePortCleanup();
        
      } catch (error) {
        this.safeLog(`Warning: Server shutdown failed: ${error.message}`, chalk.yellow);
        await this.forcePortCleanup();
      }
    } else if (this.coordinatorWs) {
      try {
        this.coordinatorWs.close();
        this.safeLog('✓ Client connection closed', chalk.gray);
      } catch (error) {
        this.safeLog(`Warning: Client disconnect failed: ${error.message}`, chalk.yellow);
      }
    }
    
    this.safeLog('✅ Node shutdown complete', chalk.green);
  }

  async forcePortCleanup() {
    if (this.hostPort && process.platform !== 'win32') {
      try {
        // Find and kill processes using our port
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        // Find processes using the port
        try {
          const { stdout } = await execAsync(`lsof -ti:${this.hostPort}`);
          if (stdout.trim()) {
            const pids = stdout.trim().split('\n');
            for (const pid of pids) {
              if (pid && pid !== process.pid.toString()) {
                try {
                  await execAsync(`kill -TERM ${pid}`);
                  this.safeLog(`✓ Cleaned up process ${pid} using port ${this.hostPort}`, chalk.gray);
                } catch (error) {
                  // Process might have already exited, that's fine
                }
              }
            }
          }
        } catch (error) {
          // No processes found using port, that's fine
        }
        
      } catch (error) {
        this.safeLog(`Warning: Port cleanup failed: ${error.message}`, chalk.yellow);
      }
    }
  }

  // Message handlers (copied from original P2PNode)
  onMessage(handler) {
    this.messageHandlers.set('message', handler);
  }

  async handleNodeList(nodes) {
    this.safeLog(`Discovered ${nodes.length} nodes`, chalk.blue);
    
    // Use for...of loop to properly handle async operations
    for (const node of nodes) {
      if (!this.peerKeys.has(node.nodeId)) {
        try {
          await this.initiateKeyExchange(node);
          // Small delay between key exchanges to prevent overwhelming
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          this.safeLog(`Failed to initiate key exchange with ${node.nodeId}: ${error.message}`, chalk.red);
        }
      }
    }
    
    if (this.cliInterface) this.cliInterface.rl.prompt();
  }

  async initiateKeyExchange(peerNode) {
    this.safeLog(`🔐 Starting key exchange with ${peerNode.nodeId.slice(-8)}`, chalk.cyan);
    const { ciphertext, sharedSecret } = await this.mlkem.encapsulate(peerNode.publicKey);
    this.peerKeys.set(peerNode.nodeId, sharedSecret);

    this.send({
      type: 'relay_message',
      targetNodeId: peerNode.nodeId,
      fromNodeId: this.nodeId,
      messageType: 'key_exchange_request',
      ciphertext: ciphertext
    });
  }

  async handleKeyExchangeRequest(message) {
    this.safeLog(`🔐 Received key exchange request from ${message.fromNodeId.slice(-8)}`, chalk.cyan);
    
    // Check if we already have a key exchange with this node
    if (this.peerKeys.has(message.fromNodeId) && this.peerKeys.get(message.fromNodeId) !== 'pending') {
      this.safeLog(`Key exchange already exists with ${message.fromNodeId.slice(-8)}`, chalk.gray);
      return;
    }
    
    const sharedSecret = await this.mlkem.decapsulate(message.ciphertext, this.keyPair.privateKey);
    this.peerKeys.set(message.fromNodeId, sharedSecret);
    this.safeLog(`✅ Key exchange established with ${message.fromNodeId.slice(-8)}`, chalk.green);
    
    this.send({
      type: 'relay_message',
      targetNodeId: message.fromNodeId,
      fromNodeId: this.nodeId,
      messageType: 'key_exchange_response',
      acknowledged: true
    });
  }

  handleKeyExchangeResponse(message) {
    this.safeLog(`✅ Key exchange completed with ${message.fromNodeId.slice(-8)}`, chalk.green);
  }

  async sendMessage(chatId, messageText, targetNodeId) {
    if (!this.peerKeys.has(targetNodeId)) {
      console.error('No shared key with target node');
      return;
    }

    const sharedSecret = this.peerKeys.get(targetNodeId);
    const encryptionKey = this.aesCrypto.deriveKeyFromSharedSecret(sharedSecret);
    
    const messageData = {
      chatId,
      text: messageText,
      timestamp: Date.now(),
      fromNodeId: this.nodeId
    };

    const encryptedData = this.aesCrypto.encrypt(JSON.stringify(messageData), encryptionKey);

    this.send({
      type: 'relay_message',
      targetNodeId,
      fromNodeId: this.nodeId,
      chatId,
      encryptedData
    });
  }

  handleEncryptedMessage(message) {
    try {
      if (!this.peerKeys.has(message.fromNodeId)) {
        this.safeLog(`Received message from unknown node: ${message.fromNodeId}`, chalk.red);
        return;
      }

      const sharedSecret = this.peerKeys.get(message.fromNodeId);
      const decryptionKey = this.aesCrypto.deriveKeyFromSharedSecret(sharedSecret);
      
      // Debug logging
      this.safeLog(`Decrypting message from ${message.fromNodeId.slice(-8)}`, chalk.gray);
      
      const decryptedText = this.aesCrypto.decrypt(message.encryptedData, decryptionKey);
      const messageData = JSON.parse(decryptedText);

      // Ensure we have the required message fields
      if (!messageData.chatId || !messageData.text) {
        this.safeLog(`Invalid message data from ${message.fromNodeId}`, chalk.red);
        return;
      }

      if (this.messageHandlers.has('message')) {
        this.messageHandlers.get('message')(messageData);
      }
    } catch (error) {
      this.safeLog(`Failed to decrypt message from ${message.fromNodeId.slice(-8)}: ${error.message}`, chalk.red);
      // Don't rethrow - just log and continue
    }
  }

  handleChatList(chats) {
    chats.forEach(chat => {
      if (!this.chats.has(chat.chatId)) {
        this.chats.set(chat.chatId, {
          id: chat.chatId,
          name: chat.chatName,
          participants: chat.participants
        });
      }
    });
  }

  async handlePeerInfo(message) {
    // Initiate key exchange with the peer
    try {
      await this.initiateKeyExchange({
        nodeId: message.nodeId,
        publicKey: message.publicKey,
        address: message.address
      });
    } catch (error) {
      this.safeLog(`Failed to initiate key exchange with ${message.nodeId}: ${error.message}`, chalk.red);
    }
  }

  handleChatHistory(message) {
    // Store chat history messages in local CLI interface
    if (this.cliInterface && message.messages) {
      if (!this.cliInterface.messages.has(message.chatId)) {
        this.cliInterface.messages.set(message.chatId, []);
      }
      
      const localMessages = message.messages.map(msg => ({
        from: msg.senderAlias || msg.fromNodeId.slice(-8),
        text: msg.text,
        timestamp: msg.timestamp
      }));
      
      this.cliInterface.messages.get(message.chatId).push(...localMessages);
      
      this.safeLog(`Received ${message.messages.length} chat history messages for ${message.chatId}`, chalk.blue);
      
      // Refresh display if currently in this chat
      if (this.cliInterface.currentChat && this.cliInterface.currentChat.id === message.chatId) {
        this.cliInterface.refreshChatDisplay();
        this.cliInterface.showInputArea();
      }
    }
  }

  // ===============================
  // HOST DISCONNECTION HANDLING
  // ===============================

  handleHostDisconnection(code, reason) {
    this.stopHeartbeat();
    
    // Determine disconnection type
    const isHostShutdown = code === 1001 || code === 1000 || reason === 'host_shutdown';
    const isConnectionLost = code === 1006 || code === 1011;
    
    if (isHostShutdown) {
      // Host intentionally shut down - clean shutdown
      this.performClientCleanShutdown();
    } else if (isConnectionLost) {
      // Connection lost - attempt reconnection or show error
      this.handleConnectionLoss(code, reason);
    } else {
      // Other disconnection - log and prompt
      this.safeLog(`Disconnected from network (code: ${code})`, chalk.yellow);
      if (this.cliInterface) this.cliInterface.rl.prompt();
    }
  }

  performClientCleanShutdown() {
    try {
      // Notify CLI interface of host shutdown
      if (this.cliInterface) {
        this.cliInterface.handleHostShutdown();
      }
      
      // Clear all chat messages from memory
      if (this.cliInterface && this.cliInterface.messages) {
        this.cliInterface.messages.clear();
      }
      
      // Clear peer connections
      this.peerKeys.clear();
      this.chats.clear();
      
      this.safeLog('Host has shut down. All chat data cleared.', chalk.red);
      this.safeLog('Returning to main menu...', chalk.yellow);
      
    } catch (error) {
      console.error('Error during client shutdown:', error);
    }
  }

  handleConnectionLoss(code, reason) {
    if (this.cliInterface) {
      this.cliInterface.handleConnectionLoss(code, reason);
    } else {
      this.safeLog(`Connection lost (code: ${code}). Reason: ${reason}`, chalk.red);
    }
  }

  // ===============================
  // PORT MANAGEMENT FOR MULTI-NODE
  // ===============================

  async findAvailablePort(startPort, endPort) {
    const net = await import('net');
    
    for (let port = startPort; port <= endPort; port++) {
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }
    return null;
  }

  async isPortAvailable(port) {
    const net = await import('net');
    
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.listen(port, '0.0.0.0', () => {
        server.once('close', () => {
          resolve(true);
        });
        server.close();
      });
      
      server.on('error', () => {
        resolve(false);
      });
    });
  }

  // Check if any MELQ nodes are already running
  async checkExistingNodes() {
    const existingNodes = [];
    
    // Check common MELQ ports
    for (let port = 42045; port <= 42095; port++) {
      try {
        // Try to connect to health endpoint to detect MELQ nodes
        const response = await fetch(`http://localhost:${port}/health`, { 
          timeout: 100 
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.mode === 'host' && data.nodeId) {
            existingNodes.push({
              port,
              nodeId: data.nodeId,
              nodes: data.nodes,
              chats: data.chats
            });
          }
        }
      } catch {
        // Port not in use or not a MELQ node - continue checking
      }
    }
    
    return existingNodes;
  }
}