#!/usr/bin/env node

import { mcp } from "./mcp.ts";
import { error } from "./utils.ts";

async function main() {
	await mcp();
}

main().catch((err) => {
	error("Server failed to start:", err);
	process.exit(1);
});
