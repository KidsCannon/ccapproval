export function debug(...args: unknown[]) {
	if (!process.env.CCAPPROVAL_DEBUG) return;
	console.error(...args);
}

export function error(...args: unknown[]) {
	console.error(...args);
}
