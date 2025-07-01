import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import dotenv from 'dotenv';
import { createApprovalRouter } from './api/approvals';
import { ApprovalService } from './services/approval';
import { SlackService } from './services/slack';
import { App as SlackApp } from '@slack/bolt';

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
slackApp.action('approve', async ({ body, ack }) => {
  await ack();
  
  if ('value' in body.actions[0]) {
    await approvalService.updateDecision(body.actions[0].value, {
      status: 'approved',
      decidedBy: body.user.id,
      reason: 'Approved via Slack'
    });
  }
});

slackApp.action('reject', async ({ body, ack }) => {
  await ack();
  
  if ('value' in body.actions[0]) {
    await approvalService.updateDecision(body.actions[0].value, {
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