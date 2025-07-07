import { randomUUID } from "node:crypto";
import type bolt from "@slack/bolt";
import { isChannelMember } from "./slack.ts";
import { button, markdownSection, plainText } from "./slack-messages.ts";
import { debug, formatCwd, info, warn } from "./utils.ts";

export interface ApprovalRequest {
	id: string;
	toolName: string;
	parameters: unknown;
	status: "pending" | "approved" | "rejected" | "timeout";
	decidedBy?: string;
	decidedAt?: Date;
	reason?: string;
	createdAt: Date;
}

const approvals = new Map<string, ApprovalRequest>();
const pendingResolvers = new Map<
	string,
	{ resolve: (value: ApprovalRequest) => void }
>();

export async function handlePermissionPrompt(
	slackApp: bolt.App,
	args: {
		tool_name: string;
		input?: unknown;
	},
	options: {
		toolCallCount: number;
		rootThreadTs: string;
		channel: string;
		waitTimeout: number;
	},
) {
	const { channel, waitTimeout } = options;
	const requestId = randomUUID();
	const startTime = Date.now();

	info("Approval request received", {
		action: "approval_request_received",
		requestId,
		tool: args.tool_name,
		channelId: channel,
		timestamp: startTime,
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

			info("Approval granted", {
				action: "approval_granted",
				requestId: approval.id,
				approverId: body.user.id,
				responseTime:
					approval.decidedAt.getTime() - approval.createdAt.getTime(),
			});

			// Update Slack message
			if (!body.message?.ts) {
				return;
			}

			const text = plainText({
				type: "approved",
				...approval,
				userId: body.user.id,
				cwd: formatCwd(),
			});
			const massage = {
				text: text.split("\n")[0],
				blocks: [markdownSection(text)],
			};
			await client.chat.update({
				channel: body.channel?.id ?? channel,
				ts: body.message.ts,
				...massage,
			});

			// Notify waiting promise
			const resolver = pendingResolvers.get(action.value);
			if (resolver) {
				resolver.resolve(approval);
				pendingResolvers.delete(action.value);
			}
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

			info("Approval denied", {
				action: "approval_denied",
				requestId: approval.id,
				approverId: body.user.id,
				reason: approval.reason,
				responseTime:
					approval.decidedAt.getTime() - approval.createdAt.getTime(),
			});

			// Update Slack message
			if (!body.message?.ts) {
				return;
			}

			const text = plainText({
				type: "rejected",
				...approval,
				userId: body.user.id,
				cwd: formatCwd(),
			});
			const massage = {
				text: text.split("\n")[0],
				blocks: [markdownSection(text)],
			};
			await client.chat.update({
				channel: body.channel?.id ?? channel,
				ts: body.message.ts,
				...massage,
			});

			// Notify waiting promise
			const resolver = pendingResolvers.get(action.value);
			if (resolver) {
				resolver.resolve(approval);
				pendingResolvers.delete(action.value);
			}
		},
	);

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
		id: requestId,
		toolName: args.tool_name,
		parameters: args.input,
		status: "pending",
		createdAt: new Date(startTime),
	};
	approvals.set(approval.id, approval);

	// Send Slack notification
	const text = plainText({
		type: "requested",
		toolName: args.tool_name,
		parameters: args.input,
		cwd: formatCwd(),
	});
	const slackMessage = {
		text: text.split("\n")[0],
		blocks: [
			markdownSection(text),
			{
				type: "actions",
				elements: [
					button({ value: approval.id, actionId: "approve" }),
					button({ value: approval.id, actionId: "reject" }),
				],
			},
		],
	};

	if (options.toolCallCount === 1) {
		await slackApp.client.chat.update({
			channel,
			...slackMessage,
			ts: options.rootThreadTs,
		});
	} else {
		await slackApp.client.chat.postMessage({
			channel,
			...slackMessage,
			thread_ts: options.rootThreadTs,
		});
	}

	const isMember = await isChannelMember(slackApp, options.channel);
	if (!isMember) {
		await slackApp.client.chat.update({
			channel,
			ts: options.rootThreadTs,
			text: "Please invite @ccapproval to this channel",
		});
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify({
						behavior: "deny",
						message: "SlackError: Please invite @ccapproval to this channel",
					}),
				},
			],
		};
	}

	// If this is the first message, save thread TS and add initial reaction
	await slackApp.client.reactions.add({
		channel: options.channel,
		timestamp: options.rootThreadTs,
		name: "hourglass_flowing_sand",
	});

	const decision = await waitForDecision(approval.id, { waitTimeout });

	try {
		await slackApp.client.reactions.remove({
			channel: options.channel,
			timestamp: options.rootThreadTs,
			name: "hourglass_flowing_sand",
		});
	} catch (error) {
		debug("Failed to remove reaction:", error);
	}

	const reactionName =
		decision.status === "approved" ? "white_check_mark" : "x";
	try {
		await slackApp.client.reactions.add({
			channel: options.channel,
			timestamp: options.rootThreadTs,
			name: reactionName,
		});
	} catch (error) {
		debug("Failed to add reaction:", error);
	}

	const res = {
		content: [
			{
				type: "text",
				text: JSON.stringify({
					behavior: decision.status === "approved" ? "allow" : "deny",
					updatedInput: decision.status === "approved" ? args.input : undefined,
					message:
						decision.status === "approved"
							? undefined
							: `Denied via Slack: ${decision.reason}`,
				}),
			},
		],
	};

	return res;
}

export async function waitForDecision(
	id: string,
	options: {
		waitTimeout: number;
	},
): Promise<ApprovalRequest> {
	const { waitTimeout } = options;
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

			warn("Approval timeout", {
				action: "approval_timeout",
				requestId: id,
				timeout: waitTimeout,
			});

			const resolver = pendingResolvers.get(id);
			if (!resolver) {
				return;
			}

			resolver.resolve(approval);
			pendingResolvers.delete(id);
		}, waitTimeout);
	});
}
