import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function sanitizeFixtureEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !/(?:token|api.?key|secret|password|credential)/i.test(key)));
}
export function installFixtureCommand(root: string, name: string, fixture: "codex" | "npm", fixtureArgs: string[] = []): string {
  mkdirSync(root, { recursive: true });
  const fixturePath = join(dirname(fileURLToPath(import.meta.url)), `cli-${fixture}.mjs`);
  const args = [process.execPath, fixturePath, ...fixtureArgs];
  const executable = join(root, `${name}${process.platform === "win32" ? ".cmd" : ""}`);
  const quoteShell = (arg: string): string => `'${arg.replaceAll("'", "'\\''")}'`;
  const quoteCmd = (arg: string): string => `"${arg.replaceAll('"', '""')}"`;
  const wrapper = process.platform === "win32"
    ? `@echo off\r\n${args.map(quoteCmd).join(" ")} %*\r\n`
    : `#!/bin/sh\nexec ${args.map(quoteShell).join(" ")} "$@"\n`;
  writeFileSync(executable, wrapper);
  chmodSync(executable, 0o755);
  return root;
}
