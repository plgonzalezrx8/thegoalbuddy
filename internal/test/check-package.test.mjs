import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { checkPackage, verifyPackageContents, verifyManifestParity } from "../cli/check-package.mjs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
// Real npm's file selection is needed: a pairwise mirror check alone misses
// omitted canonical and plugin runtime assets when both are absent.
const result = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8", timeout: 30000 });
assert.equal(result.status, 0, "npm pack fixture must complete");
const pack = JSON.parse(result.stdout)[0];

test("shared completeness checker accepts the actual complete runtime artifact", () => {
  assert.equal(verifyPackageContents({ pack }).version, pkg.version);
});

for (const [name, remove] of [
  ["both board entrypoints", path => path.endsWith("/ui/index.html")],
  ["both receipt provenance scripts", path => path.endsWith("/scripts/receipt-provenance.mjs")],
  ["bundled font licenses", path => path.endsWith("dm-sans-OFL.txt")],
  ["CLI binary", path => path === "internal/cli/goal-maker.mjs"],
  ["plugin manifest", path => path === "plugins/goalbuddy/.codex-plugin/plugin.json"],
]) {
  test(`completeness check rejects missing ${name}`, () => {
    assert.throws(() => verifyPackageContents({ pack: { ...pack, files: pack.files.filter(file => !remove(file.path)) } }), /incomplete/);
  });
}

test("packed package identity and version must match the source manifests", () => {
  assert.throws(() => verifyPackageContents({ pack: { ...pack, version: "999.0.0" } }), /intended package/);
  assert.throws(() => verifyPackageContents({ pack: { ...pack, name: "goalbuddy" } }), /intended package/);
  const manifests = [".codex-plugin", ".claude-plugin"].map(dir => JSON.parse(readFileSync(`plugins/goalbuddy/${dir}/plugin.json`, "utf8")));
  const marketplaces = [".agents/plugins", ".claude-plugin"].map(dir => JSON.parse(readFileSync(`${dir}/marketplace.json`, "utf8")));
  assert.throws(() => verifyManifestParity(pkg, [{ ...manifests[0], version: "999.0.0" }, manifests[1]], marketplaces), /name\/version/);
  assert.throws(() => verifyManifestParity(pkg, manifests, [{ ...marketplaces[0], name: "other" }, marketplaces[1]]), /Marketplace/);
});

for (const path of ["audit/private.json", "internal/test/a.test.mjs", ".env", "../secret", "/absolute"]) {
  test(`artifact rejects unsafe or development-only file ${path}`, () => {
    assert.throws(() => verifyPackageContents({ pack: { ...pack, files: [...pack.files, { path }] } }));
  });
}

test("package inspection fails closed on npm and malformed JSON failures", () => {
  assert.throws(() => checkPackage({ runPack: () => ({ status: 1, stdout: "[]" }) }), /Unable/);
  assert.throws(() => checkPackage({ runPack: () => ({ status: 0, stdout: "no JSON" }) }), /malformed/);
  assert.throws(() => checkPackage({ runPack: () => ({ status: 0, stdout: "[]" }) }), /one artifact/);
});
