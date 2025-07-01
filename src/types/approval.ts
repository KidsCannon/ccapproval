export interface ApprovalRequest {
  id: string;
  toolName: string;
  parameters: Record<string, unknown>;
  requestedAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'timeout';
  slackMessageTs?: string;
  slackChannel?: string;
  decidedBy?: string;
  decidedAt?: Date;
  reason?: string;
}

export interface ToolEventData {
  tool: string;
  params: Record<string, unknown>;
  context?: string;
}

export interface CreateApprovalRequest {
  toolName: string;
  parameters: Record<string, unknown>;
}

export interface ApprovalDecision {
  decision: 'approve' | 'block';
  reason: string;
}

export interface SlackButtonInteraction {
  action_id: string;
  value: string;
  user: {
    id: string;
    name: string;
  };
  response_url: string;
  trigger_id: string;
}