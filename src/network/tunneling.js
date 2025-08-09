import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import fetch from 'node-fetch';
import chalk from 'chalk';

const execAsync = promisify(exec);

export class TunnelingService {
  constructor() {
    this.activeProcess = null;
    this.publicUrl = null;
    this.method = null;
  }

  async exposeToInternet(localPort, options = {}) {
    const { preferredMethod = 'auto', customDomain } = options;
    
    console.log(chalk.yellow('🌐 Setting up internet access...'));
    
    if (preferredMethod === 'manual' || preferredMethod === 'auto') {
      const manualUrl = await this.tryManualSetup(localPort, customDomain);
      if (manualUrl) return manualUrl;
    }
    
    if (preferredMethod === 'ngrok' || preferredMethod === 'auto') {
      const ngrokUrl = await this.tryNgrok(localPort);
      if (ngrokUrl) return ngrokUrl;
    }
    
    if (preferredMethod === 'localtunnel' || preferredMethod === 'auto') {
      const ltUrl = await this.tryLocalTunnel(localPort);
      if (ltUrl) return ltUrl;
    }
    
    if (preferredMethod === 'serveo' || preferredMethod === 'auto') {
      const serveoUrl = await this.tryServeo(localPort);
      if (serveoUrl) return serveoUrl;
    }
    
    throw new Error('No tunneling method available. Try manual setup or install ngrok.');
  }

