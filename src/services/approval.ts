import { randomUUID } from 'crypto';
import { SlackService } from './slack';
import type { ApprovalRequest, CreateApprovalRequest } from '../types/approval';

interface ApprovalServiceConfig {
  slack: {
    token: string;
    signingSecret: string;
    channel: string;
  };
}

interface UpdateDecisionParams {
  status: 'approved' | 'rejected';
  decidedBy: string;
  reason?: string;
}

export class ApprovalService {
  private approvals: Map<string, ApprovalRequest> = new Map();
  private slackService: SlackService;

  constructor(config: ApprovalServiceConfig) {
    this.slackService = new SlackService(config.slack);
  }

  async create(request: CreateApprovalRequest): Promise<ApprovalRequest> {
    const approval: ApprovalRequest = {
      id: randomUUID(),
      toolName: request.toolName,
      parameters: request.parameters,
      requestedAt: new Date(),
      status: 'pending'
    };

    // Send Slack notification
    try {
      const slackResult = await this.slackService.sendApprovalRequest(approval);
      approval.slackMessageTs = slackResult.ts;
      approval.slackChannel = slackResult.channel;
    } catch (error) {
      console.error('Failed to send Slack notification:', error);
      // Continue even if Slack fails
    }

    this.approvals.set(approval.id, approval);
    return approval;
  }

  async getById(id: string): Promise<ApprovalRequest | null> {
    return this.approvals.get(id) || null;
  }

  async updateDecision(
    id: string, 
    params: UpdateDecisionParams
  ): Promise<ApprovalRequest | null> {
    const approval = this.approvals.get(id);
    if (!approval) {
      return null;
    }

    approval.status = params.status;
    approval.decidedBy = params.decidedBy;
    approval.decidedAt = new Date();
    approval.reason = params.reason;

    return approval;
  }

  async waitForDecision(id: string, timeoutMs: number): Promise<ApprovalRequest | null> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const approval = await this.getById(id);
      
      if (!approval) {
        return null;
      }
      
      if (approval.status !== 'pending') {
        return approval;
      }
      
      // Wait 50ms before checking again
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Timeout - update status
    const approval = await this.getById(id);
    if (approval && approval.status === 'pending') {
      approval.status = 'timeout';
    }
    
    return approval;
  }
}