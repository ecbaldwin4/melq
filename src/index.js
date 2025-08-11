import { Command } from 'commander';
import { UnifiedNode } from './network/unified-node.js';
import { CLIInterface } from './cli/interface.js';
import chalk from 'chalk';
import readline from 'readline';

const program = new Command();

program
  .name('melq')
  .description('Secure P2P chat - Host or join networks easily')
  .version('1.0.0')
  .option('-j, --join <code>', 'Join network with connection code')
  .option('-h, --host [port]', 'Host a new network (optional port)')
  .option('--internet', 'Expose hosted network to internet (with --host)')
  .option('--local-only', 'Host network for local access only (with --host)')
  .option('--tunnel <method>', 'Specify tunneling method: ngrok, localtunnel, serveo, manual')
  .option('--update', 'Update MELQ to the latest version from GitHub')
  .option('--check-updates', 'Check if updates are available without installing')
  .action(async (options) => {
    if (options.update) {
      await handleUpdateCommand();
      return;
    }
    
    if (options.checkUpdates) {
      await handleCheckUpdatesCommand();
      return;
    }
    
    console.log(chalk.blue('🔐 MELQ - Quantum-Secure P2P Chat'));
    console.log(chalk.gray('═'.repeat(50)));
    
    try {
      const node = new UnifiedNode();
      
      if (options.join) {
        await startClientMode(node, options.join);
      } else if (options.host) {
        const port = parseInt(options.host) || 0;
        const hostOptions = {
          exposeToInternet: options.internet || (!options.localOnly && !process.stdout.isTTY),
          tunnelMethod: options.tunnel || 'auto'
        };
        
        // Skip interactive mode if options are provided via CLI
        if (options.internet || options.localOnly || options.tunnel) {
          await startHostModeWithOptions(node, port, hostOptions);
        } else {
          await startHostMode(node, port);
        }
      } else {
        await showInteractiveMenu(node);
      }
    } catch (error) {
      console.error(chalk.red('Failed to start MELQ:'), error.message);
      process.exit(1);
    }
  });

async function showInteractiveMenu(node) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(chalk.yellow('\nWhat would you like to do?'));
  console.log(chalk.cyan('1. 🏠 Host a new network (others can join you)'));
  console.log(chalk.cyan('2. 🔗 Join an existing network'));
  console.log(chalk.cyan('3. 🔍 Discover local networks'));
  console.log(chalk.cyan('4. ❓ Help'));

  const answer = await new Promise(resolve => {
    rl.question(chalk.green('\nChoose an option (1-4): '), resolve);
  });

  rl.close();

  switch (answer.trim()) {
    case '1':
      await startHostMode(node);
      break;
    case '2':
      await promptForConnectionCode(node);
      break;
    case '3':
      await discoverLocalNetworks(node);
      break;
    case '4':
      showHelp();
      break;
    default:
      console.log(chalk.red('Invalid option. Please try again.'));
      await showInteractiveMenu(node);
  }
}

