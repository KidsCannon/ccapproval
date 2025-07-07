import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from "@modelcontextprotocol/sdk/types.js";
import type { App } from "@slack/bolt";
import z from "zod";
import { handlePermissionPrompt } from "./ccapproval.ts";
import { NAME, VERSION } from "./constants.ts";
import { env } from "./env.ts";
import { slackApp } from "./slack.ts";
import { debug, error, info } from "./utils.ts";

const inputSchema = z.object({
	tool_name: z.string(),
	input: z.unknown(),
});

export class McpServer {
	private slackApp: App;
	private server: Server;
	private transport: StdioServerTransport;
	private isShuttingDown = false;

	constructor() {
		this.slackApp = slackApp();
		this.server = new Server(
			{
				name: NAME,
				version: VERSION,
			},
			{
				capabilities: {
					tools: {},
				},
			},
		);
		this.transport = new StdioServerTransport();
	}

	async start() {
		await this.slackApp.start();

		// Get workspace info for logging
		try {
			const authTest = await this.slackApp.client.auth.test();
			info("Slack client connected", {
				workspace: authTest.team || "unknown",
				botUser: authTest.user || "unknown",
			});
		} catch (err) {
			error("Failed to get Slack workspace info", { error: err });
		}

		this.registerTools();
		await this.server.connect(this.transport);
		info("MCP server started", { transport: "stdio" });

		// Handle various shutdown signals
		process.on("SIGINT", this.shutdown);
		process.on("SIGTERM", this.shutdown);

		// Handle stdin close when Claude terminates
		process.stdin.on("end", async () => {
			debug("Claude process ended, shutting down...");
			await this.shutdown();
		});
		process.stdin.on("close", async () => {
			debug("stdin closed, shutting down...");
			await this.shutdown();
		});
	}

	private async shutdown() {
		if (this.isShuttingDown) {
			return;
		}

		this.isShuttingDown = true;

		debug("Stopping Slack app...");
		await this.slackApp.stop();

		debug("Closing MCP server...");
		await this.server.close();
	}

	private registerTools() {
		// Handle tool calls
		this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
			if (this.isShuttingDown) {
				throw new McpError(ErrorCode.InternalError, "Server is shutting down");
			}

			try {
				switch (request.params.name) {
					case "tool-approval": {
						const arg = inputSchema.safeParse(request.params.arguments);
						if (!arg.success) {
							throw new McpError(ErrorCode.InvalidParams, "Invalid arguments");
						}
						return await handlePermissionPrompt(this.slackApp, arg.data, {
							channel: env.SLACK_CHANNEL_NAME,
							waitTimeout: 12 * 60 * 60 * 1000, // 12 hours
						});
					}
					default:
						throw new McpError(
							ErrorCode.MethodNotFound,
							`Unknown tool: ${request.params.name}`,
						);
				}
			} catch (err) {
				error("MCP request failed", {
					tool: request.params.name,
					error: err instanceof Error ? err.message : "Unknown error",
				});
				throw new McpError(
					ErrorCode.InternalError,
					`Approval process failed: ${err instanceof Error ? err.message : "Unknown error"}`,
				);
			}
		});

		// List available tools
		this.server.setRequestHandler(ListToolsRequestSchema, async () => {
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
	}

	async stop(): Promise<void> {
		if (this.isShuttingDown) {
			return;
		}
		this.isShuttingDown = true;

		try {
			// Stop accepting new connections
			await this.transport.close();
			// Stop Slack app
			await this.slackApp.stop();
		} catch (err) {
			error("Error during server shutdown", { error: err });
			throw err;
		}
	}
}
