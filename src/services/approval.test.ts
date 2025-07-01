import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApprovalService } from './approval';
import type { CreateApprovalRequest } from '../types/approval';

// Mock SlackService
vi.mock('./slack', () => {
  return {
    SlackService: vi.fn().mockImplementation(() => ({
      sendApprovalRequest: vi.fn().mockResolvedValue({
        ts: '1234567890.123456',
        channel: 'C1234567890'
      })
    }))
  };
});

describe('ApprovalService', () => {
  let service: ApprovalService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ApprovalService({
      slack: {
        token: 'xoxb-test',
        signingSecret: 'test-secret',
        channel: 'C1234567890'
      }
    });
  });

  describe('create', () => {
    it('should create approval and send Slack notification', async () => {
      const request: CreateApprovalRequest = {
        toolName: 'Bash',
        parameters: { command: 'ls -la' }
      };

      const approval = await service.create(request);

      expect(approval).toMatchObject({
        toolName: 'Bash',
        parameters: { command: 'ls -la' },
        status: 'pending'
      });
      expect(approval.id).toBeDefined();
      expect(approval.requestedAt).toBeInstanceOf(Date);
      expect(approval.slackMessageTs).toBe('1234567890.123456');
      expect(approval.slackChannel).toBe('C1234567890');
    });
  });

  describe('getById', () => {
    it('should retrieve existing approval', async () => {
      const request: CreateApprovalRequest = {
        toolName: 'Write',
        parameters: { file_path: '/tmp/test.txt', content: 'test' }
      };

      const created = await service.create(request);
      const retrieved = await service.getById(created.id);

      expect(retrieved).toEqual(created);
    });

    it('should return null for non-existent approval', async () => {
      const result = await service.getById('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('updateDecision', () => {
    it('should update approval decision', async () => {
      const request: CreateApprovalRequest = {
        toolName: 'Edit',
        parameters: { file_path: '/tmp/test.txt' }
      };

      const created = await service.create(request);
      const updated = await service.updateDecision(created.id, {
        status: 'approved',
        decidedBy: 'U12345',
        reason: 'Safe operation'
      });

      expect(updated).toMatchObject({
        id: created.id,
        status: 'approved',
        decidedBy: 'U12345',
        reason: 'Safe operation'
      });
      expect(updated?.decidedAt).toBeInstanceOf(Date);
    });

    it('should return null for non-existent approval', async () => {
      const result = await service.updateDecision('non-existent', {
        status: 'rejected',
        decidedBy: 'U12345'
      });
      expect(result).toBeNull();
    });
  });

  describe('waitForDecision', () => {
    it('should wait for approval decision', async () => {
      const request: CreateApprovalRequest = {
        toolName: 'Bash',
        parameters: { command: 'echo test' }
      };

      const created = await service.create(request);

      // Simulate approval after 100ms
      setTimeout(async () => {
        await service.updateDecision(created.id, {
          status: 'approved',
          decidedBy: 'U12345'
        });
      }, 100);

      const result = await service.waitForDecision(created.id, 500);
      expect(result?.status).toBe('approved');
    });

    it('should timeout if no decision made', async () => {
      const request: CreateApprovalRequest = {
        toolName: 'Write',
        parameters: { file_path: '/etc/passwd' }
      };

      const created = await service.create(request);
      const result = await service.waitForDecision(created.id, 100);
      
      expect(result?.status).toBe('timeout');
    });
  });
});