async function startHostMode(node, port = 0) {
  console.log(chalk.yellow('\n🏠 Setting up network host...'));
  
  // Ask about internet exposure
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(chalk.yellow('\nNetwork Access Options:'));
  console.log(chalk.cyan('1. 🏠 Local network only (same WiFi/LAN)'));
  console.log(chalk.cyan('2. 🌐 Local + Internet (anyone can join)'));
  console.log(chalk.cyan('3. 🔧 Advanced options'));

  const accessChoice = await new Promise(resolve => {
    rl.question(chalk.green('\nChoose access level (1-3): '), resolve);
  });

  let options = { exposeToInternet: false };
  
  if (accessChoice.trim() === '2') {
    options.exposeToInternet = true;
    
    // Show tunneling method options for Local + Internet
    console.log(chalk.yellow('\nTunneling Method:'));
    console.log(chalk.cyan('1. Auto (prefer localtunnel - instant, no signup!)'));
    console.log(chalk.cyan('2. Localtunnel only (recommended - no account needed)'));
    console.log(chalk.cyan('3. ngrok only (requires account for persistent URLs)'));
    console.log(chalk.cyan('4. Manual setup (port forwarding)'));
    
    const methodChoice = await new Promise(resolve => {
      rl.question(chalk.green('Choose method (1-4): '), resolve);
    });
    
    switch (methodChoice.trim()) {
      case '2':
        options.tunnelMethod = 'localtunnel';
        break;
      case '3':
        options.tunnelMethod = 'ngrok';
        break;
      case '4':
        options.tunnelMethod = 'manual';
        
        const customDomain = await new Promise(resolve => {
          rl.question(chalk.green('Custom domain/IP (optional): '), resolve);
        });
        
        if (customDomain.trim()) {
          options.customDomain = customDomain.trim();
        }
        break;
      default:
        options.tunnelMethod = 'auto';
    }
  } else if (accessChoice.trim() === '3') {
    // Advanced options
    const internetChoice = await new Promise(resolve => {
      rl.question(chalk.green('Expose to internet? (y/N): '), resolve);
    });
    
    if (internetChoice.toLowerCase().startsWith('y')) {
      options.exposeToInternet = true;
      
      console.log(chalk.yellow('\nTunneling Method:'));
      console.log(chalk.cyan('1. Auto (prefer localtunnel - instant, no signup!)'));
      console.log(chalk.cyan('2. Localtunnel only (recommended - no account needed)'));
      console.log(chalk.cyan('3. ngrok only (requires account for persistent URLs)'));
      console.log(chalk.cyan('4. Manual setup (port forwarding)'));
      
      const methodChoice = await new Promise(resolve => {
        rl.question(chalk.green('Choose method (1-4): '), resolve);
      });
      
      switch (methodChoice.trim()) {
        case '2':
          options.tunnelMethod = 'localtunnel';
          break;
        case '3':
          options.tunnelMethod = 'ngrok';
          break;
        case '4':
          options.tunnelMethod = 'manual';
          
          const customDomain = await new Promise(resolve => {
            rl.question(chalk.green('Custom domain/IP (optional): '), resolve);
          });
          
          if (customDomain.trim()) {
            options.customDomain = customDomain.trim();
          }
          break;
        default:
          options.tunnelMethod = 'auto';
      }
    }
  }

  rl.close();
  
  console.log(chalk.yellow('\n🗠️ Starting network...'));
  const networkInfo = await node.startAsHost(port, options);
  
  console.log(chalk.green('\n✅ Network successfully hosted!'));
  
  // Show connection codes
  console.log(chalk.blue('\n📋 Connection Codes:'));
  console.log(chalk.cyan('🏠 Local (same network):'));
  console.log(chalk.bgCyan.black(` ${networkInfo.localConnectionCode} `));
  
  if (networkInfo.hasInternet) {
    console.log(chalk.cyan('\n🌐 Internet (anywhere):'));
    console.log(chalk.bgGreen.black(` ${networkInfo.internetConnectionCode} `));
  }
  
  console.log(chalk.gray('\nShare these codes with others so they can join!'));
  console.log(chalk.gray('Command: melq --join <connection_code>'));
  
  // Start host monitoring interface and auto-connect client
  await startHostWithAutoClient(node, networkInfo);
}

async function startHostModeWithOptions(node, port = 0, options = {}) {
  console.log(chalk.yellow('\n🖥️ Starting network with specified options...'));
  
  const networkInfo = await node.startAsHost(port, options);
  
  console.log(chalk.green('\n✅ Network successfully hosted!'));
  
  // Show connection codes
  console.log(chalk.blue('\n📋 Connection Codes:'));
  console.log(chalk.cyan('🏠 Local (same network):'));
  console.log(chalk.bgCyan.black(` ${networkInfo.localConnectionCode} `));
  
  if (networkInfo.hasInternet) {
    console.log(chalk.cyan('\n🌐 Internet (anywhere):'));
    console.log(chalk.bgGreen.black(` ${networkInfo.internetConnectionCode} `));
  }
  
  console.log(chalk.gray('\nShare these codes with others so they can join!'));
  console.log(chalk.gray('Command: melq --join <connection_code>'));
  
  // Start host monitoring interface and auto-connect client
  await startHostWithAutoClient(node, networkInfo);
}

