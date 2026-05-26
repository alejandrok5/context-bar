# Install — Codex (and other hosts)

The [Codex CLI](https://github.com/openai/codex) does not (yet) have a stable, documented statusline contract. `context-bart` ships two paths to support it:

1. A **best-effort Codex adapter** that reads either an `OPENAI_*`/`CODEX_*`-prefixed env var or a nested `codex` payload on stdin.
2. A **generic env-adapter** that any host can drive by setting `CONTEXT_BART_*` env vars.

## Generic setup (works for any host)

The env adapter is the universal escape hatch. Configure your host to:

1. Set these env vars before invoking the script:
   ```bash
   export CONTEXT_BART_MODEL_ID="gpt-5"
   export CONTEXT_BART_USED_TOKENS=120000
   export CONTEXT_BART_WINDOW_TOKENS=200000
   export CONTEXT_BART_COST_USD=0.55
   export CONTEXT_BART_CWD="$PWD"
   ```
2. Pipe an empty (or any) JSON payload to the script:
   ```bash
   echo '{}' | node /absolute/path/to/context-bart/bin/context-bart.js
   ```

The env adapter is the last-resort detector, so it will always run when no other host adapter claims the payload.

## Codex-specific env vars

If you're driving Codex and want the dedicated adapter (which adds `prettyModelName` and a few defaults), set:

```bash
export CODEX_MODEL="gpt-5"
export CODEX_USED_TOKENS=120000
export CODEX_WINDOW_TOKENS=200000
export CODEX_COST_USD=0.55
```

The Codex adapter activates when `CODEX_MODEL` or `CODEX_SESSION_ID` is set.

## Other hosts (Aider, Cursor, etc.)

Any host that supports running a shell command for its status line can use `context-bart` via the env adapter. Open a PR if you'd like a dedicated adapter for your host — the contract is described in the [README](../README.md#add-a-new-host-adapter).
