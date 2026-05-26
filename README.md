# Context Bar

> A Smart Zone / Dumb Zone context-window meter for Claude Code, OpenCode, Codex, and other AI coding agents.

```
[▰▰▰▰▱▱▱▱▱▱] 42% · Dumb Zone · Opus 4.7 · 412k/1M · main · $0.42
```

When you're talking to a long-context model, the first ~30% of the window is the **Smart Zone** — the model reasons reliably, follows instructions, and doesn't hallucinate. Push past ~40% and you enter the **Dumb Zone**: attention fragments, instructions get dropped, and "lost-in-the-middle" failures climb. `context-bar` puts that threshold front-and-center in your terminal so you know when to `/compact` or start a fresh session before quality degrades.

## Features

- **Single-line meter** with a 10-segment progress bar, percentage, and zone label.
- **Color tiers** — green (0–29%), yellow (30–39%), red (40%+). Honors `NO_COLOR`.
- **Multi-host** — adapters for Claude Code, OpenCode, Codex, and a generic env-var fallback.
- **Zero dependencies** — pure Node.js stdlib (`fs`, `child_process`). Node 18+.
- **Auto window detection** — 1M when the model id is tagged `[1m]`, the host sets `exceeds_200k_tokens`, or observed usage tops 200k; 200k otherwise. Overridable via `CONTEXT_BAR_WINDOW_TOKENS`.
- **Extras** — model name, raw tokens, git branch (annotated with worktree name when you're in a linked worktree, e.g. `feat-x@worktree_3`), session cost.
- **Crash-safe** — any unexpected input degrades to a fallback line instead of breaking your status bar.

## Install

Pick one:

```bash
# npm (recommended for most users)
npm install -g context-bar
```

```bash
# git clone (if you want to pin to a commit or hack on the source)
git clone https://github.com/alejandrok5/context-bar.git ~/context-bar
```

The npm install puts a `context-bar` binary on your `$PATH`. Find its absolute path with `which context-bar` (or `where context-bar` on Windows) — you'll need it for the host config below, because some hosts (notably Claude Code's `statusLine`) launch commands without inheriting your shell's `PATH`.

The git-clone path requires no `npm install` and no build step. The script in `bin/context-bar.js` is ready to run.

Then wire it into your tool of choice:

- **[Claude Code](docs/install-claude-code.md)**
- **[OpenCode](docs/install-opencode.md)**
- **[Codex / generic](docs/install-codex.md)**

### Quick wire-up (Claude Code)

Add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "/absolute/path/to/context-bar",
    "padding": 1
  }
}
```

Replace `/absolute/path/to/context-bar` with the output of `which context-bar` (npm install) or `node /absolute/path/to/context-bar/bin/context-bar.js` (git clone).

Restart Claude Code. The bar should appear at the bottom of your terminal session.

## Configuration

Most behavior is auto-detected. Use these env vars to override:

| Env var | Default | What it does |
| --- | --- | --- |
| `CONTEXT_BAR_WINDOW_TOKENS` | auto | Force the context window size (e.g. `200000`, `1000000`). |
| `NO_COLOR` / `CONTEXT_BAR_NO_COLOR` | unset | Disable ANSI color output. |
| `FORCE_COLOR` | unset | Force color on (overrides `NO_COLOR`). Set to `0`/`false` to force off. |
| `CONTEXT_BAR_ZONE_SMART` | `30` | Smart→approaching threshold (% of window). |
| `CONTEXT_BAR_ZONE_DUMB` | `40` | approaching→Dumb threshold (% of window). |
| `CONTEXT_BAR_ASCII` | auto | Force ASCII glyphs (`[#####-----]`) instead of Unicode (`[▰▰▰▰▰▱▱▱▱▱]`). Auto-on when `LANG` is non-UTF-8. |
| `CONTEXT_BAR_USED_TOKENS` | n/a | (env adapter only) Used tokens count. |
| `CONTEXT_BAR_MODEL_ID` | n/a | (env adapter only) Model id. |
| `CONTEXT_BAR_MODEL_NAME` | n/a | (env adapter only) Display name. |
| `CONTEXT_BAR_COST_USD` | n/a | (env adapter only) Cumulative cost. |
| `CONTEXT_BAR_CWD` | `$PWD` | (env adapter only) Working dir for git branch lookup. |
| `CONTEXT_BAR_TRANSCRIPT_PATH` | n/a | (env adapter only) JSONL transcript to parse. |

## How "used tokens" is computed

- **Claude Code**: walks the JSONL transcript at `transcript_path` (passed in by Claude Code) from the bottom up, finds the most recent assistant message with a `usage` block, and sums `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`. That's the model's actual context size at the last turn. After `/compact`, the walk stops at the `compact_boundary` marker and reports `0` until the next assistant turn writes fresh usage — so the bar visibly resets the moment you compact.
- **OpenCode**: reads `usage.total_tokens` (or `input_tokens + output_tokens`) directly from the payload.
- **Codex**: reads env vars or a nested `codex.usage` payload.
- **env fallback**: trusts `CONTEXT_BAR_USED_TOKENS` directly.

## Why the 40% threshold?

The "lost-in-the-middle" effect ([Liu et al., 2023](https://arxiv.org/abs/2307.03172)) shows that LLM recall and instruction-following degrade noticeably once the prompt grows past a fraction of the model's window — for current generation models, that's around 30–40%. The exact number isn't universal, but the qualitative cliff is real, and `context-bar` errs on the side of warning early. If you want to move the threshold, fork `src/render.js` (`pickZone`) — it's ~10 lines.

## Add a new host adapter

Adapters live in `src/adapters/`. The contract is two functions:

```js
module.exports = {
  name: 'my-host',
  detect(stdin, env) {
    // return true if this payload/env looks like yours
  },
  parse(stdin, env) {
    // return a normalized payload:
    // { modelId, modelDisplayName, usedTokens, windowSize, costUsd, cwd, transcriptPath }
  },
};
```

Register it in `src/detect.js` (order matters — first detector wins). Add a test in `test/adapters.test.js`. Submit a PR.

## Development

```bash
npm test    # runs node --test on the test/ dir
npm run smoke   # pipes an empty payload to verify the fallback path
```

No dependencies to install.

## License

MIT. See [LICENSE](LICENSE).
