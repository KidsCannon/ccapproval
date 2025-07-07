import bolt from "@slack/bolt";
import z from "zod";
import { env } from "./env.ts";
import { debug } from "./utils.ts";

const wsMessageSchema = z.object({
	type: z.string().optional(),
	reason: z.string().optional(),
});

const logLevel = env.CCAPPROVAL_DEBUG
	? bolt.LogLevel.DEBUG
	: bolt.LogLevel.ERROR;

const logger = {
	debug,
	info: debug,
	warn: debug,
	error: debug,
	setLevel: () => {},
	getLevel: () => logLevel,
	setName: () => {},
};

export async function startSlackApp() {
	// https://tools.slack.dev/bolt-js/concepts/socket-mode/#custom-socketmode-receiver
	const receiver = new bolt.SocketModeReceiver({
		appToken: env.SLACK_APP_TOKEN,
		logLevel,
		logger,
	});

	const slackApp = new bolt.App({
		token: env.SLACK_BOT_TOKEN,
		logLevel,
		logger,
		receiver,
	});

	const p = new Promise<unknown>((resolve, reject) => {
		receiver.client.on("ws_message", async (args) => {
			const msg = wsMessageSchema.parse(JSON.parse(String(args)));
			switch (msg.type) {
				case "hello":
					resolve({});
					break;
				case "disconnect":
					// Example: {"type":"disconnect","reason":"too_many_websockets","debug_info":{"host":"applink-13"}}
					await slackApp.stop();
					reject(new Error("Disconnected from Slack"));
					break;
			}
		});
	});

	await slackApp.start();
	await p;

	return slackApp;
}

export async function isChannelMember(slackApp: bolt.App, channel: string) {
	const info = await slackApp.client.conversations.info({ channel });
	if (info.channel == null) return false;
	debug("isChannelMember", info.channel);
	return info.channel.is_member;
}
