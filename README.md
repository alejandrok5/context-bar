# Context Bart

[![CI](https://github.com/alejandrok5/context-bart/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/alejandrok5/context-bart/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/context-bart.svg)](https://www.npmjs.com/package/context-bart)
[![node](https://img.shields.io/node/v/context-bart.svg)](https://www.npmjs.com/package/context-bart)
[![license](https://img.shields.io/npm/l/context-bart.svg)](LICENSE)

> A Smart Zone / Dumb Zone context-window meter for Claude Code, OpenCode, Codex, and other AI coding agents.

![Context Bart — three zones across the session lifecycle](docs/demo.svg)

```
[▰▰▰▰▱▱▱▱▱▱] 42% · Dumb Zone · Opus 4.7 · 412k/1M · main · $0.42
```

When you're talking to a long-context model, the first ~30% of the window is the **Smart Zone** — the model reasons reliably, follows instructions, and doesn't hallucinate. Push past ~40% and you enter the **Dumb Zone**: attention fragments, instructions get dropped, and "lost-in-the-middle" failures climb. `context-bart` puts that threshold front-and-center in your terminal so you know when to `/compact` or start a fresh session before quality degrades.

## Features

- **Single-line meter** with a 10-segment progress bar, percentage, and zone label.
- **Color tiers** — green (0–29%), yellow (30–39%), red (40%+). Honors `NO_COLOR`.
- **Multi-host** — adapters for Claude Code, OpenCode, Codex, and a generic env-var fallback.
- **Zero dependencies** — pure Node.js stdlib (`fs`, `child_process`). Node 18+.
- **Auto window detection** — 1M when the model id is tagged `[1m]`, the host sets `exceeds_200k_tokens`, or observed usage tops 200k; 200k otherwise. Overridable via `CONTEXT_BART_WINDOW_TOKENS`.
- **Extras** — model name, raw tokens, git branch (annotated with worktree name when you're in a linked worktree, e.g. `feat-x@worktree_3`), session cost.
- **Crash-safe** — any unexpected input degrades to a fallback line instead of breaking your status bar.

## Why not just write my own?

The [Claude Code statusline docs](https://code.claude.com/docs/en/statusline) hand you the contract — a JSON payload on stdin, your script's stdout becomes the bar — plus a few minimal examples. `context-bart` is what you'd end up writing if you sat down to ship a good one. The non-obvious things it solves:

- **The transcript walk.** Sum `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` from the latest assistant turn, stopping at `compact_boundary` markers so the bar visibly drops after `/compact`. The docs examples don't compute used context at all.
- **Window detection.** Claude Code reports `model.id: "claude-opus-4-7"` for 1M-tier sessions — the `[1m]` suffix isn't always there. `context-bart` reads `exceeds_200k_tokens` and auto-grows when observed usage tops 200k, so you never see `205% · 410k/200k`.
- **A defensible threshold.** Green / yellow / red at 30 / 40 % comes from the [lost-in-the-middle research](https://arxiv.org/abs/2307.03172), not picked from a hat.
- **Speed.** ~40 ms cold, zero deps. Shell-pipe statuslines that fan out to `git`, `jq`, and `node` land at 200–400 ms — noticeable every refresh.
- **Portability.** OpenCode and Codex send different payloads; switch tools, the bar follows.

If you want a multi-line bar, embedded `gh` / weather / etc., or anything that isn't a context meter, the docs page is your starting point. `context-bart` is purpose-built for the "am I about to enter the Dumb Zone?" question.

## Install

Pick one:

```bash
# npm (recommended for most users)
npm install -g context-bart
```

```bash
# git clone (if you want to pin to a commit or hack on the source)
git clone https://github.com/alejandrok5/context-bart.git ~/context-bart
```

The npm install puts a `context-bart` binary on your `$PATH`. Find its absolute path with `which context-bart` (or `where context-bart` on Windows) — you'll need it for the host config below, because some hosts (notably Claude Code's `statusLine`) launch commands without inheriting your shell's `PATH`.

The git-clone path requires no `npm install` and no build step. The script in `bin/context-bart.js` is ready to run.

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
    "command": "/absolute/path/to/context-bart",
    "padding": 1
  }
}
```

Replace `/absolute/path/to/context-bart` with the output of `which context-bart` (npm install) or `node /absolute/path/to/context-bart/bin/context-bart.js` (git clone).

Restart Claude Code. The bar should appear at the bottom of your terminal session.

### Updates

`context-bart` does a once-a-day, fire-and-forget check against the npm registry. When a newer version is available, a dim `↑0.2.1` segment is appended to the bar — that's your cue to run `npm update -g context-bart` (or `git pull` if you cloned). The check runs in a detached background process so it never delays a status-bar refresh; results are cached in `${XDG_CACHE_HOME:-~/.cache}/context-bart/latest.json` (or `%LOCALAPPDATA%\context-bart\` on Windows). Opt out entirely with `CONTEXT_BART_NO_UPDATE_CHECK=1`.

## Configuration

Most behavior is auto-detected. Use these env vars to override:

| Env var | Default | What it does |
| --- | --- | --- |
| `CONTEXT_BART_WINDOW_TOKENS` | auto | Force the context window size (e.g. `200000`, `1000000`). |
| `NO_COLOR` / `CONTEXT_BART_NO_COLOR` | unset | Disable ANSI color output. |
| `FORCE_COLOR` | unset | Force color on (overrides `NO_COLOR`). Set to `0`/`false` to force off. |
| `CONTEXT_BART_ZONE_SMART` | `30` | Smart→approaching threshold (% of window). |
| `CONTEXT_BART_ZONE_DUMB` | `40` | approaching→Dumb threshold (% of window). |
| `CONTEXT_BART_ASCII` | auto | Force ASCII glyphs (`[#####-----]`) instead of Unicode (`[▰▰▰▰▰▱▱▱▱▱]`). Auto-on when `LANG` is non-UTF-8. |
| `CONTEXT_BART_NO_UPDATE_CHECK` | unset | Disable the once-a-day version check that appends a dim `↑x.y.z` segment when a newer release is on npm. |
| `CONTEXT_BART_USED_TOKENS` | n/a | (env adapter only) Used tokens count. |
| `CONTEXT_BART_MODEL_ID` | n/a | (env adapter only) Model id. |
| `CONTEXT_BART_MODEL_NAME` | n/a | (env adapter only) Display name. |
| `CONTEXT_BART_COST_USD` | n/a | (env adapter only) Cumulative cost. |
| `CONTEXT_BART_CWD` | `$PWD` | (env adapter only) Working dir for git branch lookup. |
| `CONTEXT_BART_TRANSCRIPT_PATH` | n/a | (env adapter only) JSONL transcript to parse. |

## How "used tokens" is computed

- **Claude Code**: walks the JSONL transcript at `transcript_path` (passed in by Claude Code) from the bottom up, finds the most recent assistant message with a `usage` block, and sums `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`. That's the model's actual context size at the last turn. After `/compact`, the walk stops at the `compact_boundary` marker and reports `0` until the next assistant turn writes fresh usage — so the bar visibly resets the moment you compact.
- **OpenCode**: reads `usage.total_tokens` (or `input_tokens + output_tokens`) directly from the payload.
- **Codex**: reads env vars or a nested `codex.usage` payload.
- **env fallback**: trusts `CONTEXT_BART_USED_TOKENS` directly.

## Why the 40% threshold?

The "lost-in-the-middle" effect ([Liu et al., 2023](https://arxiv.org/abs/2307.03172)) shows that LLM recall and instruction-following degrade noticeably once the prompt grows past a fraction of the model's window — for current generation models, that's around 30–40%. The exact number isn't universal, but the qualitative cliff is real, and `context-bart` errs on the side of warning early. If you want to move the threshold, fork `src/render.js` (`pickZone`) — it's ~10 lines.

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

No dependencies to install. See [CONTRIBUTING.md](CONTRIBUTING.md) for
the release process.

## License

MIT. See [LICENSE](LICENSE).
