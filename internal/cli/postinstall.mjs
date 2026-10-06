#!/usr/bin/env node
// Generated from internal/cli/postinstall.mts; do not edit.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { detectInstallChannel } from "../../goalbuddy/scripts/install-channel.mjs";
const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, "goal-maker.mjs");
const globalInstall = process.env.npm_config_global === "true"
    || process.env.npm_config_location === "global";
// Keep acquisition provenance after npm's transient environment disappears.
const packageRoot = join(__dirname, "../..");
if (/\/node_modules\/thegoalbuddy(?:\/|$)/.test(packageRoot.replaceAll("\\", "/"))) {
    writeFileSync(join(packageRoot, ".goalbuddy-package-install.json"), `${JSON.stringify({
        package_name: "thegoalbuddy", install_channel: detectInstallChannel(__dirname),
    }, null, 2)}\n`);
}
if (!globalInstall || process.env.GOALBUDDY_SKIP_POSTINSTALL) {
    process.exit(0);
}
const result = spawnSync(process.execPath, [cliPath], {
    encoding: "utf8",
    env: process.env,
    stdio: "inherit",
});
if (result.status === 0) {
    process.exit(0);
}
console.error("");
console.error("thegoalbuddy installed globally, but setup did not complete for every target.");
console.error("Run this after Codex and Claude Code are available:");
console.error("  thegoalbuddy");
process.exit(0);
