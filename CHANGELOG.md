# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-25

### Added
- Initial release.
- Single-line context-window meter with Smart Zone / Dumb Zone color coding.
- Adapters for Claude Code, OpenCode, Codex, and a generic env-var fallback.
- Auto window-size detection from model id (1M for `[1m]` suffix, 200k otherwise).
- Git branch and session cost extras.
- Zero runtime dependencies; pure Node.js stdlib.
- Test suite via `node --test`.
