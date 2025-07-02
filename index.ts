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

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;
const SLACK_CHANNEL_NAME = process.env.SLACK_CHANNEL_NAME;

interface ApprovalRequest {
	id: string;
	toolName: string;
	parameters: unknown;
	status: "pending" | "approved" | "rejected" | "timeout";
	decidedBy?: string;
	decidedAt?: Date;
	reason?: string;
}

const approvals = new Map<string, ApprovalRequest>();
const pendingResolvers = new Map<
	string,
	{ resolve: (value: ApprovalRequest) => void }
>();

// Debug logging for MCP Server
function debug(...args: unknown[]) {
	console.error(...args);
}

async function handlePermissionPrompt(
	slackApp: bolt.App,
	channel: string,
	args: unknown,
) {
	try {
		if (typeof args !== "object" || args == null) {
			throw new McpError(ErrorCode.InvalidParams, "Invalid arguments");
		}
		if (!("tool_name" in args) || typeof args.tool_name !== "string") {
			throw new McpError(ErrorCode.InvalidParams, "Invalid tool_name");
		}
		if (
			!("input" in args) ||
			typeof args.input !== "object" ||
			args.input == null
		) {
			throw new McpError(ErrorCode.InvalidParams, "Invalid input");
		}

		// Check if tool is dangerous
		debug("received tool", args.tool_name);
		if (!DANGEROUS_TOOLS.includes(args.tool_name)) {
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
			toolName: args.tool_name,
			parameters: args.input,
			status: "pending",
		};

		approvals.set(approval.id, approval);

		// Send Slack notification
		await slackApp.client.chat.postMessage({
			channel,
			text: `🔧 Tool execution approval requested: ${args.tool_name}`,
			blocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `🔧 *Tool execution approval requested*\n\n*Tool:* ${args.tool_name}\n*Parameters:*\n\`\`\`${JSON.stringify(args.input, null, 2)}\`\`\``,
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
			if (!approval || approval.status !== "pending") {
				return;
			}

			approval.status = "timeout";
			approval.reason = "Approval request timed out";

			const resolver = pendingResolvers.get(id);
			if (!resolver) {
				return;
			}

			resolver.resolve(approval);
			pendingResolvers.delete(id);
		}, APPROVAL_TIMEOUT);
	});
}

// サーバーの実行
async function run() {
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

	if (!SLACK_BOT_TOKEN || !SLACK_APP_TOKEN || !SLACK_CHANNEL_NAME) {
		throw new Error("Missing required environment variables");
	}

	const slackApp = new bolt.App({
		logLevel: bolt.LogLevel.DEBUG,
		token: SLACK_BOT_TOKEN,
		appToken: SLACK_APP_TOKEN,
		socketMode: true,
	});

	// Handle approve button
	slackApp.action<bolt.BlockAction>(
		"approve",
		async ({ body, ack, action, client }) => {
			await ack();

			if (!("value" in action) || !action.value) {
				return;
			}

			const approval = approvals.get(action.value);
			if (!approval || approval.status !== "pending") {
				return;
			}

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
			if (!body.message?.ts) {
				return;
			}

			await client.chat.update({
				channel: body.channel?.id ?? SLACK_CHANNEL_NAME,
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
		},
	);

	// Handle reject button
	slackApp.action<bolt.BlockAction>(
		"reject",
		async ({ body, ack, action, client }) => {
			await ack();

			if (!("value" in action) || !action.value) {
				return;
			}

			const approval = approvals.get(action.value);
			if (!approval || approval.status !== "pending") {
				return;
			}

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
			if (!body.message?.ts) {
				return;
			}

			await client.chat.update({
				channel: body.channel?.id ?? SLACK_CHANNEL_NAME,
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
				return await handlePermissionPrompt(
					slackApp,
					SLACK_CHANNEL_NAME,
					request.params.arguments || {},
				);
			default:
				throw new McpError(
					ErrorCode.MethodNotFound,
					`Unknown tool: ${request.params.name}`,
				);
		}
	});

	await slackApp.start();
	debug("⚡️ Slack app is running");

	const transport = new StdioServerTransport();
	await server.connect(transport);
	debug("🚀 MCP server connected and ready");
}

run().catch((error) => {
	debug("Server failed to start:", error);
	process.exit(1);
});
