import { env } from "./env.ts";

export function debug(...args: unknown[]) {
	if (!env.CCAPPROVAL_DEBUG) return;
	console.error(...args);
}

export function error(...args: unknown[]) {
	console.error(...args);
}
