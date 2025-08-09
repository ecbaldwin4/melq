#!/usr/bin/env node

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import and run the main application
const appPath = join(__dirname, '..', 'src', 'index.js');
// Convert path to file URL for cross-platform compatibility
const appURL = pathToFileURL(appPath).href;
await import(appURL);