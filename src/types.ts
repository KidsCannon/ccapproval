export interface ApprovalRequest {
	id: string;
	toolName: string;
	parameters: unknown;
	status: "pending" | "approved" | "rejected" | "timeout";
	decidedBy?: string;
	decidedAt?: Date;
	reason?: string;
}

export type { SessionThreadMapping } from "./storage";