async function startClientMode(node, connectionCode) {
  console.log(chalk.yellow(`\n🔗 Joining network: ${connectionCode}`));
  
  try {
    await node.joinNetwork(connectionCode);
    console.log(chalk.green('\n✅ Successfully joined network!'));
    
    // Determine connection method for display
    let method = 'remote';
    let tunnelMethod = null;
    
    if (connectionCode.includes('192.168.') || connectionCode.includes('localhost') || connectionCode.includes('127.0.0.1')) {
      method = 'local';
    } else if (connectionCode.includes('ngrok')) {
      method = 'internet';
      tunnelMethod = 'ngrok';
    } else if (connectionCode.includes('loca.lt')) {
      method = 'internet';
      tunnelMethod = 'localtunnel';
    } else if (connectionCode.includes('serveo.net')) {
      method = 'internet';
      tunnelMethod = 'serveo';
    } else {
      method = 'internet';
      tunnelMethod = 'manual';
    }
    
    const connectionInfo = {
      connectionCode,
      method,
      tunnelMethod
    };
    
    await startChatInterface(node, connectionInfo);
  } catch (error) {
    console.error(chalk.red('Failed to join network:'), error.message);
    console.log(chalk.yellow('\nPlease check:'));
    console.log(chalk.gray('• Connection code is correct'));
    console.log(chalk.gray('• Host network is running'));
    console.log(chalk.gray('• Network connectivity'));
    process.exit(1);
  }
}

async function promptForConnectionCode(node) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(chalk.yellow('\n🔗 Join Network'));
  console.log(chalk.gray('Enter the connection code shared by the host.'));
  console.log(chalk.gray('Formats accepted:'));
  console.log(chalk.gray('  melq://192.168.1.100:3000'));
  console.log(chalk.gray('  https://abc123.ngrok.io'));
  console.log(chalk.gray('  192.168.1.100:3000\n'));

  const connectionCode = await new Promise(resolve => {
    rl.question(chalk.green('Connection code: '), resolve);
  });

  rl.close();

  if (connectionCode.trim()) {
    await startClientMode(node, connectionCode.trim());
  } else {
    console.log(chalk.red('No connection code provided.'));
    await showInteractiveMenu(node);
  }
}

async function discoverLocalNetworks(node) {
  console.log(chalk.yellow('\n🔍 Scanning for local MELQ networks...'));
  
  try {
    const networks = await node.discoverLocalNetworks();
    
    if (networks.length === 0) {
      console.log(chalk.gray('No local MELQ networks found.'));
      console.log(chalk.gray('\nTry:'));
      console.log(chalk.gray('• Make sure other nodes are running on this network'));
      console.log(chalk.gray('• Check your firewall settings'));
      console.log(chalk.gray('• Use connection codes for remote networks\n'));
      await showInteractiveMenu(node);
      return;
    }
    
    console.log(chalk.green(`\nFound ${networks.length} local network(s):`));
    networks.forEach((network, index) => {
      const age = Math.floor((Date.now() - network.timestamp) / 1000);
      console.log(chalk.cyan(`${index + 1}. ${network.networkName}`));
      console.log(chalk.gray(`   Host: ${network.host}:${network.port} (${age}s ago)`));
    });
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const choice = await new Promise(resolve => {
      rl.question(chalk.green(`\nChoose network (1-${networks.length}) or 0 to go back: `), resolve);
    });

    rl.close();
    
    const networkIndex = parseInt(choice.trim()) - 1;
    
    if (choice.trim() === '0') {
      await showInteractiveMenu(node);
    } else if (networkIndex >= 0 && networkIndex < networks.length) {
      const selectedNetwork = networks[networkIndex];
      await startClientMode(node, selectedNetwork.connectionCode);
    } else {
      console.log(chalk.red('Invalid selection.'));
      await discoverLocalNetworks(node);
    }
    
  } catch (error) {
    console.error(chalk.red('Discovery failed:'), error.message);
    console.log(chalk.gray('\nFallback to manual connection codes.\n'));
    await showInteractiveMenu(node);
  }
}

