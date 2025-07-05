import { describe, expect, it } from "vitest";
import { button, markdownSection, message } from "./slack-messages.ts";

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
			const result = message({
				type: "requested",
				toolName: "Bash",
				parameters: { command: "ls -la" },
			});

			expect(result).toContain("🔧 *Tool execution approval requested*");
			expect(result).toContain("*Tool:* Bash");
			expect(result).toContain("*Parameters:*");
			expect(result).toContain("```");
			expect(result).toContain('"command": "ls -la"');
		});

		it("should create approved message with user and timestamp", () => {
			const beforeTime = new Date().toISOString();
			const result = message({
				type: "approved",
				toolName: "Write",
				parameters: { file: "test.txt" },
				userId: "U12345",
			});
			const afterTime = new Date().toISOString();

			expect(result).toContain("✅ *Tool execution approved*");
			expect(result).toContain("*Tool:* Write");
			expect(result).toContain("*Arguments:*");
			expect(result).toContain('"file": "test.txt"');
			expect(result).toContain("*Decided by:* <@U12345>");
			expect(result).toContain("*Time:*");

			// Check that timestamp is between before and after
			const timeMatch = result.match(/\*Time:\* (.+)$/m);
			expect(timeMatch).toBeTruthy();
			if (timeMatch) {
				const timestamp = timeMatch[1];
				expect(timestamp >= beforeTime).toBe(true);
				expect(timestamp <= afterTime).toBe(true);
			}
		});

		it("should create rejected message with user and timestamp", () => {
			const result = message({
				type: "rejected",
				toolName: "Edit",
				parameters: { file: "config.json" },
				userId: "U67890",
			});

			expect(result).toContain("❌ *Tool execution rejected*");
			expect(result).toContain("*Tool:* Edit");
			expect(result).toContain("*Arguments:*");
			expect(result).toContain('"file": "config.json"');
			expect(result).toContain("*Decided by:* <@U67890>");
			expect(result).toContain("*Time:*");
			expect(result).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
		});

		it("should format complex parameters correctly", () => {
			const complexParams = {
				command: "npm install",
				args: ["--save-dev", "typescript"],
				env: { NODE_ENV: "development" },
			};

			const result = message({
				type: "requested",
				toolName: "Bash",
				parameters: complexParams,
			});

			expect(result).toContain("```");
			expect(result).toContain(JSON.stringify(complexParams, null, 2));
		});
	});
});
