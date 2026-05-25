# Install — Claude Code

Claude Code reads a `statusLine` block from `~/.claude/settings.json`.

## 1. Clone the repo

```bash
git clone https://github.com/<your-user>/context-bar.git ~/context-bar
```

## 2. Edit `~/.claude/settings.json`

Add the `statusLine` block at the top level:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /absolute/path/to/context-bar/bin/context-bar.js",
    "padding": 1
  }
}
```

Use an **absolute path** — Claude Code does not expand `~`. On macOS/Linux you typically want `/Users/<you>/context-bar/...` or `/home/<you>/context-bar/...`. On Windows, use forward slashes.

If you already have other top-level keys (`permissions`, `enabledPlugins`, etc.), just add `statusLine` alongside them.

## 3. Restart Claude Code

Quit and relaunch the CLI / desktop / IDE extension. The bar should appear at the bottom of the terminal/UI.

## What Claude Code passes to the script

The Claude Code adapter expects a JSON payload on stdin with at minimum:

```json
{
  "transcript_path": "/path/to/session.jsonl",
  "model": { "id": "claude-opus-4-7[1m]", "display_name": "Opus" },
  "cwd": "/working/dir",
  "cost": { "total_cost_usd": 0.42 }
}
```

The script reads the JSONL transcript to compute current context usage. The transcript is updated by Claude Code after each turn, so the bar refreshes naturally.

## Troubleshooting

- **Bar doesn't appear**: confirm `which node` returns a Node 18+ binary; absolute paths matter inside `settings.json` because Claude Code runs the command without your shell's `PATH`.
- **Always shows 0%**: the script can't find the transcript — verify `transcript_path` is what your version of Claude Code emits (look at the latest line in `~/.claude/projects/.../*.jsonl`).
- **Colors look weird**: set `"command": "NO_COLOR=1 node /path/to/bin/context-bar.js"` or `export NO_COLOR=1` in your shell.
- **Slow status bar**: this script aims for <50ms. If it's slow, your transcript file is unusually large; trim with `/compact`.
