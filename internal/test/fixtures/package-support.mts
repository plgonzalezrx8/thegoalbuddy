import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { fileURLToPath } from "node:url";

export type JsonObject = Record<string, unknown>;
export interface PackageFixture {
  directory: string;
  home: string;
  codexHome: string;
  claudeHome: string;
  project: string;
  prefix: string;
  env: NodeJS.ProcessEnv;
}
export interface RunOptions { cwd?: string; env?: NodeJS.ProcessEnv }

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function object(value: unknown): JsonObject {
  if (!isObject(value)) throw new Error("Expected a JSON object in artifact report.");
  return value;
}
export function objectField(value: JsonObject, key: string): JsonObject { return object(value[key]); }
export function stringField(value: JsonObject, key: string): string {
  if (typeof value[key] !== "string") throw new Error(`Expected a string ${key} in artifact report.`);
  return value[key];
}
export function objectsField(value: JsonObject, key: string): JsonObject[] {
  const list = value[key];
  if (!Array.isArray(list)) throw new Error(`Expected an array ${key} in artifact report.`);
  return list.map((entry: unknown) => object(entry));
}
export function strings(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item: unknown) => typeof item === "string")) throw new Error("Expected an array of strings in artifact data.");
  return value;
}

/** Locate the original authored checkout, never the relocated emitted tests. */
export function repositoryRoot(): string {
  const specified = process.env.THEGOALBUDDY_TEST_ROOT;
  if (specified && !isAbsolute(specified)) throw new Error("THEGOALBUDDY_TEST_ROOT must identify an absolute original checkout.");
  let root = resolve(specified || process.cwd());
  for (;;) {
    if (existsSync(join(root, "package.json")) && existsSync(join(root, "internal/cli/goal-maker.mts")) && existsSync(join(root, "AGENTS.md"))) {
      const pkg = object(JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as unknown);
      if (pkg.name === "thegoalbuddy") return realpathSync(root);
    }
    if (specified || dirname(root) === root) throw new Error("Cannot find the original thegoalbuddy TypeScript checkout.");
    root = dirname(root);
  }
}

export function requiredTarball(): string {
  const path = process.env.THEGOALBUDDY_TEST_TARBALL;
  if (!path || !isAbsolute(path)) throw new Error("Final artifact tests require THEGOALBUDDY_TEST_TARBALL=<absolute verified tarball path>; they never create or repack an artifact.");
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error("THEGOALBUDDY_TEST_TARBALL must identify an existing final tarball file.");
  return realpathSync(path);
}

function executable(name: string): string {
  for (const directory of (process.env.PATH || "").split(delimiter)) {
    const candidate = join(directory, name);
    if (existsSync(candidate) && statSync(candidate).isFile()) return realpathSync(candidate);
  }
  throw new Error(`${name} is required for final artifact tests.`);
}
function npmExecutable(): string { return executable(process.platform === "win32" ? "npm.cmd" : "npm"); }

