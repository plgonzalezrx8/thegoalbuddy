import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const repo = resolve(process.env.THEGOALBUDDY_TEST_ROOT || process.cwd());
const script = resolve(repo, "goalbuddy/scripts/apply-receipt.mjs");
const checker = resolve(repo, "goalbuddy/scripts/check-goal-state.mjs");

function makeBoard() {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-apply-receipt-"));
  const goalDir = join(root, "docs", "goals", "one");
  mkdirSync(join(goalDir, "notes"), { recursive: true });
  writeFileSync(join(goalDir, "goal.md"), "# one\n");
  writeFileSync(join(goalDir, "state.yaml"), `version: 2
goal:
  title: "one goal"
  slug: "one"
  kind: specific
  tranche: "test"
  status: active
agents:
  scout: unknown
  worker: unknown
  judge: unknown
active_task: T001
tasks:
  - id: T001
    type: worker
    assignee: Worker
    status: active
    objective: "Adjust the widget."
    allowed_files:
      - src/widget.ts
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    receipt: null
  - id: T999
    type: judge
    assignee: Judge
    status: queued
    objective: "Audit the outcome."
    receipt: null
`);
  return { root, goalDir };
}

const DONE_RECEIPT = {
  result: "done",
  task_id: "T001",
  changed_files: ["src/widget.ts"],
  commands: [{ cmd: "npm test", status: "pass" }],
  summary: "widget adjusted",
  harness: "codex",
};

function dispatchReport(receipt: unknown, patch: Record<string, unknown> = {}) {
  return { ok: true, task_id: "T001", board_path: "docs/goals/one/state.yaml", role: "worker", harness: "codex", exit_status: 0, receipt, scope_check: { status: "clean", violations: [] }, ...patch };
}

