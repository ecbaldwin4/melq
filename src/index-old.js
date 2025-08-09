import { Command } from 'commander';
import { P2PNode } from './network/node.js';
import { CLIInterface } from './cli/interface.js';
import chalk from 'chalk';

const program = new Command();

program
  .name('melq')
  .description('Secure P2P chat with directory-like interface')
  .version('1.0.0')
  .option('-c, --coordinator <url>', 'Coordinator server URL', 'ws://localhost:3000/ws')
  .action(async (options) => {
    console.log(chalk.blue('Starting MELQ P2P Chat...'));
    
    try {
      let coordinatorUrl = options.coordinator.replace('http://', 'ws://').replace('https://', 'wss://');
      if (!coordinatorUrl.endsWith('/ws')) {
        coordinatorUrl += '/ws';
      }

      const node = new P2PNode(coordinatorUrl);
      console.log(chalk.gray(`Connecting to coordinator: ${coordinatorUrl}`));
      
      await node.connect();
      
      const cli = new CLIInterface(node);
      cli.start();
      
      setTimeout(() => {
        node.discoverNodes();
      }, 1000);
      
    } catch (error) {
      console.error(chalk.red('Failed to start MELQ:'), error.message);
      console.log(chalk.yellow('Make sure the coordinator server is running.'));
      console.log(chalk.gray('Start coordinator with: npm run coordinator'));
      process.exit(1);
    }
  });

program.parse();