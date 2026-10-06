# Contributing

Thanks for improving `thegoalbuddy`.

## Local Setup

Clone the repo and run the checks:

```bash
git clone https://github.com/plgonzalezrx8/thegoalbuddy.git
cd thegoalbuddy
npm run check
```

## Skill Tree Sync

`goalbuddy/` is the canonical skill tree. `plugins/goalbuddy/skills/goal-prep/` is a generated mirror — never edit it directly. After changing anything under `goalbuddy/`, run:

```bash
npm run sync:plugin
```

The test suite fails if the two trees differ.

## Local Install Test

thegoalbuddy installs into Codex and Claude Code by default. Use temporary home directories so local testing does not overwrite your real install:

```bash
# Both targets
root=$(mktemp -d)
node internal/cli/goal-maker.mjs --codex-home "$root/codex" --claude-home "$root/claude"
node internal/cli/goal-maker.mjs doctor --target codex --codex-home "$root/codex"
node internal/cli/goal-maker.mjs doctor --target claude --claude-home "$root/claude"
rm -rf "$root"

# One target
tmp=$(mktemp -d)
node internal/cli/goal-maker.mjs install --target claude --claude-home "$tmp"
node internal/cli/goal-maker.mjs doctor --target claude --claude-home "$tmp"
rm -rf "$tmp"
```

## Package Check

Before opening a PR, verify the npm package contents:

```bash
npm pack --dry-run
```

The package should include `README.md`, the single running `CHANGELOG.md`, `docs/releases/README.md` for the release process, `internal/assets/`, `package.json`, `internal/cli/`, the canonical `goalbuddy/` skill directory, and `plugins/goalbuddy/` (with both `.codex-plugin/` and `.claude-plugin/` manifests). The `goal-maker` and `goalbuddy` CLI aliases remain compatible; obsolete personal prep skills are removed by the installer. Do not add a second tracked skill payload or per-version changelog files.

## Releases

thegoalbuddy publishes from GitHub Actions with npm trusted publishing. See [docs/releases](docs/releases/README.md) before creating a release.

## Contribution Guidelines

- Keep the runtime dependency-free unless there is a strong reason.
- Keep `goalbuddy/` installable as the canonical skill directory.
- Keep installation working for both Codex and Claude Code.
- Keep the `goal-maker` CLI compatibility alias working; use Goal Prep as the single prep skill.
- Prefer small, reviewable changes.
- Update README or templates when behavior changes.
- Run `npm run check` before submitting changes.
