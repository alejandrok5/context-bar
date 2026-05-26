# Contributing to Context Bart

Bug reports, fixes, and new host adapters are welcome.

## Local development

See [README → Development](README.md#development) for the quick-start
(`npm test`, `npm run smoke`, `npm run lint`). There are no runtime
dependencies; dev dependencies are just for linting.

## Adding a host adapter

See [README → Add a new host adapter](README.md#add-a-new-host-adapter).
Implement `detect` + `parse` in `src/adapters/<host>.js`, register it in
`src/detect.js` (first detector wins), and add a test in
`test/adapters.test.js`.

## Cutting a release

Releases publish to npm via `.github/workflows/release.yml` when a `v*`
tag is pushed. The workflow lints, tests, verifies the tag matches
`package.json`, and publishes with Sigstore provenance.

### One-time setup

1. Generate an [npm automation token](https://docs.npmjs.com/creating-and-viewing-access-tokens)
   with publish rights for `context-bart`.
2. Add it to the repo as `NPM_TOKEN` (Settings → Secrets and variables →
   Actions → New repository secret).

### Per-release steps

1. **Update `CHANGELOG.md`** — move items from `[Unreleased]` into a new
   dated section. Commit (`docs: changelog for vX.Y.Z`).
2. **Bump and tag** — `npm version` updates `package.json`, creates a
   commit, and annotates a `vX.Y.Z` tag in one step:
   ```bash
   npm version <patch|minor|major>
   git push --follow-tags
   ```
3. **Watch the workflow** — `gh run watch` or the Actions tab. On
   success the new version is live on npm.
4. **Draft the GitHub release** — the workflow does not create this
   automatically:
   ```bash
   gh release create vX.Y.Z --title "vX.Y.Z — short title" \
     --notes "$(awk '/^## \[X.Y.Z\]/,/^## \[/' CHANGELOG.md | sed '$d')"
   ```
   Or paste the CHANGELOG section by hand at
   `https://github.com/alejandrok5/context-bart/releases/new`.

### Workflow idempotency

The publish step checks `npm view context-bart@<version>` first and
skips itself if that version already exists on the registry. This means
it's safe to:

- Re-run the workflow after a transient failure (e.g. a flaky network
  during the test step) without tripping `E409 version exists`.
- Push the tag for a version that was published manually (e.g. when
  bootstrapping the automation).

It does **not** protect against publishing the wrong code at a version.
If you need to ship a fix, always bump the version — never force-move a
published tag.

### Recovering from a bad release

`npm unpublish` is only allowed within 72 hours and is generally
discouraged. Prefer one of:

- Ship `vX.Y.Z+1` with the fix.
- [Deprecate](https://docs.npmjs.com/cli/v10/commands/npm-deprecate) the
  bad version: `npm deprecate context-bart@X.Y.Z "use X.Y.Z+1"`.
