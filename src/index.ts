#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { handlePermissionPrompt } from "./ccapproval.ts";
import { debug } from "./utils.ts";

const NAME = "ccapproval";

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;
const SLACK_CHANNEL_NAME = process.env.SLACK_CHANNEL_NAME;

async function main() {
	switch (process.argv[2]) {
		case "mcp":
			await mcp();
			break;
		case "hook":
			await hook();
			break;
		default:
			throw new Error(`Unknown sub-command: ${process.argv[2]}`);
	}
}

async function hook() {
	// TODO: implement
}

async function mcp() {
	if (!SLACK_BOT_TOKEN || !SLACK_APP_TOKEN || !SLACK_CHANNEL_NAME) {
		throw new Error("Missing required environment variables");
	}

	const server = new Server(
		{
			name: NAME,
			version: "1.0.0",
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		debug("CallToolRequestSchema", request);

		switch (request.params.name) {
			case "tool-approval": {
				return await handlePermissionPrompt(request.params.arguments || {}, {
					channel: SLACK_CHANNEL_NAME,
					waitTimeout: 12 * 60 * 60 * 1000, // 12 hours
				});
			}
			default:
				throw new McpError(
					ErrorCode.MethodNotFound,
					`Unknown tool: ${request.params.name}`,
				);
		}
	});

	server.setRequestHandler(ListToolsRequestSchema, async () => {
		debug("Listing tools");
		return {
			tools: [
				{
					name: "tool-approval",
					description:
						"Request approval for dangerous tool usage with Slack notification",
					inputSchema: {
						type: "object",
						properties: {
							tool_name: {
								type: "string",
								description: "Name of the tool requiring approval",
							},
							input: {
								type: "object",
								description: "Parameters being passed to the tool",
							},
						},
						required: ["tool_name", "input"],
					},
				},
			],
		};
	});

	const transport = new StdioServerTransport();
	await server.connect(transport);
	debug("🚀 MCP server connected and ready");

	// Handle stdin close to exit gracefully when Claude terminates
	process.stdin.on("end", async () => {
		debug("Claude process ended, shutting down...");
		await server.close();
		process.exit(0);
	});

	process.stdin.on("close", async () => {
		debug("stdin closed, shutting down...");
		await server.close();
		process.exit(0);
	});
}

main().catch((error) => {
	debug("Server failed to start:", error);
	process.exit(1);
});
