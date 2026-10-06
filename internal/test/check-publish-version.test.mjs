import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { verifyPublishVersion } from "../cli/check-publish-version.mjs";
import { checkPublishStatus } from "../cli/check-publish-status.mjs";
import { compareVersions } from "../cli/npm-registry.mjs";

const pkg = { name: "thegoalbuddy", version: "0.5.0" };
const response = (data, status = 0) => ({ status, stdout: JSON.stringify(data) });
const missing = response({ error: { code: "E404" } }, 1);
function runner(result) {
  const calls = [];
  return { calls, runNpm: args => { calls.push(args); return result; } };
}

test("version eligibility uses all published versions on the bounded official registry", () => {
  const fixture = runner(response(["0.4.3", "0.3.0", "0.5.0-beta.2"]));
  assert.equal(verifyPublishVersion({ pkg, runNpm: fixture.runNpm }).latest, "0.5.0-beta.2");
  assert.deepEqual(fixture.calls[0], ["view", "thegoalbuddy", "versions", "--json", "--registry=https://registry.npmjs.org/", "--fetch-timeout=10000", "--fetch-retries=0"]);
});

test("version eligibility rejects already published and regressing versions", () => {
  assert.throws(() => verifyPublishVersion({ pkg, runNpm: () => response(["0.5.0", "0.6.0"]) }), /already been published/);
  assert.throws(() => verifyPublishVersion({ pkg, runNpm: () => response(["0.6.0"]) }), /greater than the latest/);
  assert.throws(() => verifyPublishVersion({ pkg, runNpm: () => response(["0.5.0+build"]) }), /already been published/);
});

test("a structured missing package permits first publication", () => {
  assert.deepEqual(verifyPublishVersion({ pkg, runNpm: () => missing }), { version: "0.5.0", latest: null });
});

test("exact-version status finds an older published target without consulting latest", () => {
  const fixture = runner(response("0.5.0"));
  assert.deepEqual(checkPublishStatus({ pkg, runNpm: fixture.runNpm }), { alreadyPublished: true, version: "0.5.0" });
  assert.equal(fixture.calls[0][1], "thegoalbuddy@0.5.0");
  assert.equal(fixture.calls[0][2], "version");
  assert.ok(fixture.calls[0].includes("--registry=https://registry.npmjs.org/"));
});

test("exact-version status permits only a structured missing target", () => {
  assert.equal(checkPublishStatus({ pkg, runNpm: () => missing }).alreadyPublished, false);
  assert.equal(checkPublishStatus({ pkg, runNpm: () => ({ ...missing, stdout: "", stderr: missing.stdout }) }).alreadyPublished, false);
  for (const data of ["0.6.0", ["0.5.0"], { version: "0.5.0" }, null]) {
    assert.throws(() => checkPublishStatus({ pkg, runNpm: () => response(data) }), /unexpected version/);
  }
});

for (const [name, result] of [
  ["raw E404 text", { status: 1, stdout: "", stderr: "npm error E404 404 Not Found" }],
  ["malformed success", { status: 0, stdout: "not JSON" }],
  ["empty success", { status: 0, stdout: "" }],
  ["authentication", response({ error: { code: "E401" } }, 1)],
  ["authorization", response({ error: { code: "E403" } }, 1)],
  ["network", response({ error: { code: "ENOTFOUND" } }, 1)],
  ["timeout with misleading E404", { ...missing, status: null, error: { code: "ETIMEDOUT" } }],
  ["nonzero response without error", response(["0.4.3"], 1)],
  ["error inside success", response({ error: { code: "E404" } })],
]) {
  test(`version and status checks fail closed on ${name}`, () => {
    assert.throws(() => verifyPublishVersion({ pkg, runNpm: () => result }));
    assert.throws(() => checkPublishStatus({ pkg, runNpm: () => result }));
  });
}

for (const data of [[], {}, null, "", ["garbage"], ["01.2.3"], ["0.4.3", 7], ["0.5.0-beta.01"]]) {
  test(`version check rejects malformed version-list data ${JSON.stringify(data)}`, () => {
    assert.throws(() => verifyPublishVersion({ pkg, runNpm: () => response(data) }));
  });
}

test("semantic version ordering preserves prerelease and numeric identifiers", () => {
  assert.ok(compareVersions("0.5.0-beta.10", "0.5.0-beta.2") > 0);
  assert.ok(compareVersions("0.5.0", "0.5.0-beta.10") > 0);
  assert.equal(compareVersions("0.5.0+one", "0.5.0+two"), 0);
  assert.ok(compareVersions("0.5.0-alpha.1", "0.5.0-alpha") > 0);
});

test("CLI ignores environment version overrides and refuses a lower version", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-registry-mock-"));
  try {
    const executable = join(root, "npm");
    writeFileSync(executable, `#!${process.execPath}\nprocess.stdout.write(JSON.stringify(["999.0.0"]));\n`);
    chmodSync(executable, 0o755);
    const result = spawnSync(process.execPath, ["internal/cli/check-publish-version.mjs"], {
      encoding: "utf8", env: { ...process.env, PATH: root + delimiter + process.env.PATH,
        GOALBUDDY_PUBLISHED_VERSIONS: "[]", GOAL_MAKER_PUBLISHED_VERSIONS: "[]" },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /greater than the latest published version 999.0.0/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("status CLI writes an idempotent skip output for the exact published target", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-status-mock-"));
  try {
    const executable = join(root, "npm"), output = join(root, "github-output");
    const current = JSON.parse(readFileSync("package.json", "utf8")).version;
    writeFileSync(executable, `#!${process.execPath}\nprocess.stdout.write(JSON.stringify(${JSON.stringify(current)}));\n`);
    chmodSync(executable, 0o755);
    const result = spawnSync(process.execPath, ["internal/cli/check-publish-status.mjs"], {
      encoding: "utf8", env: { ...process.env, PATH: root + delimiter + process.env.PATH, GITHUB_OUTPUT: output },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(output, "utf8"), `already_published=true\npackage_version=${current}\n`);
    assert.match(result.stdout, /already published; skipping publication/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("status CLI fails without authorizing publication when npm authentication fails", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-status-failure-"));
  try {
    const executable = join(root, "npm"), output = join(root, "github-output");
    writeFileSync(output, "existing_output=true\n");
    writeFileSync(executable, `#!${process.execPath}\nprocess.stdout.write(JSON.stringify({error:{code:"E401",summary:"sensitive diagnostic omitted"}}));process.exitCode=1;\n`);
    chmodSync(executable, 0o755);
    const result = spawnSync(process.execPath, ["internal/cli/check-publish-status.mjs"], {
      encoding: "utf8", env: { ...process.env, PATH: root + delimiter + process.env.PATH, GITHUB_OUTPUT: output },
    });
    assert.equal(result.status, 1);
    assert.equal(readFileSync(output, "utf8"), "existing_output=true\n");
    assert.doesNotMatch(result.stderr, /sensitive diagnostic/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
