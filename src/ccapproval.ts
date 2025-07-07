import { randomUUID } from "node:crypto";
import type bolt from "@slack/bolt";
import { isChannelMember } from "./slack.ts";
import { button, markdownSection, plainText } from "./slack-messages.ts";
import { debug } from "./utils.ts";

export interface ApprovalRequest {
	id: string;
	toolName: string;
	parameters: unknown;
	status: "pending" | "approved" | "rejected" | "timeout";
	decidedBy?: string;
	decidedAt?: Date;
	reason?: string;
}

// const DANGEROUS_TOOLS = ["Bash", "Write", "Edit", "MultiEdit"];

// Track thread TS for this process (first message creates the thread)
let processThreadTs: string | undefined;
let processChannelId: string | undefined;

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
		channel: string;
		waitTimeout: number;
	},
) {
	const { channel, waitTimeout } = options;
	debug("handlePermissionPrompt", channel, args);

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
			const text = plainText({
				type: "approved",
				...approval,
				userId: body.user.id,
				cwd: process.cwd(),
			});
			const massage = {
				text: text.split("\n")[0],
				blocks: [markdownSection(text)],
			};
			debug("updating slack message", massage);
			await client.chat.update({
				channel: body.channel?.id ?? channel,
				ts: body.message.ts,
				...massage,
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
			const text = plainText({
				type: "rejected",
				...approval,
				userId: body.user.id,
				cwd: process.cwd(),
			});
			const massage = {
				text: text.split("\n")[0],
				blocks: [markdownSection(text)],
			};
			debug("updating slack message", massage);
			await client.chat.update({
				channel: body.channel?.id ?? channel,
				ts: body.message.ts,
				...massage,
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

	// Send Slack notification
	const text = plainText({
		type: "requested",
		toolName: args.tool_name,
		parameters: args.input,
		cwd: process.cwd(),
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
	debug("Sending Slack message", {
		message: slackMessage,
		useThread: !!processThreadTs,
	});

	const postMessageResult = await slackApp.client.chat.postMessage({
		channel,
		...slackMessage,
		thread_ts: processThreadTs, // Use existing thread if available
	});
	debug("Posted message result:", {
		ts: postMessageResult.ts,
		channel: postMessageResult.channel,
	});

	if (postMessageResult.channel != null && postMessageResult.ts != null) {
		const isMember = await isChannelMember(slackApp, postMessageResult.channel);
		if (!isMember) {
			await slackApp.client.chat.delete({
				channel: postMessageResult.channel,
				ts: postMessageResult.ts,
			});
			await slackApp.client.chat.postMessage({
				channel,
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
	}

	// If this is the first message, save thread TS and add initial reaction
	if (!processThreadTs && postMessageResult.ts && postMessageResult.channel) {
		debug("Creating new thread, saving thread TS");
		processThreadTs = postMessageResult.ts;
		processChannelId = postMessageResult.channel;

		// Add executing reaction to the root message
		await slackApp.client.reactions.add({
			channel: postMessageResult.channel,
			timestamp: postMessageResult.ts,
			name: "hourglass_flowing_sand",
		});
	}

	debug("Waiting for decision", approval.id);
	const decision = await waitForDecision(approval.id, { waitTimeout });
	debug("Decision:", decision);

	// Update reactions on the thread root message
	if (processThreadTs && processChannelId) {
		// Remove executing reaction
		try {
			await slackApp.client.reactions.remove({
				channel: processChannelId,
				timestamp: processThreadTs,
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
				channel: processChannelId,
				timestamp: processThreadTs,
				name: reactionName,
			});
		} catch (error) {
			debug("Failed to add reaction:", error);
		}
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
	debug("Returning response", res);

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

			const resolver = pendingResolvers.get(id);
			if (!resolver) {
				return;
			}

			debug("Resolving approval", approval);
			resolver.resolve(approval);
			pendingResolvers.delete(id);
		}, waitTimeout);
	});
}
