#!/usr/bin/env node
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Node accepts one source per --check invocation; shell globs do not check each file.
const roots = [
  "internal/cli",
  "goalbuddy/scripts",
  "goalbuddy/surfaces/local-goal-board/scripts",
  "goalbuddy/surfaces/local-goal-board/ui",
];
const files: string[] = [];
function collect(root: string) {
  for (const name of readdirSync(root).sort()) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) collect(path);
    else if (/\.(mjs|js)$/.test(name)) files.push(path);
  }
}
for (const root of roots) collect(resolve(root));
for (const path of files) {
  const result = spawnSync(process.execPath, ["--check", path], {
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    process.stderr.write(
      result.stderr ||
        result.error?.message ||
        `Syntax check failed: ${path}\n`,
    );
    process.exitCode = 1;
    break;
  }
}
if (!process.exitCode)
  console.log(`Syntax checked ${files.length} source modules.`);
