import { object, array, text, texts, parseObject } from "./fixtures/cli-json.mjs";
import { readFileSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const pkg = parseObject(readFileSync("package.json", "utf8"));

test("fork package exposes thegoalbuddy with compatible CLI aliases", () => {
  assert.equal(pkg.name, "thegoalbuddy");
  for (const name of ["thegoalbuddy", "goalbuddy", "goal-maker"]) {
    assert.equal(object(pkg.bin)[name], "internal/cli/goal-maker.mjs");
  }
  assert.equal(object(pkg.repository).url, "git+https://github.com/plgonzalezrx8/thegoalbuddy.git");
});

test("fork CLI directs users to thegoalbuddy", () => {
  const result = spawnSync(process.execPath, ["internal/cli/goal-maker.mjs", "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /thegoalbuddy for Claude Code and Codex/);
  assert.match(result.stdout, /thegoalbuddy update/);
});

test("bundled update checker stays on the fork package and update channel", () => {
  const result = spawnSync(process.execPath, ["goalbuddy/scripts/check-update.mjs", "--json"], {
    encoding: "utf8",
    env: { ...process.env, GOALBUDDY_TEST_NPM_LATEST_VERSION: "99.0.0", npm_config_user_agent: "npm/11.9.0" },
  });
  assert.equal(result.status, 0, result.stderr);
  const report = parseObject(result.stdout);
  assert.equal(report.package, "thegoalbuddy");
  assert.equal(report.update_command, "npx thegoalbuddy@latest");
});

test("generated board presents fork branding and links while retaining existing state paths", () => {
  const root = mkdtempSync(join(tmpdir(), "thegoalbuddy-brand-"));
  try {
    cpSync("goalbuddy/surfaces/local-goal-board/examples/subgoal-parent", root, { recursive: true });
    const result = spawnSync(process.execPath, [resolve("goalbuddy/surfaces/local-goal-board/scripts/local-goal-board.mjs"), "--goal", root, "--once", "--json"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const appDir = text(parseObject(result.stdout).appDir);
    assert.equal(appDir, join(root, ".goalbuddy-board"));
    const html = readFileSync(join(appDir, "index.html"), "utf8");
    assert.match(html, /aria-label="thegoalbuddy home"\s*>\s*thegoalbuddy/);
    assert.match(html, /https:\/\/github.com\/plgonzalezrx8\/thegoalbuddy/);
    assert.doesNotMatch(html, /tolimarchuk\/goalbuddy/);
    const js = readFileSync(join(appDir, "app.js"), "utf8");
    assert.match(js, /thegoalbuddy/);
    assert.doesNotMatch(js, /api.github.com/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
