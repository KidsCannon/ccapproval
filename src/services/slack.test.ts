import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackService } from './slack';
import type { ApprovalRequest } from '../types/approval';

// Mock the Slack Bolt App
vi.mock('@slack/bolt', () => {
  return {
    App: vi.fn().mockImplementation(() => ({
      client: {
        chat: {
          postMessage: vi.fn().mockResolvedValue({
            ok: true,
            ts: '1234567890.123456',
            channel: 'C1234567890'
          })
        }
      },
      action: vi.fn(),
      start: vi.fn().mockResolvedValue(undefined)
    })),
    ExpressReceiver: vi.fn().mockImplementation(() => ({
      router: {
        use: vi.fn(),
        get: vi.fn(),
        post: vi.fn()
      }
    }))
  };
});

describe('SlackService', () => {
  let service: SlackService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SlackService({
      token: 'xoxb-test',
      signingSecret: 'test-secret',
      channel: 'C1234567890'
    });
  });

  describe('sendApprovalRequest', () => {
    it('should send approval request with interactive buttons', async () => {
      const mockApproval: ApprovalRequest = {
        id: 'test-123',
        toolName: 'Bash',
        parameters: { command: 'echo test' },
        requestedAt: new Date(),
        status: 'pending'
      };
      
      const result = await service.sendApprovalRequest(mockApproval);
      
      expect(result).toHaveProperty('ts');
      expect(result).toHaveProperty('channel');
      expect(result.ts).toBe('1234567890.123456');
      expect(result.channel).toBe('C1234567890');
    });

    it('should format message with proper blocks', async () => {
      const mockApproval: ApprovalRequest = {
        id: 'test-456',
        toolName: 'Write',
        parameters: { 
          file_path: '/etc/passwd',
          content: 'malicious content' 
        },
        requestedAt: new Date(),
        status: 'pending'
      };
      
      await service.sendApprovalRequest(mockApproval);
      
      // Verify the Slack client was called
      const mockApp = (service as any).app;
      expect(mockApp.client.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C1234567890',
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: 'header'
            }),
            expect.objectContaining({
              type: 'section',
              fields: expect.any(Array)
            }),
            expect.objectContaining({
              type: 'section',
              text: expect.objectContaining({
                type: 'mrkdwn'
              })
            }),
            expect.objectContaining({
              type: 'actions',
              elements: expect.arrayContaining([
                expect.objectContaining({
                  type: 'button',
                  action_id: 'approve',
                  style: 'primary'
                }),
                expect.objectContaining({
                  type: 'button',
                  action_id: 'reject',
                  style: 'danger'
                })
              ])
            })
          ])
        })
      );
    });
  });

  describe('handleInteraction', () => {
    it('should handle approve button interaction', async () => {
      const interaction = {
        action_id: 'approve',
        value: 'test-123',
        user: { id: 'U123', name: 'testuser' },
        response_url: 'https://hooks.slack.com/test',
        trigger_id: 'trigger123'
      };
      
      const result = await service.handleInteraction(interaction);
      
      expect(result).toEqual({
        approvalId: 'test-123',
        decision: 'approved',
        userId: 'U123',
        userName: 'testuser'
      });
    });

    it('should handle reject button interaction', async () => {
      const interaction = {
        action_id: 'reject',
        value: 'test-456',
        user: { id: 'U456', name: 'anotheruser' },
        response_url: 'https://hooks.slack.com/test',
        trigger_id: 'trigger456'
      };
      
      const result = await service.handleInteraction(interaction);
      
      expect(result).toEqual({
        approvalId: 'test-456',
        decision: 'rejected',
        userId: 'U456',
        userName: 'anotheruser'
      });
    });
  });
});