# ccapproval - Claude Code Approval

## INSTALLATION

Add MCP server:

```shell
$ claude mcp add ccapproval --scope user \
		-e "SLACK_BOT_TOKEN=xoxb-..." \
		-e "SLACK_APP_TOKEN=xapp-..." \
		-e "SLACK_CHANNEL=channel for communication" \
		-e "SLACK_MENTION=username for mention (optional)" \
		-- npx ccapproval@latest
```

Or use MCP config file:

```shell
$ claude --mcp-config ~/.config/ccapproval/mcp.json ...
```

See examples:

- [examples/mcp-npx.json](examples/mcp-npx.json)
- [examples/mcp-npx-debug.json](examples/mcp-npx-debug.json)
- [examples/mcp-deno.json](examples/mcp-deno.json)
- [examples/mcp-deno-debug.json](examples/mcp-deno-debug.json)

## USAGE

```shell
$ claude --permission-prompt-tool mcp__ccapproval__tool-approval -p [prompt]
```

## NOTICE

- The `--permission-prompt-tool` option only works in non-interactive mode in combination with the `-p` flag. It does not work in interactive mode.
- Hooks are available in interactive mode, but they cannot selectively react only when permission prompts are displayed during pre-use tool events, so this tool does not currently support it.

## TIPS

```shell
alias claude-p='claudee --permission-mode acceptEdits --mcp-config ~/.config/ccapproval/mcp.json --permission-prompt-tool mcp__ccapproval__tool-approval -p'
```

## TROUBLESHOOTING

| Issue | Solution |
|-------|----------|
| Bot not posting | Verify bot is in channel |
| Auth errors | Check token format and whitespace |
| Channel not found | Remove `#` from channel name |

### DEBUGGING

```shell
$ claude --debug --mcp-config ~/.config/ccapproval/mcp-debug.json --permission-prompt-tool mcp__ccapproval__tool-approval -p [prompt]
```

~/.config/ccapproval/mcp-debug.json:
```json
{
	"mcpServers": {
		"ccapproval": {
			"command": "bash",
			"args": [
				"-c",
				"npx ccapproval@latest 2> >(systemd-cat -p err -t ccapproval)"
			],
			"env": {
				"CCAPPROVAL_DEBUG": "true",
				"SLACK_BOT_TOKEN": "xoxb-****",
				"SLACK_APP_TOKEN": "xapp-****",
				"SLACK_CHANNEL_NAME": "your-channel-name"
			}
		}
	}
}
```

See debug logs:
```shell
$ journalctl -u ccapproval.service -f
```

## SLACK SETUP

1. Create App: https://api.slack.com/apps → New App → From scratch → Name: `ccapproval`
2. Socket Mode: Settings → Socket Mode → Enable
3. App Token: Basic Information → App-Level Tokens → Add `connections:write` scope → Save `xapp-...`
4. Bot Token: OAuth & Permissions → Add scopes (`channels:read`, `chat:write`, `chat:write.public`, `reactions:write`) → Install → Save `xoxb-...`
5. Interactivity: Interactivity & Shortcuts → Enable
6. `/invite @ccapproval` in the channel

