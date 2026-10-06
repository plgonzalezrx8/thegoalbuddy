import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { releaseInputFingerprint, sha256, sourceCommit } from "../cli/release-inputs.mjs";
import { requiredChecks, verifyReadiness, verifyTestedArtifact, artifactEntries, type ReadinessReport } from "../cli/release-readiness.mjs";
import { expectedPackageFiles } from "../cli/check-package.mjs";
import { packageRelease } from "../build/package-release.mjs";

function write(root: string, path: string, value: string): void { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); }
function git(root: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, "Synthetic Git fixture must initialize successfully");
}
function commit(root: string): void { git(root, ["init", "-q"]); git(root, ["add", "."]); git(root, ["-c", "user.name=Synthetic", "-c", "user.email=synthetic@example.invalid", "commit", "-qm", "Synthetic gate fixture"]); }
interface Fixture { root: string; site: string; reportPath: string; report: ReadinessReport; close: () => void; save: () => void }
function fixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), "goalbuddy-readiness-")), root = join(directory, "product"), site = join(directory, "site");
  mkdirSync(root); mkdirSync(site);
  const pkg = { name: "thegoalbuddy", version: "0.5.0", bin: {}, repository: { url: "git+https://github.com/plgonzalezrx8/thegoalbuddy.git" }, publishConfig: { registry: "https://registry.npmjs.org/", access: "public" } };
  write(root, "package.json", JSON.stringify(pkg));
  for (const path of ["README.md", "BRANDING.md", "CONTRIBUTING.md", "CHANGELOG.md", "LICENSE", "internal/cli/runtime.mts", "internal/assets/mark.svg", "docs/releases/README.md", "docs/spec/receipt.md", "goalbuddy/SKILL.md", "plugins/goalbuddy/skills/goal-prep/SKILL.md", "internal/site/index.html", "tsconfig.experimental.json", ".npmignore"]) write(root, path, path.endsWith("SKILL.md") ? "identical synthetic skill" : "synthetic " + path);
  for (const dir of [".codex-plugin", ".claude-plugin"]) write(root, `plugins/goalbuddy/${dir}/plugin.json`, JSON.stringify({ name: pkg.name, version: pkg.version }));
  const marketplace = JSON.stringify({ name: pkg.name, plugins: [{ name: pkg.name, source: "./plugins/goalbuddy" }] });
  write(root, ".agents/plugins/marketplace.json", marketplace); write(root, ".claude-plugin/marketplace.json", marketplace);
  const files = [{ path: "internal/site/index.html", sha256: sha256(readFileSync(join(root, "internal/site/index.html"))) }];
  const websiteFingerprint = sha256(JSON.stringify(files));
  write(site, ".openai/hosting.json", JSON.stringify({ project_id: "synthetic-project", static: { directory: "dist" } }));
  write(site, "source-manifest.json", JSON.stringify({ sourceFingerprint: websiteFingerprint, files }));
  write(site, "site/index.html", readFileSync(join(root, "internal/site/index.html"), "utf8"));
  write(site, "dist/index.html", readFileSync(join(root, "internal/site/index.html"), "utf8"));
  commit(root); commit(site);
  const sites = { projectId: "synthetic-project", sourceCommit: sourceCommit(site), versionId: "synthetic-version", deploymentId: "synthetic-deployment", url: "https://synthetic.chatgpt.site", audience: "owner-private" as const, websiteFingerprint };
  const evidenceBytes = JSON.stringify({ status: "pass", browserStatus: "pass", sites });
  write(root, "audit/evidence.json", evidenceBytes);
  const evidence = { path: "audit/evidence.json", sha256: sha256(evidenceBytes) }, passed = { status: "pass" as const, evidence };
  const report: ReadinessReport = { schemaVersion: 1, package: "thegoalbuddy", version: "0.5.0", sourceCommit: sourceCommit(root), fingerprint: releaseInputFingerprint(root).fingerprint, sites,
    checks: { typecheck: passed, generated: passed, sourceTests: passed, node18: passed, node24: passed, nativeCodex: passed, nativeClaude: passed, boardBrowser: passed, websiteBrowser: passed, hostedSite: passed, independentReview: { ...passed, scope: "final" } } };
  const reportPath = "audit/readiness.json", save = (): void => write(root, reportPath, JSON.stringify(report));
  save();
  return { root, site, reportPath, report, save, close: () => rmSync(directory, { recursive: true, force: true }) };
}
function verify(f: Fixture): ReadinessReport { return verifyReadiness({ root: f.root, reportPath: f.reportPath, siteCheckout: f.site }); }