function runApply(root: string, args: string[], receipt: unknown) {
  const receiptPath = join(root, "receipt.json");
  writeFileSync(receiptPath, JSON.stringify(receipt));
  return spawnSync(process.execPath, [script, "docs/goals/one", "--receipt", receiptPath, "--json", ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("apply-receipt records a done receipt and activates the next task atomically", () => {
  const { root, goalDir } = makeBoard();
  try {
    const result = runApply(root, ["--task", "T001", "--activate", "T999"], DONE_RECEIPT);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.stop_allowed, false);
    assert.equal(report.continuation_required, true);
    assert.match(report.next_action, /Continue the active task T999/i);

    const state = readFileSync(join(goalDir, "state.yaml"), "utf8");
    assert.match(state, /active_task: T999/);
    assert.match(state, /summary: "widget adjusted"/);
    assert.match(state, /harness: codex/);
    assert.match(state, /status: pass/);

    const check = spawnSync(process.execPath, [checker, goalDir], { encoding: "utf8" });
    assert.equal(JSON.parse(check.stdout).ok, true, check.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt reverts the board when the transition is invalid", () => {
  const { root, goalDir } = makeBoard();
  try {
    const before = readFileSync(join(goalDir, "state.yaml"), "utf8");
    const badReceipt = { ...DONE_RECEIPT, commands: [{ cmd: "npm test", status: "fail" }] };
    const result = runApply(root, ["--task", "T001", "--activate", "T999"], badReceipt);
    assert.equal(result.status, 1, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.ok(report.checker_errors.length > 0);
    assert.equal(readFileSync(join(goalDir, "state.yaml"), "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt accepts a dispatch report and defaults status from the receipt", () => {
  const { root, goalDir } = makeBoard();
  try {
    const reportInput = dispatchReport({ ...DONE_RECEIPT, board_path: "docs/goals/one/state.yaml" });
    const result = runApply(root, ["--task", "T001", "--activate", "T999"], reportInput);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.continuation_required, true);
    assert.equal(report.active_task, "T999");
    const state = readFileSync(join(goalDir, "state.yaml"), "utf8");
    assert.match(state, /active_task: T999/);
    assert.match(state, /summary: "widget adjusted"/);
    const t001 = state.slice(state.indexOf("- id: T001"), state.indexOf("- id: T999"));
    assert.match(t001, /status: done/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const scenario of [
  { name: "failed dispatch", wrap: (receipt: unknown) => dispatchReport(receipt, { ok: false, scope_check: { status: "violations", violations: ["README.md"] } }) },
  { name: "missing dispatch scope verdict", wrap: (receipt: unknown) => dispatchReport(receipt, { scope_check: undefined }) },
  { name: "skipped dispatch scope verdict", wrap: (receipt: unknown) => dispatchReport(receipt, { scope_check: { status: "skipped_not_git" } }) },
  { name: "contradictory dispatch violations", wrap: (receipt: unknown) => dispatchReport(receipt, { scope_check: { status: "clean", violations: ["README.md"] } }) },
  { name: "wrong task", patch: { task_id: "T777" } },
  { name: "wrong board", patch: { board_path: "docs/goals/other/state.yaml" } },
  { name: "wrong dispatch role", wrap: (receipt: unknown) => dispatchReport(receipt, { role: "judge" }) },
  { name: "wrong dispatch task", wrap: (receipt: unknown) => dispatchReport(receipt, { task_id: "T999" }) },
  { name: "wrong receipt role", patch: { role: "judge" } },
  { name: "status conflict", patch: { result: "blocked" }, args: ["--status", "done"] },
  { name: "invalid result", patch: { result: "success" } },
]) {
  test(`apply-receipt rejects ${scenario.name} without changing state`, () => {
    const { root, goalDir } = makeBoard();
    try {
      const before = readFileSync(join(goalDir, "state.yaml"), "utf8");
      const receipt = { ...DONE_RECEIPT, board_path: "docs/goals/one/state.yaml", ...scenario.patch };
      const result = runApply(root, ["--task", "T001", "--activate", "T999", ...(scenario.args || [])], scenario.wrap ? scenario.wrap(receipt) : receipt);
      assert.equal(result.status, 1, result.stdout);
      assert.equal(readFileSync(join(goalDir, "state.yaml"), "utf8"), before);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

const invalidDispatchFields: [string, Record<string, unknown>, Record<string, unknown>, RegExp][] = [
  ["missing report task", { task_id: undefined }, {}, /Dispatch task_id/],
  ["missing report board", { board_path: undefined }, {}, /Dispatch board_path/],
  ["missing report role", { role: undefined }, {}, /Dispatch role/],
  ["missing report harness", { harness: undefined }, {}, /Dispatch harness/],
  ["unsupported report harness", { harness: "other-cli" }, { harness: "other-cli" }, /Dispatch harness/],
  ["missing exit status", { exit_status: undefined }, {}, /exit successfully/],
  ["failed exit status", { exit_status: 1 }, {}, /exit successfully/],
  ["missing receipt task", {}, { task_id: undefined }, /Receipt task_id is required/],
  ["missing receipt board", {}, { board_path: undefined }, /Receipt board_path is required/],
];
for (const [name, reportPatch, receiptPatch, expectedError] of invalidDispatchFields) {
  test(`apply-receipt rejects ${name} in an otherwise successful dispatch report`, () => {
    const { root, goalDir } = makeBoard();
    try {
      const before = readFileSync(join(goalDir, "state.yaml"), "utf8");
      const receipt = { ...DONE_RECEIPT, board_path: "docs/goals/one/state.yaml", ...receiptPatch };
      const result = runApply(root, ["--task", "T001", "--activate", "T999"], dispatchReport(receipt, reportPatch));
      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stderr, expectedError);
      assert.equal(readFileSync(join(goalDir, "state.yaml"), "utf8"), before);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test("apply-receipt still accepts a manual receipt without task or board identity", () => {
  const { root } = makeBoard();
  try {
    const receipt: Record<string, unknown> = { ...DONE_RECEIPT };
    delete receipt.task_id;
    const result = runApply(root, ["--task", "T001", "--activate", "T999"], receipt);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// JSON dispatch envelopes are untrusted, including their top-level shape.
test("dispatch provenance rejects null and primitive reports without throwing", async () => {
  const { dispatchReportErrors } = await import("../../goalbuddy/scripts/receipt-provenance.mjs");
  for (const input of [null, undefined, 42, [], "report"]) {
    const errors = dispatchReportErrors(input, { taskId: "T001", boardPath: "state.yaml", role: "worker" });
    assert.ok(errors.length > 0);
    assert.match(errors.join(" "), /must be an object/);
  }
});
