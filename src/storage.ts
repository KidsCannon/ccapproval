import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface SessionThreadMapping {
	sessionId: string;
	threadTs: string;
	channelId: string;
	status: "executing" | "done" | "failed";
	createdAt: string;
	updatedAt: string;
}

class Storage {
	private dataDir: string;
	private filePath: string;

	constructor(customDataDir?: string) {
		if (customDataDir) {
			this.dataDir = customDataDir;
		} else {
			const xdgDataHome =
				process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
			this.dataDir = path.join(xdgDataHome, "ccapproval");
		}
		this.filePath = path.join(this.dataDir, "session-threads.json");
	}

	private async ensureDataDir(): Promise<void> {
		await fs.mkdir(this.dataDir, { recursive: true });
	}

	private async readData(): Promise<Record<string, SessionThreadMapping>> {
		try {
			const content = await fs.readFile(this.filePath, "utf-8");
			return JSON.parse(content);
		} catch (error: unknown) {
			if (
				typeof error === "object" &&
				error != null &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return {};
			}
			throw error;
		}
	}

	private async writeData(
		data: Record<string, SessionThreadMapping>,
	): Promise<void> {
		await this.ensureDataDir();
		const tempPath = `${this.filePath}.tmp`;

		// Write to temp file first for atomic operation
		await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
		await fs.rename(tempPath, this.filePath);
	}

	async create(mapping: SessionThreadMapping): Promise<void> {
		const data = await this.readData();
		data[mapping.sessionId] = mapping;
		await this.writeData(data);
	}

	async get(sessionId: string): Promise<SessionThreadMapping | undefined> {
		const data = await this.readData();
		return data[sessionId];
	}

	async update(
		sessionId: string,
		updates: Partial<SessionThreadMapping>,
	): Promise<void> {
		const data = await this.readData();
		const existing = data[sessionId];

		if (!existing) {
			throw new Error(`Session ${sessionId} not found`);
		}

		data[sessionId] = {
			...existing,
			...updates,
			updatedAt: new Date().toISOString(),
		};

		await this.writeData(data);
	}

	async delete(sessionId: string): Promise<void> {
		const data = await this.readData();
		delete data[sessionId];
		await this.writeData(data);
	}

	async getAll(): Promise<SessionThreadMapping[]> {
		const data = await this.readData();
		return Object.values(data);
	}
}

export const storage = new Storage();
export { Storage };
