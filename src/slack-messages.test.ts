import { describe, expect, it } from "vitest";
import type { ApprovalRequest } from "../types.js";
import {
	createApprovalRequestMessage,
	createApprovedMessage,
	createRejectedMessage,
} from "./slack-messages.js";

describe("slack-messages", () => {
	describe("createApprovalRequestMessage", () => {
		it("should create approval request message with correct structure", () => {
			const toolName = "Bash";
			const parameters = { command: "ls -la" };
			const approvalId = "test-id-123";

			const result = createApprovalRequestMessage(
				toolName,
				parameters,
				approvalId,
			);

			expect(result.text).toBe("🔧 Tool execution approval requested: Bash");
			expect(result.blocks).toHaveLength(2);

			// Check section block
			const sectionBlock = result.blocks[0];
			expect(sectionBlock.type).toBe("section");
			expect(sectionBlock.text.type).toBe("mrkdwn");
			expect(sectionBlock.text.text).toContain(
				"🔧 *Tool execution approval requested*",
			);
			expect(sectionBlock.text.text).toContain("*Tool:* Bash");
			expect(sectionBlock.text.text).toContain("*Parameters:*");
			expect(sectionBlock.text.text).toContain(
				JSON.stringify(parameters, null, 2),
			);

			// Check actions block
			const actionsBlock = result.blocks[1];
			expect(actionsBlock.type).toBe("actions");
			expect(actionsBlock.elements).toHaveLength(2);

			// Check approve button
			const approveButton = actionsBlock.elements[0];
			expect(approveButton.type).toBe("button");
			expect(approveButton.text.type).toBe("plain_text");
			expect(approveButton.text.text).toBe("✅ Approve");
			expect(approveButton.style).toBe("primary");
			expect(approveButton.action_id).toBe("approve");
			expect(approveButton.value).toBe(approvalId);

			// Check reject button
			const rejectButton = actionsBlock.elements[1];
			expect(rejectButton.type).toBe("button");
			expect(rejectButton.text.type).toBe("plain_text");
			expect(rejectButton.text.text).toBe("❌ Reject");
			expect(rejectButton.style).toBe("danger");
			expect(rejectButton.action_id).toBe("reject");
			expect(rejectButton.value).toBe(approvalId);
		});
	});

	describe("createApprovedMessage", () => {
		it("should create approved message with correct structure", () => {
			const approval: ApprovalRequest = {
				id: "test-id",
				toolName: "Write",
				parameters: { file_path: "/test.txt", content: "test" },
				status: "pending",
			};
			const userId = "U12345";

			const result = createApprovedMessage(approval, userId);

			expect(result.text).toBe("✅ Tool execution approved by <@U12345>");
			expect(result.blocks).toHaveLength(1);

			const block = result.blocks[0];
			expect(block.type).toBe("section");
			expect(block.text.type).toBe("mrkdwn");
			expect(block.text.text).toContain("✅ *Tool execution approved*");
			expect(block.text.text).toContain("*Tool:* Write");
			expect(block.text.text).toContain("*Decided by:* <@U12345>");
			expect(block.text.text).toContain(
				JSON.stringify(approval.parameters, null, 2),
			);
		});

		it("should create approved message with complete content", () => {
			const approval: ApprovalRequest = {
				id: "test-id",
				toolName: "Bash",
				parameters: { command: "npm install" },
				status: "pending",
			};
			const userId = "U67890";

			const result = createApprovedMessage(approval, userId);

			expect(result.blocks[0].text.text).toMatch(
				/✅ \*Tool execution approved\*/,
			);
			expect(result.blocks[0].text.text).toMatch(/\*Tool:\* Bash/);
			expect(result.blocks[0].text.text).toMatch(
				/\*Arguments:\* \{[\s\S]*"command": "npm install"[\s\S]*\}/,
			);
			expect(result.blocks[0].text.text).toMatch(/\*Decided by:\* <@U67890>/);
			expect(result.blocks[0].text.text).toMatch(
				/\*Time:\* \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/,
			);
		});
	});

	describe("createRejectedMessage", () => {
		it("should create rejected message with correct structure", () => {
			const approval: ApprovalRequest = {
				id: "test-id",
				toolName: "Edit",
				parameters: { file_path: "/test.txt" },
				status: "pending",
			};
			const userId = "U67890";

			const result = createRejectedMessage(approval, userId);

			expect(result.text).toBe("❌ Tool execution rejected by <@U67890>");
			expect(result.blocks).toHaveLength(1);

			const block = result.blocks[0];
			expect(block.type).toBe("section");
			expect(block.text.type).toBe("mrkdwn");
			expect(block.text.text).toContain("❌ *Tool execution rejected*");
			expect(block.text.text).toContain("*Tool:* Edit");
			expect(block.text.text).toContain("*Decided by:* <@U67890>");
		});

		it("should create rejected message with complete content", () => {
			const approval: ApprovalRequest = {
				id: "test-id",
				toolName: "MultiEdit",
				parameters: { edits: [{ old: "foo", new: "bar" }] },
				status: "pending",
			};
			const userId = "U12345";

			const result = createRejectedMessage(approval, userId);

			expect(result.blocks[0].text.text).toMatch(
				/❌ \*Tool execution rejected\*/,
			);
			expect(result.blocks[0].text.text).toMatch(/\*Tool:\* MultiEdit/);
			expect(result.blocks[0].text.text).toMatch(/\*Decided by:\* <@U12345>/);
			expect(result.blocks[0].text.text).toMatch(
				/\*Time:\* \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/,
			);
		});
	});
});
