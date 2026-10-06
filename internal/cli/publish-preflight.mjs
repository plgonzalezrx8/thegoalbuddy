#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPublishIdentity } from "./check-publish-identity.mjs";
import { verifyPublishVersion } from "./check-publish-version.mjs";
import { checkPackage, packageRoot } from "./check-package.mjs";

export function publishPreflight({ root = packageRoot, pkg, runNpm, runStep = runRequiredStep, inspectPackage = checkPackage, env = process.env } = {}) {
  pkg ??= JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const identity = verifyPublishIdentity({ pkg, env, runNpm });
  const version = verifyPublishVersion({ pkg, runNpm });
  runStep("npm", ["run", "check"], root);
  runStep(process.execPath, ["internal/cli/sync-skill-tree.mjs"], root);
  const contents = inspectPackage({ root });
  return { identity, version, contents };
}

function runRequiredStep(command, args, root) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", timeout: 180000, shell: process.platform === "win32" });
  if (result.error || result.status !== 0) throw new Error(`Required release check failed: ${command} ${args.join(" ")}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = publishPreflight();
    console.log(`Publish preflight passed: ${report.contents.name}@${report.contents.version}; identity, eligible version, full checks, mirror and package contents verified.`);
  } catch (error) {
    console.error(`Publish preflight failed: ${error.message}`);
    process.exitCode = 1;
  }
}
