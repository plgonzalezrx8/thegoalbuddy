#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourceDir = resolve(__dirname, "../agents");
const scriptArgs = process.argv.slice(2);
const force = scriptArgs.includes("--force");
const destArg = scriptArgs.find((arg) => !arg.startsWith("-"));
const defaultDest = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "agents");
const destDir = resolve(destArg || defaultDest);

if (!existsSync(sourceDir)) {
  console.error(`agent definitions not found: ${sourceDir}`);
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });

const files = readdirSync(sourceDir).filter((f) => f.endsWith(".toml") && !f.includes("config-snippet"));
for (const file of files) {
  const src = join(sourceDir, file);
  const dest = join(destDir, file);
  if (existsSync(dest) && !force) {
    console.log(`skip existing ${dest} (use --force to overwrite)`);
    continue;
  }
  copyFileSync(src, dest);
  console.log(`installed ${dest}`);
}
