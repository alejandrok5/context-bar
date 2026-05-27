# Install — OpenCode

[OpenCode](https://opencode.ai) supports a customizable status line via its config file (typically `~/.config/opencode/config.json` or `~/.opencode/config.json` depending on version).

> **Heads up**: OpenCode's statusline contract is still evolving. The adapter reads several likely field names defensively. If your version doesn't match, fall back to the env adapter (see below).

## One-liner

```bash
npx context-bart install opencode
```

The installer prefers an existing `~/.opencode/config.json` if you have one; otherwise it writes the XDG path (`~/.config/opencode/config.json`). It merges a `statusline` block in place, backs up the previous file to `.bak`, and warns if a `status_line` or `statusBar` key from a different OpenCode version is already present (in which case rename `statusline` to whichever your version expects).

Pass `--dry-run` to print the proposed file without writing.

Then restart OpenCode — the bar should appear in your status area.

## Manual setup

```bash
git clone https://github.com/alejandrok5/context-bart.git ~/context-bart
```

Add to your OpenCode config (path varies by version — check `opencode --help` or your docs):

```json
{
  "statusline": {
    "command": "node /absolute/path/to/context-bart/bin/context-bart.js"
  }
}
```

If your OpenCode version uses a different key (`status_line`, `statusBar`, etc.), use that — the script reads stdin regardless.

Restart OpenCode.

## Fallback: env-adapter mode

If the OpenCode adapter doesn't pick up your tokens correctly, configure OpenCode to set these env vars before invoking the script:

```bash
export CONTEXT_BART_MODEL_ID="$OPENCODE_MODEL"
export CONTEXT_BART_USED_TOKENS="$OPENCODE_TOTAL_TOKENS"
export CONTEXT_BART_WINDOW_TOKENS=200000
```

The generic env adapter will take over and render the bar from those vars. See the main [README](../README.md) for the full list.

## Reporting issues

If your OpenCode payload differs from what the adapter expects, please:

1. Run `echo '<payload-you-saw>' | node bin/context-bart.js` to see what's parsed.
2. Open an issue with the redacted payload — we'll extend the adapter.
