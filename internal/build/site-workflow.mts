import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { buildSite } from "./build-site.mjs";
import { errorMessage, filesIn, isDirectRun, repoRoot } from "./common.mjs";

// Explicit portable adapter: the connector's packaged helper is unavailable on
// this executor. Implements its source/commit/archive contract using native Git.
interface Credential { remote_url: string; token: string; branch: string; auth_mode: string; token_expires_at: string }
interface Packet { project_id: string; credential: Credential; checkout: string; archivePath: string }
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function packet(value: unknown): Packet {
  if (!object(value) || typeof value.project_id !== "string" || typeof value.checkout !== "string" || typeof value.archivePath !== "string" || !object(value.credential)) throw new Error("Invalid Sites workflow packet.");
  const c = value.credential;
  if (typeof c.remote_url !== "string" || typeof c.token !== "string" || typeof c.branch !== "string" || typeof c.auth_mode !== "string" || typeof c.token_expires_at !== "string") throw new Error("Incomplete Sites credential metadata.");
  if (!c.remote_url.startsWith("https://") || c.auth_mode !== "http_extra_header" || !/^[\w/-]+$/.test(c.branch) || c.branch.includes("..") || Date.parse(c.token_expires_at) <= Date.now()) throw new Error("Unsupported or expired Sites source credential.");
  return { project_id: value.project_id, checkout: resolve(value.checkout), archivePath: resolve(value.archivePath), credential: { remote_url: c.remote_url, token: c.token, branch: c.branch, auth_mode: c.auth_mode, token_expires_at: c.token_expires_at } };
}
function git(args: string[], checkout: string, env: NodeJS.ProcessEnv = process.env): string {
  const result = spawnSync("git", args, { cwd: checkout, env, encoding: "utf8", timeout: 120000 });
  // Never retain Git authentication/remote diagnostics; they may reflect headers.
  if (result.error || result.status !== 0) throw new Error(`Sites Git operation failed: ${args[0]} (status ${result.status ?? "signal"}).`);
  return result.stdout.trim();
}
export function prepareSite(value: unknown): { project_id: string; commit_sha: string; archive: string; sourceFingerprint: string; archiveSha256: string } {
  const input = packet(value);
  const manifestPath = join(input.checkout, ".openai/hosting.json");
  const hosting: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!object(hosting) || hosting.project_id !== input.project_id || !object(hosting.static) || hosting.static.directory !== "dist") throw new Error("Sites identity/static manifest does not match this workflow.");
  buildSite();
  const sourceFiles = filesIn(repoRoot, "internal/site").filter(path => !path.endsWith("DNS.md") && !path.endsWith(".html") || path === "internal/site/index.html");
  const entries = sourceFiles.map(path => ({ path, sha256: createHash("sha256").update(readFileSync(join(repoRoot, path))).digest("hex") }));
  const sourceFingerprint = createHash("sha256").update(JSON.stringify(entries)).digest("hex");
  for (const directory of ["site", "dist"]) rmSync(join(input.checkout, directory), { recursive: true, force: true });
  for (const path of sourceFiles) {
    const target = join(input.checkout, "site", path.slice("internal/site/".length));
    mkdirSync(dirname(target), { recursive: true }); copyFileSync(join(repoRoot, path), target);
  }
  for (const path of filesIn(repoRoot, "dist")) {
    const target = join(input.checkout, path);
    mkdirSync(dirname(target), { recursive: true }); copyFileSync(join(repoRoot, path), target);
  }
  writeFileSync(join(input.checkout, "source-manifest.json"), JSON.stringify({ adapter: "portable-typescript-sites", sourceFingerprint, files: entries }, null, 2) + "\n");
  writeFileSync(join(input.checkout, ".gitignore"), "node_modules/\n.env\n.env.*\n");
  writeFileSync(join(input.checkout, "README.md"), "# thegoalbuddy website\n\nGenerated deployment checkout from thegoalbuddy/internal/site. Edit the canonical repository and re-export; never maintain a separate website here. JavaScript is TypeScript-generated runtime only.\n");
  if (!existsSync(join(input.checkout, ".git"))) git(["init", "--initial-branch", input.credential.branch], input.checkout);
  const remotes = git(["remote"], input.checkout).split("\n");
  if (remotes.includes("origin")) git(["remote", "set-url", "origin", input.credential.remote_url], input.checkout);
  else git(["remote", "add", "origin", input.credential.remote_url], input.checkout);
  git(["add", "--", ".openai/hosting.json", ".gitignore", "README.md", "source-manifest.json", "site", "dist"], input.checkout);
  const changed = git(["status", "--porcelain"], input.checkout);
  if (changed) git(["-c", "user.name=Codex", "-c", "user.email=codex@localhost", "commit", "-m", "Deploy TypeScript-generated thegoalbuddy website"], input.checkout);
  const commit_sha = git(["rev-parse", "HEAD"], input.checkout);
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${input.credential.token}`, GIT_CONFIG_KEY_1: "credential.helper", GIT_CONFIG_VALUE_1: "" };
  git(["push", "origin", `HEAD:refs/heads/${input.credential.branch}`], input.checkout, env);
  const remote = git(["ls-remote", "origin", `refs/heads/${input.credential.branch}`], input.checkout, env).split(/\s+/)[0];
  if (remote !== commit_sha) throw new Error("Pushed Sites source does not match the local archive inputs.");
  mkdirSync(dirname(input.archivePath), { recursive: true });
  const archive = spawnSync("tar", ["-cf", input.archivePath, "--", ".openai/hosting.json", "dist"], { cwd: input.checkout, encoding: "utf8" });
  if (archive.error || archive.status !== 0) throw new Error("Unable to package matching Sites static deployment archive.");
  if (git(["status", "--porcelain"], input.checkout)) throw new Error("Sites checkout changed after source push/archive.");
  return { project_id: input.project_id, commit_sha, archive: input.archivePath, sourceFingerprint, archiveSha256: createHash("sha256").update(readFileSync(input.archivePath)).digest("hex") };
}
if (isDirectRun(import.meta.url)) {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdout.write("Ready for Sites workflow JSON on stdin (input is hidden).\n");
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    if (!buffer.includes("\n")) return;
    process.stdin.pause();
    try { const input: unknown = JSON.parse(buffer.slice(0, buffer.indexOf("\n"))); buffer = ""; console.log(JSON.stringify(prepareSite(input))); }
    catch (error) { console.error(errorMessage(error)); process.exitCode = 1; }
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.destroy();
  });
}
