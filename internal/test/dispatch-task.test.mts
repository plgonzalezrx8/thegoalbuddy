import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const repo = resolve(process.env.THEGOALBUDDY_TEST_ROOT || process.cwd());
const dispatcher = resolve(repo, "goalbuddy/scripts/dispatch-task.mjs");

function makeProject({ taskType = "worker" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-dispatch-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "widget.ts"), "export const widget = 1;\n");
  writeFileSync(join(root, "README.md"), "# fixture\n");
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
    type: ${taskType}
    assignee: ${taskType === "worker" ? "Worker" : "Scout"}
    status: active
    objective: "Adjust the widget."
    allowed_files:
      - src/widget.ts
    verify:
      - "true"
    stop_if:
      - "Need files outside allowed_files."
    receipt: null
  - id: T999
    type: judge
    assignee: Judge
    status: queued
    objective: "Review the outcome."
    receipt: null
`);
  const git = (args: string[]) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  git(["init", "-q"]);
  git(["-c", "user.email=test@example.com", "-c", "user.name=test", "add", "-A"]);
  git(["-c", "user.email=test@example.com", "-c", "user.name=test", "commit", "-qm", "init"]);
  return root;
}

function fakeHarnessBin(root: string, name: string, script: string) {
  const bin = join(root, "fake-bin");
  mkdirSync(bin, { recursive: true });
  const path = join(bin, name);
  writeFileSync(path, `#!/bin/sh\n${script}\n`);
  chmodSync(path, 0o755);
  return bin;
}

const RECEIPT = JSON.stringify({
  goalbuddy_receipt_v1: {
    result: "done",
    task_id: "T001",
    board_path: "docs/goals/one/state.yaml",
    changed_files: ["src/widget.ts"],
    commands: [{ cmd: "true", status: "pass" }],
    summary: "widget adjusted",
    harness: "codex",
  },
});

function runDispatch(root: string, bin: string, extraArgs: string[] = []) {
  return spawnSync(process.execPath, [dispatcher, "docs/goals/one", "--to", "codex", "--json", ...extraArgs], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
  });
}

