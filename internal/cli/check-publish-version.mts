#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJson, parsePackage, errorMessage, type NpmRunner } from "./contracts.mjs";
import { registryLookup, parseVersion, compareVersions } from "./npm-registry.mjs";

export function verifyPublishVersion({ pkg: rawPackage, runNpm }: { pkg?: unknown; runNpm?: NpmRunner } = {}) {
  const pkg = parsePackage(rawPackage);
  parseVersion(pkg.version);
  const lookup = registryLookup(pkg.name, "versions", runNpm);
  if (lookup.missing) return { version: pkg.version, latest: null };
  const versions = typeof lookup.data === "string" ? [lookup.data] : lookup.data;
  if (!Array.isArray(versions) || !versions.length) throw new Error("Published versions must be a nonempty JSON version list.");
  for (const version of versions) parseVersion(version);
  const latest = [...versions].sort(compareVersions).at(-1);
  if (typeof latest !== "string") throw new Error("Published versions must contain strings.");
  if (versions.some(version => compareVersions(version, pkg.version) === 0)) {
    throw new Error(`${pkg.name}@${pkg.version} has already been published. Bump package.json before publishing.`);
  }
  if (compareVersions(pkg.version, latest) <= 0) {
    throw new Error(`${pkg.name}@${pkg.version} must be greater than the latest published version ${latest}.`);
  }
  return { version: pkg.version, latest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const pkg = parsePackage(parseJson(readFileSync(resolve(root, "package.json"), "utf8")));
    const report = verifyPublishVersion({ pkg });
    console.log(`Publish version check passed: ${pkg.name}@${report.version}${report.latest ? ` > published ${report.latest}` : " has no published versions"}.`);
  } catch (error) {
    console.error(`Publish version check failed: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}
