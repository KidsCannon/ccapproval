const codeBlock = (text: string) => `\`\`\`${text}\`\`\``;

export const markdownSection = (text: string) => {
	return {
		type: "section",
		text: {
			type: "mrkdwn",
			text,
		},
	};
};

export const button = (args: {
	value: string;
	actionId: "approve" | "reject";
}) => {
	const params = {
		approve: { text: "✅ Approve", style: "primary" },
		reject: { text: "❌ Reject", style: "danger" },
	};
	return {
		type: "button",
		text: {
			type: "plain_text",
			text: params[args.actionId].text,
		},
		style: params[args.actionId].style as "primary" | "danger",
		action_id: args.actionId,
		value: args.value,
	};
};

export const message = (
	args:
		| {
				type: "requested";
				toolName: string;
				parameters: unknown;
		  }
		| {
				type: "approved" | "rejected";
				toolName: string;
				parameters: unknown;
				userId: string;
		  },
) => {
	const headers = {
		requested: "🔧 *Tool execution approval requested*",
		approved: `✅ *Tool execution approved*`,
		rejected: `❌ *Tool execution rejected*`,
	};

	const header =
		args.type === "requested"
			? headers[args.type]
			: `${headers[args.type]}

*Tool:* ${args.toolName}
*Arguments:* ${JSON.stringify(args.parameters, null, 2)}
*Decided by:* <@${args.userId}>
*Time:* ${new Date().toISOString()}`;

	if (args.type === "requested") {
		return `${header}

*Tool:* ${args.toolName}
*Parameters:*
${codeBlock(JSON.stringify(args.parameters, null, 2))}`;
	}

	return header;
};
