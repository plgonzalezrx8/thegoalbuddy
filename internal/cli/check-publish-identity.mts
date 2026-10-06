#!/usr/bin/env node
import { isRecord, parseJson, registryErrorCode, errorMessage, type NpmRunner } from "./contracts.mjs";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Release policy belongs to this fork. Do not infer authority from npm authors,
// the GitHub actor, a profile URL, or a token's mere presence.
export const target = Object.freeze({
  package: "thegoalbuddy",
  npmAccount: "plgonzalezrx8",
  repository: "plgonzalezrx8/thegoalbuddy",
  workflow: "npm-publish.yml",
  registry: "https://registry.npmjs.org/",
});

export interface IdentityOptions { pkg?: unknown; env?: NodeJS.ProcessEnv; runNpm?: NpmRunner }
export function verifyPublishIdentity({ pkg, env = process.env, runNpm = npm }: IdentityOptions = {}) {
  if (!isRecord(pkg) || pkg.name !== target.package) {
    throw new Error(`This fork may publish only ${target.package}; upstream packages are outside its release policy.`);
  }
  if ((isRecord(pkg.repository) ? pkg.repository.url : undefined) !== `git+https://github.com/${target.repository}.git`) {
    throw new Error("Package repository must point to this fork.");
  }
  if ((isRecord(pkg.publishConfig) ? pkg.publishConfig.registry : undefined) !== target.registry || (isRecord(pkg.publishConfig) ? pkg.publishConfig.access : undefined) !== "public") {
    throw new Error("Publication must target the public npm registry.");
  }

  const trusted = env.GITHUB_ACTIONS === "true";
  if (trusted) {
    const workflowPrefix = `${target.repository}/.github/workflows/${target.workflow}@`;
    if (env.GITHUB_REPOSITORY !== target.repository || env.GITHUB_EVENT_NAME !== "release"
      || !env.GITHUB_WORKFLOW_REF?.startsWith(workflowPrefix)
      || !env.GITHUB_WORKFLOW_REF.slice(workflowPrefix.length)
      || !env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
      throw new Error("Trusted publishing requires this fork's release workflow and GitHub OIDC permission.");
    }
  } else {
    const identity = runNpm(["whoami", `--registry=${target.registry}`]);
    if (identity.error || identity.status !== 0) {
      throw new Error(`npm authentication is required. Sign in as ${target.npmAccount} using browser login or the configured private environment secret.`);
    }
    if ((identity.stdout || "").trim() !== target.npmAccount) {
      throw new Error(`Publication requires npm account ${target.npmAccount}; the authenticated account does not match.`);
    }
  }

  const lookup = runNpm(["view", target.package, "name", "maintainers", "--json", `--registry=${target.registry}`]);
  let metadata: unknown;
  try { metadata = parseJson(lookup.stdout || ""); } catch { /* Invalid or missing data must fail closed. */ }
  if (lookup.error || lookup.status !== 0) {
    const missing = !lookup.error && Number.isInteger(lookup.status) && lookup.status !== null && lookup.status > 0 && registryErrorCode(metadata) === "E404";
    if (missing && !trusted) {
      return { account: target.npmAccount, package: target.package, authentication: "npm-account", state: "first-publication" };
    }
    if (missing && trusted) {
      throw new Error(`First publish ${target.package} from the authenticated ${target.npmAccount} account before configuring its trusted publisher.`);
    }
    throw new Error("Unable to verify npm package ownership; publication is blocked.");
  }
  const maintainers = isRecord(metadata) && Array.isArray(metadata.maintainers)
    ? metadata.maintainers.map((entry: unknown) => typeof entry === "string" ? entry.trim().split(/[\s<]/)[0] : isRecord(entry) ? entry.name : undefined)
    : [];
  if ((!isRecord(metadata) || metadata.name !== target.package) || !maintainers.includes(target.npmAccount)) {
    throw new Error(`${target.package} must list ${target.npmAccount} as an npm maintainer before this fork can publish it.`);
  }
  return { account: target.npmAccount, package: target.package, authentication: trusted ? "github-oidc" : "npm-account", state: "existing-package" };
}

function npm(args: string[]) {
  return spawnSync("npm", [...args, "--fetch-timeout=10000", "--fetch-retries=0"], {
    encoding: "utf8",
    timeout: 15000,
    shell: process.platform === "win32",
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const pkg = parseJson(readFileSync(resolve(root, "package.json"), "utf8"));
    const report = verifyPublishIdentity({ pkg });
    console.log(`Publish identity check passed: ${report.package}, npm account ${report.account}, ${report.authentication}, ${report.state}.`);
  } catch (error) {
    console.error(`Publish identity check failed: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}
