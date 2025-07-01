import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createApprovalRouter } from './approvals';
import { ApprovalService } from '../services/approval';
import type { CreateApprovalRequest } from '../types/approval';

// Mock SlackService to avoid real Slack calls
vi.mock('../services/slack', () => {
  return {
    SlackService: vi.fn().mockImplementation(() => ({
      sendApprovalRequest: vi.fn().mockResolvedValue({
        ts: '1234567890.123456',
        channel: 'C1234567890'
      })
    }))
  };
});

describe('Approval API', () => {
  let app: Hono;
  let approvalService: ApprovalService;
  
  beforeEach(() => {
    approvalService = new ApprovalService({
      slack: {
        token: 'xoxb-test',
        signingSecret: 'test-secret',
        channel: 'C1234567890'
      }
    });
    app = new Hono();
    app.route('/api', createApprovalRouter(approvalService));
  });

  describe('POST /api/approvals', () => {
    it('should create approval request', async () => {
      const requestBody: CreateApprovalRequest = {
        toolName: 'Bash',
        parameters: { command: 'rm -rf /' }
      };

      const res = await app.request('/api/approvals', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' }
      });
      
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('slackMessageSent', true);
    });

    it('should validate request body', async () => {
      const invalidBody = {
        // Missing required fields
        parameters: { command: 'test' }
      };

      const res = await app.request('/api/approvals', {
        method: 'POST',
        body: JSON.stringify(invalidBody),
        headers: { 'Content-Type': 'application/json' }
      });
      
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/approvals/:id', () => {
    it('should retrieve approval by id', async () => {
      const res = await app.request('/api/approvals/test-123', {
        method: 'GET'
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('id', 'test-123');
      expect(data).toHaveProperty('status');
    });

    it('should return 404 for non-existent approval', async () => {
      const res = await app.request('/api/approvals/non-existent', {
        method: 'GET'
      });
      
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toHaveProperty('error', 'Not found');
    });
  });

  describe('POST /api/approvals/:id/decision', () => {
    it('should update approval decision', async () => {
      const decision = {
        status: 'approved',
        decidedBy: 'U12345',
        reason: 'Looks safe'
      };

      const res = await app.request('/api/approvals/test-123/decision', {
        method: 'POST',
        body: JSON.stringify(decision),
        headers: { 'Content-Type': 'application/json' }
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('status', 'approved');
      expect(data).toHaveProperty('decidedBy', 'U12345');
    });
  });
});