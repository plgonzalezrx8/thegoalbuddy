import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { publishPreflight, type PreflightOptions } from "../cli/publish-preflight.mjs";
import { parsePackage, parseJson } from "../cli/contracts.mjs";
import { type ReadinessReport } from "../cli/release-readiness.mjs";

const pkg = { ...parsePackage(parseJson(readFileSync("package.json", "utf8"))), version: "0.5.0" };
const response = (data: unknown) => ({ status: 0, stdout: JSON.stringify(data) });
const passed = { status: "pass" as const, evidence: { path: "synthetic", sha256: "a".repeat(64) } };
const readiness: ReadinessReport = { schemaVersion: 1, package: "thegoalbuddy", version: "0.5.0", sourceCommit: "a".repeat(40), fingerprint: "b".repeat(64),
  checks: { typecheck: passed, generated: passed, sourceTests: passed, node18: passed, node24: passed, nativeCodex: passed, nativeClaude: passed, boardBrowser: passed, websiteBrowser: passed, hostedSite: passed, independentReview: { ...passed, scope: "final" } },
  sites: { projectId: "synthetic", sourceCommit: "a".repeat(40), versionId: "synthetic", deploymentId: "synthetic", url: "https://synthetic.chatgpt.site", audience: "owner-private", websiteFingerprint: "c".repeat(64) } };
interface FixtureOptions { account?: string; versions?: string[]; failStep?: string; failPack?: boolean; failEarlyArtifact?: boolean }
function fixture({ account = "plgonzalezrx8", versions = ["0.4.3"], failStep, failPack = false, failEarlyArtifact = false }: FixtureOptions = {}): { events: string[]; options: PreflightOptions } {
  const events: string[] = [];
  let artifactCalls = 0;
  return { events, options: { pkg, env: {}, root: "/synthetic/source-root",
    verifyReady: () => { events.push("readiness"); return readiness; },
    verifyArtifact: ({ root }) => {
      assert.equal(root, "/synthetic/source-root");
      const stage = artifactCalls++ === 0 ? "tested-artifact" : "contents";
      events.push(stage);
      if (failEarlyArtifact || failPack && stage === "contents") throw new Error("incomplete or untested tarball");
      return { contents: { name: pkg.name, version: pkg.version, files: 123 }, report: {
        schemaVersion: 1, package: "thegoalbuddy", version: pkg.version, fingerprint: readiness.fingerprint, tarball: "/synthetic/verified.tgz", sha256: "d".repeat(64), integrity: "sha512-synthetic", fileCount: 123, status: "pass", tests: { passed: 1, failed: 0, skipped: 0 } } };
    },
    runNpm: args => {
      events.push(args[0] === "whoami" ? "identity" : args[2]);
      return args[0] === "whoami" ? { status: 0, stdout: account } : args[2] === "name" ? response({ name: pkg.name, maintainers: [{ name: "plgonzalezrx8" }] }) : response(versions);
    },
    runStep: (command, args, root) => {
      assert.equal(root, "/synthetic/source-root");
      const step = args.includes("check") ? "full-check" : "mirror";
      events.push(step);
      if (step === failStep) throw new Error(`${step} failed`);
      if (step === "mirror") assert.deepEqual(args, ["internal/cli/sync-skill-tree.mjs"]);
    },
  } };
}

test("direct publication requires identity, eligibility, full tests, mirror and tarball checks in order", () => {
  const f = fixture();
  assert.equal(publishPreflight(f.options).contents.version, "0.5.0");
  assert.deepEqual(f.events, ["readiness", "tested-artifact", "identity", "name", "versions", "full-check", "mirror", "contents"]);
});

const failures: [string, FixtureOptions, string[]][] = [
  ["wrong identity", { account: "other" }, ["readiness", "tested-artifact", "identity"]],
  ["published version", { versions: ["0.5.0"] }, ["readiness", "tested-artifact", "identity", "name", "versions"]],
  ["tests fail", { failStep: "full-check" }, ["readiness", "tested-artifact", "identity", "name", "versions", "full-check"]],
  ["mirror differs", { failStep: "mirror" }, ["readiness", "tested-artifact", "identity", "name", "versions", "full-check", "mirror"]],
  ["tarball incomplete", { failPack: true }, ["readiness", "tested-artifact", "identity", "name", "versions", "full-check", "mirror", "contents"]],
];
for (const [name, changes, expected] of failures) {
  test(`publication blocks when ${name}`, () => {
    const f = fixture(changes);
    assert.throws(() => publishPreflight(f.options));
    assert.deepEqual(f.events, expected);
  });
}

test("publication rejects missing verified website and review evidence before registry access", () => {
  const f = fixture();
  delete f.options.verifyReady;
  assert.throws(() => publishPreflight(f.options), /readiness|verification/i);
  assert.deepEqual(f.events, []);
});


test("publication rejects an untested or mismatched artifact before registry access", () => {
  const f = fixture({ failEarlyArtifact: true });
  assert.throws(() => publishPreflight(f.options), /untested/);
  assert.deepEqual(f.events, ["readiness", "tested-artifact"]);
});

test("directory prepublishOnly cannot authorize an untested repack even with verified evidence", () => {
  const f = fixture();
  f.options.env = { npm_lifecycle_event: "prepublishOnly" };
  assert.throws(() => publishPreflight(f.options), /exact verified tarball|directory publication/i);
  assert.deepEqual(f.events, []);
});
