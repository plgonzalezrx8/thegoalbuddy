#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registryLookup, parseVersion } from "./npm-registry.mjs";

export function checkPublishStatus({ pkg, runNpm } = {}) {
  parseVersion(pkg.version);
  const lookup = registryLookup(`${pkg.name}@${pkg.version}`, "version", runNpm);
  if (lookup.missing) return { alreadyPublished: false, version: pkg.version };
  if (lookup.data !== pkg.version) throw new Error("Registry returned an unexpected version; publication is blocked.");
  return { alreadyPublished: true, version: pkg.version };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    const report = checkPublishStatus({ pkg });
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `already_published=${report.alreadyPublished}\npackage_version=${report.version}\n`);
    console.log(`${pkg.name}@${report.version} is ${report.alreadyPublished ? "already published; skipping publication" : "not published"}.`);
  } catch (error) {
    console.error(`Publish status check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
