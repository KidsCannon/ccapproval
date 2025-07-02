#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from "@modelcontextprotocol/sdk/types.js";
import bolt from "@slack/bolt";

const NAME = "ccapproval";
const DANGEROUS_TOOLS = ["Bash", "Write", "Edit", "MultiEdit"];
const APPROVAL_TIMEOUT = 12 * 60 * 60 * 1000; // 12 hours
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN || "";
const SLACK_CHANNEL_NAME = process.env.SLACK_CHANNEL_NAME || "";

interface ApprovalRequest {
	id: string;
	toolName: string;
	parameters: Record<string, unknown>;
	status: "pending" | "approved" | "rejected" | "timeout";
	decidedBy?: string;
	decidedAt?: Date;
	reason?: string;
}

let server: Server;
let slackApp: bolt.App;
const approvals = new Map<string, ApprovalRequest>();
const pendingResolvers = new Map<
	string,
	{ resolve: (value: ApprovalRequest) => void }
>();

// Debug logging for MCP Server
function debug(...args: unknown[]) {
	console.error(...args);
}

// ツール承認の処理
async function handleToolApproval(args: unknown) {
	try {
		const { tool_name, input } = args as {
			tool_name: string;
			input: Record<string, unknown>;
		};

		if (!tool_name || !input) {
			throw new McpError(
				ErrorCode.InvalidParams,
				"Both tool and params are required",
			);
		}

		// Check if tool is dangerous
		debug("received tool", tool_name);
		if (!DANGEROUS_TOOLS.includes(tool_name)) {
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							decision: "approve",
							reason: "Safe tool - automatic approval",
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
			status: "pending",
		};

		approvals.set(approval.id, approval);

		// Send Slack notification
		try {
			await slackApp.client.chat.postMessage({
				channel: SLACK_CHANNEL_NAME || "",
				text: `🔧 Tool execution approval requested: ${tool_name}`,
				blocks: [
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text: `🔧 *Tool execution approval requested*\n\n*Tool:* ${tool_name}\n*Parameters:*\n\`\`\`${JSON.stringify(input, null, 2)}\`\`\``,
						},
					},
					{
						type: "actions",
						elements: [
							{
								type: "button",
								text: {
									type: "plain_text",
									text: "✅ Approve",
								},
								style: "primary",
								action_id: "approve",
								value: approval.id,
							},
							{
								type: "button",
								text: {
									type: "plain_text",
									text: "❌ Reject",
								},
								style: "danger",
								action_id: "reject",
								value: approval.id,
							},
						],
					},
				],
			});
		} catch (error) {
			debug("Failed to send Slack notification:", error);
			// Continue even if Slack fails
		}

		// Wait for decision with timeout
		const decision = await waitForDecision(approval.id);

		return {
			content: [
				{
					type: "text",
					text: JSON.stringify({
						decision: decision.status === "approved" ? "approve" : "block",
						reason: decision.reason || `Decision: ${decision.status}`,
						timestamp: new Date().toISOString(),
					}),
				},
			],
		};
	} catch (error) {
		throw new McpError(
			ErrorCode.InternalError,
			`Approval process failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

// 承認の決定を待つ
async function waitForDecision(id: string): Promise<ApprovalRequest> {
	return new Promise((resolve) => {
		pendingResolvers.set(id, { resolve });

		// Set timeout
		setTimeout(() => {
			const approval = approvals.get(id);
			if (approval && approval.status === "pending") {
				approval.status = "timeout";
				approval.reason = "Approval request timed out";

				const resolver = pendingResolvers.get(id);
				if (resolver) {
					resolver.resolve(approval);
					pendingResolvers.delete(id);
				}
			}
		}, APPROVAL_TIMEOUT);
	});
}

// 初期化と実行
async function init() {
	// Initialize MCP server
	server = new Server(
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

	// Initialize Slack app
	slackApp = new bolt.App({
		logLevel: bolt.LogLevel.DEBUG,
		token: SLACK_BOT_TOKEN ?? "",
		appToken: SLACK_APP_TOKEN ?? "",
		socketMode: true,
	});

	// Handle approve button
	slackApp.action<bolt.BlockAction>(
		"approve",
		async ({ body, ack, action, client }) => {
			await ack();

			if ("value" in action && action.value) {
				const approval = approvals.get(action.value);
				if (approval && approval.status === "pending") {
					approval.status = "approved";
					approval.decidedBy = body.user.id;
					approval.decidedAt = new Date();
					approval.reason = "Approved via Slack";

					// Notify waiting promise
					const resolver = pendingResolvers.get(action.value);
					if (resolver) {
						resolver.resolve(approval);
						pendingResolvers.delete(action.value);
					}

					// Update Slack message
					if (body.message?.ts) {
						await client.chat.update({
							channel: body.channel?.id || SLACK_CHANNEL_NAME || "",
							ts: body.message.ts,
							text: `✅ Tool execution approved by <@${body.user.id}>`,
							blocks: [
								{
									type: "section",
									text: {
										type: "mrkdwn",
										text: `✅ *Tool execution approved*\n\n*Tool:* ${approval.toolName}\n*Arguments:* ${JSON.stringify(approval.parameters, null, 2)}\n*Decided by:* <@${body.user.id}>\n*Time:* ${new Date().toISOString()}`,
									},
								},
							],
						});
					}
				}
			}
		},
	);

	// Handle reject button
	slackApp.action<bolt.BlockAction>(
		"reject",
		async ({ body, ack, action, client }) => {
			await ack();

			if ("value" in action && action.value) {
				const approval = approvals.get(action.value);
				if (approval && approval.status === "pending") {
					approval.status = "rejected";
					approval.decidedBy = body.user.id;
					approval.decidedAt = new Date();
					approval.reason = "Rejected via Slack";

					// Notify waiting promise
					const resolver = pendingResolvers.get(action.value);
					if (resolver) {
						resolver.resolve(approval);
						pendingResolvers.delete(action.value);
					}

					// Update Slack message
					if (body.message?.ts) {
						await client.chat.update({
							channel: body.channel?.id || SLACK_CHANNEL_NAME || "",
							ts: body.message.ts,
							text: `❌ Tool execution rejected by <@${body.user.id}>`,
							blocks: [
								{
									type: "section",
									text: {
										type: "mrkdwn",
										text: `❌ *Tool execution rejected*\n\n*Tool:* ${approval.toolName}\n*Decided by:* <@${body.user.id}>\n*Time:* ${new Date().toISOString()}`,
									},
								},
							],
						});
					}
				}
			}
		},
	);

	server.setRequestHandler(ListToolsRequestSchema, async () => {
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

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		switch (request.params.name) {
			case "tool-approval":
				return await handleToolApproval(request.params.arguments || {});
			default:
				throw new McpError(
					ErrorCode.MethodNotFound,
					`Unknown tool: ${request.params.name}`,
				);
		}
	});
}

// サーバーの実行
async function run() {
	// Initialize everything
	await init();

	// Start Slack app
	await slackApp.start();
	debug("⚡️ Slack app is running");

	// Start MCP server
	const transport = new StdioServerTransport();
	await server.connect(transport);
	debug("🚀 MCP server connected and ready");
}

// メイン実行
run().catch((error) => {
	debug("Server failed to start:", error);
	process.exit(1);
});
