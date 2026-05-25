# Install — OpenCode

[OpenCode](https://opencode.ai) supports a customizable status line via its config file (typically `~/.config/opencode/config.json` or `~/.opencode/config.json` depending on version).

> **Heads up**: OpenCode's statusline contract is still evolving. The adapter reads several likely field names defensively. If your version doesn't match, fall back to the env adapter (see below).

## 1. Clone the repo

```bash
git clone https://github.com/<your-user>/context-bar.git ~/context-bar
```

## 2. Wire it into OpenCode

Add to your OpenCode config (path varies by version — check `opencode --help` or your docs):

```json
{
  "statusline": {
    "command": "node /absolute/path/to/context-bar/bin/context-bar.js"
  }
}
```

If your OpenCode version uses a different key (`status_line`, `statusBar`, etc.), use that — the script reads stdin regardless.

## 3. Restart OpenCode

The bar should appear in your status area.

## Fallback: env-adapter mode

If the OpenCode adapter doesn't pick up your tokens correctly, configure OpenCode to set these env vars before invoking the script:

```bash
export CONTEXT_BAR_MODEL_ID="$OPENCODE_MODEL"
export CONTEXT_BAR_USED_TOKENS="$OPENCODE_TOTAL_TOKENS"
export CONTEXT_BAR_WINDOW_TOKENS=200000
```

The generic env adapter will take over and render the bar from those vars. See the main [README](../README.md) for the full list.

## Reporting issues

If your OpenCode payload differs from what the adapter expects, please:

1. Run `echo '<payload-you-saw>' | node bin/context-bar.js` to see what's parsed.
2. Open an issue with the redacted payload — we'll extend the adapter.
