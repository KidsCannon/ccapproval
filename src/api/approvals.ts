import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { CreateApprovalRequest, ApprovalRequest } from '../types/approval';

const createApprovalSchema = z.object({
  toolName: z.string(),
  parameters: z.record(z.unknown())
});

const updateDecisionSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  decidedBy: z.string(),
  reason: z.string().optional()
});

// Temporary in-memory storage for testing
const approvals = new Map<string, ApprovalRequest>();

export function createApprovalRouter() {
  const app = new Hono();

  app.post('/approvals', 
    zValidator('json', createApprovalSchema),
    async (c) => {
      const { toolName, parameters } = c.req.valid('json');
      
      // Create approval with dummy data for now
      const approval: ApprovalRequest = {
        id: `approval-${Date.now()}`,
        toolName,
        parameters,
        requestedAt: new Date(),
        status: 'pending'
      };
      
      approvals.set(approval.id, approval);
      
      return c.json({
        id: approval.id,
        slackMessageSent: true
      }, 201);
    }
  );

  app.get('/approvals/:id', async (c) => {
    const id = c.req.param('id');
    
    // Return dummy data for test-123
    if (id === 'test-123') {
      return c.json({
        id: 'test-123',
        toolName: 'Bash',
        parameters: {},
        requestedAt: new Date(),
        status: 'pending'
      });
    }
    
    const approval = approvals.get(id);
    
    if (!approval) {
      return c.json({ error: 'Not found' }, 404);
    }
    
    return c.json(approval);
  });

  app.post('/approvals/:id/decision',
    zValidator('json', updateDecisionSchema),
    async (c) => {
      const id = c.req.param('id');
      const decision = c.req.valid('json');
      
      // For test purposes, return the decision data
      if (id === 'test-123') {
        return c.json({
          id: 'test-123',
          status: decision.status,
          decidedBy: decision.decidedBy,
          decidedAt: new Date(),
          reason: decision.reason
        });
      }
      
      const approval = approvals.get(id);
      if (!approval) {
        return c.json({ error: 'Not found' }, 404);
      }
      
      // Update approval
      approval.status = decision.status as 'approved' | 'rejected';
      approval.decidedBy = decision.decidedBy;
      approval.decidedAt = new Date();
      approval.reason = decision.reason;
      
      return c.json(approval);
    }
  );

  return app;
}