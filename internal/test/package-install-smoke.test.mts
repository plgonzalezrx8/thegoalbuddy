import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertClaudeUsable, fixture, globalBin, localBin, objectField, objectsField, report, requiredTarball, run, runNpm, stringField, strings, succeeded, tarballIdentity } from "./fixtures/package-support.mjs";

// This suite consumes exactly the final artifact supplied by the release gate.
const tarball = requiredTarball();
const packageVersion = tarballIdentity(tarball).version;

test("real npm tarball installation smoke (isolated POSIX homes and lifecycle)", {
  skip: process.platform === "win32" ? "POSIX bin and lifecycle smoke; CLI unit tests cover Windows resolution" : false,
}, async (t) => {
  const root = mkdtempSync(join(tmpdir(), "thegoalbuddy-package-smoke-"));
  try {
    const local = fixture(root, "local", packageVersion);
    // Scripts are explicitly enabled; local postinstall intentionally does not
    // set up personal hosts. All install targets stay under temporary homes.
    succeeded(runNpm(["install", "--ignore-scripts=false", "--foreground-scripts", tarball], local));
    assert.equal(existsSync(join(local.claudeHome, "skills")), false);
    assert.equal(existsSync(local.codexHome), false);

    await t.test("installed bin defaults to both targets and preserves Claude when Codex is missing", () => {
      const bin = localBin(local);
      for (const alias of ["thegoalbuddy", "goalbuddy", "goal-maker"]) {
        assert.match(succeeded(run(localBin(local, alias), ["--help"], local)).stdout, /thegoalbuddy for Claude Code and Codex/);
      }
      const installed = report(run(bin, ["--json"], local), 1);
      assert.equal(installed.ok, false);
      assert.equal(objectField(installed, "codex").ok, false);
      assert.match(stringField(objectField(installed, "codex"), "error"), /Codex plugin marketplace.*ENOENT/);
      assert.equal(objectField(objectField(installed, "claude"), "skill").status, "installed");
      assert.equal(objectField(objectField(installed, "claude"), "package").current_version, packageVersion);
      assertClaudeUsable(bin, local);
      const codex = report(run(bin, ["doctor", "--target", "codex"], local), 1);
      assert.equal(objectField(codex, "goal_runtime").codex_cli_available, false);
      assert.equal(codex.runtime_state, "fully-removed");
    });

    await t.test("npm exec resolves installed package offline and targeted Claude update repairs stale agents", () => {
      const help = succeeded(runNpm(["exec", "--offline", "--no", "--", "thegoalbuddy", "--help"], local));
      assert.match(help.stdout, /thegoalbuddy install/);
      const installed = report(runNpm(["exec", "--offline", "--no", "--", "thegoalbuddy", "install", "--target", "claude", "--json"], local));
      assert.equal(objectField(installed, "skill").current_version, packageVersion);
      writeFileSync(join(local.claudeHome, "agents", "goal-worker.md"), "stale smoke fixture\n");
      const stale = report(run(localBin(local), ["doctor", "--target", "claude"], local), 1);
      assert.deepEqual(stale.stale_agents, ["goal-worker.md"]);
      const update = report(run(localBin(local), ["update", "--target", "claude", "--json"], local, {
        env: { ...local.env, CLAUDE_HOME: local.claudeHome },
      }));
      assert.equal(objectsField(update, "agents").find((agent) => agent.file === "goal-worker.md")?.status, "updated");
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
      assert.equal(objectField(objectField(board, "board"), "goal").slug, "package-smoke");
      const html = readFileSync(join(stringField(board, "appDir"), "index.html"), "utf8");
      const css = readFileSync(join(stringField(board, "appDir"), "styles.css"), "utf8");
      assert.match(html, /thegoalbuddy/i);
      assert.match(css, /observatory-sky\.webp/);
      const references = [
        ...html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g),
        ...css.matchAll(/url\("\.\/([^"#?]+)"\)/g),
      ].map((match) => match[1]);
      assert.ok(references.includes("dm-sans.woff2"));
      assert.ok(references.includes("libre-caslon-display.woff2"));
      for (const filename of new Set(references)) {
        assert.ok(readFileSync(join(stringField(board, "appDir"), filename)).length > 0, `empty rendered asset ${filename}`);
      }
      assert.equal(readFileSync(join(stringField(board, "appDir"), "dm-sans.woff2")).subarray(0, 4).toString(), "wOF2");
      assert.equal(readFileSync(join(stringField(board, "appDir"), "observatory-sky.webp")).subarray(8, 12).toString(), "WEBP");
    });

    await t.test("global npm postinstall runs both targets and leaves Claude usable with missing Codex", () => {
      const global = fixture(root, "global-missing-codex", packageVersion);
      const installed = succeeded(runNpm(["install", "--global", "--prefix", global.prefix, "--ignore-scripts=false", "--foreground-scripts", tarball], global));
      assert.match(installed.stdout, /postinstall/);
      assert.match(installed.stderr, /setup did not complete for every target/);
      assert.match(installed.stdout, /Codex: not completed/);
      for (const alias of ["thegoalbuddy", "goalbuddy", "goal-maker"]) {
        assert.match(succeeded(run(globalBin(global, alias), ["--help"], global)).stdout, /thegoalbuddy for Claude Code and Codex/);
      }
      assertClaudeUsable(globalBin(global), global);
      const checked = report(run(globalBin(global), ["check-update", "--json"], global));
      assert.equal(checked.current_version, packageVersion);
      assert.equal(checked.update_command, "npm install -g thegoalbuddy@latest");
      const skillScript = join(global.claudeHome, "skills", "goal-prep", "scripts", "check-update.mjs");
      const skillChecked = report(run(process.execPath, [skillScript, "--json"], global));
      assert.equal(skillChecked.update_command, "npm install -g thegoalbuddy@latest");
      const codex = report(run(globalBin(global), ["doctor", "--target", "codex"], global), 1);
      assert.equal(objectField(codex, "goal_runtime").codex_cli_available, false);
    });

    await t.test("global postinstall with explicitly synthetic Codex host wires both targets", () => {
      const global = fixture(root, "global-synthetic-codex", packageVersion, { syntheticCodex: true });
      const installed = succeeded(runNpm(["install", "--global", "--prefix", global.prefix, "--ignore-scripts=false", "--foreground-scripts", tarball], global));
      assert.match(installed.stdout, /postinstall/);
      assert.doesNotMatch(installed.stderr, /setup did not complete/);
      assertClaudeUsable(globalBin(global), global);
      const codex = report(run(globalBin(global), ["doctor", "--target", "codex"], global));
      assert.equal(objectField(codex, "plugin").enabled, true);
      assert.equal(objectField(codex, "plugin").skill_installed, true);
      assert.equal(objectField(codex, "goal_runtime").ready, true);
      assert.deepEqual(codex.missing_agents, []);
      const calls = readFileSync(join(global.directory, "synthetic-codex-calls.jsonl"), "utf8").trim().split("\n").map((line) => strings(JSON.parse(line) as unknown));
      assert.ok(calls.some((args) => args.slice(0, 3).join(" ") === "plugin marketplace add"));
      assert.ok(calls.every((args) => args[0] !== "exec"), "smoke must not execute an agent");
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
