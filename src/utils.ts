export function debug(...args: unknown[]) {
	if (!process.env.CC_APPROVAL_DEBUG) return;
	console.error(...args);
}
