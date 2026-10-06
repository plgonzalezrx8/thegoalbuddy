import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fixture, localBin, objectField, objectsField, report, requiredTarball, run, runNpm, stringField, succeeded, tarballFiles, tarballIdentity, tarballText } from "./fixtures/package-support.mjs";

const tarball = requiredTarball();
const canonicalPrefix = "goalbuddy/";
const pluginPrefix = "plugins/goalbuddy/skills/goal-prep/";

function relativePackedFiles(files: string[], prefix: string): string[] {
  return files.filter(file => file.startsWith(prefix)).map(file => file.slice(prefix.length)).sort();
}

test("packed canonical and plugin skill trees stay complete and aligned", () => {
  const files = tarballFiles(tarball);
  const canonicalFiles = relativePackedFiles(files, canonicalPrefix);
  const pluginFiles = relativePackedFiles(files, pluginPrefix);
  assert.ok(files.includes("goalbuddy/references/goal-execution.md"));
  assert.ok(files.includes("docs/spec/receipt-v1.md"), "packed README receipt specification must resolve");
  assert.ok(canonicalFiles.includes("SKILL.md"));
  assert.ok(canonicalFiles.includes("scripts/render-task-prompt.mjs"));
  assert.deepEqual(canonicalFiles, pluginFiles);
  assert.ok(!files.some(path => /(?:^|\/)(?:test|tests|fixtures|build|audit|node_modules|\.build)(?:\/|$)/.test(path)), "artifact must exclude test/build/audit state");
  assert.ok(!files.some(path => /(?:^|\/)\.env(?:[./]|$)|(?:^|\/)\.npmrc$/.test(path)), "artifact must exclude credentials and npm configuration");
  const pkg = tarballIdentity(tarball);
  assert.equal(pkg.name, "thegoalbuddy");
  for (const manifest of [".codex-plugin", ".claude-plugin"]) {
    const parsed: unknown = JSON.parse(tarballText(tarball, `plugins/goalbuddy/${manifest}/plugin.json`));
    assert.deepEqual(objectField({ manifest: parsed }, "manifest").version, pkg.version);
  }
});

test("the final npm artifact installs the Claude contract and role agents", {
  skip: process.platform === "win32" ? "POSIX installed-bin smoke; platform adoption requires its own gate" : false,
}, () => {
  const root = mkdtempSync(join(tmpdir(), "thegoalbuddy-artifact-contract-"));
  try {
    const context = fixture(root, "claude-contract", tarballIdentity(tarball).version);
    succeeded(runNpm(["install", "--ignore-scripts=false", "--foreground-scripts", tarball], context));
    const installed = report(run(localBin(context), ["install", "--target", "claude", "--json"], context));
    assert.equal(objectField(installed, "skill").status, "installed");
    assert.deepEqual(objectsField(installed, "agents").map(agent => stringField(agent, "file")).sort(), ["goal-judge.md", "goal-scout.md", "goal-worker.md"]);
    assert.equal(existsSync(join(context.claudeHome, "commands", "goalbuddy.md")), true);
    assert.equal(existsSync(join(context.claudeHome, "commands", "goal.md")), false);
    const installedContract = join(context.claudeHome, "skills", "goal-prep", "references", "goal-execution.md");
    assert.equal(existsSync(installedContract), true);
    assert.match(readFileSync(installedContract, "utf8"), /governs Codex `\/goal` and Claude Code `\/goalbuddy` runs/);
    for (const file of ["goal-judge.md", "goal-scout.md", "goal-worker.md"]) {
      assert.equal(existsSync(join(context.claudeHome, "agents", file)), true);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
