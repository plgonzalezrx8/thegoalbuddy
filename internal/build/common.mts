import { createHash } from "node:crypto";
import { releaseInputFingerprint } from "../cli/release-inputs.mjs";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export interface GeneratedFile { source: string; output: string; project: "node" | "browser" }
export interface GeneratedInventory { version: 1; files: GeneratedFile[] }
export const runtimeRoots = ["internal/cli", "goalbuddy/scripts", "goalbuddy/surfaces/local-goal-board/scripts"];
export const browserRoots = ["internal/site", "goalbuddy/surfaces/local-goal-board/ui"];
export const repoRoot = resolve(process.env.THEGOALBUDDY_TEST_ROOT || process.cwd());

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
export function safeRelative(path: string): boolean { return path.length > 0 && !path.startsWith("/") && !path.includes("\\") && !path.split("/").some(part => part === ".." || part === "." || part === ""); }
export function readInventory(value: unknown): GeneratedInventory {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.files)) throw new Error("Invalid generated-file inventory.");
  const files: GeneratedFile[] = [];
  const outputs = new Set<string>();
  for (const item of value.files) {
    if (!record(item) || typeof item.source !== "string" || typeof item.output !== "string" || !safeRelative(item.source) || !safeRelative(item.output)) throw new Error("Unsafe generated-file inventory entry.");
    const source = item.source;
    const node = item.project === "node" && runtimeRoots.some(root => source.startsWith(root + "/")) && source.endsWith(".mts") && item.output === source.slice(0, -4) + ".mjs";
    const browser = item.project === "browser" && browserRoots.some(root => source.startsWith(root + "/")) && source.endsWith(".ts") && item.output === source.slice(0, -3) + ".js";
    if (!node && !browser || outputs.has(item.output)) throw new Error("Inventory output is outside its owned TypeScript source mapping.");
    outputs.add(item.output);
    files.push({ source: item.source, output: item.output, project: node ? "node" : "browser" });
  }
  return { version: 1, files };
}

export function filesIn(root: string, subdirectory: string): string[] {
  const full = join(root, subdirectory);
  if (!existsSync(full)) return [];
  return readdirSync(full, { withFileTypes: true }).flatMap(entry => {
    if (["node_modules", ".git", ".build", ".goalbuddy-board", "dist"].includes(entry.name)) return [];
    const file = join(subdirectory, entry.name).replaceAll("\\", "/");
    if (entry.isSymbolicLink()) throw new Error(`Unsupported symlink in maintained tree: ${file}`);
    return entry.isDirectory() ? filesIn(root, file) : entry.isFile() ? [file] : [];
  }).sort();
}

export function discoverInventory(root = repoRoot): GeneratedInventory {
  const files: GeneratedFile[] = [];
  for (const directory of runtimeRoots) for (const source of filesIn(root, directory).filter(file => file.endsWith(".mts")))
    files.push({ source, output: source.slice(0, -4) + ".mjs", project: "node" });
  for (const directory of browserRoots) for (const source of filesIn(root, directory).filter(file => file.endsWith(".ts") && !file.endsWith(".d.ts")))
    files.push({ source, output: source.slice(0, -3) + ".js", project: "browser" });
  return { version: 1, files: files.sort((a, b) => a.source.localeCompare(b.source, "en")) };
}

export function run(command: string, args: string[], root = repoRoot, env: NodeJS.ProcessEnv = process.env): void {
  const result = spawnSync(command, args, { cwd: root, env, encoding: "utf8", stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command failed (${result.status ?? "signal"}): ${command} ${args.join(" ")}`);
}

export function compile(project: "node" | "browser" | "tests", destination: string, root = repoRoot): void {
  run(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", `tsconfig.${project}.json`, "--outDir", destination], root);
}

export function generatedBytes(source: string, emitted: string): string {
  const notice = `// Generated from ${source}; do not edit.\n`;
  if (emitted.startsWith("#!")) {
    const end = emitted.indexOf("\n");
    return emitted.slice(0, end + 1) + notice + emitted.slice(end + 1);
  }
  return notice + emitted;
}

export function isDirectRun(url: string): boolean {
  return Boolean(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(url));
}

export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
export function hash(bytes: string | Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }
export function writeJson(path: string, value: unknown): void { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + "\n"); }
export function inputFingerprint(root = repoRoot): { fingerprint: string; files: Array<{ path: string; sha256: string }> } {
  return releaseInputFingerprint(root);
}

export function rootFromArguments(args: string[]): string {
  const index = args.indexOf("--root");
  return index >= 0 && args[index + 1] ? resolve(args[index + 1]) : repoRoot;
}
