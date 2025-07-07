import { env } from "./env.ts";

export function debug(...args: unknown[]) {
	if (!env.CCAPPROVAL_DEBUG) return;
	console.error("[ccapproval]", ...args);
}

export function error(...args: unknown[]) {
	console.error("[ccapproval]", ...args);
}
