import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const workflow = readFileSync(".github/workflows/npm-publish.yml", "utf8");

test("npm publishing is release-only and bound to the package version", () => {
  assert.match(workflow, /release:\s*\n\s+types: \[published\]/);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
  assert.match(workflow, /RELEASE_TAG: \$\{\{ github\.event\.release\.tag_name \}\}/);
  assert.match(workflow, /expected_tag="v\$package_version"/);
  assert.match(workflow, /if \[ "\$RELEASE_TAG" != "\$expected_tag" \]/);
});

test("npm publishing uses OIDC and a trusted-publishing-capable npm", () => {
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /node-version: "24"/);
  assert.match(workflow, /npm install --global npm@11\.18\.0/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN/);
});

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

test("manual publication requires the intended npm identity before the version check", () => {
  assert.equal(pkg.scripts.prepublishOnly, "node internal/cli/publish-preflight.mjs");
  assert.equal(pkg.publishConfig.registry, "https://registry.npmjs.org/");
});

test("trusted publication verifies fork account ownership before publishing", () => {
  const identity = workflow.indexOf("npm run publish:identity");
  const publish = workflow.lastIndexOf("run: npm publish");
  assert.ok(identity >= 0 && publish > identity, "release must pass identity/ownership guard before publish");
});

test("CI checks the exact target through the shared fail-closed checker", () => {
  assert.match(workflow, /npm run publish:status/);
  assert.doesNotMatch(workflow, /npm view thegoalbuddy version|\|\| true/);
  assert.match(workflow, /if: steps.npm_status.outputs.already_published != 'true'/);
});
