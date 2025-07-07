#!/usr/bin/env node

import { McpServer } from "./mcp.ts";
import { error, info } from "./utils.ts";

async function main() {
	info("Application starting", {
		version: process.env.npm_package_version || "0.0.2",
		node: process.version,
	});

	const server = new McpServer();

	// Handle graceful shutdown
	const shutdownSignals = ["SIGINT", "SIGTERM"];
	for (const signal of shutdownSignals) {
		process.on(signal, async () => {
			info("Graceful shutdown initiated", { signal });
			try {
				await server.shutdown();
				info("Graceful shutdown completed");
				process.exit(0);
			} catch (err) {
				error("Error during shutdown", { error: err });
				process.exit(1);
			}
		});
	}

	try {
		await server.start();
		info("Application ready to receive requests");
	} catch (err) {
		error("Server failed to start:", err);
		await server.shutdown();
	}
}

main().catch((err) => {
	error("Server failed to start:", err);
	process.exit(1);
});
