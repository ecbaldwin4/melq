import WebSocket from 'ws';

const testUrl = process.argv[2];

if (!testUrl) {
  console.log('Usage: node test-connection.js <url>');
  console.log('Example: node test-connection.js wss://d4a662a3f4b8.ngrok-free.app');
  process.exit(1);
}

console.log(`Testing WebSocket connection to: ${testUrl}`);

const ws = new WebSocket(testUrl, {
  headers: {
    'User-Agent': 'MELQ-Connection-Test/1.0.0',
    'ngrok-skip-browser-warning': 'true'
  }
});

ws.on('open', () => {
  console.log('✅ WebSocket connection successful!');
  console.log('The host is running and accepting connections.');
  ws.close();
});

ws.on('error', (error) => {
  console.log('❌ WebSocket connection failed:');
  console.log(`Error: ${error.message}`);
  
  if (error.message.includes('400')) {
    console.log('\n🔍 This suggests:');
    console.log('• The host is not running MELQ');
    console.log('• ngrok is forwarding to the wrong port');
    console.log('• The host is running something else');
  }
});

ws.on('close', () => {
  console.log('Connection closed.');
  process.exit(0);
});

setTimeout(() => {
  console.log('⏰ Connection timeout - host may not be responding');
  process.exit(1);
}, 10000);