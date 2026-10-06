// Generated from goalbuddy/scripts/install-channel.mts; do not edit.
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { isRecord } from "./value.mjs";
const commands = Object.freeze({
    npm: "npx thegoalbuddy@latest",
    "npm-global": "npm install -g thegoalbuddy@latest",
    pnpm: "pnpm update -g thegoalbuddy",
    bun: "bun update -g thegoalbuddy",
    mise: "mise upgrade npm:thegoalbuddy",
    "claude-plugin": "/plugin update thegoalbuddy@thegoalbuddy",
    "codex-plugin": "codex plugin marketplace upgrade thegoalbuddy",
    source: "update the source checkout and rerun its thegoalbuddy installer",
});
function readJson(path) {
    try {
        const parsed = JSON.parse(readFileSync(path, "utf8"));
        return isRecord(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
function ancestors(path) {
    const result = [];
    for (let dir = resolve(path);; dir = dirname(dir)) {
        result.push(dir);
        if (dir === dirname(dir))
            return result;
    }
}
function contains(root, path) {
    const rel = relative(resolve(root), resolve(path));
    return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep));
}
export function detectInstallChannel(scriptDir, env = process.env) {
    // Persisted provenance belongs to this installation, unlike its caller's environment.
    for (const dir of ancestors(scriptDir)) {
        for (const file of [".goalbuddy-install.json", ".goalbuddy-package-install.json"]) {
            const metadata = readJson(join(dir, file));
            if (metadata?.package_name === "thegoalbuddy" && typeof metadata.install_channel === "string" && isInstallChannel(metadata.install_channel)) {
                return metadata.install_channel;
            }
        }
    }
    if (env.CLAUDE_PLUGIN_ROOT && contains(env.CLAUDE_PLUGIN_ROOT, scriptDir)) {
        const manifest = readJson(join(env.CLAUDE_PLUGIN_ROOT, ".claude-plugin", "plugin.json"));
        if (manifest?.name === "thegoalbuddy")
            return "claude-plugin";
    }
    for (const dir of ancestors(scriptDir)) {
        const path = dir.replaceAll("\\", "/");
        if (path.includes("/.claude/plugins/") && readJson(join(dir, ".claude-plugin", "plugin.json"))?.name === "thegoalbuddy")
            return "claude-plugin";
        if (path.includes("/plugins/cache/") && readJson(join(dir, ".codex-plugin", "plugin.json"))?.name === "thegoalbuddy")
            return "codex-plugin";
    }
    const userAgent = env.npm_config_user_agent || "";
    if (/^pnpm\//.test(userAgent))
        return "pnpm";
    if (/^bun\//.test(userAgent))
        return "bun";
    if (env.MISE_EXE || env.MISE_SHELL || env.MISE_PROJECT_ROOT)
        return "mise";
    const normalized = resolve(scriptDir).replaceAll("\\", "/");
    if (env.npm_config_global === "true" || env.npm_config_location === "global" || normalized.includes("/lib/node_modules/thegoalbuddy/") || normalized.endsWith("/lib/node_modules/thegoalbuddy"))
        return "npm-global";
    if (normalized.includes("/node_modules/thegoalbuddy/") || normalized.endsWith("/node_modules/thegoalbuddy") || /^npm\//.test(userAgent))
        return "npm";
    return "unknown";
}
export function detectUpdateCommand(scriptDir, env = process.env) {
    if (env.GOALBUDDY_TEST_UPDATE_COMMAND)
        return env.GOALBUDDY_TEST_UPDATE_COMMAND;
    const channel = detectInstallChannel(scriptDir, env);
    return (channel === "unknown" ? undefined : commands[channel]) || "use the install channel that installed thegoalbuddy";
}
export function findInstalledVersion(scriptDir) {
    for (const dir of ancestors(scriptDir)) {
        const metadata = readJson(join(dir, ".goalbuddy-install.json"));
        if (metadata?.package_name === "thegoalbuddy" && metadata.package_version)
            return metadata.package_version;
        for (const path of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", "package.json"]) {
            const data = readJson(join(dir, path));
            if (data?.name === "thegoalbuddy" && data.version)
                return data.version;
        }
    }
    return "0.0.0";
}
function isInstallChannel(value) { return Object.hasOwn(commands, value); }
