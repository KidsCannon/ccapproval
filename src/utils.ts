import { readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "./env.ts";

export function debug(...args: unknown[]) {
	if (!env.CCAPPROVAL_DEBUG) return;
	console.error(...args);
}

export function error(...args: unknown[]) {
	console.error(...args);
}

export function getVersion(): string {
	try {
		const packageJsonPath = join(__dirname, "../package.json");
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
		return packageJson.version || "1.0.0";
	} catch (err) {
		console.error("[yepcode-mcp-server]", "Unable to retrieve version:", err);
		return "unknown";
	}
}
