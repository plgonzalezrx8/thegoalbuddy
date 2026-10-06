# thegoalbuddy

[Website](https://thegoalbuddy.pete-nektarios.chatgpt.site) · [Source](https://github.com/plgonzalezrx8/thegoalbuddy)

**Keep your goal in sight.**

thegoalbuddy gives long coding runs a destination, a current task, and evidence of progress. Its constellation board helps you see what is moving, what needs attention, and how the work will be verified. Your repository holds the plan; Codex or Claude Code does the work.

<p align="center">
  <img src="internal/assets/constellation-star.png" alt="" width="48">
  <br>
  <img src="internal/assets/constellation-board.png" alt="thegoalbuddy constellation board: a local goal viewer showing active work, completion criteria, decisions, and evidence." width="100%">
</p>

*Example local board. Your goal files determine the tasks, decisions, and evidence shown.*

This is an MIT-licensed fork of [GoalBuddy by tolimarchuk](https://github.com/tolimarchuk/goalbuddy), revived as **thegoalbuddy**. The original copyright is retained in LICENSE.

## Start Here

The fork npm package **has not been published by this change**. From this checkout, with Node 18 or later, install into Codex and Claude Code. Committed generated runtime works directly with Node; installation does not require a TypeScript compiler:

```bash
node internal/cli/goal-maker.mjs
```

Node.js 18 or later and npm are required; a maintained Node 22 or 24 installation is recommended. Codex setup needs a Codex CLI with `codex plugin marketplace` support on your PATH. Claude setup writes its skill, command, and agent files even before Claude Code is installed; install and authenticate Claude Code before executing goals. The package does not supply a coding-tool subscription or unlock native Codex `/goal`.

To install into just one tool, use `--target codex` or `--target claude`. For example:

```bash
node internal/cli/goal-maker.mjs --target claude
```

Restart your coding tool, then prepare a goal:

| Coding tool | Prepare command |
| --- | --- |
| Codex | `$goal-prep` |
| Claude Code | `/goal-prep` |

Tell Goal Prep what you want to accomplish and what observable result will prove it worked. Prep creates the local goal files and prints the exact execution command. Run that command in your coding tool to start the work. **Prep does not start execution automatically.**

Codex uses native `/goal` when your account has that feature. thegoalbuddy does not enable it. Claude Code uses the installed `/goalbuddy` command, leaving Claude's own `/goal` untouched. If native Codex `/goal` is unavailable, use Claude Code or the active-task prompt and your coding tool's normal agent flow; the goal files remain usable.

After a future npm release, `npx thegoalbuddy` will be the published installation path. The examples below describe that installed CLI; before publication, replace `npx thegoalbuddy` or `thegoalbuddy` with `node internal/cli/goal-maker.mjs` from this checkout.

After publication, use `npx thegoalbuddy@latest` for a fresh npm execution, or `npm install -g thegoalbuddy@latest` followed by `thegoalbuddy`. Global npm installation attempts setup for both tools in its postinstall step; if a host is unavailable, the executable remains installed and reports how to retry. `GOALBUDDY_SKIP_POSTINSTALL=1` skips automatic host setup. Use `thegoalbuddy --target claude` or `--target codex` to retry one target, then `thegoalbuddy doctor --target claude` and `thegoalbuddy doctor --target codex` to check the installation.

### Resume an existing goal

```bash
node internal/cli/goal-maker.mjs resume
```

This lists local goals, their active tasks, and the continuation command for each coding tool. Use the printed command to pick up from the files already in your repository. You can begin in Codex and resume in Claude Code, or the other way around.

### Unblock a goal

Open the blocked task and read its reason, stop condition, and receipt. Run `resume` for the correct continuation command, then use that command in your coding tool with the missing decision, access, or evidence. Add a message such as: “Here is the answer to the blocked task: …”. The coding tool updates the goal state and continues from the recorded next step.

The browser board is a **read-only viewer**: it does not approve decisions, edit tasks, or launch the coding agent. Continue the work in your coding tool.

### Migrating from GoalBuddy

Existing `goalbuddy` and `goal-maker` CLI aliases, Claude Code `/goalbuddy`, agent identifiers, v2 state files, `.goalbuddy-board/`, and preference keys remain compatible. New Codex plugin installs use `thegoalbuddy@thegoalbuddy`.

Disable the upstream `goalbuddy@goalbuddy` plugin first to avoid two `$goal-prep` entries. The fork does not automatically remove the upstream plugin; its `goal_*` agent names are shared compatibility identifiers. Use one global npm package at a time because the compatibility CLI names overlap. Installing the fork updates those shared agent files, and its reset removes them; keep one plugin enabled in a given Codex home, or use separate homes for an isolated comparison.

## Cross-Harness Goals

Harnesses churn; repos persist. A thegoalbuddy board lives in your repo as plain files, so the goal outlives whichever tool started it: begin a goal in Codex, resume it in Claude Code tomorrow, or the other way around, using the command for that harness.

```bash
npx thegoalbuddy resume
```

`resume` lists every live board in the repo with its status, active task, and both continuation commands: Codex `/goal Follow docs/goals/<slug>/goal.md.` and Claude Code `/goalbuddy Follow docs/goals/<slug>/goal.md.`. Receipts can record which harness performed each task, so the board's history survives the handoff intact.

Boards can also mix vendors within a single run — a Claude judge and a Codex worker on the same board:

```bash
npx thegoalbuddy dispatch docs/goals/<slug> --to codex
```

`dispatch` renders the active task's prompt, runs the target CLI headless (`codex` or `claude-code`), and returns a receipt with a write-scope report. It requires a Git working tree and compares before/after content, file modes, and index state, including files that were already dirty. Worker changes must stay inside `allowed_files`; read-only roles must change nothing. Authoritative goal control files are protected even when Git ignores them. Scope snapshots cover tracked and non-ignored untracked Git files plus the goal-file trees; other ignored outputs outside those trees are outside this check.

The dispatcher never edits the board. Applying an external dispatch report requires a successful, clean scope check and matching task, board, role, and harness identity. Failed or mismatched reports are rejected before state is written. The PM records the accepted receipt and advances the board. Existing unwrapped manual PM receipts remain supported; external-harness receipts require task and board identity.

## Codex Install Model

For Codex, the canonical install is the native plugin plus bundled agents:

```text
~/.codex/plugins/cache/thegoalbuddy/thegoalbuddy/<version>/
~/.codex/agents/goal_judge.toml
~/.codex/agents/goal_scout.toml
~/.codex/agents/goal_worker.toml
```

The Codex plugin bundles `$goal-prep`; a clean Codex install should not need personal `~/.codex/skills/goalbuddy` or `~/.codex/skills/goal-maker` folders. Native Codex `/goal` is a separate OpenAI-gated feature. thegoalbuddy prepares local boards and handoff prompts for it, but it does not enable or replace native `/goal`.

To verify a Codex install:

```bash
npx thegoalbuddy doctor --target codex --goal-ready
```

To remove thegoalbuddy-owned Codex runtime surfaces:

```bash
npx thegoalbuddy reset --target codex
```

Native `codex plugin remove thegoalbuddy@thegoalbuddy` only removes the native plugin surface. thegoalbuddy also owns the `goal_*.toml` agent files it installed, its Codex plugin cache, its marketplace entry, and old personal skill folders from earlier installs. Use `thegoalbuddy reset --target codex` when you want those thegoalbuddy-owned files removed too.

## What It Creates

```text
docs/goals/<your-goal>/
  goal.md
  state.yaml
  notes/
  .goalbuddy-board/ # generated local board files
  subgoals/        # optional depth-1 child boards
```

`goal.md` says what you want.

`state.yaml` tracks the board.

`notes/` keeps longer findings out of the main thread.

`subgoals/` holds optional child boards when one parent task needs a bounded branch of work.

## How It Thinks

```text
Intent -> Oracle -> Surface -> Loop -> Proof
```

The oracle is the observable signal that says whether the original owner outcome is actually true: a test suite, browser walkthrough, demo transcript, generated artifact, benchmark, source-backed answer, release check, or final human decision.

Set this success signal during prep so the final review checks the outcome you actually want.

The local board is the default work surface. It is not an extension marketplace; it is the built-in view of the `state.yaml` truth.

The receipt and task-card format is specified in [docs/spec/receipt-v1.md](docs/spec/receipt-v1.md) — harness-neutral, plain YAML, machine-validated.

Scout maps the repo.

Judge chooses the largest safe useful slice.

Worker completes the whole assigned slice and leaves a receipt.

The execution command keeps the loop honest until a final Judge/PM audit maps receipts and verification back to the oracle and records the full outcome complete.

## Slice Sizing

Safe does not mean small. Safe means bounded, explicit, verified, and reversible.

thegoalbuddy should not optimize for tiny safe tasks. It should optimize for the largest safe useful slice: a working screen, working API path, data pipeline step, backend vertical slice, real bug fix, or milestone review. The board warns when it sees safe-looking work that keeps adding helpers, contracts, proof files, or doc notes without moving the outcome.

## A Small Local Model

thegoalbuddy keeps the model small:

- `state.yaml` is the source of truth.
- A board is a view of one `state.yaml`.
- The local hub is a switchboard for many boards.
- A subgoal is one depth-1 `state.yaml` linked from a parent task.
- Settings are viewer preferences, not workflow state.

Use subgoals for bounded child work that belongs to a parent task. Use multiple local boards when parallel agents or separate goal runs are active at the same time. The constellation view puts your destination and current work first; task details and the conventional board remain available for inspection.

## Execution Quality

thegoalbuddy can prepare safe parallel work; it does not run a parallel org chart or install arbitrary extension packs.

Use `thegoalbuddy prompt docs/goals/<slug>` to render a compact prompt for the active task without dumping the whole state file. The prompt includes exact role identifiers for both harnesses: Codex uses `required_spawn_agent_type` (`goal_scout`, `goal_worker`, or `goal_judge`), while Claude Code uses `required_claude_subagent_type` (`goal-scout`, `goal-worker`, or `goal-judge`). PMs should use the exact thegoalbuddy role instead of a generic agent. Use `thegoalbuddy parallel-plan docs/goals/<slug>` to inspect read-only or disjoint write-scope work that can be handed to native Codex or Claude Code agent flows. The command reports recommendations only; it does not mutate state or spawn agents.

## Update

When a new thegoalbuddy version ships:

```bash
npx thegoalbuddy@latest update
```

That updates both Codex and Claude Code.

For a global installation, first run `npm install -g thegoalbuddy@latest`, then `thegoalbuddy update`. Running an old global executable only refreshes integrations from that old package; it does not download a new npm version. Genuine Claude marketplace plugin installations use `/plugin update thegoalbuddy@thegoalbuddy` instead. The update checker records the acquisition channel so npm-installed Claude skills do not recommend a native plugin update.

## Live Boards

thegoalbuddy opens a local board while the work is running, so you can see the plan, active task, receipts, subgoals, and verification status without digging through the chat.

Multiple local boards reuse one readable `thegoalbuddy.localhost` hub with an in-header board switcher. On a local machine, share the printed URL as a clickable Markdown link. A cloud workspace's `127.0.0.1` or `.localhost` URL points to that workspace, so use the host's supported authenticated preview forwarding or attach screenshots for the user. Keep the board bound to loopback; it is a read-only local viewer. The viewer supports a constellation overview, task details, viewer preferences, and reduced-motion handling.

Custom external integrations should be built as ordinary repo work with a concrete implementation plan, not installed from a thegoalbuddy catalog.

See the [running changelog](CHANGELOG.md) for the complete release history. Version 0.5.0 is prepared as the first fork release; it has not been published. Earlier entries describe upstream releases.

## Good For

- broad project improvements
- release prep
- bug hunts that need evidence
- refactors with verification steps
- anything too large for one prompt

## Develop from TypeScript

All maintained program code, tests, fixtures, and build tools are authored in TypeScript. `.mts` sources generate Node `.mjs` modules; browser `.ts` sources generate `.js`. Generated installable files remain committed so native Git-installed plugins work without a compiler. Edit TypeScript sources, then regenerate runtime and the canonical skill mirror.

From a checkout, use these contributor commands (POSIX shell):

```bash
GOALBUDDY_SKIP_POSTINSTALL=1 npm ci
npm run build
npm run typecheck
npm run check
npm run build:site
```

`npm run check` verifies source, generated output, behavior, branding, and website assets before npm packaging. It does not create an npm tarball or publish. The website export goes to `dist/` for Sites hosting on the assigned Codex subdomain. Goal files stay local; the marketing website does not host your boards. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development boundary and [site hosting](https://github.com/plgonzalezrx8/thegoalbuddy/blob/main/internal/site/DNS.md) for the deployment process.

## For This Repo

thegoalbuddy is MIT licensed. This fork is preparing version 0.5.0. Complete TypeScript, host, browser, hosted website, and independent review checks before building the final npm artifact. Test that exact artifact; publication requires explicit authorization.

The implementation lives in this repo, but the happy path is intentionally tiny: install it, run Goal Prep, then use the printed Codex `/goal` or Claude Code `/goalbuddy` command.

For release process details, see [docs/releases](docs/releases/README.md).

## License

MIT
