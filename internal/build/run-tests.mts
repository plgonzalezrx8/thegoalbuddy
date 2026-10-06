import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { compile, errorMessage, filesIn, isDirectRun, repoRoot, run } from "./common.mjs";

const artifactNames = new Set(["package-artifact.test.mjs", "package-install-smoke.test.mjs"]);
const groups: Record<string, RegExp> = {
  skill: /(?:apply-receipt|check-can-stop|check-goal-state|check-update|dispatch-task|install-agents)\.test\.mjs$/,
  cli: /(?:goal-maker-cli|fork-branding|plugin-marketplace|goalbuddy-skill-policy|skill-tree-sync)\.test\.mjs$/,
  board: /local-goal-board\/test\//,
  release: /(?:check-package|check-publish-identity|check-publish-version|publish-preflight|release-workflow)\.test\.mjs$/,
};
export function runTests(group = "source", args: string[] = []): void {
  mkdirSync(join(repoRoot, ".build"), { recursive: true });
  const destination = mkdtempSync(join(repoRoot, ".build/tests-"));
  try {
  compile("tests", destination);
  // Compiled modules still resolve bundled templates/assets relative to themselves.
  // Stage immutable payload data, never operator goals or configuration.
  for (const file of ["package.json", ...filesIn(repoRoot, "goalbuddy").filter(path => !/\.(mts|ts|mjs|js|cjs)$/.test(path))]) {
    const target = join(destination, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(repoRoot, file), target);
  }
  let files = ["internal/test", "goalbuddy/surfaces/local-goal-board/test"].flatMap(dir => filesIn(destination, dir)).filter(path => path.endsWith(".test.mjs"));
  files = files.filter(file => group === "package" ? artifactNames.has(file.split("/").at(-1) || "") : !artifactNames.has(file.split("/").at(-1) || ""));
  if (groups[group]) files = files.filter(file => groups[group]!.test(file));
  if (!files.length) throw new Error(`No tests for group ${group}.`);
  const env: NodeJS.ProcessEnv = { ...process.env, THEGOALBUDDY_TEST_ROOT: repoRoot };
  if (group === "package") {
    const index = args.indexOf("--tarball");
    if (index < 0 || !args[index + 1] || !existsSync(args[index + 1]!)) throw new Error("Final package tests require --tarball <absolute verified artifact path>.");
    env.THEGOALBUDDY_TEST_TARBALL = args[index + 1];
  }
  run(process.execPath, ["--test", ...files.map(file => join(destination, file))], repoRoot, env);
  } finally { rmSync(destination, { recursive: true, force: true }); }
}
if (isDirectRun(import.meta.url)) try { runTests(process.argv[2], process.argv.slice(3)); } catch (error) { console.error(errorMessage(error)); process.exitCode = 1; }
