import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const packageVersion = JSON.parse(readFileSync(join(repository, "package.json"), "utf8")).version;

function npmExecutable() {
  for (const directory of (process.env.PATH || "").split(delimiter)) {
    const candidate = join(directory, "npm");
    if (existsSync(candidate)) return realpathSync(candidate);
  }
  throw new Error("npm is required for real tarball installation smoke tests");
}

function fixture(root, name, { syntheticCodex = false } = {}) {
  const directory = join(root, name);
  const home = join(directory, "home");
  const codexHome = join(directory, "codex-home");
  const claudeHome = join(home, ".claude");
  const tools = join(directory, "tools");
  const project = join(directory, "project");
  const prefix = join(directory, "global-prefix");
  const npmrc = join(directory, "npmrc");
  const globalNpmrc = join(directory, "global-npmrc");
  for (const path of [home, tools, project, prefix]) mkdirSync(path, { recursive: true });
  writeFileSync(npmrc, "");
  writeFileSync(globalNpmrc, "");
  writeFileSync(join(project, "package.json"), '{"name":"isolated-package-smoke","private":true}\n');
  symlinkSync(process.execPath, join(tools, "node"));
  symlinkSync(npmExecutable(), join(tools, "npm"));
  symlinkSync("/bin/sh", join(tools, "sh"));

  // Whitelist environment values; never pass operator credentials or npm config.
  // No CLAUDE_HOME override here: it selects Claude-only instead of default both.
  // The default Claude directory is still confined to this temporary HOME.
  const env = {
    HOME: home,
    USERPROFILE: home,
    CODEX_HOME: codexHome,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_CACHE_HOME: join(home, ".cache"),
    PATH: tools,
    TMPDIR: directory,
    LANG: "C.UTF-8",
    npm_config_cache: join(directory, "npm-cache"),
    npm_config_userconfig: npmrc,
    npm_config_globalconfig: globalNpmrc,
    npm_config_prefix: prefix,
    npm_config_registry: "http://127.0.0.1:9/",
    npm_config_offline: "true",
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
    npm_config_user_agent: "",
    GOALBUDDY_TEST_NPM_LATEST_VERSION: packageVersion,
  };

  if (syntheticCodex) {
    // This tests npm lifecycle wiring against the existing synthetic host
    // contract. It makes no claim about real Codex plugin adoption or models.
    env.GOALBUDDY_SMOKE_SYNTHETIC_CODEX = "1";
    const script = join(tools, "codex");
    writeFileSync(script, `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
if (process.env.GOALBUDDY_SMOKE_SYNTHETIC_CODEX !== "1") process.exit(2);
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(join(directory, "synthetic-codex-calls.jsonl"))}, JSON.stringify(args) + "\\n");
if (args.join(" ") === "--version") console.log("codex-cli 0.128.0");
else if (args.join(" ") === "login status") console.log("Logged in with ChatGPT (synthetic fixture)");
else if (args.join(" ") === "features list") console.log("goals                               under development  true");
else if (args.slice(0, 3).join(" ") === "plugin marketplace add") console.log("Added marketplace (synthetic fixture)");
else process.exit(2);
`);
    chmodSync(script, 0o755);
  }

  return { directory, home, codexHome, claudeHome, project, prefix, env };
}

