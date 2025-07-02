#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { ToolApprovalService } from '../hooks/tool-approval-service.js';

// Load environment variables
dotenv.config();

const APPROVAL_TIMEOUT = parseInt(process.env.APPROVAL_TIMEOUT_MS || '30000');
const APPROVAL_SERVER_URL = process.env.APPROVAL_SERVER_URL || 'http://localhost:3210';

class ApprovalMcpServer {
  private server: Server;
  private approvalService: ToolApprovalService;

  constructor() {
    this.server = new Server(
      {
        name: 'ccnotify-approval-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.approvalService = new ToolApprovalService(APPROVAL_SERVER_URL, APPROVAL_TIMEOUT);
    this.setupToolHandlers();
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

      const input = JSON.stringify({ tool, params });
      const decision = await this.approvalService.handle(input);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              decision: decision.decision,
              reason: decision.reason,
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// Create and run the server
const server = new ApprovalMcpServer();
server.run().catch((error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});