  async tryManualSetup(localPort, customDomain) {
    if (customDomain) {
      console.log(chalk.blue(`📡 Using custom domain: ${customDomain}`));
      this.method = 'manual';
      this.publicUrl = customDomain.startsWith('http') ? customDomain : `https://${customDomain}`;
      return {
        publicUrl: this.publicUrl,
        connectionCode: this.publicUrl.replace(/^https?:\/\//, 'melq://'),
        method: 'manual'
      };
    }
    
    // Try to detect public IP
    try {
      const response = await fetch('https://api.ipify.org?format=text', { timeout: 5000 });
      const publicIp = await response.text();
      
      console.log(chalk.blue(`📡 Detected public IP: ${publicIp}`));
      console.log(chalk.yellow('⚠️  Manual setup required:'));
      console.log(chalk.gray(`   1. Configure router to forward port ${localPort} to this device`));
      console.log(chalk.gray(`   2. Share connection code: melq://${publicIp}:${localPort}`));
      
      this.method = 'manual';
      this.publicUrl = `http://${publicIp}:${localPort}`;
      
      return {
        publicUrl: this.publicUrl,
        connectionCode: `melq://${publicIp}:${localPort}`,
        method: 'manual',
        requiresPortForwarding: true
      };
      
    } catch (error) {
      console.log(chalk.gray('Could not detect public IP'));
      return null;
    }
  }

  async tryNgrok(localPort) {
    try {
      console.log(chalk.gray(`Trying ngrok on port ${localPort}...`));
      
      // Check if ngrok is available
      try {
        await execAsync('ngrok version');
        console.log(chalk.gray('✓ ngrok found'));
      } catch (error) {
        console.log(chalk.gray('ngrok not found, skipping...'));
        return null;
      }

      // Kill any existing ngrok processes to avoid session limit error
      try {
        const isWindows = process.platform === 'win32';
        const killCommand = isWindows 
          ? 'taskkill /f /im ngrok.exe' 
          : 'pkill -f ngrok';
        
        await execAsync(killCommand);
        console.log(chalk.gray('✓ Cleaned up existing ngrok processes'));
        // Wait a moment for processes to fully terminate
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        // No existing processes, that's fine
      }
      
      // Start ngrok
      console.log(chalk.gray(`Starting: ngrok http ${localPort}`));
      this.activeProcess = spawn('ngrok', ['http', localPort.toString()], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let stdoutOutput = '';
      let stderrOutput = '';
      
      this.activeProcess.stdout.on('data', (data) => {
        const text = data.toString();
        stdoutOutput += text;
        console.log(chalk.gray('ngrok stdout:'), text.trim());
      });
      
      this.activeProcess.stderr.on('data', (data) => {
        const text = data.toString();
        stderrOutput += text;
        console.log(chalk.gray('ngrok stderr:'), text.trim());
      });
      
      // Wait for ngrok to start and get the URL
      return new Promise((resolve) => {
        // Give ngrok some time to start, then check its API
        setTimeout(async () => {
          try {
            console.log(chalk.gray('Checking ngrok API for tunnel info...'));
            const response = await fetch('http://127.0.0.1:4040/api/tunnels');
            const data = await response.json();
            
            if (data.tunnels && data.tunnels.length > 0) {
              const tunnel = data.tunnels.find(t => t.config && t.config.addr && t.config.addr.includes(localPort.toString()));
              
              if (tunnel && tunnel.public_url) {
                clearTimeout(timeout);
                const publicUrl = tunnel.public_url.replace('http://', 'https://'); // Ensure HTTPS
                this.publicUrl = publicUrl;
                this.method = 'ngrok';
                
                console.log(chalk.green('✅ ngrok tunnel found via API!'));
                console.log(chalk.blue(`📡 Public URL: ${publicUrl}`));
                
                resolve({
                  publicUrl,
                  connectionCode: publicUrl.replace('https://', 'melq://'),
                  method: 'ngrok'
                });
                return;
              }
            }
          } catch (error) {
            console.log(chalk.gray('ngrok API check failed:', error.message));
          }
        }, 5000);

        const timeout = setTimeout(() => {
          console.log(chalk.gray('ngrok timeout - checking output:'));
          if (stdoutOutput) console.log(chalk.gray('STDOUT:'), stdoutOutput.slice(-200));
          if (stderrOutput) console.log(chalk.gray('STDERR:'), stderrOutput.slice(-200));
          this.cleanup();
          resolve(null);
        }, 20000); // Increased timeout for API check
        
        // Check both stdout and stderr for the URL
        const checkForUrl = (text) => {
          const urlMatch = text.match(/https:\/\/[\\w\\.-]+\\.ngrok(?:-free)?\\.app/);
          
          if (urlMatch) {
            clearTimeout(timeout);
            const publicUrl = urlMatch[0];
            this.publicUrl = publicUrl;
            this.method = 'ngrok';
            
            console.log(chalk.green('✅ ngrok tunnel established!'));
            console.log(chalk.blue(`📡 Public URL: ${publicUrl}`));
            
            resolve({
              publicUrl,
              connectionCode: publicUrl.replace('https://', 'melq://'),
              method: 'ngrok'
            });
            return true;
          }
          return false;
        };
        
        this.activeProcess.stdout.on('data', (data) => {
          checkForUrl(data.toString());
        });
        
        this.activeProcess.stderr.on('data', (data) => {
          checkForUrl(data.toString());
        });
        
        this.activeProcess.on('error', (error) => {
          console.log(chalk.gray('ngrok process error:'), error.message);
          clearTimeout(timeout);
          resolve(null);
        });
        
        this.activeProcess.on('exit', (code, signal) => {
          console.log(chalk.gray(`ngrok exited with code ${code}, signal ${signal}`));
          if (stderrOutput.includes('authenticate')) {
            console.log(chalk.yellow('⚠️  ngrok authentication required. Run: ngrok authtoken <token>'));
          }
          clearTimeout(timeout);
          resolve(null);
        });
      });
      
    } catch (error) {
      console.log(chalk.gray('ngrok failed:', error.message));
      return null;
    }
  }

  async tryLocalTunnel(localPort) {
    try {
      console.log(chalk.gray('Trying localtunnel...'));
      
      // Try to install localtunnel if not available
      try {
        await execAsync('npx localtunnel --version');
      } catch (error) {
        console.log(chalk.gray('localtunnel not available, skipping...'));
        return null;
      }
      
      this.activeProcess = spawn('npx', ['localtunnel', '--port', localPort.toString()], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.cleanup();
          resolve(null);
        }, 15000);
        
        this.activeProcess.stdout.on('data', (data) => {
          const text = data.toString();
          const urlMatch = text.match(/https:\/\/[\\w\\.-]+\\.loca\\.lt/);
          
          if (urlMatch) {
            clearTimeout(timeout);
            const publicUrl = urlMatch[0];
            this.publicUrl = publicUrl;
            this.method = 'localtunnel';
            
            console.log(chalk.green('✅ Localtunnel established!'));
            console.log(chalk.blue(`📡 Public URL: ${publicUrl}`));
            
            resolve({
              publicUrl,
              connectionCode: publicUrl.replace('https://', 'melq://'),
              method: 'localtunnel'
            });
          }
        });
        
        this.activeProcess.on('error', () => {
          clearTimeout(timeout);
          resolve(null);
        });
        
        this.activeProcess.on('exit', () => {
          clearTimeout(timeout);
          resolve(null);
        });
      });
      
    } catch (error) {
      console.log(chalk.gray('localtunnel failed:', error.message));
      return null;
    }
  }

  async tryServeo(localPort) {
    try {
      console.log(chalk.gray('Trying serveo.net...'));
      
      this.activeProcess = spawn('ssh', [
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ServerAliveInterval=60',
        '-R', `80:localhost:${localPort}`,
        'serveo.net'
      ], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.cleanup();
          resolve(null);
        }, 10000);
        
        this.activeProcess.stderr.on('data', (data) => {
          const text = data.toString();
          const urlMatch = text.match(/https:\/\/[\\w\\.-]+\\.serveo\\.net/);
          
          if (urlMatch) {
            clearTimeout(timeout);
            const publicUrl = urlMatch[0];
            this.publicUrl = publicUrl;
            this.method = 'serveo';
            
            console.log(chalk.green('✅ Serveo tunnel established!'));
            console.log(chalk.blue(`📡 Public URL: ${publicUrl}`));
            
            resolve({
              publicUrl,
              connectionCode: publicUrl.replace('https://', 'melq://'),
              method: 'serveo'
            });
          }
        });
        
        this.activeProcess.on('error', () => {
          clearTimeout(timeout);
          resolve(null);
        });
        
        this.activeProcess.on('exit', () => {
          clearTimeout(timeout);
          resolve(null);
        });
      });
      
    } catch (error) {
      console.log(chalk.gray('serveo failed:', error.message));
      return null;
    }
  }

  cleanup() {
    if (this.activeProcess) {
      console.log(chalk.gray('Stopping tunneling service...'));
      
      try {
        // For ngrok, try graceful shutdown first
        if (this.method === 'ngrok') {
          this.activeProcess.kill('SIGTERM');
          
          // If process doesn't exit gracefully, force kill after 3 seconds
          setTimeout(() => {
            if (this.activeProcess && !this.activeProcess.killed) {
              console.log(chalk.gray('Force killing ngrok process...'));
              this.activeProcess.kill('SIGKILL');
            }
          }, 3000);
        } else {
          this.activeProcess.kill();
        }
        
        this.activeProcess = null;
      } catch (error) {
        console.log(chalk.gray('Error stopping tunnel process:'), error.message);
      }
    }
    
    this.publicUrl = null;
    this.method = null;
  }

  getConnectionInfo() {
    return {
      publicUrl: this.publicUrl,
      method: this.method,
      isActive: !!this.activeProcess
    };
  }
}