async function startHostWithAutoClient(hostNode, networkInfo) {
  console.log(chalk.blue('\n📊 Starting host monitoring interface...'));
  
  // Setup cleanup handlers for the host
  setupHostCleanup(hostNode);
  
  // Start the host monitoring interface
  startHostMonitoring(hostNode, networkInfo);
  
  // Try to auto-connect as client
  await attemptAutoClientConnection(networkInfo);
}

function setupHostCleanup(hostNode) {
  // Cleanup function
  const cleanup = async () => {
    console.log(chalk.yellow('\n🔄 Shutting down host and cleaning up...'));
    if (hostNode) {
      try {
        await hostNode.disconnect();
      } catch (error) {
        console.error(chalk.red('❌ Cleanup error:'), error.message);
      }
    }
    console.log(chalk.green('✅ Host cleanup completed'));
    process.exit(0);
  };

  // Handle various exit scenarios
  process.on('SIGINT', () => {
    cleanup().catch((error) => {
      console.error(chalk.red('❌ Cleanup failed:'), error);
      process.exit(1);
    });
  });
  
  process.on('SIGTERM', () => {
    cleanup().catch((error) => {
      console.error(chalk.red('❌ Cleanup failed:'), error);
      process.exit(1);
    });
  });
  
  process.on('exit', async () => {
    if (hostNode) {
      try {
        // Note: exit event handlers can't be async, so we do our best
        hostNode.disconnect();
      } catch (error) {
        console.error('Final cleanup error:', error.message);
      }
    }
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error(chalk.red('❌ Uncaught exception:'), error);
    cleanup().catch(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('❌ Unhandled rejection at:'), promise, 'reason:', reason);
    cleanup().catch(() => process.exit(1));
  });
}

async function attemptAutoClientConnection(networkInfo) {
  try {
    console.log(chalk.cyan('\n🔄 Auto-connecting as client to own hosted session...'));
    
    // Create a new client node
    const clientNode = new UnifiedNode();
    
    // Determine which connection code to use (prefer local)
    const connectionCode = networkInfo.localConnectionCode;
    
    // Give the host a moment to fully initialize and finish all setup output
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Connect as client
    await clientNode.joinNetwork(connectionCode);
    console.log(chalk.green('✅ Successfully auto-connected as client!'));
    
    // Give additional time for any remaining output to settle
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Create connection info for display - preserve both local and internet addresses
    const connectionInfo = {
      connectionCode,
      localConnectionCode: networkInfo.localConnectionCode,
      internetConnectionCode: networkInfo.internetConnectionCode,
      method: networkInfo.hasInternet ? 'internet' : 'local',
      tunnelMethod: networkInfo.hasInternet ? (
        networkInfo.internetConnectionCode.includes('ngrok.io') ? 'ngrok' : 
        networkInfo.internetConnectionCode.includes('loca.lt') ? 'localtunnel' : 
        networkInfo.internetConnectionCode.includes('serveo.net') ? 'serveo' : 
        'manual'
      ) : null,
      isHost: true,
      hasInternet: networkInfo.hasInternet
    };
    
    // Start client chat interface
    await startChatInterface(clientNode, connectionInfo);
    
  } catch (error) {
    console.error(chalk.red('❌ Auto-connect failed:'), error.message);
    console.log(chalk.yellow('🔄 Falling back to manual client spawn...'));
    await fallbackClientSpawn(networkInfo);
  }
}

