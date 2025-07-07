const codeBlock = (text: string, options?: { oneline?: boolean }) =>
	options?.oneline ? `\`${text}\`` : `\`\`\`${text}\`\`\``;

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
				userId?: string;
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
			header = `🔧 *Tool execution approval requested*${
				args.userId ? ` to <@${args.userId}>` : ""
			}`;
			break;
		case "approved":
			header = `✅ *Tool execution approved* by <@${args.userId}> at ${new Date().toISOString()}`;
			break;
		case "rejected":
			header = `❌ *Tool execution rejected* by <@${args.userId}> at ${new Date().toISOString()}`;
			break;
	}

	const params = JSON.stringify(args.parameters, null, 2);

	const res = `${header}

*Tool:* ${codeBlock(args.toolName, { oneline: true })}
*Directory:* ${codeBlock(args.cwd, { oneline: true })}
*Parameters:* ${codeBlock(params.length > 500 ? `${params.slice(0, 500)}...` : params)}`;

	return res;
};
