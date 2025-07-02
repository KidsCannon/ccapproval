import type { ApprovalRequest } from "../types.js";

export function createApprovalRequestMessage(
	toolName: string,
	parameters: unknown,
	approvalId: string,
) {
	return {
		text: `🔧 Tool execution approval requested: ${toolName}`,
		blocks: [
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: `🔧 *Tool execution approval requested*\n\n*Tool:* ${toolName}\n*Parameters:*\n\`\`\`${JSON.stringify(parameters, null, 2)}\`\`\``,
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
						value: approvalId,
					},
					{
						type: "button",
						text: {
							type: "plain_text",
							text: "❌ Reject",
						},
						style: "danger",
						action_id: "reject",
						value: approvalId,
					},
				],
			},
		],
	};
}

export function createApprovedMessage(
	approval: ApprovalRequest,
	userId: string,
) {
	return {
		text: `✅ Tool execution approved by <@${userId}>`,
		blocks: [
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: `✅ *Tool execution approved*\n\n*Tool:* ${approval.toolName}\n*Arguments:* ${JSON.stringify(approval.parameters, null, 2)}\n*Decided by:* <@${userId}>\n*Time:* ${new Date().toISOString()}`,
				},
			},
		],
	};
}

export function createRejectedMessage(
	approval: ApprovalRequest,
	userId: string,
) {
	return {
		text: `❌ Tool execution rejected by <@${userId}>`,
		blocks: [
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: `❌ *Tool execution rejected*\n\n*Tool:* ${approval.toolName}\n*Decided by:* <@${userId}>\n*Time:* ${new Date().toISOString()}`,
				},
			},
		],
	};
}
