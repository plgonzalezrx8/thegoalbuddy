import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { publishPreflight } from "../cli/publish-preflight.mjs";

const pkg = { ...JSON.parse(readFileSync("package.json", "utf8")), version: "0.5.0" };
const response = data => ({ status: 0, stdout: JSON.stringify(data) });
function fixture({ account = "plgonzalezrx8", versions = ["0.4.3"], failStep, failPack = false } = {}) {
  const events = [];
  return { events, options: { pkg, env: {}, root: "/synthetic/source-root",
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
    inspectPackage: ({ root }) => {
      assert.equal(root, "/synthetic/source-root"); events.push("contents");
      if (failPack) throw new Error("incomplete tarball");
      return { name: pkg.name, version: pkg.version, files: 123 };
    },
  } };
}

test("direct publication requires identity, eligibility, full tests, mirror and tarball checks in order", () => {
  const f = fixture();
  assert.equal(publishPreflight(f.options).contents.version, "0.5.0");
  assert.deepEqual(f.events, ["identity", "name", "versions", "full-check", "mirror", "contents"]);
});

for (const [name, changes, expected] of [
  ["wrong identity", { account: "other" }, ["identity"]],
  ["published version", { versions: ["0.5.0"] }, ["identity", "name", "versions"]],
  ["tests fail", { failStep: "full-check" }, ["identity", "name", "versions", "full-check"]],
  ["mirror differs", { failStep: "mirror" }, ["identity", "name", "versions", "full-check", "mirror"]],
  ["tarball incomplete", { failPack: true }, ["identity", "name", "versions", "full-check", "mirror", "contents"]],
]) {
  test(`publication blocks when ${name}`, () => {
    const f = fixture(changes);
    assert.throws(() => publishPreflight(f.options));
    assert.deepEqual(f.events, expected);
  });
}
