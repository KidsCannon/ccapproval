import { z } from 'zod';

const DANGEROUS_TOOLS = ['Bash', 'Write', 'Edit', 'MultiEdit'];

const toolEventSchema = z.object({
  tool: z.string(),
  params: z.record(z.unknown())
});

export type ToolEvent = z.infer<typeof toolEventSchema>;

export interface ApprovalDecision {
  decision: 'approve' | 'block';
  reason: string;
}

export class PreToolUseHandler {
  private approvalServerUrl: string;
  private approvalTimeout: number;

  constructor(approvalServerUrl: string, approvalTimeout: number) {
    this.approvalServerUrl = approvalServerUrl;
    this.approvalTimeout = approvalTimeout;
  }

  async handle(input: string): Promise<ApprovalDecision> {
    try {
      const event = toolEventSchema.parse(JSON.parse(input));
      
      // Check if tool is dangerous
      if (!DANGEROUS_TOOLS.includes(event.tool)) {
        return { 
          decision: 'approve', 
          reason: 'Safe tool - automatic approval' 
        };
      }

      // Request approval
      const approval = await this.requestApproval(event);
      const result = await this.waitForDecision(approval.id);
      
      return {
        decision: result.status === 'approved' ? 'approve' : 'block',
        reason: result.decidedBy ? `Decision: ${result.status} by ${result.decidedBy}` : (result.reason || `Decision: ${result.status}`)
      };
    } catch (error) {
      // On any error, block for safety
      return {
        decision: 'block',
        reason: `Error in approval process: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async requestApproval(event: ToolEvent): Promise<any> {
    const response = await fetch(`${this.approvalServerUrl}/api/approvals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolName: event.tool,
        parameters: event.params
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create approval request: ${response.status}`);
    }
    
    return response.json();
  }

  private async waitForDecision(id: string): Promise<any> {
    const deadline = Date.now() + this.approvalTimeout;
    
    while (Date.now() < deadline) {
      const response = await fetch(`${this.approvalServerUrl}/api/approvals/${id}`);
      
      if (!response.ok) {
        throw new Error(`Failed to get approval status: ${response.status}`);
      }
      
      const approval: any = await response.json();
      
      if (approval.status !== 'pending') {
        return approval;
      }
      
      // Wait 1 second before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Timeout reached
    return {
      status: 'timeout',
      reason: 'Approval request timed out'
    };
  }
}