test("dispatch runs an external worker and reports a clean scope", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", `if printf '%s\\n' "$@" | grep -q 'Native wait_agent timeouts'; then exit 42; fi\necho "export const widget = 2;" > src/widget.ts\necho '${RECEIPT}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.harness, "codex");
    assert.equal(report.receipt.result, "done");
    assert.equal(report.scope_check.status, "clean");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch flags out-of-scope writes from an external worker", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", `echo "tampered" >> README.md\necho '${RECEIPT}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 1, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.scope_check.status, "violations");
    assert.deepEqual(report.scope_check.violations, ["README.md"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch flags any write from a read-only role", () => {
  const root = makeProject({ taskType: "scout" });
  try {
    const bin = fakeHarnessBin(root, "codex", `echo "export const widget = 2;" > src/widget.ts\necho '${RECEIPT}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 1, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.scope_check.status, "violations");
    assert.deepEqual(report.scope_check.violations, ["src/widget.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch extracts receipts wrapped in markdown fences", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", `printf 'Here you go:\\n\\n\`\`\`json\\n%s\\n\`\`\`\\n' '${RECEIPT}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).receipt.summary, "widget adjusted");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch reports a missing harness CLI cleanly", () => {
  const root = makeProject();
  try {
    const bin = join(root, "sparse-bin");
    mkdirSync(bin, { recursive: true });
    const gitPath = spawnSync("command", ["-v", "git"], { encoding: "utf8", shell: true }).stdout.trim();
    symlinkSync(gitPath, join(bin, "git"));
    const result = spawnSync(process.execPath, [dispatcher, "docs/goals/one", "--to", "codex", "--json"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: bin },
    });
    assert.equal(result.status, 1, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.match(report.error, /codex.*not found|not found.*codex/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch rejects unsupported harness targets", () => {
  const root = makeProject();
  try {
    const result = spawnSync(process.execPath, [dispatcher, "docs/goals/one", "--to", "gemini", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.match(report.error, /Unknown or missing dispatch target/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("external dispatch timeout is terminal and still reports partial writes", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", "echo 'partial external write' >> README.md\nwhile :; do :; done");
    const result = spawnSync(process.execPath, [dispatcher, "docs/goals/one", "--to", "codex", "--timeout", "1", "--json"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
    });
    assert.equal(result.status, 1, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.match(report.error, /hard execution timeout after 1s/);
    assert.equal(report.timeout_semantics, "hard_execution_deadline");
    assert.equal(report.scope_check.status, "violations");
    assert.deepEqual(report.scope_check.violations, ["README.md"]);
    assert.equal(report.receipt, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("goalbuddy dispatch CLI wrapper forwards to the bundled script", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", `echo "export const widget = 2;" > src/widget.ts\necho '${RECEIPT}'`);
    const cli = resolve(repo, "internal/cli/goal-maker.mjs");
    const result = spawnSync(process.execPath, [cli, "dispatch", "docs/goals/one", "--to", "codex", "--json"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.scope_check.status, "clean");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch rejects receipt-shaped fragments that are not real receipts", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", `echo '{"goalbuddy_receipt_v1": true}'\necho 'later, the real one:'\necho '${RECEIPT}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.receipt.result, "done");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch extracts bare receipts returned without the envelope", () => {
  const root = makeProject();
  try {
    const bare = JSON.stringify({
      result: "done",
      task_id: "T001",
      board_path: "docs/goals/one/state.yaml",
      changed_files: ["src/widget.ts"],
      commands: [{ cmd: "true", status: "pass" }],
      summary: "bare receipt",
    });
    const bin = fakeHarnessBin(root, "codex", `echo "export const widget = 2;" > src/widget.ts\nprintf 'Some prose first.\\n\`\`\`json\\n%s\\n\`\`\`\\n' '${bare}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.receipt.summary, "bare receipt");
    assert.equal(report.receipt.harness, "codex");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const scenario of [
  { name: "already-dirty tracked edits", prepare: (root: string) => writeFileSync(join(root, "README.md"), "dirty before\n"), script: "echo 'dirty after' > README.md", files: ["README.md"] },
  { name: "already-untracked edits", prepare: (root: string) => writeFileSync(join(root, "scratch.txt"), "before\n"), script: "echo after > scratch.txt", files: ["scratch.txt"] },
  { name: "dirty tracked reversion", prepare: (root: string) => writeFileSync(join(root, "README.md"), "dirty\n"), script: "git checkout -- README.md", files: ["README.md"] },
  { name: "untracked deletion", prepare: (root: string) => writeFileSync(join(root, "scratch.txt"), "before\n"), script: "rm scratch.txt", files: ["scratch.txt"] },
  { name: "tracked rename", script: "mv README.md renamed.md", files: ["README.md", "renamed.md"] },
  { name: "permission change", script: "chmod +x README.md", files: ["README.md"] },
  { name: "staged-only change", prepare: (root: string) => writeFileSync(join(root, "README.md"), "dirty\n"), script: "git add README.md", files: ["README.md"] },
  { name: "authoritative board write", script: "echo '# tampered' >> docs/goals/one/state.yaml", files: ["docs/goals/one/state.yaml"] },
  { name: "ignored authoritative board write", prepare: (root: string) => { spawnSync("git", ["rm", "--cached", "docs/goals/one/state.yaml"], { cwd: root }); writeFileSync(join(root, ".gitignore"), "docs/goals/\n"); }, script: "echo '# tampered' >> docs/goals/one/state.yaml", files: ["docs/goals/one/state.yaml"] },
]) {
  test(`dispatch detects ${scenario.name}`, () => {
    const root = makeProject();
    try {
      scenario.prepare?.(root);
      const bin = fakeHarnessBin(root, "codex", `${scenario.script}\necho '${RECEIPT}'`);
      const result = runDispatch(root, bin);
      assert.equal(result.status, 1, result.stdout);
      const report = JSON.parse(result.stdout);
      assert.equal(report.scope_check.status, "violations");
      assert.deepEqual(report.scope_check.violations, scenario.files);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test("read-only dispatch rejects edits to goal control files", () => {
  const root = makeProject({ taskType: "scout" });
  try {
    const bin = fakeHarnessBin(root, "codex", `echo '# tampered' >> docs/goals/one/state.yaml\necho '${RECEIPT}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(JSON.parse(result.stdout).scope_check.violations, ["docs/goals/one/state.yaml"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("dispatch detects allowed edits to an already-dirty file without blaming unchanged dirty files", () => {
  const root = makeProject();
  try {
    writeFileSync(join(root, "src", "widget.ts"), "before dirty\n");
    writeFileSync(join(root, "README.md"), "unrelated dirty\n");
    const bin = fakeHarnessBin(root, "codex", `echo after > src/widget.ts\necho '${RECEIPT}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(JSON.parse(result.stdout).scope_check.changed_files, ["src/widget.ts"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

const invalidReceiptFields: [string, Record<string, unknown>][] = [
  ["wrong task", { task_id: "T777" }],
  ["wrong board", { board_path: "docs/goals/other/state.yaml" }],
  ["missing provenance", { task_id: undefined, board_path: undefined }],
  ["wrong role", { role: "judge" }],
  ["wrong harness", { harness: "claude-code" }],
  ["invalid result", { result: "success" }],
];
for (const [name, patch] of invalidReceiptFields) {
  test(`dispatch rejects ${name} receipts`, () => {
    const root = makeProject();
    try {
      const receipt = JSON.stringify({ goalbuddy_receipt_v1: { ...JSON.parse(RECEIPT).goalbuddy_receipt_v1, ...patch } });
      const bin = fakeHarnessBin(root, "codex", `echo '${receipt}'`);
      const result = runDispatch(root, bin);
      assert.equal(result.status, 1, result.stdout);
      assert.equal(JSON.parse(result.stdout).ok, false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test("dispatch fails closed without a Git scope snapshot before running the executor", () => {
  const root = makeProject();
  try {
    rmSync(join(root, ".git"), { recursive: true, force: true });
    const bin = fakeHarnessBin(root, "codex", `echo launched > executor-launched\necho '${RECEIPT}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 1, result.stdout);
    assert.equal(JSON.parse(result.stdout).scope_check.status, "unverified");
    assert.equal(existsSync(join(root, "executor-launched")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("dispatch permits an explicitly scoped note but never authoritative board edits under a broad grant", () => {
  const root = makeProject();
  try {
    const path = join(root, "docs/goals/one/state.yaml");
    const state = readFileSync(path, "utf8").replace("- src/widget.ts", "- docs/goals/one/**");
    writeFileSync(path, state);
    const noteReceipt = JSON.stringify({ goalbuddy_receipt_v1: { ...JSON.parse(RECEIPT).goalbuddy_receipt_v1, changed_files: ["docs/goals/one/notes/evidence.md"] } });
    const bin = fakeHarnessBin(root, "codex", `echo evidence > docs/goals/one/notes/evidence.md\necho '${noteReceipt}'`);
    const allowed = runDispatch(root, bin);
    assert.equal(allowed.status, 0, allowed.stderr || allowed.stdout);
    fakeHarnessBin(root, "codex", `echo '# tampered' >> docs/goals/one/state.yaml\necho '${RECEIPT}'`);
    const denied = runDispatch(root, bin);
    assert.equal(denied.status, 1, denied.stdout);
    assert.deepEqual(JSON.parse(denied.stdout).scope_check.violations, ["docs/goals/one/state.yaml"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("dispatch ignores echoed receipt schema placeholders when extracting a real bare receipt", () => {
  const root = makeProject();
  try {
    const bare = JSON.stringify(JSON.parse(RECEIPT).goalbuddy_receipt_v1);
    const bin = fakeHarnessBin(root, "codex", `echo '${bare}'\necho '{"result":"done | blocked","task_id":"<T###>","summary":"placeholder"}' >&2`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).receipt.summary, "widget adjusted");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a successful fake executor report applies to its selected board end to end", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", `echo updated > src/widget.ts\necho '${RECEIPT}'`);
    const dispatched = runDispatch(root, bin);
    assert.equal(dispatched.status, 0, dispatched.stderr || dispatched.stdout);
    const reportPath = join(root, "dispatch-report.json");
    writeFileSync(reportPath, dispatched.stdout);
    const applied = spawnSync(process.execPath, [resolve(repo, "goalbuddy/scripts/apply-receipt.mjs"), "docs/goals/one", "--task", "T001", "--receipt", reportPath, "--activate", "T999", "--json"], { cwd: root, encoding: "utf8" });
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);
    assert.equal(JSON.parse(applied.stdout).active_task, "T999");
    assert.match(readFileSync(join(root, "docs/goals/one/state.yaml"), "utf8"), /harness: codex/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("dispatch protects a symlinked board when only its referent content changes", () => {
  const root = makeProject();
  try {
    const statePath = join(root, "docs/goals/one/state.yaml");
    const target = join(root, ".git", "board-state.yaml");
    renameSync(statePath, target);
    symlinkSync(target, statePath);
    const bin = fakeHarnessBin(root, "codex", `echo '# changed referent' >> docs/goals/one/state.yaml\necho '${RECEIPT}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(JSON.parse(result.stdout).scope_check.violations, ["docs/goals/one/state.yaml"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
