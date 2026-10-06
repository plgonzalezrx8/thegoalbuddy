import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { browserRoots, compile, discoverInventory, errorMessage, filesIn, generatedBytes, isDirectRun, readInventory, repoRoot, run, runtimeRoots, safeRelative, writeJson } from "./common.mjs";

interface SavedFile { path: string; backup: string | null; temporary: string }
interface Transaction { version: 1; files: SavedFile[] }

function managed(path: string): boolean {
  return safeRelative(path) && (path === "internal/build/generated-files.json" || runtimeRoots.some(root => path.startsWith(root + "/") && path.endsWith(".mjs")) || browserRoots.some(root => path.startsWith(root + "/") && path.endsWith(".js")) || path.startsWith("plugins/goalbuddy/skills/goal-prep/") && !path.split("/").includes(".goalbuddy-board"));
}

function rejectSymlinkAncestors(root: string, path: string): void {
  const base = resolve(root);
  let current = base;
  if (lstatSync(base).isSymbolicLink()) throw new Error("Symlink release root is unsupported.");
  for (const part of relative(base, resolve(base, path)).split(/[\\/]/)) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error("Symlink in generated recovery path; no mutations performed.");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") break;
      throw error;
    }
  }
}

function readTransaction(value: unknown, root: string): Transaction {
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("files" in value) || !Array.isArray(value.files)) throw new Error("Invalid interrupted build journal; retain it for recovery.");
  const files: SavedFile[] = [];
  for (const entry of value.files) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || !("path" in entry) || typeof entry.path !== "string" || !managed(entry.path) || !("backup" in entry) || entry.backup !== null && typeof entry.backup !== "string" || !("temporary" in entry) || typeof entry.temporary !== "string" || !entry.temporary.startsWith(entry.path + ".generated-") || !safeRelative(entry.temporary)) throw new Error("Unsafe build journal entry; no recovery mutations performed.");
    rejectSymlinkAncestors(root, entry.path);
    rejectSymlinkAncestors(root, entry.temporary);
    if (typeof entry.backup === "string") {
      const backup = relative(root, resolve(entry.backup)).replaceAll("\\", "/");
      if (!/^\.build\/emit-[^/]+\/backup-\d+$/.test(backup)) throw new Error("Unsafe build journal backup location.");
      rejectSymlinkAncestors(root, backup);
      if (!existsSync(entry.backup)) throw new Error("Build recovery backup is missing; retain the journal.");
    }
    files.push({ path: entry.path, backup: entry.backup, temporary: entry.temporary });
  }
  return { version: 1, files };
}

export function recoverBuild(root = repoRoot): void {
  rejectSymlinkAncestors(root, ".build/promotion.json");
  const journal = join(root, ".build/promotion.json");
  if (!existsSync(journal)) return;
  const transaction = readTransaction(JSON.parse(readFileSync(journal, "utf8")), root);
  for (const entry of transaction.files) {
    const target = join(root, entry.path);
    if (entry.backup) { mkdirSync(dirname(target), { recursive: true }); copyFileSync(entry.backup, target); }
    else rmSync(target, { force: true });
    rmSync(join(root, entry.temporary), { force: true });
  }
  rmSync(journal);
}

