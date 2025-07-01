import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import dotenv from 'dotenv';
import { createApprovalRouter } from './api/approvals';
import { ApprovalService } from './services/approval';
import { App as SlackApp, type BlockAction } from '@slack/bolt';

// Load environment variables
dotenv.config();

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Initialize services
const approvalService = new ApprovalService({
  slack: {
    token: process.env.SLACK_BOT_TOKEN || '',
    signingSecret: process.env.SLACK_SIGNING_SECRET || '',
    channel: process.env.SLACK_CHANNEL || ''
  }
});

// Initialize Slack app for handling interactions
const slackApp = new SlackApp({
  token: process.env.SLACK_BOT_TOKEN || '',
  signingSecret: process.env.SLACK_SIGNING_SECRET || '',
  socketMode: false,
  port: parseInt(process.env.SLACK_PORT || '3001')
});

// Handle Slack button interactions
slackApp.action<BlockAction>('approve', async ({ body, ack, action }) => {
  await ack();
  
  if ('value' in action && action.value) {
    await approvalService.updateDecision(action.value, {
      status: 'approved',
      decidedBy: body.user.id,
      reason: 'Approved via Slack'
    });
  }
});

slackApp.action<BlockAction>('reject', async ({ body, ack, action }) => {
  await ack();
  
  if ('value' in action && action.value) {
    await approvalService.updateDecision(action.value, {
      status: 'rejected',
      decidedBy: body.user.id,
      reason: 'Rejected via Slack'
    });
  }
});

// Routes
app.route('/api', createApprovalRouter(approvalService));

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// Start servers
const port = parseInt(process.env.PORT || '3000');

async function startServers() {
  // Start Slack app
  await slackApp.start();
  console.log('⚡️ Slack app is running on port', process.env.SLACK_PORT || '3001');
  
  // Start main server
  serve({
    fetch: app.fetch,
    port
  });
  
  console.log(`🚀 Server is running on port ${port}`);
}

startServers().catch(console.error);

export { app, approvalService };