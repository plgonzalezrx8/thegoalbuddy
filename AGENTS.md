# AGENTS.md

thegoalbuddy is an npm package that installs into Codex and Claude Code by default (use --target to select one). Keep the repo layout and package boundary clear.

## Repo Shape

- `goalbuddy/` is the canonical installable skill payload (used by both Codex and Claude Code).
- `goalbuddy/agents/` holds Codex TOML agent definitions (`goal_*.toml`).
- `plugins/goalbuddy/agents/` holds Claude Code markdown subagents (`goal-*.md`).
- `goalbuddy/scripts/` stays inside the skill because installed skill instructions call those scripts.
- `internal/` is package and development infrastructure, not skill content.
- `plugins/goalbuddy/` is the repo-local plugin scaffold. It contains:
  - `.codex-plugin/plugin.json` — Codex plugin manifest.
  - `.claude-plugin/plugin.json` — Claude Code plugin manifest.
  - `skills/goal-prep/` — shared skill payload.
  - `agents/` — Claude Code agent definitions (markdown).
  - `commands/` — Claude Code slash command definitions (markdown).
- `goal-maker` and `goalbuddy` remain CLI compatibility aliases. Goal Prep is the single prep skill; do not add a second tracked skill payload.
- `goalbuddy/surfaces/local-goal-board/` is the built-in local board surface. Its `ui/` contains markup, styles, browser behavior and the constellation renderer; `scripts/lib/` normalizes goal data. There is no public extension catalog.

## Improvement Surfaces

When improving this repo, consider README, `goalbuddy/SKILL.md`, legacy CLI compatibility behavior, templates, checker behavior, CLI UX, plugin UX (both Codex and Claude Code), package contents, local board behavior, and site/docs copy. Do not assume a request only touches code.

## Package Rules

- Keep the runtime dependency-free unless there is a strong reason.
- Keep `goalbuddy/` installable as the canonical skill directory.
- Keep installation working for both Codex and Claude Code by default; `--target codex` or `--target claude` selects one.
- Keep the `goal-maker` CLI compatibility alias working. The installer removes obsolete personal prep skills to avoid duplicate invocation.
- Keep package-only CLI and tests under `internal/`.
- Do not commit local `docs/goals/` run artifacts unless explicitly requested.
- Author all maintained program code, tests, executable fixtures, and tooling in TypeScript: Node `.mts` and browser `.ts`. JavaScript is generated output only.
- Edit TypeScript sources, then run `npm run build`. Generated installable `.mjs`/`.js` files and the inventory are committed so direct Git plugin installation requires no compiler.
- Never repair generated drift as part of verification: `npm run check:generated` must fail on stale or unowned JavaScript, interrupted generation, or mirror drift.
- `npm run check` is the required source check before claiming implementation is complete. It does not pack. Final npm packaging requires matching readiness, actual host/browser/hosted Sites evidence, and independent review.
- Use `npm run package:release -- --readiness <report> --destination <directory>` only after those stages pass. `npm run check:package -- --tarball <absolute-path>` tests that exact supplied artifact without repacking.
- Keep automatic publication disabled until verified evidence can be transported to the release runner. Publication still requires explicit authorization.

## Release Rules

- Before telling the user to publish, check `npm whoami` and the latest published version with `npm view thegoalbuddy version`.
- If `npm whoami` fails with `E401` or publish fails with `E401`, `E403`, or `E404` after the tarball is built, treat it as an npm authentication/permission problem first, not a missing version bump.
- Do not tell the user to rerun plain `npm publish` after an auth failure. Tell them to run `npm login` for the correct npm account, verify `npm whoami`, then publish.
- `package.json` already has `publishConfig.access = "public"`; do not add `--access public` as the primary fix unless package metadata changes.