// Helper function to validate and normalize connection codes
export function parseConnectionCode(connectionCode) {
  if (!connectionCode) throw new Error('Connection code is required');
  
  // Clean up the input
  const cleanCode = connectionCode.trim();
  
  // Handle melq:// format
  if (cleanCode.startsWith('melq://')) {
    const address = cleanCode.replace('melq://', '');
    // Use WSS for ngrok-free.app domains even with melq:// prefix
    if (address.includes('.ngrok-free.app') || address.includes('.ngrok.') || address.includes('.loca.lt') || address.includes('.serveo.net')) {
      return `wss://${address}/ws`;
    }
    return `ws://${address}/ws`;
  }
  
  // Handle https:// format (for tunnels like ngrok)
  if (cleanCode.startsWith('https://')) {
    const address = cleanCode.replace('https://', '');
    // Don't add /ws for ngrok-free.app - they handle routing differently
    if (address.includes('.ngrok-free.app')) {
      return `wss://${address}`;
    }
    return `wss://${address}/ws`;
  }
  
  // Handle http:// format  
  if (cleanCode.startsWith('http://')) {
    const address = cleanCode.replace('http://', '');
    // Upgrade HTTP to HTTPS for tunnel services
    if (address.includes('.ngrok-free.app') || address.includes('.ngrok.') || address.includes('.loca.lt') || address.includes('.serveo.net')) {
      return `wss://${address}/ws`;
    }
    return `ws://${address}/ws`;
  }
  
  // Handle bare ngrok/tunnel domains (assume https)
  if (cleanCode.includes('.ngrok.') || cleanCode.includes('.loca.lt') || cleanCode.includes('.serveo.net')) {
    return `wss://${cleanCode}/ws`;
  }
  
  // Handle IP:port format
  if (cleanCode.includes(':') && /^[0-9.:]+$/.test(cleanCode)) {
    return `ws://${cleanCode}/ws`;
  }
  
  // Handle bare domain (assume https for tunnels, ws for local)
  if (cleanCode.includes('.')) {
    return `wss://${cleanCode}/ws`;
  }
  
  throw new Error('Invalid connection code format. Expected: melq://host:port, https://tunnel.url, or IP:port');
}