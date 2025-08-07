import Fastify from 'fastify';
import { WebSocketServer } from 'ws';

const fastify = Fastify({ logger: true });

const nodes = new Map();
const chatRooms = new Map();

fastify.register(async function (fastify) {
  const wss = new WebSocketServer({ 
    server: fastify.server,
    path: '/ws'
  });

  wss.on('connection', (ws) => {
    console.log('Node connected');
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(ws, message);
      } catch (error) {
        console.error('Invalid message:', error);
      }
    });

    ws.on('close', () => {
      const nodeId = getNodeIdBySocket(ws);
      if (nodeId) {
        nodes.delete(nodeId);
        console.log(`Node ${nodeId} disconnected`);
      }
    });
  });

  function handleMessage(ws, message) {
    switch (message.type) {
      case 'register':
        nodes.set(message.nodeId, {
          socket: ws,
          publicKey: message.publicKey,
          address: message.address,
          timestamp: Date.now()
        });
        ws.send(JSON.stringify({ type: 'registered', nodeId: message.nodeId }));
        break;

      case 'discover_nodes':
        const nodeList = Array.from(nodes.entries())
          .filter(([id]) => id !== message.nodeId)
          .map(([id, node]) => ({
            nodeId: id,
            publicKey: node.publicKey,
            address: node.address
          }));
        ws.send(JSON.stringify({ type: 'node_list', nodes: nodeList }));
        break;

      case 'create_chat':
        const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        chatRooms.set(chatId, {
          creator: message.nodeId,
          name: message.chatName,
          participants: [message.nodeId],
          created: Date.now()
        });
        ws.send(JSON.stringify({ type: 'chat_created', chatId, chatName: message.chatName }));
        break;

      case 'join_chat':
        const chat = chatRooms.get(message.chatId);
        if (chat && !chat.participants.includes(message.nodeId)) {
          chat.participants.push(message.nodeId);
          broadcastToChatParticipants(message.chatId, {
            type: 'user_joined',
            chatId: message.chatId,
            nodeId: message.nodeId
          }, message.nodeId);
        }
        break;

      case 'relay_message':
        relayEncryptedMessage(message);
        break;
    }
  }

  function getNodeIdBySocket(socket) {
    for (const [nodeId, node] of nodes.entries()) {
      if (node.socket === socket) return nodeId;
    }
    return null;
  }

  function broadcastToChatParticipants(chatId, message, excludeNodeId = null) {
    const chat = chatRooms.get(chatId);
    if (!chat) return;

    chat.participants.forEach(nodeId => {
      if (nodeId !== excludeNodeId) {
        const node = nodes.get(nodeId);
        if (node && node.socket.readyState === 1) {
          node.socket.send(JSON.stringify(message));
        }
      }
    });
  }

  function relayEncryptedMessage(message) {
    const targetNode = nodes.get(message.targetNodeId);
    if (targetNode && targetNode.socket.readyState === 1) {
      targetNode.socket.send(JSON.stringify({
        type: 'encrypted_message',
        fromNodeId: message.fromNodeId,
        chatId: message.chatId,
        encryptedData: message.encryptedData,
        timestamp: Date.now()
      }));
    }
  }
});

fastify.get('/health', async (request, reply) => {
  return { 
    status: 'healthy', 
    nodes: nodes.size, 
    chats: chatRooms.size,
    timestamp: Date.now()
  };
});

fastify.get('/stats', async (request, reply) => {
  return {
    totalNodes: nodes.size,
    totalChats: chatRooms.size,
    activeChats: Array.from(chatRooms.values()).map(chat => ({
      name: chat.name,
      participants: chat.participants.length,
      created: chat.created
    }))
  };
});

const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Coordination server running on port ${port}`);
    console.log('Use ngrok to expose this server: ngrok http 3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();