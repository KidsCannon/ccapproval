#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from "@modelcontextprotocol/sdk/types.js";
import z from "zod";
import { handlePermissionPrompt } from "./ccapproval.ts";
import { startSlackApp } from "./slack.ts";
import { debug, error } from "./utils.ts";

const NAME = "ccapproval";

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;
const SLACK_CHANNEL_NAME = process.env.SLACK_CHANNEL_NAME;

const inputSchema = z.object({
	tool_name: z.string(),
	input: z.record(z.unknown()),
});

export async function mcp() {
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

		try {
			switch (request.params.name) {
				case "tool-approval": {
					debug("Starting Slack app");
					const slackApp = await startSlackApp();
					try {
						debug("Parsing arguments");
						const arg = inputSchema.safeParse(request.params.arguments);
						if (!arg.success) {
							throw new McpError(ErrorCode.InvalidParams, "Invalid arguments");
						}
						debug("Calling handlePermissionPrompt");
						return await handlePermissionPrompt(slackApp, arg.data, {
							channel: SLACK_CHANNEL_NAME,
							waitTimeout: 12 * 60 * 60 * 1000, // 12 hours
						});
					} finally {
						await slackApp.stop();
					}
				}
				default:
					throw new McpError(
						ErrorCode.MethodNotFound,
						`Unknown tool: ${request.params.name}`,
					);
			}
		} catch (err) {
			error("Approval process failed", err);
			throw new McpError(
				ErrorCode.InternalError,
				`Approval process failed: ${err instanceof Error ? err.message : "Unknown error"}`,
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
