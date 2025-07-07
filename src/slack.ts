import bolt from "@slack/bolt";
import { env } from "./env.ts";
import { debug } from "./utils.ts";

const logLevel = env.CCAPPROVAL_DEBUG
	? bolt.LogLevel.DEBUG
	: bolt.LogLevel.ERROR;

const slackDebug = (...args: unknown[]) => {
	debug("[@slack/bolt]", ...args);
};

const logger = {
	debug: slackDebug,
	info: slackDebug,
	warn: slackDebug,
	error: slackDebug,
	setLevel: () => {},
	getLevel: () => logLevel,
	setName: () => {},
};

export function slackApp() {
	return new bolt.App({
		token: env.SLACK_BOT_TOKEN,
		appToken: env.SLACK_APP_TOKEN,
		logLevel,
		logger,
		socketMode: true,
	});
}

export async function isChannelMember(slackApp: bolt.App, channel: string) {
	const info = await slackApp.client.conversations.info({ channel });
	if (info.channel == null) return false;
	return info.channel.is_member;
}
