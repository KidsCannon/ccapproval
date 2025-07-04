# ccapproval - Claude Code Approval

## USAGE

```shell
$ claude --permission-prompt-tool mcp__ccapproval__tool-approval -p [prompt]
```

## INSTALLATION

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

## NOTICE

- The `--permission-prompt-tool` option only works in non-interactive mode in combination with the `-p` flag. It does not work in interactive mode.
- Hooks are available in interactive mode, but due to a one-minute timeout, there is a high possibility that the approval process will exceed the timeout period, so this tool does not currently support it.

## TIPS

```shell
alias claude-p='claude --permission-prompt-tool mcp__ccapproval__tool-approval -p'
```

## TROUBLESHOOTING

| Issue | Solution |
|-------|----------|
| Bot not posting | Verify bot is in channel |
| Auth errors | Check token format and whitespace |
| Channel not found | Remove `#` from channel name |

## SLACK SETUP

1. Create App: https://api.slack.com/apps → New App → From scratch → Name: `ccapproval`
2. Socket Mode: Settings → Socket Mode → Enable
3. App Token: Basic Information → App-Level Tokens → Add `connections:write` scope → Save `xapp-...`
4. Bot Token: OAuth & Permissions → Add scopes (`chat:write`, `chat:write.public`, `reactions:write`) → Install → Save `xoxb-...`
5. Interactivity: Interactivity & Shortcuts → Enable

