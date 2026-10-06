import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { isRecord, parseJson, type CommandResult, type NpmRunner } from "../cli/contracts.mjs";
import { verifyPublishIdentity } from "../cli/check-publish-identity.mjs";
import { verifyPublishVersion } from "../cli/check-publish-version.mjs";
import { inspectArtifact, verifyReadiness, type ReadinessOptions, type ReadinessReport } from "../cli/release-readiness.mjs";
import { releaseInputFingerprint, sha256, sourceCommit } from "../cli/release-inputs.mjs";
import { errorMessage, isDirectRun, repoRoot } from "./common.mjs";

export interface PackageReleaseOptions {
  root?: string; readinessPath?: string; destination?: string; siteCheckout?: string; env?: NodeJS.ProcessEnv;
  verifyReady?: (options: ReadinessOptions) => ReadinessReport; runNpm?: NpmRunner;
  runPack?: (args: string[], root: string) => CommandResult;
}
export function packageRelease({ root = repoRoot, readinessPath, destination, siteCheckout, env = process.env, verifyReady = verifyReadiness,
  runNpm, runPack = (args, cwd) => spawnSync("npm", args, { cwd, encoding: "utf8", timeout: 30000, shell: process.platform === "win32" }) }: PackageReleaseOptions = {}) {
  const readiness = verifyReady({ root, reportPath: readinessPath, siteCheckout });
  if (!destination) throw new Error("Final packaging requires --destination.");
  const output = resolve(destination), reportPath = join(output, `thegoalbuddy-${readiness.version}.pack.json`);
  const expectedTarball = join(output, `thegoalbuddy-${readiness.version}.tgz`);
  if (existsSync(reportPath) || existsSync(expectedTarball)) throw new Error("Final artifact already exists; reuse and test it instead of repacking.");
  const pkg = parseJson(readFileSync(join(root, "package.json"), "utf8"));
  verifyPublishIdentity({ pkg, env, runNpm });
  verifyPublishVersion({ pkg, runNpm });
  mkdirSync(output, { recursive: true });
  // One actual pack, only after all prior stages; never run publication.
  const result = runPack(["pack", "--json", "--ignore-scripts", "--pack-destination", output], root);
  if (result.error || result.status !== 0) throw new Error("Final npm packaging failed.");
  const packs = parseJson(result.stdout || "");
  if (!Array.isArray(packs) || packs.length !== 1 || !isRecord(packs[0]) || typeof packs[0].filename !== "string"
    || basename(packs[0].filename) !== packs[0].filename || packs[0].filename !== basename(expectedTarball)) throw new Error("npm returned unexpected final artifact metadata.");
  const tarball = join(output, packs[0].filename);
  const contents = inspectArtifact(root, tarball);
  const bytes = readFileSync(tarball);
  if (releaseInputFingerprint(root).fingerprint !== readiness.fingerprint || sourceCommit(root) !== readiness.sourceCommit) throw new Error("Source changed during final packaging; artifact is invalid.");
  const metadata = { schemaVersion: 1, package: readiness.package, version: readiness.version, fingerprint: readiness.fingerprint, sourceCommit: readiness.sourceCommit,
    tarball, sha256: sha256(bytes), integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`, fileCount: contents.files,
    status: "untested", tests: { passed: 0, failed: 0, skipped: 0 }, readinessPath: resolve(root, readinessPath || ""), pack: packs[0] };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(metadata, null, 2) + "\n", { flag: "wx" });
  return { reportPath, tarball, sha256: metadata.sha256, integrity: metadata.integrity };
}
function argument(args: string[], name: string): string | undefined { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; }
if (isDirectRun(import.meta.url)) try {
  console.log(JSON.stringify(packageRelease({ readinessPath: argument(process.argv, "--readiness"), destination: argument(process.argv, "--destination"), siteCheckout: argument(process.argv, "--site-checkout") })));
} catch (error) { console.error(errorMessage(error)); process.exitCode = 1; }
