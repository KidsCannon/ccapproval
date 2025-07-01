import { App, ExpressReceiver } from '@slack/bolt';
import type { ApprovalRequest, SlackButtonInteraction } from '../types/approval';

interface SlackServiceConfig {
  token: string;
  signingSecret: string;
  channel: string;
}

interface SlackMessageResult {
  ts: string;
  channel: string;
}

interface InteractionResult {
  approvalId: string;
  decision: 'approved' | 'rejected';
  userId: string;
  userName: string;
}

export class SlackService {
  private app: App;
  private channel: string;

  constructor(config: SlackServiceConfig) {
    this.channel = config.channel;
    
    const receiver = new ExpressReceiver({
      signingSecret: config.signingSecret
    });

    this.app = new App({
      token: config.token,
      receiver
    });

    // Register button interaction handlers
    this.app.action('approve', async ({ ack }) => {
      await ack();
    });

    this.app.action('reject', async ({ ack }) => {
      await ack();
    });
  }

  async sendApprovalRequest(approval: ApprovalRequest): Promise<SlackMessageResult> {
    const blocks = [
      {
        type: 'header' as const,
        text: { 
          type: 'plain_text' as const, 
          text: '🔐 Claude Code 承認リクエスト' 
        }
      },
      {
        type: 'section' as const,
        fields: [
          { 
            type: 'mrkdwn' as const, 
            text: `*ツール:* ${approval.toolName}` 
          },
          { 
            type: 'mrkdwn' as const, 
            text: `*時刻:* ${approval.requestedAt.toLocaleString('ja-JP')}` 
          }
        ]
      },
      {
        type: 'section' as const,
        text: { 
          type: 'mrkdwn' as const, 
          text: '```' + JSON.stringify(approval.parameters, null, 2) + '```' 
        }
      },
      {
        type: 'actions' as const,
        block_id: `approval_${approval.id}`,
        elements: [
          {
            type: 'button' as const,
            text: { 
              type: 'plain_text' as const, 
              text: '✅ 承認' 
            },
            style: 'primary' as const,
            action_id: 'approve',
            value: approval.id
          },
          {
            type: 'button' as const,
            text: { 
              type: 'plain_text' as const, 
              text: '❌ 拒否' 
            },
            style: 'danger' as const,
            action_id: 'reject',
            value: approval.id
          }
        ]
      }
    ];

    const result = await this.app.client.chat.postMessage({
      channel: this.channel,
      blocks,
      text: `承認リクエスト: ${approval.toolName}`
    });

    if (!result.ts || !result.channel) {
      throw new Error('Failed to send Slack message');
    }

    return {
      ts: result.ts,
      channel: result.channel as string
    };
  }

  async handleInteraction(interaction: SlackButtonInteraction): Promise<InteractionResult> {
    const decision = interaction.action_id === 'approve' ? 'approved' : 'rejected';
    
    return {
      approvalId: interaction.value,
      decision,
      userId: interaction.user.id,
      userName: interaction.user.name
    };
  }

  async start(port?: number): Promise<void> {
    await this.app.start(port);
  }
}