function run(command, args, context, { cwd = context.project, env = context.env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.ifError(result.error);
  return result;
}

function runNpm(args, context, options) {
  return run(process.execPath, [npmExecutable(), ...args], context, options);
}

function succeeded(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function report(result, expectedStatus = 0) {
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function localBin(context) {
  return join(context.project, "node_modules", ".bin", "thegoalbuddy");
}

function globalBin(context) {
  return join(context.prefix, "bin", "thegoalbuddy");
}

function assertClaudeUsable(bin, context) {
  const doctor = report(run(bin, ["doctor", "--target", "claude"], context));
  assert.equal(doctor.skill_installed, true);
  assert.equal(doctor.goal_command_present, true);
  assert.equal(doctor.native_goal_available, true);
  assert.deepEqual(doctor.missing_agents, []);
  assert.deepEqual(doctor.stale_agents, []);
  assert.match(readFileSync(join(context.claudeHome, "commands", "goalbuddy.md"), "utf8"), /state\.yaml/);
}

test("real npm tarball installation smoke (isolated POSIX homes and lifecycle)", {
  skip: process.platform === "win32" ? "POSIX bin and lifecycle smoke; CLI unit tests cover Windows resolution" : false,
}, async (t) => {
  const root = mkdtempSync(join(tmpdir(), "thegoalbuddy-package-smoke-"));
  try {
    const packaging = fixture(root, "packaging");
    const packed = succeeded(runNpm(["pack", "--json", "--pack-destination", root], packaging, { cwd: repository }));
    const tarball = join(root, JSON.parse(packed.stdout)[0].filename);
    assert.equal(existsSync(tarball), true);
    const local = fixture(root, "local");
    // Scripts are explicitly enabled; local postinstall intentionally does not
    // set up personal hosts. All install targets stay under temporary homes.
    succeeded(runNpm(["install", "--ignore-scripts=false", "--foreground-scripts", tarball], local));
    assert.equal(existsSync(join(local.claudeHome, "skills")), false);
    assert.equal(existsSync(local.codexHome), false);

    await t.test("installed bin defaults to both targets and preserves Claude when Codex is missing", () => {
      const bin = localBin(local);
      assert.match(succeeded(run(bin, ["--help"], local)).stdout, /thegoalbuddy for Claude Code and Codex/);
      const installed = report(run(bin, ["--json"], local), 1);
      assert.equal(installed.ok, false);
      assert.equal(installed.codex.ok, false);
      assert.match(installed.codex.error, /Codex plugin marketplace.*ENOENT/);
      assert.equal(installed.claude.skill.status, "installed");
      assert.equal(installed.claude.package.current_version, packageVersion);
      assertClaudeUsable(bin, local);
      const codex = report(run(bin, ["doctor", "--target", "codex"], local), 1);
      assert.equal(codex.goal_runtime.codex_cli_available, false);
      assert.equal(codex.runtime_state, "fully-removed");
    });

    await t.test("npm exec resolves installed package offline and targeted Claude update repairs stale agents", () => {
      const help = succeeded(runNpm(["exec", "--offline", "--no", "--", "thegoalbuddy", "--help"], local));
      assert.match(help.stdout, /thegoalbuddy install/);
      const installed = report(runNpm(["exec", "--offline", "--no", "--", "thegoalbuddy", "install", "--target", "claude", "--json"], local));
      assert.equal(installed.skill.current_version, packageVersion);
      writeFileSync(join(local.claudeHome, "agents", "goal-worker.md"), "stale smoke fixture\n");
      const stale = report(run(localBin(local), ["doctor", "--target", "claude"], local), 1);
      assert.deepEqual(stale.stale_agents, ["goal-worker.md"]);
      const update = report(run(localBin(local), ["update", "--target", "claude", "--json"], local, {
        env: { ...local.env, CLAUDE_HOME: local.claudeHome },
      }));
      assert.equal(update.agents.find((agent) => agent.file === "goal-worker.md").status, "updated");
      assertClaudeUsable(localBin(local), local);
    });

    await t.test("npm-installed Claude skill retains npm update channel without npm user agent", () => {
      const script = join(local.claudeHome, "skills", "goal-prep", "scripts", "check-update.mjs");
      const checked = report(run(process.execPath, [script, "--json"], local));
      assert.equal(checked.current_version, packageVersion);
      assert.equal(checked.check_status, "ok");
      assert.equal(checked.update_command, "npx thegoalbuddy@latest");
    });

    await t.test("installed bin creates a goal and renders the observatory board with usable asset references", () => {
      const created = report(run(localBin(local), ["init", "package-smoke", "--json"], local));
      assert.equal(created.slug, "package-smoke");
      const board = report(run(localBin(local), ["board", "docs/goals/package-smoke", "--once", "--json"], local));
      assert.equal(board.board.goal.slug, "package-smoke");
      const html = readFileSync(join(board.appDir, "index.html"), "utf8");
      const css = readFileSync(join(board.appDir, "styles.css"), "utf8");
      assert.match(html, /thegoalbuddy/i);
      assert.match(css, /observatory-sky\.webp/);
      const references = [
        ...html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g),
        ...css.matchAll(/url\("\.\/([^"#?]+)"\)/g),
      ].map((match) => match[1]);
      assert.ok(references.includes("dm-sans.woff2"));
      assert.ok(references.includes("libre-caslon-display.woff2"));
      for (const filename of new Set(references)) {
        assert.ok(readFileSync(join(board.appDir, filename)).length > 0, `empty rendered asset ${filename}`);
      }
      assert.equal(readFileSync(join(board.appDir, "dm-sans.woff2")).subarray(0, 4).toString(), "wOF2");
      assert.equal(readFileSync(join(board.appDir, "observatory-sky.webp")).subarray(8, 12).toString(), "WEBP");
    });

    await t.test("global npm postinstall runs both targets and leaves Claude usable with missing Codex", () => {
      const global = fixture(root, "global-missing-codex");
      const installed = succeeded(runNpm(["install", "--global", "--prefix", global.prefix, "--ignore-scripts=false", "--foreground-scripts", tarball], global));
      assert.match(installed.stdout, /postinstall/);
      assert.match(installed.stderr, /setup did not complete for every target/);
      assert.match(installed.stdout, /Codex: not completed/);
      assertClaudeUsable(globalBin(global), global);
      const checked = report(run(globalBin(global), ["check-update", "--json"], global));
      assert.equal(checked.current_version, packageVersion);
      assert.equal(checked.update_command, "npm install -g thegoalbuddy@latest");
      const skillScript = join(global.claudeHome, "skills", "goal-prep", "scripts", "check-update.mjs");
      const skillChecked = report(run(process.execPath, [skillScript, "--json"], global));
      assert.equal(skillChecked.update_command, "npm install -g thegoalbuddy@latest");
      const codex = report(run(globalBin(global), ["doctor", "--target", "codex"], global), 1);
      assert.equal(codex.goal_runtime.codex_cli_available, false);
    });

    await t.test("global postinstall with explicitly synthetic Codex host wires both targets", () => {
      const global = fixture(root, "global-synthetic-codex", { syntheticCodex: true });
      const installed = succeeded(runNpm(["install", "--global", "--prefix", global.prefix, "--ignore-scripts=false", "--foreground-scripts", tarball], global));
      assert.match(installed.stdout, /postinstall/);
      assert.doesNotMatch(installed.stderr, /setup did not complete/);
      assertClaudeUsable(globalBin(global), global);
      const codex = report(run(globalBin(global), ["doctor", "--target", "codex"], global));
      assert.equal(codex.plugin.enabled, true);
      assert.equal(codex.plugin.skill_installed, true);
      assert.equal(codex.goal_runtime.ready, true);
      assert.deepEqual(codex.missing_agents, []);
      const calls = readFileSync(join(global.directory, "synthetic-codex-calls.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
      assert.ok(calls.some((args) => args.slice(0, 3).join(" ") === "plugin marketplace add"));
      assert.ok(calls.every((args) => args[0] !== "exec"), "smoke must not execute an agent");
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
