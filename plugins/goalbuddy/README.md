# thegoalbuddy Plugin (Codex + Claude Code)

thegoalbuddy packages the canonical `goal-prep` skill as a plugin so teams can install the reusable workflow in **Codex** and **Claude Code**, while keeping the npm CLI for local setup, doctor checks, and the built-in local board surface.

Version 0.5.0 is the prepared, unpublished observatory release. It preserves Claude Code's native `/goal` command and installs thegoalbuddy execution as `/goalbuddy`.

## What It Contains

- `.codex-plugin/plugin.json`: Codex plugin manifest and Codex UI copy.
- `.claude-plugin/plugin.json`: Claude Code plugin manifest.
- `skills/goal-prep/`: the installable thegoalbuddy skill payload (shared by both platforms).
- `agents/`: Claude Code subagent definitions (`goal-scout.md`, `goal-judge.md`, `goal-worker.md`).
- `commands/goalbuddy.md`: Claude Code's thegoalbuddy execution command, kept separate from native `/goal`.
- `skills/goal-prep/SKILL.md`: canonical `$goal-prep` / `/goal-prep` entry point.
- `assets/constellation-star.png`: generated observatory mark used by the Codex plugin.

## Local Testing

From the repo root:

```bash
npm run check
npx thegoalbuddy doctor
npx thegoalbuddy check-update
```

## Install Both Targets

```bash
npx thegoalbuddy
```

This installs and enables the native Codex plugin in `~/.codex/`, then installs the thegoalbuddy skill, `/goalbuddy` command, and Scout/Judge/Worker subagents into `~/.claude/`. The skill surfaces `/goal-prep` in Claude Code.

## Install One Target

```bash
npx thegoalbuddy --target codex
npx thegoalbuddy --target claude
```

This installs the thegoalbuddy skill and the three Scout/Judge/Worker subagents into `~/.claude/`. Restart Claude Code, then run:

```text
/goal-prep
```

After Goal Prep creates a board, start it with Codex `/goal` or Claude Code `/goalbuddy`, as printed by the tool.

Or install the npm package globally:

```bash
npm i -g thegoalbuddy
thegoalbuddy                  # installs for Codex and Claude Code
thegoalbuddy --target codex   # installs for Codex only
thegoalbuddy --target claude  # installs for Claude Code only
```

For local CLI testing before npm publish:

```bash
node internal/cli/goal-maker.mjs
node internal/cli/goal-maker.mjs doctor
node internal/cli/goal-maker.mjs board docs/goals/<slug> --once --json
```

## Release Notes

Acquire updates through the channel used to install the package: `npx thegoalbuddy@latest update`, or `npm install -g thegoalbuddy@latest` followed by `thegoalbuddy update`. A native Claude marketplace installation uses `/plugin update thegoalbuddy@thegoalbuddy`. npm installs record their acquisition channel in the copied skill metadata.

Node 18+ is required; maintained Node 22 or 24 is recommended. Codex requires a CLI with native marketplace support. Claude files can be installed before the host is available; actual goal execution requires an authenticated host. Use screenshots or supported forwarding for cloud board previews.

The plugin is prepared for the `plgonzalezrx8/thegoalbuddy` repo and `thegoalbuddy` npm package. Keep `.codex-plugin/plugin.json` and `.claude-plugin/plugin.json` aligned with `package.json` before publishing a new package release.
