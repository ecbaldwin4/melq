import dgram from 'dgram';
import { networkInterfaces } from 'os';
import chalk from 'chalk';

const DISCOVERY_PORT = 41234;
const DISCOVERY_MESSAGE = 'MELQ_DISCOVERY_REQUEST';
const DISCOVERY_RESPONSE = 'MELQ_DISCOVERY_RESPONSE';

export class NetworkDiscovery {
  constructor() {
    this.socket = null;
    this.isListening = false;
    this.discoveredNetworks = new Map();
  }

  // Start advertising this node as a MELQ network host
  async startAdvertising(nodeInfo) {
    this.socket = dgram.createSocket('udp4');
    
    this.socket.on('message', (msg, rinfo) => {
      const message = msg.toString();
      
      if (message === DISCOVERY_MESSAGE) {
        // Someone is looking for MELQ networks, respond with our info
        const response = JSON.stringify({
          type: DISCOVERY_RESPONSE,
          nodeId: nodeInfo.nodeId,
          networkName: `${nodeInfo.nodeId.slice(-8)}'s Network`,
          host: this.getLocalIP(),
          port: nodeInfo.port,
          connectionCode: `melq://${this.getLocalIP()}:${nodeInfo.port}`,
          timestamp: Date.now()
        });
        
        this.socket.send(response, rinfo.port, rinfo.address);
      }
    });

    await new Promise((resolve, reject) => {
      this.socket.bind(DISCOVERY_PORT, (err) => {
        if (err) reject(err);
        else {
          this.isListening = true;
          console.log(chalk.gray(`🔍 Network discovery active on port ${DISCOVERY_PORT}`));
          resolve();
        }
      });
    });
  }

  // Discover MELQ networks on the local network
  async discoverNetworks(timeoutMs = 3000) {
    return new Promise((resolve) => {
      const discoverySocket = dgram.createSocket('udp4');
      this.discoveredNetworks.clear();
      
      // Listen for responses
      discoverySocket.on('message', (msg, rinfo) => {
        try {
          const response = JSON.parse(msg.toString());
          
          if (response.type === DISCOVERY_RESPONSE) {
            this.discoveredNetworks.set(response.nodeId, {
              nodeId: response.nodeId,
              networkName: response.networkName,
              host: response.host,
              port: response.port,
              connectionCode: response.connectionCode,
              address: rinfo.address,
              timestamp: response.timestamp
            });
          }
        } catch (error) {
          // Ignore invalid messages
        }
      });

      // Bind and start discovery
      discoverySocket.bind(() => {
        discoverySocket.setBroadcast(true);
        
        // Send discovery request to broadcast addresses
        const broadcastAddresses = this.getBroadcastAddresses();
        
        broadcastAddresses.forEach(addr => {
          discoverySocket.send(
            DISCOVERY_MESSAGE, 
            DISCOVERY_PORT, 
            addr,
            (err) => {
              if (err) {
                console.error(chalk.gray(`Discovery broadcast to ${addr} failed:`, err.message));
              }
            }
          );
        });

        // Wait for responses
        setTimeout(() => {
          discoverySocket.close();
          resolve(Array.from(this.discoveredNetworks.values()));
        }, timeoutMs);
      });
    });
  }

  // Get all broadcast addresses for the local network interfaces
  getBroadcastAddresses() {
    const addresses = [];
    const nets = networkInterfaces();
    
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        // Skip internal and non-IPv4 addresses
        if (net.family === 'IPv4' && !net.internal) {
          // Calculate broadcast address
          const ip = net.address.split('.').map(Number);
          const netmask = net.netmask.split('.').map(Number);
          
          const broadcast = ip.map((octet, i) => 
            octet | (255 ^ netmask[i])
          ).join('.');
          
          addresses.push(broadcast);
        }
      }
    }
    
    // Also add common broadcast address
    addresses.push('255.255.255.255');
    
    return [...new Set(addresses)]; // Remove duplicates
  }

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

  stop() {
    if (this.socket) {
      this.socket.close();
      this.isListening = false;
    }
  }
}

export async function discoverLocalNetworks() {
  console.log(chalk.yellow('🔍 Scanning for local MELQ networks...'));
  
  const discovery = new NetworkDiscovery();
  const networks = await discovery.discoverNetworks(5000);
  
  if (networks.length === 0) {
    console.log(chalk.gray('No local MELQ networks found.'));
    console.log(chalk.gray('Try:'));
    console.log(chalk.gray('• Make sure other nodes are running on this network'));
    console.log(chalk.gray('• Check your firewall settings'));
    console.log(chalk.gray('• Use connection codes for remote networks'));
    return [];
  }
  
  console.log(chalk.green(`Found ${networks.length} local network(s):`));
  networks.forEach((network, index) => {
    const age = Math.floor((Date.now() - network.timestamp) / 1000);
    console.log(chalk.cyan(`${index + 1}. ${network.networkName}`));
    console.log(chalk.gray(`   Host: ${network.host}:${network.port} (${age}s ago)`));
    console.log(chalk.gray(`   Code: ${network.connectionCode}`));
  });
  
  return networks;
}