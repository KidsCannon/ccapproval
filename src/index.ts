#!/usr/bin/env node

import { McpServer } from "./mcp.ts";
import { error } from "./utils.ts";

async function main() {
	const server = new McpServer();
	await server.start();
}

main().catch((err) => {
	error("Server failed to start:", err);
	process.exit(1);
});
