export const env = {
	SLACK_CHANNEL: requireEnv("SLACK_CHANNEL"),
	SLACK_MENTION: process.env.SLACK_MENTION,
	SLACK_BOT_TOKEN: requireEnv("SLACK_BOT_TOKEN"),
	SLACK_APP_TOKEN: requireEnv("SLACK_APP_TOKEN"),
	CCAPPROVAL_DEBUG: process.env.CCAPPROVAL_DEBUG != null,
};

function requireEnv(name: string) {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}