async function fallbackClientSpawn(networkInfo) {
  try {
    const { spawn } = await import('child_process');
    
    console.log(chalk.yellow('\n🚀 Spawning separate client terminal...'));
    
    // Try to spawn a new terminal with melq client
    const connectionCode = networkInfo.localConnectionCode || networkInfo.internetConnectionCode;
    
    // Try common terminal emulators based on platform
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    
    let terminals = [];
    
    if (isWindows) {
      terminals = [
        { cmd: 'wt', args: ['node', 'src/index.js', '--join', connectionCode] }, // Windows Terminal
        { cmd: 'powershell', args: ['-Command', `node src/index.js --join ${connectionCode}`] },
        { cmd: 'cmd', args: ['/c', `start cmd /k "node src/index.js --join ${connectionCode}"`] }
      ];
    } else if (isMac) {
      terminals = [
        { cmd: 'osascript', args: ['-e', `tell application "Terminal" to do script "cd '${process.cwd()}' && node src/index.js --join ${connectionCode}"`] },
        { cmd: 'open', args: ['-a', 'Terminal', '.'] }
      ];
    } else {
      // Linux/Unix
      terminals = [
        { cmd: 'gnome-terminal', args: ['--', 'node', 'src/index.js', '--join', connectionCode] },
        { cmd: 'xterm', args: ['-e', `node src/index.js --join ${connectionCode}`] },
        { cmd: 'konsole', args: ['-e', `node src/index.js --join ${connectionCode}`] },
        { cmd: 'x-terminal-emulator', args: ['-e', `node src/index.js --join ${connectionCode}`] }
      ];
    }
    
    let spawned = false;
    for (const terminal of terminals) {
      try {
        spawn(terminal.cmd, terminal.args, { 
          detached: true, 
          stdio: 'ignore',
          cwd: process.cwd()
        });
        console.log(chalk.green(`✅ Spawned client in ${terminal.cmd}`));
        spawned = true;
        break;
      } catch (err) {
        // Try next terminal
        continue;
      }
    }
    
    if (!spawned) {
      console.log(chalk.red('❌ Could not spawn automatic client terminal.'));
      console.log(chalk.blue('📋 Manual connection instructions:'));
      console.log(chalk.gray('Open a new terminal and run:'));
      console.log(chalk.white(`  melq --join ${connectionCode}`));
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Fallback client spawn failed:'), error.message);
    console.log(chalk.blue('📋 Manual connection instructions:'));
    console.log(chalk.gray('Open a new terminal and run:'));
    const connectionCode = networkInfo.localConnectionCode || networkInfo.internetConnectionCode;
    console.log(chalk.white(`  melq --join ${connectionCode}`));
  }
}

function startHostMonitoring(hostNode, networkInfo) {
  console.log(chalk.green('\n🖥️  HOST MONITORING INTERFACE'));
  console.log(chalk.gray('═'.repeat(50)));
  console.log(chalk.blue('📊 Network Status:'));
  console.log(chalk.gray(`   Local: ${networkInfo.localConnectionCode}`));
  if (networkInfo.internetConnectionCode) {
    console.log(chalk.gray(`   Internet: ${networkInfo.internetConnectionCode}`));
  }
  console.log(chalk.gray(`   Port: ${networkInfo.port}`));
  console.log(chalk.gray(`   Host IP: ${networkInfo.ip}`));
  
  // Show initial stats
  console.log(chalk.yellow('\n⚡ Live Stats:'));
  const statsLine = chalk.blue('👥 Connected: 0 | 💬 Chats: 0');
  console.log(statsLine);
  
  // Update stats periodically using title bar instead
  setInterval(() => {
    const connectedCount = hostNode.connectedNodes ? hostNode.connectedNodes.size : 0;
    const chatCount = hostNode.chatRooms ? hostNode.chatRooms.size : 0;
    
    // Update terminal title instead of interfering with command line
    process.stdout.write(`\x1b]0;MELQ Host - Connected: ${connectedCount} | Chats: ${chatCount}\x1b\\`);
  }, 2000);
  
  console.log(chalk.gray('(Stats shown in terminal title bar)'));
}

async function startChatInterface(node, connectionInfo = null) {
  // Give a moment for any console output to finish
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Clear screen to separate client interface from host output
  console.clear();
  
  console.log(chalk.gray('Initializing chat interface...'));
  
  const cli = new CLIInterface(node);
  
  // Set connection info if provided (client mode)
  if (connectionInfo) {
    cli.setConnectionInfo(connectionInfo);
  }
  
  cli.start();
  
  // Auto-discovery is now handled by the UnifiedNode itself
}

async function handleCheckUpdatesCommand() {
  console.log(chalk.blue('🔍 MELQ Update Checker'));
  console.log(chalk.gray('═'.repeat(50)));
  
  try {
    const { execSync } = await import('child_process');
    
    // Check if we're in a git repository
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    } catch (error) {
      console.log(chalk.red('❌ This MELQ installation is not a git repository.'));
      console.log(chalk.yellow('💡 To enable updates, reinstall using:'));
      console.log(chalk.white('   git clone https://github.com/ecbaldwin4/melq.git'));
      console.log(chalk.white('   cd melq && npm install'));
      process.exit(1);
    }
    
    console.log(chalk.yellow('📡 Checking for updates...'));
    
    // Fetch latest changes
    console.log(chalk.gray('🔍 Fetching latest changes from GitHub...'));
    execSync('git fetch origin', { stdio: 'pipe' });
    
    // Check if we're up to date
    const currentHash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const remoteHash = execSync('git rev-parse origin/master', { encoding: 'utf8' }).trim();
    
    console.log(chalk.gray(`   Local version:  ${currentHash.substring(0, 8)}`));
    console.log(chalk.gray(`   Remote version: ${remoteHash.substring(0, 8)}`));
    
    if (currentHash === remoteHash) {
      console.log(chalk.green('✅ MELQ is already up to date!'));
      console.log(chalk.gray('   No updates available.'));
      process.exit(0);
    }
    
    // Show what updates are available
    const commits = execSync('git log --oneline HEAD..origin/master', { encoding: 'utf8' });
    const commitLines = commits.trim().split('\n').filter(line => line.trim());
    const commitCount = commitLines.length;
    
    console.log(chalk.green(`🆕 ${commitCount} update${commitCount === 1 ? '' : 's'} available!`));
    console.log(chalk.yellow('\n📋 Recent changes:'));
    console.log(chalk.cyan(commits));
    console.log(chalk.blue('💡 Run "melq --update" to install updates.'));
    
  } catch (error) {
    console.error(chalk.red('❌ Update check failed:'), error.message);
    process.exit(1);
  }
}

