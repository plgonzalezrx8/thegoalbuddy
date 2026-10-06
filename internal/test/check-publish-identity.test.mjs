import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyPublishIdentity, target } from "../cli/check-publish-identity.mjs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const success = (value) => ({ status: 0, stdout: typeof value === "string" ? value : JSON.stringify(value) });
const owned = { name: target.package, maintainers: [{ name: target.npmAccount, email: "example@example.invalid" }] };
const missing = { status: 1, stdout: JSON.stringify({ error: { code: "E404" } }) };
function runner({ account = target.npmAccount, metadata = success(owned), identityError = false } = {}) {
  const calls = [];
  const runNpm = (args) => {
    calls.push(args);
    return args[0] === "whoami" ? identityError ? { status: 1, stdout: "" } : success(account + "\n") : metadata;
  };
  return { calls, runNpm };
}
const trusted = {
  GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: target.repository, GITHUB_EVENT_NAME: "release",
  GITHUB_WORKFLOW_REF: `${target.repository}/.github/workflows/${target.workflow}@refs/tags/v0.4.3`,
  ACTIONS_ID_TOKEN_REQUEST_URL: "https://example.invalid/oidc", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "synthetic-test-value",
};
function check(options = {}, env = {}, packageData = pkg) {
  const fixture = runner(options);
  return { report: verifyPublishIdentity({ pkg: packageData, env, runNpm: fixture.runNpm }), calls: fixture.calls };
}

test("first publication requires the exact npm account and an official registry lookup", () => {
  const { report, calls } = check({ metadata: missing });
  assert.equal(report.state, "first-publication");
  assert.equal(report.account, "plgonzalezrx8");
  assert.equal(report.package, "thegoalbuddy");
  assert.equal(report.authentication, "npm-account");
  assert.deepEqual(calls.map(args => args[0]), ["whoami", "view"]);
  assert.ok(calls.every(args => args.includes("--registry=https://registry.npmjs.org/")));
});

test("wrong authenticated account cannot pass even when the desired owner maintains the package", () => {
  const fixture = runner({ account: "someone-else" });
  assert.throws(() => verifyPublishIdentity({ pkg, env: {}, runNpm: fixture.runNpm }), /authenticated account does not match/);
  assert.equal(fixture.calls.length, 1);
});

test("unauthenticated local publication fails before registry lookup", () => {
  assert.throws(() => check({ identityError: true }), /authentication is required/);
});

test("existing package verifies its expected npm maintainer", () => {
  assert.equal(check().report.state, "existing-package");
  assert.equal(check({ metadata: success({ name: target.package, maintainers: [`${target.npmAccount} <example@example.invalid>`] }) }).report.state, "existing-package");
});

for (const [name, metadata] of [
  ["another owner's package", success({ name: target.package, maintainers: [{ name: "another-owner" }] })],
  ["lookalike owner", success({ name: target.package, maintainers: [{ name: "plgonzalezrx8-other" }] })],
  ["upstream package name", success({ ...owned, name: "goalbuddy" })],
  ["missing maintainer data", success({ name: target.package })],
  ["malformed registry data", success("not JSON")],
  ["registry authentication failure", { status: 1, stdout: JSON.stringify({ error: { code: "E401" } }) }],
  ["registry outage", { status: 1, stdout: JSON.stringify({ error: { code: "E500" } }) }],
  ["registry timeout", { status: null, error: { code: "ETIMEDOUT" }, stdout: "" }],
]) {
  test(`publication rejects ${name}`, () => assert.throws(() => check({ metadata })));
}

for (const [name, changes] of [
  ["upstream package", { name: "goalbuddy" }],
  ["wrong source repository", { repository: { url: "git+https://github.com/tolimarchuk/goalbuddy.git" } }],
  ["another registry", { publishConfig: { access: "public", registry: "https://example.invalid/" } }],
  ["non-public access", { publishConfig: { ...pkg.publishConfig, access: "restricted" } }],
]) {
  test(`release policy rejects ${name} before using credentials`, () => {
    const fixture = runner();
    assert.throws(() => verifyPublishIdentity({ pkg: { ...pkg, ...changes }, env: {}, runNpm: fixture.runNpm }));
    assert.equal(fixture.calls.length, 0);
  });
}

test("trusted workflow verifies npm ownership without assuming whoami supports OIDC", () => {
  const { report, calls } = check({}, trusted);
  assert.equal(report.authentication, "github-oidc");
  assert.deepEqual(calls.map(args => args[0]), ["view"]);
});

for (const [name, changes] of [
  ["forked repository", { GITHUB_REPOSITORY: "someone-else/thegoalbuddy" }],
  ["another workflow", { GITHUB_WORKFLOW_REF: `${target.repository}/.github/workflows/test.yml@refs/heads/main` }],
  ["missing workflow ref", { GITHUB_WORKFLOW_REF: undefined }],
  ["missing workflow revision", { GITHUB_WORKFLOW_REF: `${target.repository}/.github/workflows/${target.workflow}@` }],
  ["non-release trigger", { GITHUB_EVENT_NAME: "push" }],
  ["missing OIDC endpoint", { ACTIONS_ID_TOKEN_REQUEST_URL: undefined }],
  ["missing OIDC credential", { ACTIONS_ID_TOKEN_REQUEST_TOKEN: undefined }],
]) {
  test(`trusted publishing rejects ${name}`, () => {
    const fixture = runner();
    assert.throws(() => verifyPublishIdentity({ pkg, env: { ...trusted, ...changes }, runNpm: fixture.runNpm }), /fork's release workflow/);
    assert.equal(fixture.calls.length, 0);
  });
}

test("trusted publishing cannot bootstrap a package with no verified account ownership", () => {
  assert.throws(() => check({ metadata: missing }, trusted), /First publish thegoalbuddy/);
  assert.throws(() => check({ metadata: success({ ...owned, maintainers: [{ name: "another-owner" }] }) }, trusted), /must list plgonzalezrx8/);
});
