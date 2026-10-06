import { object, array, text, texts, parseObject } from "./fixtures/cli-json.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkPackage, verifyPackageContents, verifyManifestParity, expectedPackageFiles } from "../cli/check-package.mjs";

const root = process.env.THEGOALBUDDY_TEST_ROOT || process.cwd();
const pkg = parseObject(readFileSync("package.json", "utf8"));
// File-selection metadata only: actual npm packing is the final-stage suite.
const pack = { name: pkg.name, version: pkg.version, files: expectedPackageFiles(root, pkg).map(path => ({ path })) };

test("shared completeness checker accepts the complete synthetic runtime file list", () => {
  assert.equal(verifyPackageContents({ root, pack }).version, pkg.version);
});

const removals: [string, (path: string) => boolean][] = [
  ["both board entrypoints", path => path.endsWith("/ui/index.html")],
  ["both receipt provenance scripts", path => path.endsWith("/scripts/receipt-provenance.mjs")],
  ["bundled font licenses", path => path.endsWith("dm-sans-OFL.txt")],
  ["CLI binary", path => path === "internal/cli/goal-maker.mjs"],
  ["plugin manifest", path => path === "plugins/goalbuddy/.codex-plugin/plugin.json"],
];
for (const [name, remove] of removals) {
  test(`completeness check rejects missing ${name}`, () => {
    assert.throws(() => verifyPackageContents({ root, pack: { ...pack, files: pack.files.filter(file => !remove(file.path)) } }), /incomplete/);
  });
}

test("packed package identity and version must match the source manifests", () => {
  assert.throws(() => verifyPackageContents({ root, pack: { ...pack, version: "999.0.0" } }), /intended package/);
  assert.throws(() => verifyPackageContents({ root, pack: { ...pack, name: "goalbuddy" } }), /intended package/);
  const manifests = [".codex-plugin", ".claude-plugin"].map(dir => parseObject(readFileSync(`plugins/goalbuddy/${dir}/plugin.json`, "utf8")));
  const marketplaces = [".agents/plugins", ".claude-plugin"].map(dir => parseObject(readFileSync(`${dir}/marketplace.json`, "utf8")));
  assert.throws(() => verifyManifestParity(pkg, [{ ...manifests[0], version: "999.0.0" }, manifests[1]], marketplaces), /name\/version/);
  assert.throws(() => verifyManifestParity(pkg, manifests, [{ ...marketplaces[0], name: "other" }, marketplaces[1]]), /Marketplace/);
});

for (const path of ["audit/private.json", "internal/test/a.test.mjs", ".env", "../secret", "/absolute"]) {
  test(`artifact rejects unsafe or development-only file ${path}`, () => {
    assert.throws(() => verifyPackageContents({ root, pack: { ...pack, files: [...pack.files, { path }] } }));
  });
}

test("package inspection fails closed on npm and malformed JSON failures", () => {
  assert.throws(() => checkPackage({ runPack: () => ({ status: 1, stdout: "[]" }) }), /Unable/);
  assert.throws(() => checkPackage({ runPack: () => ({ status: 0, stdout: "no JSON" }) }), /malformed/);
  assert.throws(() => checkPackage({ runPack: () => ({ status: 0, stdout: "[]" }) }), /one artifact/);
});