async function handleUpdateCommand() {
  console.log(chalk.blue('🔄 MELQ Update Manager'));
  console.log(chalk.gray('═'.repeat(50)));
  
  try {
    const { execSync } = await import('child_process');
    const fs = await import('fs');
    const path = await import('path');
    
    // Check if we're in a git repository
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    } catch (error) {
      console.log(chalk.red('❌ This MELQ installation is not a git repository.'));
      console.log(chalk.yellow('💡 To enable updates, reinstall using:'));
      console.log(chalk.white('   git clone https://github.com/ecbaldwin4/melq.git'));
      console.log(chalk.white('   cd melq && npm install'));
      process.exit(1);
    }
    
    console.log(chalk.yellow('📡 Checking for updates...'));
    
    // Fetch latest changes
    console.log(chalk.gray('🔍 Fetching latest changes from GitHub...'));
    execSync('git fetch origin', { stdio: 'pipe' });
    
    // Check if we're up to date
    const currentHash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const remoteHash = execSync('git rev-parse origin/master', { encoding: 'utf8' }).trim();
    
    console.log(chalk.gray(`   Local version:  ${currentHash.substring(0, 8)}`));
    console.log(chalk.gray(`   Remote version: ${remoteHash.substring(0, 8)}`));
    
    if (currentHash === remoteHash) {
      console.log(chalk.green('✅ MELQ is already up to date!'));
      console.log(chalk.gray('   No updates available.'));
      process.exit(0);
    }
    
    // Show what will be updated
    const commits = execSync('git log --oneline HEAD..origin/master', { encoding: 'utf8' });
    const commitLines = commits.trim().split('\n').filter(line => line.trim());
    const commitCount = commitLines.length;
    
    console.log(chalk.green(`🆕 ${commitCount} update${commitCount === 1 ? '' : 's'} available!`));
    console.log(chalk.yellow('\n📋 Recent changes:'));
    console.log(chalk.cyan(commits));
    
    // Ask for confirmation
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const confirm = await new Promise(resolve => {
      rl.question(chalk.green('Update to latest version? (y/N): '), resolve);
    });
    
    rl.close();
    
    if (!confirm.toLowerCase().startsWith('y')) {
      console.log(chalk.yellow('Update cancelled.'));
      process.exit(0);
    }
    
    console.log(chalk.yellow('🔄 Updating MELQ...'));
    
    // Check for uncommitted changes
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf8' });
      if (status.trim()) {
        console.log(chalk.yellow('⚠️  You have uncommitted changes. Stashing them...'));
        execSync('git stash push -m "melq-auto-update-stash"', { stdio: 'pipe' });
      }
    } catch (error) {
      console.log(chalk.red('❌ Failed to stash changes:'), error.message);
      process.exit(1);
    }
    
    // Pull latest changes
    console.log(chalk.cyan('⬇️  Pulling latest changes...'));
    execSync('git pull origin master', { stdio: 'pipe' });
    
    // Update dependencies
    console.log(chalk.cyan('📦 Updating dependencies...'));
    execSync('npm install', { stdio: 'pipe' });
    
    // Get new version
    const newHash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    
    console.log(chalk.green('✅ MELQ successfully updated!'));
    console.log(chalk.gray(`   Previous: ${currentHash.substring(0, 8)}`));
    console.log(chalk.gray(`   Current:  ${newHash.substring(0, 8)}`));
    console.log(chalk.yellow('\n🚀 Run "melq" to use the updated version!'));
    
  } catch (error) {
    console.error(chalk.red('❌ Update failed:'), error.message);
    console.log(chalk.yellow('\n🔧 Manual update instructions:'));
    console.log(chalk.white('   git pull origin master'));
    console.log(chalk.white('   npm install'));
    process.exit(1);
  }
}

