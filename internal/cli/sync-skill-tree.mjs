#!/usr/bin/env node
// Generated from internal/cli/sync-skill-tree.mts; do not edit.
// Keeps plugins/goalbuddy/skills/goal-prep a byte-exact mirror of goalbuddy/.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const canonicalRoot = join(repoRoot, "goalbuddy");
const mirrorRoot = join(repoRoot, "plugins", "goalbuddy", "skills", "goal-prep");
const ignoredNames = new Set([".DS_Store"]);
const ignoredDirs = new Set([".goalbuddy-board"]);
const write = process.argv.includes("--write");
const canonicalFiles = listFiles(canonicalRoot);
const mirrorFiles = listFiles(mirrorRoot);
const missing = [];
const changed = [];
const extra = [...mirrorFiles].filter((file) => !canonicalFiles.has(file));
for (const file of canonicalFiles) {
    if (!mirrorFiles.has(file)) {
        missing.push(file);
    }
    else if (!readFileSync(join(canonicalRoot, file)).equals(readFileSync(join(mirrorRoot, file)))) {
        changed.push(file);
    }
}
if (write) {
    for (const file of [...missing, ...changed]) {
        const dest = join(mirrorRoot, file);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(join(canonicalRoot, file), dest);
        console.log(`synced ${file}`);
    }
    for (const file of extra) {
        rmSync(join(mirrorRoot, file));
        console.log(`removed extra ${file}`);
    }
    console.log("Plugin skill tree matches goalbuddy/.");
}
else if (missing.length || changed.length || extra.length) {
    for (const file of missing)
        console.error(`missing in mirror: ${file}`);
    for (const file of changed)
        console.error(`differs: ${file}`);
    for (const file of extra)
        console.error(`extra in mirror: ${file}`);
    console.error("Run: npm run sync:plugin");
    process.exit(1);
}
else {
    console.log("Plugin skill tree matches goalbuddy/.");
}
function listFiles(root, dir = root, files = new Set()) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (ignoredNames.has(entry.name))
            continue;
        if (entry.isDirectory() && ignoredDirs.has(entry.name))
            continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory())
            listFiles(root, path, files);
        else
            files.add(relative(root, path).split(sep).join("/"));
    }
    return files;
}
