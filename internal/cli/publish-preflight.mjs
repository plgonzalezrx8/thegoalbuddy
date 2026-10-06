#!/usr/bin/env node
// Generated from internal/cli/publish-preflight.mts; do not edit.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { errorMessage, parseJson } from "./contracts.mjs";
import { verifyPublishIdentity } from "./check-publish-identity.mjs";
import { verifyPublishVersion } from "./check-publish-version.mjs";
import { packageRoot } from "./check-package.mjs";
import { verifyReadiness, verifyTestedArtifact } from "./release-readiness.mjs";
export function publishPreflight({ root = packageRoot, pkg, runNpm, runStep = runRequiredStep, env = process.env, readinessPath = env.THEGOALBUDDY_RELEASE_READINESS, artifactPath = env.THEGOALBUDDY_RELEASE_ARTIFACT, siteCheckout = env.THEGOALBUDDY_SITE_CHECKOUT, verifyReady = verifyReadiness, verifyArtifact = verifyTestedArtifact } = {}) {
    // Evidence and exact tested bytes are mandatory before touching credentials or
    // the registry. These path settings are references, never approval flags.
    const readiness = verifyReady({ root, reportPath: readinessPath, siteCheckout });
    verifyArtifact({ root, reportPath: artifactPath, readiness });
    pkg ??= parseJson(readFileSync(resolve(root, "package.json"), "utf8"));
    const identity = verifyPublishIdentity({ pkg, env, runNpm });
    const version = verifyPublishVersion({ pkg, runNpm });
    runStep("npm", ["run", "check"], root);
    runStep(process.execPath, ["internal/cli/sync-skill-tree.mjs"], root);
    // Recheck the same file after source checks. No lifecycle stage may repack it.
    const artifact = verifyArtifact({ root, reportPath: artifactPath, readiness });
    return { identity, version, contents: artifact.contents, artifact: artifact.report, readiness };
}
function runRequiredStep(command, args, root) {
    const result = spawnSync(command, args, { cwd: root, stdio: "inherit", timeout: 180000, shell: process.platform === "win32" });
    if (result.error || result.status !== 0)
        throw new Error(`Required release check failed: ${command} ${args.join(" ")}`);
}
function argument(name) { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const report = publishPreflight({ readinessPath: argument("--readiness"), artifactPath: argument("--artifact"), siteCheckout: argument("--site-checkout") });
        console.log(`Publish preflight passed: ${report.contents.name}@${report.contents.version}; readiness, exact tested artifact, identity, eligible version, full checks and mirror verified. No publication performed.`);
    }
    catch (error) {
        console.error(`Publish preflight failed: ${errorMessage(error)}`);
        process.exitCode = 1;
    }
}
