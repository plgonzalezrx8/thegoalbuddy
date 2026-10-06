#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { detectUpdateCommand, findInstalledVersion } from "./install-channel.mjs";

import { errorMessage } from "./value.mjs";

interface UpdateReport { package: string; current_version: string; latest_version: string | null; update_available: boolean; check_status: string; update_command: string; error?: string; }

const packageName = "thegoalbuddy";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const report: UpdateReport = {
  package: packageName,
  current_version: normalizeVersion(findInstalledVersion(scriptDir)),
  latest_version: null,
  update_available: false,
  check_status: "unknown",
  update_command: detectUpdateCommand(scriptDir),
};

try {
  report.latest_version = latestPublishedVersion();
  report.update_available = compareVersions(report.current_version, report.latest_version) < 0;
  report.check_status = "ok";
} catch (error) {
  report.check_status = "unavailable";
  report.error = errorMessage(error);
}

if (args.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else if (report.check_status !== "ok") {
  console.log(`thegoalbuddy update check unavailable: ${report.error}`);
} else if (report.update_available) {
  console.log(`thegoalbuddy ${report.latest_version} is available; installed version is ${report.current_version}.`);
  console.log(`Update with: ${report.update_command}`);
} else {
  console.log(`thegoalbuddy is up to date (${report.current_version}).`);
}

function latestPublishedVersion() {
  if (process.env.GOALBUDDY_TEST_NPM_LATEST_VERSION) {
    return normalizeVersion(process.env.GOALBUDDY_TEST_NPM_LATEST_VERSION);
  }

  const result = spawnSync("npm", ["view", packageName, "version"], {
    cwd: resolve(scriptDir, ".."),
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 5000,
    env: {
      ...process.env,
      npm_config_update_notifier: "false",
    },
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = `${result.stderr || ""}${result.stdout || ""}`.trim();
    throw new Error(output || `npm view exited with status ${result.status}`);
  }

  return normalizeVersion(result.stdout);
}

function normalizeVersion(value: unknown) {
  const match = String(value).trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) throw new Error(`Unsupported version: ${value}`);
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

function compareVersions(left: string, right: string) {
  const leftParts = normalizeVersion(left).split(".").map(Number);
  const rightParts = normalizeVersion(right).split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}
