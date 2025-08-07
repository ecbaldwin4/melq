import WebSocket from 'ws';
import crypto from 'crypto';
import { MLKEM } from '../crypto/mlkem.js';
import { AESCrypto } from '../crypto/aes.js';

export class P2PNode {
  constructor(coordinatorUrl) {
    this.nodeId = this.generateNodeId();
    this.coordinatorUrl = coordinatorUrl;
    this.mlkem = new MLKEM();
    this.aesCrypto = new AESCrypto();
    this.keyPair = this.mlkem.generateKeyPair();
    this.peerKeys = new Map(); // nodeId -> shared secret
    this.chats = new Map(); // chatId -> chat info
    this.messageHandlers = new Map();
    this.ws = null;
  }

  generateNodeId() {
    return `node_${crypto.randomBytes(8).toString('hex')}`;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.coordinatorUrl);

      this.ws.on('open', () => {
        console.log(`Connected to coordinator as ${this.nodeId}`);
        this.register();
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      });

      this.ws.on('close', () => {
        console.log('Disconnected from coordinator');
      });

      this.ws.on('error', (error) => {
        console.error('Connection error:', error);
        reject(error);
      });
    });
  }

  register() {
    this.send({
      type: 'register',
      nodeId: this.nodeId,
      publicKey: this.keyPair.publicKey,
      address: `ws://localhost:${Math.floor(Math.random() * 10000) + 8000}`
    });
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  handleMessage(message) {
    switch (message.type) {
      case 'registered':
        console.log(`Registered successfully as ${message.nodeId}`);
        break;

      case 'node_list':
        this.handleNodeList(message.nodes);
        break;

      case 'chat_created':
        console.log(`Chat created: ${message.chatName} (ID: ${message.chatId})`);
        this.chats.set(message.chatId, {
          id: message.chatId,
          name: message.chatName,
          participants: [this.nodeId]
        });
        break;

      case 'user_joined':
        if (this.chats.has(message.chatId)) {
          console.log(`User ${message.nodeId} joined chat`);
        }
        break;

      case 'encrypted_message':
        this.handleEncryptedMessage(message);
        break;

      case 'key_exchange_request':
        this.handleKeyExchangeRequest(message);
        break;

      case 'key_exchange_response':
        this.handleKeyExchangeResponse(message);
        break;
    }
  }

  handleNodeList(nodes) {
    console.log(`Discovered ${nodes.length} nodes`);
    
    nodes.forEach(node => {
      if (!this.peerKeys.has(node.nodeId)) {
        this.initiateKeyExchange(node);
      }
    });
  }

  initiateKeyExchange(peerNode) {
    const { ciphertext, sharedSecret } = this.mlkem.encapsulate(peerNode.publicKey);
    this.peerKeys.set(peerNode.nodeId, sharedSecret);

    this.send({
      type: 'relay_message',
      targetNodeId: peerNode.nodeId,
      fromNodeId: this.nodeId,
      messageType: 'key_exchange_request',
      ciphertext: ciphertext
    });
  }

  handleKeyExchangeRequest(message) {
    const sharedSecret = this.mlkem.decapsulate(message.ciphertext, this.keyPair.privateKey);
    this.peerKeys.set(message.fromNodeId, sharedSecret);
    
    this.send({
      type: 'relay_message',
      targetNodeId: message.fromNodeId,
      fromNodeId: this.nodeId,
      messageType: 'key_exchange_response',
      acknowledged: true
    });
  }

  handleKeyExchangeResponse(message) {
    console.log(`Key exchange completed with ${message.fromNodeId}`);
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
        console.error('Received message from unknown node');
        return;
      }

      const sharedSecret = this.peerKeys.get(message.fromNodeId);
      const decryptionKey = this.aesCrypto.deriveKeyFromSharedSecret(sharedSecret);
      
      const decryptedText = this.aesCrypto.decrypt(message.encryptedData, decryptionKey);
      const messageData = JSON.parse(decryptedText);

      if (this.messageHandlers.has('message')) {
        this.messageHandlers.get('message')(messageData);
      }
    } catch (error) {
      console.error('Failed to decrypt message:', error);
    }
  }

  onMessage(handler) {
    this.messageHandlers.set('message', handler);
  }

  createChat(chatName) {
    this.send({
      type: 'create_chat',
      nodeId: this.nodeId,
      chatName
    });
  }

  joinChat(chatId) {
    this.send({
      type: 'join_chat',
      nodeId: this.nodeId,
      chatId
    });
  }

  discoverNodes() {
    this.send({
      type: 'discover_nodes',
      nodeId: this.nodeId
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}