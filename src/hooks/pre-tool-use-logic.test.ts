import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PreToolUseHandler } from './pre-tool-use-logic';

// Mock fetch globally
global.fetch = vi.fn();

describe('PreToolUseHandler', () => {
  let handler: PreToolUseHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockReset();
    handler = new PreToolUseHandler('http://localhost:3000', 1000);
  });

  describe('handle', () => {
    it('should auto-approve safe tools', async () => {
      const input = JSON.stringify({
        tool: 'Read',
        params: { file_path: '/tmp/test.txt' }
      });

      const result = await handler.handle(input);

      expect(result).toEqual({
        decision: 'approve',
        reason: 'Safe tool - automatic approval'
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should request approval for dangerous tools', async () => {
      const input = JSON.stringify({
        tool: 'Bash',
        params: { command: 'echo test' }
      });

      // Mock successful approval creation
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'test-123' })
        })
        // Mock approved status
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'test-123',
            status: 'approved',
            decidedBy: 'U12345',
            reason: 'Safe command'
          })
        });

      const result = await handler.handle(input);

      expect(result).toEqual({
        decision: 'approve',
        reason: 'Decision: approved by U12345'
      });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should block on rejection', async () => {
      const input = JSON.stringify({
        tool: 'Write',
        params: { file_path: '/etc/passwd', content: 'malicious' }
      });

      // Mock successful approval creation
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'test-456' })
        })
        // Mock rejected status
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'test-456',
            status: 'rejected',
            decidedBy: 'U67890',
            reason: 'Dangerous operation'
          })
        });

      const result = await handler.handle(input);

      expect(result).toEqual({
        decision: 'block',
        reason: 'Decision: rejected by U67890'
      });
    });

    it('should handle timeout', async () => {
      const input = JSON.stringify({
        tool: 'Edit',
        params: { file_path: '/tmp/test.txt' }
      });

      // Mock successful approval creation
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'test-789' })
        })
        // Mock pending status (will timeout)
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            id: 'test-789',
            status: 'pending'
          })
        });

      const result = await handler.handle(input);

      expect(result).toEqual({
        decision: 'block',
        reason: 'Approval request timed out'
      });
    });

    it('should handle errors gracefully', async () => {
      const input = JSON.stringify({
        tool: 'Bash',
        params: { command: 'rm -rf /' }
      });

      // Mock network error
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const result = await handler.handle(input);

      expect(result).toEqual({
        decision: 'block',
        reason: 'Error in approval process: Network error'
      });
    });

    it('should handle invalid input', async () => {
      const input = 'invalid json';

      const result = await handler.handle(input);

      expect(result).toEqual({
        decision: 'block',
        reason: expect.stringContaining('Error in approval process:')
      });
    });

    it('should handle HTTP errors during approval creation', async () => {
      const input = JSON.stringify({
        tool: 'Bash',
        params: { command: 'ls' }
      });

      // Mock HTTP error
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      const result = await handler.handle(input);

      expect(result).toEqual({
        decision: 'block',
        reason: 'Error in approval process: Failed to create approval request: 500'
      });
    });
  });
});