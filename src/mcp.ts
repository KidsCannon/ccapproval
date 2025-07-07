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
	private calledToolCount = 0;
	private isShuttingDown = false;
	private slackThreadTs: string | undefined;
	private slackChannel: string | undefined;

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

		const { ts, channel } = await this.slackApp.client.chat.postMessage({
			channel: env.SLACK_CHANNEL_NAME,
			text: `${NAME} is started`,
		});

		// Store thread info for shutdown message
		this.slackThreadTs = ts;
		this.slackChannel = channel;

		await this.registerTools();
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

		// Send shutdown message to Slack
		if (this.slackThreadTs && this.slackChannel) {
			try {
				await this.slackApp.client.chat.postMessage({
					channel: this.slackChannel,
					thread_ts: this.slackThreadTs,
					text: `${NAME} is finished`,
				});
			} catch (err) {
				error("Failed to send shutdown message to Slack", { error: err });
			}
		}

		debug("Stopping Slack app...");
		await this.slackApp.stop();

		debug("Closing MCP server...");
		await this.server.close();
	}

	private async registerTools() {
		this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
			if (this.slackThreadTs == null || this.slackChannel == null) {
				throw new McpError(
					ErrorCode.InternalError,
					"Failed to post message to Slack",
				);
			}
			if (this.isShuttingDown) {
				throw new McpError(ErrorCode.InternalError, "Server is shutting down");
			}

			try {
				switch (request.params.name) {
					case "tool-approval": {
						this.calledToolCount++;
						const arg = inputSchema.safeParse(request.params.arguments);
						if (!arg.success) {
							throw new McpError(ErrorCode.InvalidParams, "Invalid arguments");
						}
						return await handlePermissionPrompt(this.slackApp, arg.data, {
							toolCallCount: this.calledToolCount,
							rootThreadTs: this.slackThreadTs,
							channel: this.slackChannel,
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
