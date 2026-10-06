/** Shared release provenance; depends only on Node builtins. */
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export interface ReleaseInput { path: string; sha256: string }
export interface ReleaseInputs { fingerprint: string; files: ReleaseInput[] }
export const releaseInputExclusions = ["audit/", "docs/goals/", "recovery/", ".git/", "node_modules/", ".build/", "dist/", ".goalbuddy-board/", ".env*", "*.log", "*.tgz", "*.zip", "*.7z"];
export function sha256(bytes: string | Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }
export function releaseInputFingerprint(root: string): ReleaseInputs {
  const files: ReleaseInput[] = [];
  const skipped = new Set([".git", "node_modules", ".build", "dist", ".goalbuddy-board", ".DS_Store"]);
  function walk(directory: string): void {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      if (skipped.has(entry.name) || /^(audit|recovery)(\/|$)|^docs\/goals(\/|$)/.test(path)
        || /^\.env(?:\.|$)/.test(entry.name) || /\.(log|tgz|zip|7z)$/.test(entry.name)) continue;
      if (entry.isSymbolicLink()) throw new Error(`Unsupported symlink in release inputs: ${path}`);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.push({ path, sha256: sha256(readFileSync(join(root, path))) });
      else throw new Error(`Unsupported release input: ${path}`);
    }
  }
  if (!lstatSync(resolve(root)).isDirectory()) throw new Error("Release root must be a directory.");
  walk("");
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { files, fingerprint: sha256(JSON.stringify(files)) };
}
export function sourceCommit(root: string): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", timeout: 10000 });
  const value = result.stdout?.trim();
  if (result.error || result.status !== 0 || !/^[a-f0-9]{40,64}$/.test(value || "")) throw new Error("Cannot establish actual source commit for release verification.");
  return value;
}
