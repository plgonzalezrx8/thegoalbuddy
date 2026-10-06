# Local Goal Board

Open a local constellation of your goal, current work, decisions, and evidence. The board is a read-only viewer; execution and updates happen in your coding tool.

The surface keeps `state.yaml` authoritative. It writes static web app files into the goal directory and serves them from a local-only Node server. The browser subscribes to Server-Sent Events, so the view and open task details update as `state.yaml`, `notes/`, or linked depth-1 sub-goal state changes without a manual reload.

## Use When

- A human wants a local board view during a thegoalbuddy run.
- A human needs to see the next task, a blocker, or evidence without searching the coding-tool conversation.
- A goal should expose in-progress, completed, and blocked tasks from local files.
- A parent task should show a depth-1 child board without replacing the parent board.

## Generate And Serve

Before the fork is published to npm, run from this checkout (replace `<slug>` with your prepared goal directory):

```bash
node internal/cli/goal-maker.mjs board docs/goals/<slug>
```

After publication, the installed command is `npx thegoalbuddy board docs/goals/<slug>`. The bundled observatory sky, constellation star, and self-hosted fonts travel with the package; the browser needs no remote font or image service.

The command writes:

```text
docs/goals/<slug>/.goalbuddy-board/
  index.html
  styles.css
  app.js
```

Then it starts or reuses the shared local board hub at `http://thegoalbuddy.localhost:41737/`. The server still binds to loopback, so no `/etc/hosts` setup is required. The printed board URL includes the goal slug, like `http://thegoalbuddy.localhost:41737/my-goal/`. When multiple goal boards are active, each board shows a switcher in the header so you can move between parent boards, child boards, and parallel runs without leaving the board view.

These URLs work when the browser can reach the machine running the board. For cloud workspaces, use the host's supported authenticated preview forwarding or send screenshots; a loopback URL is not a user-accessible cloud preview. Keep the server bound to loopback and do not expose it publicly as a workaround.

## Check Without A Long-Running Server

```bash
npx thegoalbuddy board docs/goals/<slug> \
  --once \
  --json
```

## Live Updates

The server watches:

- `docs/goals/<slug>/state.yaml`
- `docs/goals/<slug>/notes/`
- linked `docs/goals/<slug>/subgoals/**/state.yaml`
- linked `docs/goals/<slug>/subgoals/**/notes/`

When either changes, the server re-reads the goal board and pushes a fresh board payload to connected browsers over `/events`.

## Find Your Bearings

- **Start:** prepare a goal with `$goal-prep` in Codex or `/goal-prep` in Claude Code, then run the exact execution command printed by prep.
- **Resume:** run `node internal/cli/goal-maker.mjs resume` from this checkout and use the printed continuation command in your coding tool.
- **Unblock:** inspect the blocked task, use its printed continuation command from `resume`, and give the coding tool the missing decision, access, or evidence so it can update the state and continue.

The viewer cannot run an agent, approve a decision, or edit the source files. It reflects the goal files as they change.

## Board Mapping

The constellation overview puts your destination, completion criteria, active work, and blockers first. It displays up to four tasks per sector, prioritizing tasks that need attention; **Task list** shows every task. On narrow screens, the current-work dock appears before the task list.

| Source status | Viewer label | Color |
| --- | --- | --- |
| `queued` | Pending | Neutral |
| `active` | In progress | Sky blue |
| `blocked` | Blocked | Amber |
| `done` | Completed | Jade |

The completion criteria come from `goal.oracle.signal` or `intake.completion_proof`. Blocker reasons come from `receipt.blocked_reason`, and tasks can record an optional `next_action`. When those fields are missing, the viewer should expose that absence rather than invent a decision or next step.

Select a constellation star or task-list row to open the native side inspector. It shows the objective, assignee, inputs, constraints, expected output, verification commands, allowed files, stop conditions, and receipt. Receipt evidence paths and linked note content are shown as text. A linked depth-1 child goal has inspectable tasks, and both parent and child details update live when their source files change.

An evidence path means **evidence was recorded**, not that it passed verification or that the whole goal is complete. Check the reported results and the goal's completion criteria before accepting a completion claim.

## Verification

```bash
node --test goalbuddy/surfaces/local-goal-board/test/*.test.mjs
node goalbuddy/surfaces/local-goal-board/scripts/local-goal-board.mjs \
  --goal goalbuddy/surfaces/local-goal-board/examples/keyboard-navigation \
  --once \
  --json
```

The `examples/keyboard-navigation` goal is a structurally valid preview of the observatory interface. `examples/sample-goal` is a historical dense visual fixture, not a complete executable goal; use it only to inspect dense layouts.

## Boundaries

- `state.yaml` remains the source of truth.
- The server binds to `127.0.0.1:41737` by default, advertises `http://thegoalbuddy.localhost:41737/`, and reuses that URL as a multi-board hub with in-board header navigation.
- Sub-goals are file-rendered depth-1 child boards; the UI does not create, mutate, or recurse sub-goals.
- The generated UI renders file content as text, not raw HTML.
- No package dependencies are required.
