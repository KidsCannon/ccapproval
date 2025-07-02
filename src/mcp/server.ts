#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { LogLevel, App as SlackApp, type BlockAction } from '@slack/bolt';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const DANGEROUS_TOOLS = ['Bash', 'Write', 'Edit', 'MultiEdit'];
const APPROVAL_TIMEOUT = parseInt(process.env.APPROVAL_TIMEOUT_MS || '30000');

interface ApprovalRequest {
  id: string;
  toolName: string;
  parameters: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'timeout';
  decidedBy?: string;
  decidedAt?: Date;
  reason?: string;
}

class ApprovalMcpServer {
  private server: Server;
  private slackApp: SlackApp;
  private approvals: Map<string, ApprovalRequest> = new Map();
  private pendingResolvers: Map<string, { resolve: (value: ApprovalRequest) => void }> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: 'ccnotify',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize Slack app for handling interactions
    this.slackApp = new SlackApp({
      logLevel: LogLevel.DEBUG,
      token: process.env.SLACK_BOT_TOKEN ?? '',
      appToken: process.env.SLACK_APP_TOKEN ?? '',
      socketMode: true,
    });

    this.setupSlackHandlers();
    this.setupToolHandlers();
  }

  private setupSlackHandlers() {
    // Handle approve button
    this.slackApp.action<BlockAction>('approve', async ({ body, ack, action, client }) => {
      await ack();
      
      if ('value' in action && action.value) {
        const approval = this.approvals.get(action.value);
        if (approval && approval.status === 'pending') {
          approval.status = 'approved';
          approval.decidedBy = body.user.id;
          approval.decidedAt = new Date();
          approval.reason = 'Approved via Slack';

          // Notify waiting promise
          const resolver = this.pendingResolvers.get(action.value);
          if (resolver) {
            resolver.resolve(approval);
            this.pendingResolvers.delete(action.value);
          }

          // Update Slack message
          if (body.message?.ts) {
            await client.chat.update({
              channel: body.channel?.id || process.env.SLACK_CHANNEL || '',
              ts: body.message.ts,
              text: `✅ Tool execution approved by <@${body.user.id}>`,
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `✅ *Tool execution approved*\n\n*Tool:* ${approval.toolName}\n*Decided by:* <@${body.user.id}>\n*Time:* ${new Date().toISOString()}`
                  }
                }
              ]
            });
          }
        }
      }
    });

    // Handle reject button
    this.slackApp.action<BlockAction>('reject', async ({ body, ack, action, client }) => {
      await ack();
      
      if ('value' in action && action.value) {
        const approval = this.approvals.get(action.value);
        if (approval && approval.status === 'pending') {
          approval.status = 'rejected';
          approval.decidedBy = body.user.id;
          approval.decidedAt = new Date();
          approval.reason = 'Rejected via Slack';

          // Notify waiting promise
          const resolver = this.pendingResolvers.get(action.value);
          if (resolver) {
            resolver.resolve(approval);
            this.pendingResolvers.delete(action.value);
          }

          // Update Slack message
          if (body.message?.ts) {
            await client.chat.update({
              channel: body.channel?.id || process.env.SLACK_CHANNEL || '',
              ts: body.message.ts,
              text: `❌ Tool execution rejected by <@${body.user.id}>`,
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `❌ *Tool execution rejected*\n\n*Tool:* ${approval.toolName}\n*Decided by:* <@${body.user.id}>\n*Time:* ${new Date().toISOString()}`
                  }
                }
              ]
            });
          }
        }
      }
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'tool-approval',
            description: 'Request approval for dangerous tool usage with Slack notification',
            inputSchema: {
              type: 'object',
              properties: {
                tool: {
                  type: 'string',
                  description: 'Name of the tool requiring approval',
                },
                params: {
                  type: 'object',
                  description: 'Parameters being passed to the tool',
                },
              },
              required: ['tool', 'params'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'tool-approval':
          return await this.handleToolApproval(request.params.arguments || {});
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async handleToolApproval(args: any) {
    try {
      const { tool, params } = args;
      
      if (!tool || !params) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Both tool and params are required'
        );
      }

      // Check if tool is dangerous
      if (!DANGEROUS_TOOLS.includes(tool)) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                decision: 'approve',
                reason: 'Safe tool - automatic approval',
                timestamp: new Date().toISOString(),
              }),
            },
          ],
        };
      }

      // Create approval request
      const approval: ApprovalRequest = {
        id: randomUUID(),
        toolName: tool,
        parameters: params,
        status: 'pending'
      };
      
      this.approvals.set(approval.id, approval);

      // Send Slack notification
      try {
        await this.slackApp.client.chat.postMessage({
          channel: process.env.SLACK_CHANNEL || '',
          text: `🔧 Tool execution approval requested: ${tool}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🔧 *Tool execution approval requested*\n\n*Tool:* ${tool}\n*Parameters:*\n\`\`\`${JSON.stringify(params, null, 2)}\`\`\``
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: '✅ Approve'
                  },
                  style: 'primary',
                  action_id: 'approve',
                  value: approval.id
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: '❌ Reject'
                  },
                  style: 'danger',
                  action_id: 'reject',
                  value: approval.id
                }
              ]
            }
          ]
        });
      } catch (error) {
        console.error('Failed to send Slack notification:', error);
        // Continue even if Slack fails
      }

      // Wait for decision with timeout
      const decision = await this.waitForDecision(approval.id);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              decision: decision.status === 'approved' ? 'approve' : 'block',
              reason: decision.reason || `Decision: ${decision.status}`,
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Approval process failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async waitForDecision(id: string): Promise<ApprovalRequest> {
    return new Promise((resolve) => {
      this.pendingResolvers.set(id, { resolve });

      // Set timeout
      setTimeout(() => {
        const approval = this.approvals.get(id);
        if (approval && approval.status === 'pending') {
          approval.status = 'timeout';
          approval.reason = 'Approval request timed out';
          
          const resolver = this.pendingResolvers.get(id);
          if (resolver) {
            resolver.resolve(approval);
            this.pendingResolvers.delete(id);
          }
        }
      }, APPROVAL_TIMEOUT);
    });
  }

  async run() {
    // Start Slack app
    await this.slackApp.start();
    console.log('⚡️ Slack app is running on port', process.env.SLACK_PORT || '3001');

    // Start MCP server
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('🚀 MCP server connected and ready');
  }
}

// Create and run the server
const server = new ApprovalMcpServer();
server.run().catch((error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});