test("actual input fingerprint includes arbitrary root compiler/config files and excludes ephemeral evidence", () => {
  const f = fixture(); try {
    const initial = releaseInputFingerprint(f.root).fingerprint;
    write(f.root, "audit/another-report.json", "ephemeral"); write(f.root, "docs/goals/run/state.yaml", "ephemeral"); write(f.root, ".build/cache/output", "ephemeral");
    assert.equal(releaseInputFingerprint(f.root).fingerprint, initial);
    write(f.root, "tsconfig.experimental.json", "changed");
    assert.notEqual(releaseInputFingerprint(f.root).fingerprint, initial);
    write(f.root, ".npmignore", "changed");
    assert.notEqual(releaseInputFingerprint(f.root).fingerprint, initial);
  } finally { f.close(); }
});

test("readiness validates actual source, hashed stage evidence and exact committed Sites export", () => {
  const f = fixture(); try { assert.equal(verify(f).fingerprint, f.report.fingerprint); } finally { f.close(); }
});
for (const stage of requiredChecks) {
  test(`missing ${stage} evidence blocks readiness`, () => {
    const f = fixture(); try {
      const report = { ...f.report, checks: { ...f.report.checks, [stage]: { status: "blocked" } } };
      write(f.root, f.reportPath, JSON.stringify(report));
      assert.throws(() => verify(f), /passing/);
    } finally { f.close(); }
  });
}
for (const [name, change, expected] of [
  ["changed product", (f: Fixture) => write(f.root, "README.md", "changed"), /stale/],
  ["changed evidence", (f: Fixture) => write(f.root, "audit/evidence.json", "changed"), /evidence/],
  ["unfinished promotion", (f: Fixture) => write(f.root, ".build/promotion.json", "{}"), /transaction/],
  ["held build lock", (f: Fixture) => write(f.root, ".build/build.lock", "{}"), /transaction/],
  ["another source commit", (f: Fixture) => { f.report.sourceCommit = "0".repeat(40); f.save(); }, /stale/],
  ["another version", (f: Fixture) => { f.report.version = "0.6.0"; f.save(); }, /version/],
  ["another schema", (f: Fixture) => write(f.root, f.reportPath, JSON.stringify({ ...f.report, schemaVersion: 2 })), /schema/],
  ["missing reports", (f: Fixture) => rmSync(join(f.root, f.reportPath)), /ENOENT/],
  ["preliminary review", (f: Fixture) => write(f.root, f.reportPath, JSON.stringify({ ...f.report, checks: { ...f.report.checks, independentReview: { ...f.report.checks.independentReview, scope: "preliminary" } } })), /preliminary/],
  ["approved flag without stages", (f: Fixture) => write(f.root, f.reportPath, JSON.stringify({ ...f.report, approved: true, checks: {} })), /passing/],
  ["release blockers", (f: Fixture) => write(f.root, f.reportPath, JSON.stringify({ ...f.report, blockers: ["proxy403"] })), /blockers/],
  ["legacy sources", (f: Fixture) => write(f.root, f.reportPath, JSON.stringify({ ...f.report, legacySources: ["handwritten.js"] })), /Legacy/],
  ["wrong Sites version", (f: Fixture) => { f.report.sites = { ...f.report.sites, versionId: "wrong" }; f.save(); }, /another Sites/],
  ["wrong Sites URL", (f: Fixture) => { f.report.sites = { ...f.report.sites, url: "https://wrong.chatgpt.site" }; f.save(); }, /another Sites/],
  ["changed Sites export", (f: Fixture) => write(f.site, "dist/index.html", "changed"), /unfinished|changed/],
] as const) {
  test(`readiness rejects ${name}`, () => { const f = fixture(); try { change(f); assert.throws(() => verify(f), expected); } finally { f.close(); } });
}

test("native deployment success cannot replace a blocked hosted browser", () => {
  const f = fixture(); try {
    const evidence = JSON.stringify({ status: "pass", browserStatus: "blocked", nativeDeployment: "success", sites: f.report.sites });
    write(f.root, "audit/hosted.json", evidence);
    f.report.checks.hostedSite = { status: "pass", evidence: { path: "audit/hosted.json", sha256: sha256(evidence) } }; f.save();
    assert.throws(() => verify(f), /browser verification/);
  } finally { f.close(); }
});

