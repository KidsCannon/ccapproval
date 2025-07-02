# ccapproval - Claude Code Approval

## Usage

```shell
$ claude --permission-prompt-tool mcp__ccapproval__tool-approval -p [prompt]
```

## Installation

CLI:

```shell
$ claude mcp add ccapproval -s user \
	-e "SLACK_BOT_TOKEN=xoxb-..." \
	-e "SLACK_APP_TOKEN=xapp-..." \
	-e "SLACK_CHANNEL_NAME=your-channel-name" \
	-- deno -A ccapproval
```

JSON:

```json
{
  "mcpServers": {
    "ccapproval": {
      "command": "deno",
      "args": ["-A", "ccapproval"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-...",
        "SLACK_APP_TOKEN": "xapp-...",
        "SLACK_CHANNEL_NAME": "your-channel-name"
      }
    }
  }
}
```

## Tips

```shell
alias claude-p='claude --permission-prompt-tool mcp__ccapproval__tool-approval -p'
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Bot not posting | Verify bot is in channel |
| Auth errors | Check token format and whitespace |
| Channel not found | Remove `#` from channel name |

## Slack Setup

### 1. Create Slack App

1. Go to https://api.slack.com/apps
2. Create New App → From scratch
3. Name: `ccapproval`, select workspace

### 2. Enable Socket Mode

Settings → Socket Mode → Enable

### 3. Generate App-Level Token

1. Settings → Basic Information → App-Level Tokens
2. Generate Token and Scopes
3. Add scope: `connections:write`
4. Generate and save token (`xapp-...`)

### 4. Configure Bot Token
1. Features → OAuth & Permissions
2. Add Bot Token Scopes:
   - `chat:write`
   - `chat:write.public`
3. Install to Workspace
4. Save Bot User OAuth Token (`xoxb-...`)

### 5. Enable Interactivity

Features → Interactivity & Shortcuts → Enable