function tarCommand(args: string[]): string {
  // Archive inspection neither installs nor executes its contents.
  const result = spawnSync(executable("tar"), args, {
    encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: dirname(executable("gzip")), LANG: "C" },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
export function tarballFiles(tarball: string): string[] {
  const members = tarCommand(["-tzf", tarball]).trim().split(/\r?\n/).filter(path => !path.endsWith("/"));
  assert.ok(members.length > 0, "final artifact must contain files");
  for (const path of members) {
    assert.ok(path.startsWith("package/") && !path.split("/").includes("..") && !path.includes("\\"), `unsafe artifact member ${path}`);
  }
  const paths = members.map(path => path.slice("package/".length));
  assert.equal(new Set(paths).size, paths.length, "final artifact must not contain duplicate members");
  return paths;
}
export function tarballText(tarball: string, path: string): string {
  assert.ok(path && !isAbsolute(path) && !path.split("/").includes(".."));
  return tarCommand(["-xOzf", tarball, `package/${path}`]);
}
export function tarballIdentity(tarball: string): { name: string; version: string } {
  const pkg = object(JSON.parse(tarballText(tarball, "package.json")) as unknown);
  assert.equal(pkg.name, "thegoalbuddy");
  const version = stringField(pkg, "version");
  assert.match(version, /^\d+\.\d+\.\d+(?:[-+].*)?$/);
  return { name: "thegoalbuddy", version };
}

export function fixture(root: string, name: string, version: string, { syntheticCodex = false }: { syntheticCodex?: boolean } = {}): PackageFixture {
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
  writeFileSync(npmrc, ""); writeFileSync(globalNpmrc, "");
  writeFileSync(join(project, "package.json"), '{"name":"isolated-package-smoke","private":true}\n');
  symlinkSync(process.execPath, join(tools, "node"));
  symlinkSync(npmExecutable(), join(tools, "npm"));
  symlinkSync("/bin/sh", join(tools, "sh"));
  // No inherited environment or credentials. CLAUDE_HOME is omitted for the
  // both-host default; HOME/.claude is nevertheless isolated in this fixture.
  const env: NodeJS.ProcessEnv = {
    HOME: home, USERPROFILE: home, CODEX_HOME: codexHome,
    XDG_CONFIG_HOME: join(home, ".config"), XDG_CACHE_HOME: join(home, ".cache"),
    PATH: tools, TMPDIR: directory, LANG: "C.UTF-8",
    npm_config_cache: join(directory, "npm-cache"), npm_config_userconfig: npmrc,
    npm_config_globalconfig: globalNpmrc, npm_config_prefix: prefix,
    npm_config_registry: "http://127.0.0.1:9/", npm_config_offline: "true",
    npm_config_audit: "false", npm_config_fund: "false", npm_config_update_notifier: "false",
    npm_config_user_agent: "", GOALBUDDY_TEST_NPM_LATEST_VERSION: version,
  };
  if (syntheticCodex) {
    env.GOALBUDDY_SMOKE_SYNTHETIC_CODEX = "1";
    env.GOALBUDDY_SMOKE_CODEX_LOG = join(directory, "synthetic-codex-calls.jsonl");
    const compiledFixture = join(dirname(fileURLToPath(import.meta.url)), "package-codex.mjs");
    assert.ok(existsSync(compiledFixture), "test runner must compile the synthetic Codex TypeScript fixture");
    const quote = (arg: string): string => `'${arg.replaceAll("'", "'\\''")}'`;
    const script = join(tools, "codex");
    writeFileSync(script, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(compiledFixture)} "$@"\n`);
    chmodSync(script, 0o755);
  }
  return { directory, home, codexHome, claudeHome, project, prefix, env };
}

export function run(command: string, args: string[], context: PackageFixture, { cwd = context.project, env = context.env }: RunOptions = {}): SpawnSyncReturns<string> {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  assert.ifError(result.error);
  return result;
}
export function runNpm(args: string[], context: PackageFixture, options?: RunOptions): SpawnSyncReturns<string> {
  assert.ok(!args.includes("pack") && !args.includes("publish"), "artifact verification must never pack or publish");
  return run(process.execPath, [npmExecutable(), ...args], context, options);
}
export function succeeded(result: SpawnSyncReturns<string>): SpawnSyncReturns<string> {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}
export function report(result: SpawnSyncReturns<string>, expectedStatus = 0): JsonObject {
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return object(JSON.parse(result.stdout) as unknown);
}
export function localBin(context: PackageFixture, alias = "thegoalbuddy"): string { return join(context.project, "node_modules", ".bin", alias); }
export function globalBin(context: PackageFixture, alias = "thegoalbuddy"): string { return join(context.prefix, "bin", alias); }
export function assertClaudeUsable(bin: string, context: PackageFixture): void {
  const doctor = report(run(bin, ["doctor", "--target", "claude"], context));
  assert.equal(doctor.skill_installed, true);
  assert.equal(doctor.goal_command_present, true);
  assert.equal(doctor.native_goal_available, true);
  assert.deepEqual(doctor.missing_agents, []);
  assert.deepEqual(doctor.stale_agents, []);
  assert.match(readFileSync(join(context.claudeHome, "commands", "goalbuddy.md"), "utf8"), /state\.yaml/);
}
