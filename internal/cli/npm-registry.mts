import { isRecord, parseJson, registryErrorCode, type NpmRunner } from "./contracts.mjs";
import { spawnSync } from "node:child_process";

export const registry = "https://registry.npmjs.org/";

export function runRegistryNpm(args: string[]) {
  return spawnSync("npm", args, {
    encoding: "utf8", timeout: 15000, shell: process.platform === "win32",
  });
}

// Only a structured npm E404 may mean an absent package/version. Raw error
// text, authentication failures, timeouts and malformed responses fail closed.
export function registryLookup(selector: string, field: string, runNpm: NpmRunner = runRegistryNpm): { missing: true } | { missing: false; data: unknown } {
  const result = runNpm(["view", selector, field, "--json", `--registry=${registry}`,
    "--fetch-timeout=10000", "--fetch-retries=0"]);
  let data: unknown;
  try { data = parseJson(result.stdout?.trim() || result.stderr?.trim() || ""); } catch { /* Fail closed below. */ }
  if (!result.error && Number.isInteger(result.status) && result.status !== null && result.status > 0 && registryErrorCode(data) === "E404") {
    return { missing: true };
  }
  if (result.error || result.status !== 0 || data === undefined || (isRecord(data) && data.error)) {
    // Registry diagnostics may contain credentials; never echo them.
    throw new Error(`Unable to verify ${selector} against the official npm registry; publication is blocked.`);
  }
  return { missing: false, data };
}

export function parseVersion(value: unknown) {
  const match = typeof value === "string" && value.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/);
  if (!match || match.slice(1, 4).some(part => !Number.isSafeInteger(Number(part))) || match[4]?.split(".").some(part => /^\d+$/.test(part) && part.length > 1 && part[0] === "0")) {
    throw new Error("Unsupported or malformed package version.");
  }
  return { numbers: match.slice(1, 4).map(Number), prerelease: match[4]?.split(".") || [] };
}

export function compareVersions(left: unknown, right: unknown) {
  const a = parseVersion(left), b = parseVersion(right);
  for (let i = 0; i < 3; i++) if (a.numbers[i] !== b.numbers[i]) return Math.sign(a.numbers[i] - b.numbers[i]);
  if (!a.prerelease.length || !b.prerelease.length) return Math.sign(b.prerelease.length - a.prerelease.length);
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const x = a.prerelease[i], y = b.prerelease[i];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) return x.length !== y.length ? Math.sign(x.length - y.length) : x < y ? -1 : 1;
    if (xn !== yn) return xn ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}
