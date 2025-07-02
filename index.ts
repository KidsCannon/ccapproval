#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import bolt from '@slack/bolt';

const NAME = 'ccapproval';
const DANGEROUS_TOOLS = ['Bash', 'Write', 'Edit', 'MultiEdit'];
const APPROVAL_TIMEOUT = 12 * 60 * 60 * 1000; // 12 hours
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN || '';
const SLACK_CHANNEL_NAME = process.env.SLACK_CHANNEL_NAME || '';

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
  private slackApp: bolt.App;
  private approvals: Map<string, ApprovalRequest> = new Map();
  private pendingResolvers: Map<string, { resolve: (value: ApprovalRequest) => void }> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: NAME,
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize Slack app for handling interactions
    this.slackApp = new bolt.App({
      logLevel: bolt.LogLevel.DEBUG,
      token: SLACK_BOT_TOKEN ?? '',
      appToken: SLACK_APP_TOKEN ?? '',
      socketMode: true,
    });

    this.setupSlackHandlers();
    this.setupToolHandlers();
  }

  private setupSlackHandlers() {
    // Handle approve button
    this.slackApp.action<bolt.BlockAction>('approve', async ({ body, ack, action, client }) => {
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
              channel: body.channel?.id || SLACK_CHANNEL_NAME || '',
              ts: body.message.ts,
              text: `✅ Tool execution approved by <@${body.user.id}>`,
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `✅ *Tool execution approved*\n\n*Tool:* ${approval.toolName}\n*Arguments:* ${JSON.stringify(approval.parameters, null, 2)}\n*Decided by:* <@${body.user.id}>\n*Time:* ${new Date().toISOString()}`
                  }
                }
              ]
            });
          }
        }
      }
    });

    // Handle reject button
    this.slackApp.action<bolt.BlockAction>('reject', async ({ body, ack, action, client }) => {
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
              channel: body.channel?.id || SLACK_CHANNEL_NAME || '',
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
                tool_name: {
                  type: 'string',
                  description: 'Name of the tool requiring approval',
                },
                input: {
                  type: 'object',
                  description: 'Parameters being passed to the tool',
                },
              },
              required: ['tool_name', 'input'],
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
      const { tool_name, input } = args;
      
      if (!tool_name || !input) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Both tool and params are required'
        );
      }

      // Check if tool is dangerous
      console.log('received tool', tool_name)
      if (!DANGEROUS_TOOLS.includes(tool_name)) {
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
        toolName: tool_name,
        parameters: input,
        status: 'pending'
      };
      
      this.approvals.set(approval.id, approval);

      // Send Slack notification
      try {
        await this.slackApp.client.chat.postMessage({
          channel: SLACK_CHANNEL_NAME || '',
          text: `🔧 Tool execution approval requested: ${tool_name}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🔧 *Tool execution approval requested*\n\n*Tool:* ${tool_name}\n*Parameters:*\n\`\`\`${JSON.stringify(input, null, 2)}\`\`\``
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
    console.log('⚡️ Slack app is running');

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
