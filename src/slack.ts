import bolt from "@slack/bolt";
import { env } from "./env.ts";
import { debug, error, info, warn } from "./utils.ts";

const logLevel = env.CCAPPROVAL_DEBUG
	? bolt.LogLevel.DEBUG
	: bolt.LogLevel.INFO;

const logger = {
	debug: (...args: unknown[]) => debug("[@slack/bolt]", ...args),
	info: (...args: unknown[]) => info("[@slack/bolt]", ...args),
	warn: (...args: unknown[]) => warn("[@slack/bolt]", ...args),
	error: (...args: unknown[]) => error("[@slack/bolt]", ...args),
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
