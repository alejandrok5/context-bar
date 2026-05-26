# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-05-26

### Added
- Once-a-day update notifier. When a newer version is on npm, the bar
  appends a dim `↑x.y.z` segment (or `^x.y.z` in non-UTF locales) so
  users know it's time to `npm update -g context-bart`. The check runs
  in a detached background process — stdout is already flushed before
  the fetch is kicked, so a slow registry can never delay a status-bar
  refresh. Cached in `${XDG_CACHE_HOME:-~/.cache}/context-bart/latest.json`
  (or `%LOCALAPPDATA%\context-bart\` on Windows); opt out with
  `CONTEXT_BART_NO_UPDATE_CHECK=1`. Zero new runtime dependencies — the
  fetch uses Node's `https` stdlib.

## [0.1.3] - 2026-05-25

### Fixed
- The bar didn't drop after `/compact`. Claude Code writes a
  `{ type: "system", subtype: "compact_boundary" }` marker into the
  transcript at compact time, but our backwards walk would sail past it
  and pick up the *pre-compact* usage block — leaving the bar pinned at
  the old value. The transcript reader now stops at the most recent
  `compact_boundary` and reports 0 until a fresh post-compact assistant
  turn lands, so the bar visibly resets the moment you run `/compact`.

## [0.1.2] - 2026-05-25

### Added
- Worktree detection. When `cwd` resolves to a linked git worktree (not
  the main checkout), the branch field is annotated as
  `branch@worktree-name`. The main checkout still shows just `branch`.

## [0.1.1] - 2026-05-25

### Fixed
- Window-size detection no longer assumes the 200k default when the host
  passes a model id without the `[1m]` suffix. The Claude Code transcript
  actually reports `model: "claude-opus-4-7"` for 1M-tier sessions, which
  caused readings like `205% · 410k/200k`. The detector now also reads
  Claude Code's `exceeds_200k_tokens` flag and auto-grows the window to 1M
  whenever observed usage exceeds 200k.

## [0.1.0] - 2026-05-25

### Added
- Initial release.
- Single-line context-window meter with Smart Zone / Dumb Zone color coding.
- Adapters for Claude Code, OpenCode, Codex, and a generic env-var fallback.
- Auto window-size detection from model id (1M for `[1m]` suffix, 200k otherwise).
- Git branch and session cost extras.
- Zero runtime dependencies; pure Node.js stdlib.
- Test suite via `node --test`.
