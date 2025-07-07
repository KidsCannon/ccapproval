import { homedir } from "node:os";
import { env } from "./env.ts";

export function error(...args: unknown[]) {
	console.error("[ccapproval][error]", ...args);
}

export function warn(...args: unknown[]) {
	console.error("[ccapproval][warn]", ...args);
}

export function info(...args: unknown[]) {
	console.error("[ccapproval][info]", ...args);
}

export function debug(...args: unknown[]) {
	if (!env.CCAPPROVAL_DEBUG) return;
	console.error("[ccapproval][debug]", ...args);
}

export function formatCwd(): string {
	const cwd = process.cwd();
	const home = homedir();

	if (cwd.startsWith(home)) {
		return cwd.replace(home, "~");
	}

	return cwd;
}