function tarball(root: string): Buffer {
  const records: Buffer[] = [];
  for (const path of expectedPackageFiles(root)) {
    const bytes = readFileSync(join(root, path)), header = Buffer.alloc(512), name = "package/" + path;
    assert.ok(Buffer.byteLength(name) < 100, "Synthetic tar paths must fit ustar name field");
    header.write(name, 0, 100); header.write("0000644\0", 100); header.write("0000000\0", 108); header.write("0000000\0", 116);
    header.write(bytes.length.toString(8).padStart(11, "0") + "\0", 124); header.write("00000000000\0", 136); header.fill(32, 148, 156); header.write("0", 156); header.write("ustar\0", 257);
    let checksum = 0; for (const byte of header) checksum += byte;
    header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148);
    records.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  records.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(records));
}
function artifact(f: Fixture): string {
  const bytes = tarball(f.root), path = join(f.root, "audit/final.tgz"); writeFileSync(path, bytes);
  const reportPath = "audit/artifact.json";
  write(f.root, reportPath, JSON.stringify({ schemaVersion: 1, package: "thegoalbuddy", version: f.report.version, fingerprint: f.report.fingerprint, tarball: path, sha256: sha256(bytes), integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`, fileCount: expectedPackageFiles(f.root).length, status: "pass", tests: { passed: 7, failed: 0, skipped: 0 } }));
  return reportPath;
}
test("exact artifact verifier reads actual tarball integrity/content without npm packing", () => {
  const f = fixture(); try {
    const reportPath = artifact(f), report = verifyTestedArtifact({ root: f.root, reportPath, readiness: verify(f) });
    assert.equal(report.report.tests.passed, 7); assert.equal(report.contents.version, "0.5.0");
    assert.equal(artifactEntries(readFileSync(report.report.tarball)).size, report.contents.files);
  } finally { f.close(); }
});
for (const [field, value] of [["status", "untested"], ["fingerprint", "0".repeat(64)], ["sha256", "0".repeat(64)], ["fileCount", 9999], ["tests", { passed: 7, failed: 0, skipped: 1 }]] as const) {
  test(`artifact rejects changed ${field}`, () => {
    const f = fixture(); try {
      const reportPath = artifact(f), raw: unknown = JSON.parse(readFileSync(join(f.root, reportPath), "utf8"));
      assert.ok(raw !== null && typeof raw === "object");
      write(f.root, reportPath, JSON.stringify({ ...raw, [field]: value }));
      assert.throws(() => verifyTestedArtifact({ root: f.root, reportPath, readiness: verify(f) }));
    } finally { f.close(); }
  });
}

test("packaging refuses missing readiness before registry and pack invocation", () => {
  const events: string[] = [];
  assert.throws(() => packageRelease({ root: "/synthetic/missing", destination: "/synthetic/unused", runNpm: () => { events.push("registry"); return { status: 0, stdout: "" }; }, runPack: () => { events.push("pack"); return { status: 0, stdout: "[]" }; } }), /readiness/);
  assert.deepEqual(events, []);
});
test("packaging refuses blocked hosted-browser evidence before registry and pack invocation", () => {
  const f = fixture(), events: string[] = []; try {
    write(f.root, f.reportPath, JSON.stringify({ ...f.report, checks: { ...f.report.checks, hostedSite: { status: "blocked" } } }));
    assert.throws(() => packageRelease({ root: f.root, readinessPath: f.reportPath, siteCheckout: f.site, destination: join(f.root, "audit/package"), runNpm: () => { events.push("registry"); return { status: 0, stdout: "" }; }, runPack: () => { events.push("pack"); return { status: 0, stdout: "[]" }; } }), /hostedSite/);
    assert.deepEqual(events, []);
  } finally { f.close(); }
});
test("one synthetic final pack returns immutable metadata and cannot repack existing artifact", () => {
  const f = fixture(), events: string[] = [], destination = join(f.root, "audit/package"); try {
    const options = { root: f.root, readinessPath: f.reportPath, siteCheckout: f.site, destination, env: {},
      runNpm: (args: string[]) => {
        events.push(args[0] === "whoami" ? "identity" : args[2]!);
        return { status: 0, stdout: args[0] === "whoami" ? "plgonzalezrx8" : JSON.stringify(args[2] === "name" ? { name: "thegoalbuddy", maintainers: [{ name: "plgonzalezrx8" }] } : ["0.4.3"]) };
      },
      runPack: (args: string[]) => {
        events.push("pack"); assert.deepEqual(args, ["pack", "--json", "--ignore-scripts", "--pack-destination", destination]);
        writeFileSync(join(destination, "thegoalbuddy-0.5.0.tgz"), tarball(f.root));
        return { status: 0, stdout: JSON.stringify([{ filename: "thegoalbuddy-0.5.0.tgz" }]) };
      } };
    const result = packageRelease(options);
    assert.equal(result.sha256, sha256(readFileSync(result.tarball)));
    assert.deepEqual(events, ["identity", "name", "versions", "pack"]);
    assert.throws(() => verifyTestedArtifact({ root: f.root, reportPath: result.reportPath, readiness: verify(f) }), /missing or stale/);
    assert.throws(() => packageRelease(options), /already exists/);
    assert.equal(events.filter(event => event === "pack").length, 1);
  } finally { f.close(); }
});