export function build(root = repoRoot): void {
  rejectSymlinkAncestors(root, ".build");
  mkdirSync(join(root, ".build"), { recursive: true });
  const lock = join(root, ".build/build.lock");
  // Never unlink/reclaim a lock automatically: concurrent reclaimers could remove
  // each other's newly acquired lock. Interrupted owners require explicit recovery.
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8"));
    let running = Number.isInteger(pid) && pid > 0;
    if (running) try { process.kill(pid, 0); } catch { running = false; }
    throw new Error(running ? "Another build owns the generated runtime lock." : "Stale build lock: verify its recorded owner has stopped, then explicitly remove .build/build.lock and rerun build for transaction recovery.");
  }
  writeFileSync(lock, String(process.pid), { flag: "wx" });
  let stage: string | undefined;
  try {
    stage = mkdtempSync(join(root, ".build/emit-"));
    recoverBuild(root);
    compile("node", join(stage, "node"), root);
    compile("browser", join(stage, "browser"), root);
    const inventory = discoverInventory(root);
    if (!inventory.files.length) throw new Error("No TypeScript runtime source found.");
    const changes = new Map<string, Buffer | null>();
    for (const file of inventory.files) {
      const bytes = Buffer.from(generatedBytes(file.source, readFileSync(join(stage, file.project, file.output), "utf8")));
      changes.set(file.output, bytes);
      if (file.source.startsWith("goalbuddy/")) changes.set("plugins/goalbuddy/skills/goal-prep/" + file.output.slice("goalbuddy/".length), bytes);
    }
    const previousPath = join(root, "internal/build/generated-files.json");
    if (existsSync(previousPath)) {
      const previous = readInventory(JSON.parse(readFileSync(previousPath, "utf8")));
      for (const file of previous.files) if (!changes.has(file.output)) {
        changes.set(file.output, null);
        if (file.output.startsWith("goalbuddy/")) changes.set("plugins/goalbuddy/skills/goal-prep/" + file.output.slice("goalbuddy/".length), null);
      }
    }
    changes.set("internal/build/generated-files.json", Buffer.from(JSON.stringify(inventory, null, 2) + "\n"));
    // Canonical source/assets/instructions are mirrored as bytes; no second compile.
    const canonical = filesIn(root, "goalbuddy").filter(path => changes.get(path) !== null);
    const mirrorPrefix = "plugins/goalbuddy/skills/goal-prep/";
    for (const path of canonical) if (!changes.has(path)) changes.set(mirrorPrefix + path.slice("goalbuddy/".length), readFileSync(join(root, path)));
    const wanted = new Set([...canonical.map(path => mirrorPrefix + path.slice("goalbuddy/".length)), ...[...changes.keys()].filter(path => path.startsWith(mirrorPrefix) && changes.get(path) !== null)]);
    for (const path of filesIn(root, mirrorPrefix)) if (!wanted.has(path)) changes.set(path, null);
    const transaction: Transaction = { version: 1, files: [] };
    let index = 0;
    for (const path of changes.keys()) {
      const target = join(root, path);
      const backup = existsSync(target) ? join(stage, `backup-${index++}`) : null;
      if (backup) copyFileSync(target, backup);
      transaction.files.push({ path, backup, temporary: `${path}.generated-${process.pid}` });
    }
    writeJson(join(root, ".build/promotion.json"), transaction);
    for (const [path, bytes] of changes) {
      const target = join(root, path);
      if (bytes === null) rmSync(target, { force: true });
      else {
        mkdirSync(dirname(target), { recursive: true });
        const temporary = join(root, `${path}.generated-${process.pid}`);
        writeFileSync(temporary, bytes, { mode: bytes.toString("utf8", 0, 2) === "#!" ? 0o755 : 0o644 });
        renameSync(temporary, target);
      }
    }
    run(process.execPath, ["internal/cli/sync-skill-tree.mjs"], root);
    rmSync(join(root, ".build/promotion.json"));
    console.log(`Generated ${inventory.files.length} TypeScript runtime modules; canonical/plugin payloads match.`);
  } catch (error) {
    recoverBuild(root);
    throw error;
  } finally {
    if (existsSync(lock) && readFileSync(lock, "utf8") === String(process.pid)) rmSync(lock);
    // Preserve scratch/backups whenever rollback has not completed.
    if (stage && !existsSync(join(root, ".build/promotion.json"))) rmSync(stage, { recursive: true, force: true });
  }
}

if (isDirectRun(import.meta.url)) try { build(); } catch (error) { console.error(errorMessage(error)); process.exitCode = 1; }
