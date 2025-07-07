import bolt from "@slack/bolt";
import z from "zod";
import { env } from "./env.ts";
import { debug } from "./utils.ts";

const _wsMessageSchema = z.object({
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
	debug("isChannelMember", info.channel);
	return info.channel.is_member;
}
