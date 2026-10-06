import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { compile, discoverInventory, errorMessage, filesIn, generatedBytes, isDirectRun, readInventory, repoRoot, run } from "./common.mjs";

export function assertOwnedJavaScript(root: string, owned: Set<string>): void {
  for (const directory of ["internal", "goalbuddy", "plugins/goalbuddy/skills/goal-prep"]) for (const path of filesIn(root, directory)) {
    if (/\.(?:mjs|cjs|js)$/.test(path) && !owned.has(path)) throw new Error(`Unowned JavaScript: ${path}. Author TypeScript and inventory generated output.`);
  }
}

export function checkGenerated(root = repoRoot): void {
  if (existsSync(join(root, ".build/promotion.json"))) throw new Error("Interrupted generated-file promotion requires build recovery.");
  if (existsSync(join(root, ".build/build.lock"))) throw new Error("Build lock present: generated outputs cannot be checked during a promotion.");
  const inventory = discoverInventory(root);
  const committed = readInventory(JSON.parse(readFileSync(join(root, "internal/build/generated-files.json"), "utf8")));
  if (JSON.stringify(committed) !== JSON.stringify(inventory)) throw new Error("Generated-file inventory is stale; run npm run build.");
  const owned = new Set(inventory.files.flatMap(file => file.source.startsWith("goalbuddy/") ? [file.output, "plugins/goalbuddy/skills/goal-prep/" + file.output.slice(10)] : [file.output]));
  assertOwnedJavaScript(root, owned);
  mkdirSync(join(root, ".build"), { recursive: true });
  const stage = mkdtempSync(join(root, ".build/check-"));
  try {
    compile("node", join(stage, "node"), root);
    compile("browser", join(stage, "browser"), root);
    for (const file of inventory.files) {
      const expected = generatedBytes(file.source, readFileSync(join(stage, file.project, file.output), "utf8"));
      if (!existsSync(join(root, file.output)) || readFileSync(join(root, file.output), "utf8") !== expected) throw new Error(`Stale or missing generated runtime: ${file.output}`);
    }
    run(process.execPath, ["internal/cli/sync-skill-tree.mjs"], root);
    console.log(`Verified ${inventory.files.length} generated modules, source ownership and exact plugin parity.`);
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

if (isDirectRun(import.meta.url)) try { checkGenerated(); } catch (error) { console.error(errorMessage(error)); process.exitCode = 1; }