function showHelp() {
  console.log(chalk.yellow('\n📖 MELQ Help'));
  console.log(chalk.gray('═'.repeat(50)));
  console.log(chalk.cyan('\nQuick Start:'));
  console.log(chalk.white('  melq                    ') + chalk.gray('Interactive menu'));
  console.log(chalk.white('  melq --host             ') + chalk.gray('Host a new network'));
  console.log(chalk.white('  melq --host --internet  ') + chalk.gray('Host with internet access'));
  console.log(chalk.white('  melq --host --local-only') + chalk.gray('Host for local network only'));
  console.log(chalk.white('  melq --join <code>      ') + chalk.gray('Join existing network'));
  console.log(chalk.white('  melq --update           ') + chalk.gray('Update to latest version'));
  console.log(chalk.white('  melq --check-updates    ') + chalk.gray('Check if updates are available'));
  
  console.log(chalk.cyan('\nConnection Codes:'));
  console.log(chalk.gray('  Local: melq://192.168.1.100:3000'));
  console.log(chalk.gray('  Internet: https://abc123.ngrok.io'));
  console.log(chalk.gray('  The host displays these codes when starting'));
  console.log(chalk.gray('  Share them with others to let them join'));
  
  console.log(chalk.cyan('\nInternet Access:'));
  console.log(chalk.gray('  • Preferred: localtunnel (instant, no account required!)'));
  console.log(chalk.gray('  • Alternative: ngrok or serveo (may require accounts)'));
  console.log(chalk.gray('  • Manual setup with port forwarding'));
  console.log(chalk.gray('  • Local discovery for same network'));
  
  console.log(chalk.cyan('\nSecurity:'));
  console.log(chalk.gray('  • All messages are encrypted with post-quantum ML-KEM-768'));
  console.log(chalk.gray('  • Direct P2P connections (no central server)'));
  console.log(chalk.gray('  • Messages never stored unencrypted'));
  
  console.log(chalk.cyan('\nExamples:'));
  console.log(chalk.white('  melq --host --internet'));
  console.log(chalk.white('  melq --host --tunnel ngrok'));
  console.log(chalk.white('  melq --join melq://192.168.1.100:3000'));
  console.log(chalk.white('  melq --join https://abc123.ngrok.io'));
  console.log(chalk.white('  melq --join 203.0.113.1:3000'));
  
  process.exit(0);
}

program.parse();