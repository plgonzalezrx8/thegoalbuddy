#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { errorMessage, isRecord, parseJson, parsePackage, type CommandResult } from "./contracts.mjs";

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const trees = ["goalbuddy", "plugins/goalbuddy", "internal/cli", "internal/assets", "docs/releases", "docs/spec"];
const singleFiles = ["package.json", "LICENSE", "README.md", "BRANDING.md", "CONTRIBUTING.md", "CHANGELOG.md",
  ".agents/plugins/marketplace.json", ".claude-plugin/marketplace.json"];
const pluginManifests = ["plugins/goalbuddy/.codex-plugin/plugin.json", "plugins/goalbuddy/.claude-plugin/plugin.json"];
export interface PackageContentsReport { name: string; version: string; files: number }
export interface PackageInspectionOptions { root?: string; runPack?: (args: string[]) => CommandResult }

export function verifyManifestParity(rawPackage: unknown, manifests: unknown[], marketplaces: unknown[]): void {
  const pkg = parsePackage(rawPackage);
  for (const manifest of manifests) {
    if (!isRecord(manifest) || manifest.name !== pkg.name || manifest.version !== pkg.version) throw new Error("Plugin manifest name/version must match package.json.");
  }
  for (const marketplace of marketplaces) {
    if (!isRecord(marketplace) || marketplace.name !== pkg.name || !Array.isArray(marketplace.plugins) || marketplace.plugins.length !== 1
      || !isRecord(marketplace.plugins[0]) || marketplace.plugins[0].name !== pkg.name) throw new Error("Marketplace name must match package.json and its single plugin.");
    const source: unknown = marketplace.plugins[0].source;
    if (source !== "./plugins/goalbuddy" && !(isRecord(source) && source.source === "local" && source.path === "./plugins/goalbuddy")) {
      throw new Error("Marketplace must target the packaged local plugin.");
    }
  }
}

function listFiles(root: string, relative: string): string[] {
  return readdirSync(join(root, relative), { withFileTypes: true }).flatMap(entry => {
    if ([".DS_Store", ".gitignore", ".goalbuddy-board", "node_modules"].includes(entry.name)) return [];
    const path = `${relative}/${entry.name}`;
    if (entry.isDirectory()) return listFiles(root, path);
    if (!entry.isFile()) throw new Error(`Unsupported runtime entry: ${path}`);
    return [path];
  });
}
/** Tests/build infrastructure are intentionally absent from installed runtime. */
function isInstallableFile(path: string): boolean {
  return !/(^|\/)(?:test|tests|fixtures|build)(?:\/|$)/.test(path)
    && !/(^|\/)tsconfig[^/]*\.json$/.test(path)
    && !/\.test\.[cm]?[jt]s$/.test(path);
}
export function expectedPackageFiles(root = packageRoot, rawPackage: unknown = parseJson(readFileSync(join(root, "package.json"), "utf8"))): string[] {
  const pkg = parsePackage(rawPackage);
  return [...new Set([...singleFiles, ...trees.flatMap(tree => listFiles(root, tree).filter(isInstallableFile)), ...Object.values(pkg.bin)])].sort();
}

export function verifyPackageContents({ root = packageRoot, pkg: rawPackage, pack }:
  { root?: string; pkg?: unknown; pack?: unknown } = {}): PackageContentsReport {
  const pkg = parsePackage(rawPackage ?? parseJson(readFileSync(join(root, "package.json"), "utf8")));
  if (!isRecord(pack) || pack.name !== pkg.name || pack.version !== pkg.version || !Array.isArray(pack.files)) {
    throw new Error("npm pack must return the intended package name, version and file list.");
  }
  const files: string[] = [];
  for (const file of pack.files) {
    if (!isRecord(file) || typeof file.path !== "string" || file.path.startsWith("/") || file.path.split("/").some(part => part === "..")) {
      throw new Error("npm pack returned an invalid file path.");
    }
    files.push(file.path);
  }
  if (new Set(files).size !== files.length) throw new Error("npm pack returned duplicate paths.");
  if (files.some(path => /^(audit\/|internal\/(?:test|build)\/|node_modules\/|\.git\/)|(^|\/)\.env(?:[./]|$)/.test(path) || !isInstallableFile(path))) {
    throw new Error("Packed artifact contains private or development-only files.");
  }
  const missing = expectedPackageFiles(root, pkg).filter(path => !files.includes(path));
  if (missing.length) throw new Error(`Packed artifact is incomplete: ${missing.join(", ")}`);
  // Preserve source as well as runtime/asset parity, independently of exclusions.
  const canonical = listFiles(root, "goalbuddy").map(path => path.slice("goalbuddy/".length)).sort();
  const mirrorPrefix = "plugins/goalbuddy/skills/goal-prep/";
  const mirror = listFiles(root, mirrorPrefix.slice(0, -1)).map(path => path.slice(mirrorPrefix.length)).sort();
  if (JSON.stringify(canonical) !== JSON.stringify(mirror)) throw new Error("Canonical and plugin skill file lists differ.");
  for (const path of canonical) {
    if (!readFileSync(join(root, "goalbuddy", path)).equals(readFileSync(join(root, mirrorPrefix, path)))) {
      throw new Error(`Canonical and plugin skill content differs: ${path}`);
    }
  }
  const readJson = (path: string): unknown => parseJson(readFileSync(join(root, path), "utf8"));
  verifyManifestParity(pkg, pluginManifests.map(readJson), singleFiles.slice(-2).map(readJson));
  return { name: pkg.name, version: pkg.version, files: files.length };
}

export function checkPackage({ root = packageRoot, runPack = args => spawnSync("npm", args, {
  cwd: root, encoding: "utf8", timeout: 30000, shell: process.platform === "win32",
}) }: PackageInspectionOptions = {}): PackageContentsReport {
  const result = runPack(["pack", "--dry-run", "--json", "--ignore-scripts"]);
  if (result.error || result.status !== 0) throw new Error("Unable to inspect npm tarball contents.");
  let packs: unknown;
  try { packs = parseJson(result.stdout || ""); } catch { throw new Error("npm pack returned malformed JSON."); }
  if (!Array.isArray(packs) || packs.length !== 1) throw new Error("npm pack must return one artifact.");
  return verifyPackageContents({ root, pack: packs[0] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { verifyReadiness } = await import("./release-readiness.mjs");
    const args = process.argv.slice(2);
    const argument = (name: string): string | undefined => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
    verifyReadiness({ root: packageRoot, reportPath: argument("--readiness") || process.env.THEGOALBUDDY_RELEASE_READINESS,
      siteCheckout: argument("--site-checkout") });
    const report = checkPackage();
    console.log(`Package check passed: ${report.name}@${report.version}, ${report.files} files, complete runtime and matching manifests.`);
  } catch (error) {
    console.error(`Package check failed: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}
