export interface ApprovalRequest {
	id: string;
	toolName: string;
	parameters: unknown;
	cwd?: string;
	status: "pending" | "approved" | "rejected" | "timeout";
	decidedBy?: string;
	decidedAt?: Date;
	reason?: string;
}

export type { SessionThreadMapping } from "./storage";
