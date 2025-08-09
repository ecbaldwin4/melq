import { promisify } from 'util';

class AsyncLogger {
  constructor() {
    this.logQueue = [];
    this.isProcessing = false;
  }

  // Queue log messages and process them asynchronously
  async log(...args) {
    return this._queueLog('log', args);
  }

  async error(...args) {
    return this._queueLog('error', args);
  }

  async warn(...args) {
    return this._queueLog('warn', args);
  }

  async info(...args) {
    return this._queueLog('info', args);
  }

  _queueLog(level, args) {
    return new Promise((resolve) => {
      this.logQueue.push({
        level,
        args,
        resolve,
        timestamp: Date.now()
      });
      
      // Process queue if not already processing
      if (!this.isProcessing) {
        setImmediate(() => this._processQueue());
      }
    });
  }

  async _processQueue() {
    if (this.isProcessing || this.logQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.logQueue.length > 0) {
      const logEntry = this.logQueue.shift();
      
      try {
        // Use setImmediate to yield control and make logging non-blocking
        await new Promise(resolve => {
          setImmediate(() => {
            console[logEntry.level](...logEntry.args);
            resolve();
          });
        });
        
        logEntry.resolve();
      } catch (error) {
        // Fallback to synchronous logging if async fails
        console[logEntry.level](...logEntry.args);
        logEntry.resolve();
      }
    }

    this.isProcessing = false;
  }

  // Synchronous fallback for critical messages that must be shown immediately
  sync(level, ...args) {
    console[level](...args);
  }
}

// Create singleton instance
const logger = new AsyncLogger();

export default logger;