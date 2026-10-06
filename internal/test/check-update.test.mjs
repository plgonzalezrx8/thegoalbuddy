import assert from "node:assert/strict";
import test from "node:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repo = resolve(".");
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
function run(script, extra = {}) {
  return spawnSync(process.execPath, [script, "--json"], {
    encoding: "utf8", timeout: 10000,
    env: { PATH: process.env.PATH, GOALBUDDY_TEST_NPM_LATEST_VERSION: "99.0.0", ...extra },
  });
}

test("npm-installed Claude skill records its update channel without an npm process", () => {
  const root = mkdtempSync(join(tmpdir(), "thegoalbuddy-update-"));
  try {
    const packageRoot = join(root, "node_modules", "thegoalbuddy");
    const claudeHome = join(root, ".claude");
    cpSync(join(repo, "goalbuddy"), join(packageRoot, "goalbuddy"), { recursive: true });
    cpSync(join(repo, "plugins"), join(packageRoot, "plugins"), { recursive: true });
    cpSync(join(repo, "internal", "cli"), join(packageRoot, "internal", "cli"), { recursive: true });
    writeFileSync(join(packageRoot, "package.json"), readFileSync(join(repo, "package.json")));
    const installed = spawnSync(process.execPath, [join(packageRoot, "internal/cli/goal-maker.mjs"), "install", "--target", "claude", "--claude-home", claudeHome, "--json"], {
      encoding: "utf8", timeout: 10000, env: { PATH: process.env.PATH, HOME: root },
    });
    assert.equal(installed.status, 0, installed.stderr);
    const skill = join(claudeHome, "skills", "goal-prep");
    const report = run(join(skill, "scripts", "check-update.mjs"), { CLAUDE_PLUGIN_ROOT: join(root, "unrelated-plugin") });
    assert.equal(report.status, 0, report.stderr);
    const data = JSON.parse(report.stdout);
    assert.equal(data.update_command, "npx thegoalbuddy@latest");
    assert.equal(data.current_version, version);
    assert.equal(JSON.parse(readFileSync(join(skill, ".goalbuddy-install.json"), "utf8")).install_channel, "npm");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a genuine Claude plugin retains its native update command", () => {
  const root = mkdtempSync(join(tmpdir(), "thegoalbuddy-native-update-"));
  try {
    const pluginRoot = join(root, ".claude", "plugins", "cache", "thegoalbuddy");
    const skill = join(pluginRoot, "skills", "goal-prep");
    cpSync(join(repo, "goalbuddy"), skill, { recursive: true });
    mkdirSync(join(pluginRoot, ".claude-plugin"), { recursive: true });
    writeFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "thegoalbuddy", version }));
    const report = run(join(skill, "scripts", "check-update.mjs"), { CLAUDE_PLUGIN_ROOT: pluginRoot });
    assert.equal(report.status, 0, report.stderr);
    const data = JSON.parse(report.stdout);
    assert.equal(data.update_command, "/plugin update thegoalbuddy@thegoalbuddy");
    assert.equal(data.current_version, version);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a globally installed npm executable recommends a global npm update", () => {
  const root = mkdtempSync(join(tmpdir(), "thegoalbuddy-global-update-"));
  try {
    const pkg = join(root, "lib", "node_modules", "thegoalbuddy");
    cpSync(join(repo, "goalbuddy"), join(pkg, "goalbuddy"), { recursive: true });
    cpSync(join(repo, "internal", "cli"), join(pkg, "internal", "cli"), { recursive: true });
    writeFileSync(join(pkg, "package.json"), readFileSync(join(repo, "package.json")));
    const r = spawnSync(process.execPath, [join(pkg, "internal/cli/goal-maker.mjs"), "check-update", "--json"], {
      encoding: "utf8", timeout: 10000, env: { PATH: process.env.PATH, GOALBUDDY_TEST_NPM_LATEST_VERSION: "99.0.0" },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).update_command, "npm install -g thegoalbuddy@latest");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
