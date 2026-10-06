import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { filesIn, hash, inputFingerprint, isDirectRun, repoRoot, writeJson } from "./common.mjs";
import { array, object, parseObject, text } from "../test/fixtures/cli-json.mjs";

interface Command { command: string; args: string[]; status: number; stdout: string; stderr: string }
export function nativeHostQa(): void {
  const before = inputFingerprint();
  const root = mkdtempSync(join(tmpdir(), "thegoalbuddy-native-typescript-"));
  const codex = "/opt/codex/bin/codex";
  const oldHostRoot = readFileSync("/workspace/recovery/thegoalbuddy/native-host-root.txt", "utf8").trim();
  const claude = join(oldHostRoot, "claude-cli/node_modules/.bin/claude");
  assert.ok(existsSync(codex) && existsSync(claude), "real host binaries are required");
  const home = join(root, "home"), codexHome = join(home, ".codex"), claudeHome = join(home, ".claude");
  mkdirSync(codexHome, { recursive: true }); mkdirSync(claudeHome, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    PATH: [dirname(process.execPath), dirname(codex), dirname(claude), "/usr/bin", "/bin"].join(":"),
    HOME: home, CODEX_HOME: codexHome, CLAUDE_CONFIG_DIR: claudeHome, TMPDIR: root,
    LANG: "C.UTF-8", GIT_TERMINAL_PROMPT: "0", NO_COLOR: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_AUTOUPDATER: "1",
  };
  const commands: Command[] = [];
  function command(binary: string, args: string[]): string {
    const result = spawnSync(binary, args, { cwd: repoRoot, env, encoding: "utf8", timeout: 60000, shell: false });
    commands.push({ command: binary, args, status: result.status ?? -1, stdout: result.stdout || "", stderr: result.stderr || "" });
    assert.equal(result.error, undefined, "host command must launch");
    assert.equal(result.status, 0, `host command failed: ${binary} ${args.join(" ")}`);
    return result.stdout;
  }
  function cli(args: string[]): Record<string, unknown> {
    return parseObject(command(process.execPath, [join(repoRoot, "internal/cli/goal-maker.mjs"), ...args, "--json"]));
  }
  function verifySkill(skill: string): { files: number; sha256: string } {
    const entries = filesIn(repoRoot, "goalbuddy").map(path => {
      const installed = join(skill, path.slice("goalbuddy/".length));
      assert.equal(existsSync(installed), true, `installed file missing: ${path}`);
      const source = readFileSync(join(repoRoot, path));
      assert.equal(readFileSync(installed).equals(source), true, `installed bytes differ: ${path}`);
      return { path, sha256: hash(source) };
    });
    assert.match(readFileSync(join(skill, "scripts/check-goal-state.mjs"), "utf8"), /^(?:#![^\n]+\n)?\/\/ Generated from goalbuddy\/scripts\/check-goal-state\.mts;/);
    command(process.execPath, [join(skill, "scripts/check-goal-state.mjs"), join(skill, "surfaces/local-goal-board/examples/keyboard-navigation")]);
    return { files: entries.length, sha256: hash(JSON.stringify(entries)) };
  }
  try {
    const versions = { node: process.version, codex: command(codex, ["--version"]).trim(), claude: command(claude, ["--version"]).trim() };
    const codexInstall = cli(["plugin", "install", "--source", repoRoot]);
    const codexList = parseObject(command(codex, ["plugin", "list", "--json"]));
    assert.ok(array(codexList.installed).some(value => object(value).pluginId === "thegoalbuddy@thegoalbuddy" && object(value).enabled === true));
    assert.deepEqual(cli(["doctor", "--target", "codex"]).errors, []);
    const codexSkill = verifySkill(join(text(codexInstall.cache_path), "skills/goal-prep"));
    command(claude, ["plugin", "validate", join(repoRoot, "plugins/goalbuddy")]);
    command(claude, ["plugin", "marketplace", "add", repoRoot]);
    command(claude, ["plugin", "install", "thegoalbuddy@thegoalbuddy", "--scope", "user"]);
    const claudeList: unknown = JSON.parse(command(claude, ["plugin", "list", "--json"]));
    const installed = array(claudeList).map(object).find(value => value.id === "thegoalbuddy@thegoalbuddy" && value.enabled === true);
    assert.ok(installed, "Claude must discover enabled plugin");
    const claudeSkill = verifySkill(join(text(installed.installPath), "skills/goal-prep"));
    cli(["install", "--target", "claude"]);
    const claudeDoctor = cli(["doctor", "--target", "claude"]);
    assert.equal(claudeDoctor.skill_installed, true);
    assert.deepEqual(claudeDoctor.missing_agents, []);
    assert.deepEqual(claudeDoctor.stale_agents, []);
    assert.equal(claudeDoctor.goal_command_present, true);
    assert.equal(inputFingerprint().fingerprint, before.fingerprint, "host checks must not alter maintained input");
    writeJson(join(repoRoot, "audit/typescript-sites-migration/native-hosts.json"), {
      status: "pass", fingerprint: before.fingerprint, platform: process.platform, architecture: process.arch, versions,
      credentialsPassed: false, modelExecutionPerformed: false, compilerNeededByInstalledRuntime: false,
      codex: { status: "pass", payload: codexSkill }, claude: { status: "pass", payload: claudeSkill }, commands,
      limitations: ["Linux x64 only", "No authenticated native /goal or model execution"],
    });
    console.log("Real Codex and Claude plugin adoption, doctor, byte parity, and plain-Node installed runtime passed.");
  } finally { rmSync(root, { recursive: true, force: true }); }
}
if (isDirectRun(import.meta.url)) try { nativeHostQa(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
