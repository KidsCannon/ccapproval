import bolt from "@slack/bolt";
import z from "zod";
import { debug } from "./utils.ts";

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;

// Custom SocketMode Receiver
// You can define a custom SocketModeReceiver by importing it from @slack/bolt.
//
// const { App, SocketModeReceiver } = require('@slack/bolt');
//
// const socketModeReceiver = new SocketModeReceiver({
//   appToken: process.env.APP_TOKEN,
//
//   // enable the following if you want to use OAuth
//   // clientId: process.env.CLIENT_ID,
//   // clientSecret: process.env.CLIENT_SECRET,
//   // stateSecret: process.env.STATE_SECRET,
//   // scopes: ['channels:read', 'chat:write', 'app_mentions:read', 'channels:manage', 'commands'],
// });
//
// const app = new App({
//   receiver: socketModeReceiver,
//   // disable token line below if using OAuth
//   token: process.env.BOT_TOKEN
// });
//
// (async () => {
//   await app.start();
//   app.logger.info('⚡️ Bolt app started');
// })();
// https://tools.slack.dev/bolt-js/concepts/socket-mode/#custom-socketmode-receiver

const slackWsMessageSchema = z.object({
	type: z.string().optional(),
	reason: z.string().optional(),
});

const slackLogLevel = process.env.CCAPPROVAL_DEBUG
	? bolt.LogLevel.DEBUG
	: bolt.LogLevel.ERROR;

const slackLogger = {
	debug,
	info: debug,
	warn: debug,
	error: debug,
	setLevel: () => {},
	getLevel: () => slackLogLevel,
	setName: () => {},
};

export async function startSlackApp() {
	if (!SLACK_APP_TOKEN) {
		throw new Error("SLACK_APP_TOKEN is not set");
	}
	if (!SLACK_BOT_TOKEN) {
		throw new Error("SLACK_BOT_TOKEN is not set");
	}

	const receiver = new bolt.SocketModeReceiver({
		appToken: SLACK_APP_TOKEN,
		logLevel: slackLogLevel,
		logger: slackLogger,
	});

	const slackApp = new bolt.App({
		token: SLACK_BOT_TOKEN,
		logLevel: slackLogLevel,
		logger: slackLogger,
		receiver,
	});

	const p = new Promise<unknown>((resolve, reject) => {
		receiver.client.on("ws_message", async (args) => {
			const msg = slackWsMessageSchema.parse(JSON.parse(String(args)));
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
