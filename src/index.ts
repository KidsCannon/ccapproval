#!/usr/bin/env node

import { mcp } from "./mcp.ts";
import { error } from "./utils.ts";

async function main() {
	switch (process.argv[2]) {
		case "mcp":
			await mcp();
			break;
		case "hook":
			throw new Error("Not implemented");
		default:
			throw new Error(`Unknown sub-command: ${process.argv[2]}`);
	}
}

main().catch((err) => {
	error("Server failed to start:", err);
	process.exit(1);
});
