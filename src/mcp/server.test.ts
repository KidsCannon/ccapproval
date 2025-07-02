import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolApprovalService } from '../hooks/tool-approval-service.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('MCP Server Tool Approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tool approval logic', () => {
    it('should approve safe tools automatically', async () => {
      const handler = new ToolApprovalService('http://localhost:3210', 30000);
      const input = JSON.stringify({ tool: 'Read', params: { file_path: '/test' } });
      
      const result = await handler.handle(input);
      
      expect(result.decision).toBe('approve');
      expect(result.reason).toBe('Safe tool - automatic approval');
    });

    it('should request approval for dangerous tools', async () => {
      // Mock successful approval creation and approved decision
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'test-approval-id' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ 
            status: 'approved',
            decidedBy: 'user123'
          })
        });

      const handler = new ToolApprovalService('http://localhost:3210', 30000);
      const input = JSON.stringify({ 
        tool: 'Bash', 
        params: { command: 'echo "test"' } 
      });
      
      const result = await handler.handle(input);
      
      expect(result.decision).toBe('approve');
      expect(result.reason).toBe('Decision: approved by user123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should block tools when approval is denied', async () => {
      // Mock successful approval creation but denied decision
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'test-approval-id' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ 
            status: 'denied',
            decidedBy: 'user123'
          })
        });

      const handler = new ToolApprovalService('http://localhost:3210', 30000);
      const input = JSON.stringify({ 
        tool: 'Write', 
        params: { file_path: '/etc/passwd', content: 'malicious' } 
      });
      
      const result = await handler.handle(input);
      
      expect(result.decision).toBe('block');
      expect(result.reason).toBe('Decision: denied by user123');
    });

    it('should block tools on error', async () => {
      // Mock fetch to throw an error
      mockFetch.mockRejectedValue(new Error('Network error'));

      const handler = new ToolApprovalService('http://localhost:3210', 30000);
      const input = JSON.stringify({ 
        tool: 'Bash', 
        params: { command: 'echo "test"' } 
      });
      
      const result = await handler.handle(input);
      
      expect(result.decision).toBe('block');
      expect(result.reason).toContain('Error in approval process');
    });

    it('should handle invalid JSON input', async () => {
      const handler = new ToolApprovalService('http://localhost:3210', 30000);
      const invalidInput = 'invalid json';
      
      const result = await handler.handle(invalidInput);
      
      expect(result.decision).toBe('block');
      expect(result.reason).toContain('Error in approval process');
    });

    it('should use correct timeout and server URL', () => {
      const serverUrl = 'http://example.com:8080';
      const timeout = 60000;
      
      const handler = new ToolApprovalService(serverUrl, timeout);
      
      expect(handler).toBeInstanceOf(ToolApprovalService);
    });
  });

  describe('tool validation', () => {
    it('should accept valid tool input for safe tools', async () => {
      const handler = new ToolApprovalService('http://localhost:3210', 30000);
      const validInput = JSON.stringify({ 
        tool: 'Read',
        params: { file_path: '/test.txt' }
      });
      
      const result = await handler.handle(validInput);
      
      expect(result.decision).toBe('approve');
      expect(result.reason).toBe('Safe tool - automatic approval');
    });

    it('should handle timeout scenarios', async () => {
      // Mock successful approval creation but no response (timeout)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'test-approval-id' })
        })
        .mockResolvedValue({
          ok: true,
          json: async () => ({ 
            status: 'pending' // Always return pending to trigger timeout
          })
        });

      const handler = new ToolApprovalService('http://localhost:3210', 1000); // Short timeout for test
      const input = JSON.stringify({ 
        tool: 'Bash',
        params: { command: 'echo "test"' }
      });
      
      const result = await handler.handle(input);
      
      expect(result.decision).toBe('block');
      expect(result.reason).toBe('Approval request timed out');
    });
  });
});