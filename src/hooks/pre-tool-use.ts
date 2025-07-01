#!/usr/bin/env node
import dotenv from 'dotenv';
import { PreToolUseHandler } from './pre-tool-use-logic';

// Load environment variables
dotenv.config();

const APPROVAL_TIMEOUT = parseInt(process.env.APPROVAL_TIMEOUT_MS || '30000');
const APPROVAL_SERVER_URL = process.env.APPROVAL_SERVER_URL || 'http://localhost:3000';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function main() {
  const handler = new PreToolUseHandler(APPROVAL_SERVER_URL, APPROVAL_TIMEOUT);
  const input = await readStdin();
  const result = await handler.handle(input);
  console.log(JSON.stringify(result));
}

// Run the main function
main();