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

export const plainText = (
	args:
		| {
				type: "requested";
				toolName: string;
				parameters: unknown;
				cwd: string;
		  }
		| {
				type: "approved" | "rejected";
				toolName: string;
				parameters: unknown;
				cwd: string;
				userId: string;
		  },
) => {
	let header: string;
	switch (args.type) {
		case "requested":
			header = `🔧 *Tool execution approval requested*`;
			break;
		case "approved":
			header = `✅ *Tool execution approved* by <@${args.userId}> at ${new Date().toISOString()}`;
			break;
		case "rejected":
			header = `❌ *Tool execution rejected* by <@${args.userId}> at ${new Date().toISOString()}`;
			break;
	}

	const res = `${header}

*Working Directory:* ${args.cwd}
*Tool:* ${args.toolName}
*Parameters:* ${codeBlock(JSON.stringify(args.parameters, null, 2))}`;

	return res;
};
