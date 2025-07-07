import { describe, expect, it } from "vitest";
import { button, markdownSection, plainText } from "./slack-messages.ts";

describe("slack-messages", () => {
	describe("markdownSection", () => {
		it("should create markdown section block", () => {
			const text = "Test message *with markdown*";
			const result = markdownSection(text);

			expect(result).toEqual({
				type: "section",
				text: {
					type: "mrkdwn",
					text: "Test message *with markdown*",
				},
			});
		});
	});

	describe("button", () => {
		it("should create approve button with correct properties", () => {
			const result = button({
				value: "approval-123",
				actionId: "approve",
			});

			expect(result).toEqual({
				type: "button",
				text: {
					type: "plain_text",
					text: "✅ Approve",
				},
				style: "primary",
				action_id: "approve",
				value: "approval-123",
			});
		});

		it("should create reject button with correct properties", () => {
			const result = button({
				value: "approval-456",
				actionId: "reject",
			});

			expect(result).toEqual({
				type: "button",
				text: {
					type: "plain_text",
					text: "❌ Reject",
				},
				style: "danger",
				action_id: "reject",
				value: "approval-456",
			});
		});
	});

	describe("message", () => {
		it("should create requested message with correct format", () => {
			const result = plainText({
				type: "requested",
				toolName: "Bash",
				parameters: { command: "ls -la" },
				cwd: "/tmp",
			});

			expect(result).toContain("🔧 *Tool execution approval requested*");
			expect(result).toContain("*Tool:* `Bash`");
			expect(result).toContain("*Parameters:*");
			expect(result).toContain("```");
			expect(result).toContain('"command": "ls -la"');
		});

		it("should create approved message with user and timestamp", () => {
			const beforeTime = new Date().toISOString();
			const result = plainText({
				type: "approved",
				toolName: "Write",
				parameters: { file: "test.txt" },
				userId: "U12345",
				cwd: "/tmp",
			});
			const afterTime = new Date().toISOString();

			expect(result).toContain("✅ *Tool execution approved*");
			expect(result).toContain("*Tool:* `Write`");
			expect(result).toContain("*Parameters:*");
			expect(result).toContain('"file": "test.txt"');

			// Check that timestamp is between before and after
			const timeMatch = result.match(/ at (.+)$/m);
			expect(timeMatch).toBeTruthy();
			if (timeMatch) {
				const timestamp = timeMatch[1];
				expect(timestamp >= beforeTime).toBe(true);
				expect(timestamp <= afterTime).toBe(true);
			}
		});

		it("should create rejected message with user and timestamp", () => {
			const result = plainText({
				type: "rejected",
				toolName: "Edit",
				parameters: { file: "config.json" },
				userId: "U67890",
				cwd: "/tmp",
			});

			expect(result).toContain("❌ *Tool execution rejected*");
			expect(result).toContain("*Tool:* `Edit`");
			expect(result).toContain("*Parameters:*");
			expect(result).toContain('"file": "config.json"');
			expect(result).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
		});

		it("should format complex parameters correctly", () => {
			const complexParams = {
				command: "npm install",
				args: ["--save-dev", "typescript"],
				env: { NODE_ENV: "development" },
			};

			const result = plainText({
				type: "requested",
				toolName: "Bash",
				parameters: complexParams,
				cwd: "/tmp",
			});

			expect(result).toContain("```");
			expect(result).toContain(JSON.stringify(complexParams, null, 2));
		});
	});
});
