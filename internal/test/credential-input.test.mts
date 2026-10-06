import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

for (const [name, file, args] of [
  ["hosted browser QA", "browser-qa.mjs", ["--hosted"]],
  ["Sites source adapter", "site-workflow.mjs", []],
] satisfies Array<[string, string, string[]]>) {
  test(`${name} never echoes malformed credential input in diagnostics`, () => {
    const sentinel = "SYNTHETIC_SECRET_SENTINEL";
    const executable = fileURLToPath(new URL(`../build/${file}`, import.meta.url));
    const result = spawnSync(process.execPath, [executable, ...args], {
      input: `{"token":"${sentinel}" INVALID}\n`, encoding: "utf8", timeout: 10000,
    });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /SYNTHETIC_SECRET_SENTINEL/);
  });
}
