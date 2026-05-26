# Install — Claude Code

Claude Code reads a `statusLine` block from `~/.claude/settings.json`.

## 1. Install context-bart

Either:

```bash
npm install -g context-bart
which context-bart    # note the path it prints
```

Or:

```bash
git clone https://github.com/alejandrok5/context-bart.git ~/context-bart
```

## 2. Edit `~/.claude/settings.json`

Add the `statusLine` block at the top level. Pick the form that matches how you installed:

```json
{
  "statusLine": {
    "type": "command",
    "command": "/Users/<you>/.npm-global/bin/context-bart",
    "padding": 1
  }
}
```

…or, for the git-clone path:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /Users/<you>/context-bart/bin/context-bart.js",
    "padding": 1
  }
}
```

Use an **absolute path** — Claude Code does not expand `~` and runs the command without your shell's `PATH`. On macOS/Linux you typically want `/Users/<you>/...` or `/home/<you>/...`. On Windows, use forward slashes.

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
- **Colors look weird**: set `"command": "NO_COLOR=1 node /path/to/bin/context-bart.js"` or `export NO_COLOR=1` in your shell.
- **Slow status bar**: this script aims for <50ms. If it's slow, your transcript file is unusually large; trim with `/compact`.
