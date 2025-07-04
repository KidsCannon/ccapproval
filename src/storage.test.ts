import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Storage } from "./storage";

describe("Storage", () => {
	let testDataDir: string;
	let storage: Storage;

	beforeEach(async () => {
		// Create unique test directory for each test
		testDataDir = path.join(
			os.tmpdir(),
			`ccapproval-test-${Date.now()}-${Math.random()}`,
		);
		await fs.mkdir(testDataDir, { recursive: true });

		// Create new Storage instance with test directory
		storage = new Storage(testDataDir);
	});

	afterEach(async () => {
		// Clean up test data
		try {
			await fs.rm(testDataDir, { recursive: true, force: true });
		} catch (_error) {
			// Ignore cleanup errors
		}
	});

	it("should create and retrieve a session-thread mapping", async () => {
		const mapping = {
			sessionId: "test-session-1",
			threadTs: "1234567890.123456",
			channelId: "C1234567890",
			status: "executing" as const,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		await storage.create(mapping);
		const retrieved = await storage.get(mapping.sessionId);

		expect(retrieved).toEqual(mapping);
	});

	it("should update a session-thread mapping", async () => {
		const mapping = {
			sessionId: "test-session-2",
			threadTs: "1234567890.123456",
			channelId: "C1234567890",
			status: "executing" as const,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		await storage.create(mapping);
		await storage.update(mapping.sessionId, { status: "done" });

		const updated = await storage.get(mapping.sessionId);
		expect(updated?.status).toBe("done");
		expect(updated?.updatedAt).not.toBe(mapping.updatedAt);
	});

	it("should delete a session-thread mapping", async () => {
		const mapping = {
			sessionId: "test-session-3",
			threadTs: "1234567890.123456",
			channelId: "C1234567890",
			status: "executing" as const,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		await storage.create(mapping);
		await storage.delete(mapping.sessionId);

		const deleted = await storage.get(mapping.sessionId);
		expect(deleted).toBeUndefined();
	});

	it("should get all session-thread mappings", async () => {
		const mappings = [
			{
				sessionId: "test-session-4",
				threadTs: "1234567890.123456",
				channelId: "C1234567890",
				status: "executing" as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				sessionId: "test-session-5",
				threadTs: "1234567890.654321",
				channelId: "C1234567890",
				status: "done" as const,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		];

		for (const mapping of mappings) {
			await storage.create(mapping);
		}

		const all = await storage.getAll();
		expect(all).toHaveLength(2);
		expect(all).toContainEqual(mappings[0]);
		expect(all).toContainEqual(mappings[1]);
	});

	it("should throw error when updating non-existent session", async () => {
		await expect(
			storage.update("non-existent", { status: "done" }),
		).rejects.toThrow("Session non-existent not found");
	});

	it("should return empty array when no mappings exist", async () => {
		const all = await storage.getAll();
		expect(all).toEqual([]);
	});
});
