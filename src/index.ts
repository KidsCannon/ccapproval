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
import {
	createApprovalRequestMessage,
	createApprovedMessage,
	createRejectedMessage,
} from "./slack-messages.ts";
import { storage } from "./storage.ts";
import type { ApprovalRequest } from "./types.ts";
import { debug } from "./utils.ts";

const NAME = "ccapproval";
// const DANGEROUS_TOOLS = ["Bash", "Write", "Edit", "MultiEdit"];
const APPROVAL_TIMEOUT = 12 * 60 * 60 * 1000; // 12 hours

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;
const SLACK_CHANNEL_NAME = process.env.SLACK_CHANNEL_NAME;

const approvals = new Map<string, ApprovalRequest>();
const pendingResolvers = new Map<
	string,
	{ resolve: (value: ApprovalRequest) => void }
>();

async function handlePermissionPrompt(channel: string, args: unknown) {
	const slackApp = new bolt.App({
		logLevel: bolt.LogLevel.ERROR,
		logger: {
			debug,
			info: debug,
			warn: debug,
			error: debug,
			setLevel: () => {},
			getLevel: () => bolt.LogLevel.ERROR,
			setName: () => {},
		},
		token: SLACK_BOT_TOKEN,
		appToken: SLACK_APP_TOKEN,
		socketMode: true,
	});

	try {
		// Handle approve button
		slackApp.action<bolt.BlockAction>(
			"approve",
			async ({ body, ack, action, client }) => {
				debug("on approve", body, action);

				await ack();

				if (!("value" in action) || !action.value) {
					return;
				}

				const approval = approvals.get(action.value);
				debug("finding approval", {
					actionValue: action.value,
					approval,
					allApprovals: Array.from(approvals.entries()),
				});
				if (!approval || approval.status !== "pending") {
					return;
				}

				debug("approving", approval);
				approval.status = "approved";
				approval.decidedBy = body.user.id;
				approval.decidedAt = new Date();
				approval.reason = "Approved via Slack";

				// Update Slack message
				if (!body.message?.ts) {
					return;
				}

				debug("updating slack message", approval);
				const message = createApprovedMessage(approval, body.user.id);
				debug("updating slack message", message);
				await client.chat.update({
					channel: body.channel?.id ?? channel,
					ts: body.message.ts,
					...message,
				});

				// Notify waiting promise
				const resolver = pendingResolvers.get(action.value);
				if (resolver) {
					debug("resolving", approval);
					resolver.resolve(approval);
					pendingResolvers.delete(action.value);
				}
			},
		);

		// Handle reject button
		slackApp.action<bolt.BlockAction>(
			"reject",
			async ({ body, ack, action, client }) => {
				debug("on reject", body, action);
				await ack();

				if (!("value" in action) || !action.value) {
					return;
				}

				const approval = approvals.get(action.value);
				debug("finding approval", {
					actionValue: action.value,
					approval,
					allApprovals: Array.from(approvals.entries()),
				});
				if (!approval || approval.status !== "pending") {
					return;
				}

				debug("rejecting", approval);
				approval.status = "rejected";
				approval.decidedBy = body.user.id;
				approval.decidedAt = new Date();
				approval.reason = "Rejected via Slack";

				// Update Slack message
				if (!body.message?.ts) {
					return;
				}

				debug("updating slack message", approval);
				const message = createRejectedMessage(approval, body.user.id);
				debug("updating slack message", message);
				await client.chat.update({
					channel: body.channel?.id ?? channel,
					ts: body.message.ts,
					...message,
				});

				// Notify waiting promise
				const resolver = pendingResolvers.get(action.value);
				if (resolver) {
					debug("resolving", approval);
					resolver.resolve(approval);
					pendingResolvers.delete(action.value);
				}
			},
		);

		await slackApp.start();
		debug("⚡️ Slack app is running");

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
		debug("received tool", args.tool_name, args);
		// if (!DANGEROUS_TOOLS.includes(args.tool_name)) {
		// 	return {
		// 		content: [
		// 			{
		// 				type: "text",
		// 				text: JSON.stringify({
		// 					decision: "approve",
		// 					reason: "Safe tool - automatic approval",
		// 					timestamp: new Date().toISOString(),
		// 				}),
		// 			},
		// 		],
		// 	};
		// }

		// Create approval request
		const approval: ApprovalRequest = {
			id: randomUUID(),
			toolName: args.tool_name,
			parameters: args.input,
			status: "pending",
		};
		approvals.set(approval.id, approval);
		debug("Created approval", { id: approval.id, toolName: approval.toolName });

		// Extract session ID from args (if available)
		const sessionId =
			"session_id" in args && typeof args.session_id === "string"
				? args.session_id
				: approval.id; // Fallback to approval ID if no session ID

		// Check if we already have a thread for this session
		const existingThread = await storage.get(sessionId);

		// Send Slack notification
		const message = createApprovalRequestMessage(
			args.tool_name,
			args.input,
			approval.id,
		);
		debug("Sending Slack message", message);

		const postMessageResult = await slackApp.client.chat.postMessage({
			channel,
			...message,
			thread_ts: existingThread?.threadTs, // Use existing thread if available
		});

		// If this is a new thread, store the mapping and add initial reaction
		if (!existingThread && postMessageResult.ts && postMessageResult.channel) {
			await storage.create({
				sessionId,
				threadTs: postMessageResult.ts,
				channelId: postMessageResult.channel,
				status: "executing",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			// Add executing reaction to the root message
			await slackApp.client.reactions.add({
				channel: postMessageResult.channel,
				timestamp: postMessageResult.ts,
				name: "hourglass_flowing_sand",
			});
		}

		debug("Waiting for decision", approval.id);
		const decision = await waitForDecision(approval.id);
		debug("Decision:", decision);

		// Update thread status and reactions
		if (postMessageResult.ts) {
			const threadInfo = await storage.get(sessionId);
			if (threadInfo) {
				// Update storage status
				const newStatus = decision.status === "approved" ? "done" : "failed";
				await storage.update(sessionId, { status: newStatus });

				// Remove executing reaction
				try {
					await slackApp.client.reactions.remove({
						channel: threadInfo.channelId,
						timestamp: threadInfo.threadTs,
						name: "hourglass_flowing_sand",
					});
				} catch (error) {
					debug("Failed to remove reaction:", error);
				}

				// Add final status reaction
				const reactionName =
					decision.status === "approved" ? "white_check_mark" : "x";
				try {
					await slackApp.client.reactions.add({
						channel: threadInfo.channelId,
						timestamp: threadInfo.threadTs,
						name: reactionName,
					});
				} catch (error) {
					debug("Failed to add reaction:", error);
				}
			}
		}

		const res = {
			content: [
				{
					type: "text",
					text: JSON.stringify({
						behavior: decision.status === "approved" ? "allow" : "deny",
						updatedInput:
							decision.status === "approved" ? args.input : undefined,
						message:
							decision.status === "approved"
								? undefined
								: `Denied via Slack: ${decision.reason}`,
					}),
				},
			],
		};
		debug("Returning response", res);

		return res;
	} catch (error) {
		debug("Approval process failed", error);
		throw new McpError(
			ErrorCode.InternalError,
			`Approval process failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	} finally {
		await slackApp.stop();
	}
}

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

			debug("Resolving approval", approval);
			resolver.resolve(approval);
			pendingResolvers.delete(id);
		}, APPROVAL_TIMEOUT);
	});
}

async function run() {
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
		switch (request.params.name) {
			case "tool-approval": {
				return await handlePermissionPrompt(
					SLACK_CHANNEL_NAME,
					request.params.arguments || {},
				);
			}
			default:
				throw new McpError(
					ErrorCode.MethodNotFound,
					`Unknown tool: ${request.params.name}`,
				);
		}
	});

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

	const transport = new StdioServerTransport();
	await server.connect(transport);
	debug("🚀 MCP server connected and ready");

	// Handle stdin close to exit gracefully when Claude terminates
	process.stdin.on("end", () => {
		debug("Claude process ended, shutting down...");
		process.exit(0);
	});

	process.stdin.on("close", () => {
		debug("stdin closed, shutting down...");
		process.exit(0);
	});
}

run().catch((error) => {
	debug("Server failed to start:", error);
	process.exit(1);
});
