import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { repositoryRoot } from "./fixtures/package-support.mjs";

const repository = repositoryRoot();

test("release history stays in one running changelog", () => {
  assert.deepEqual(readdirSync(join(repository, "docs/releases")).sort(), ["README.md"]);

  const changelog = readFileSync(join(repository, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /single, running release history/);
  assert.match(changelog, /Do not create separate versioned changelog files/);
  assert.match(changelog, /Never include client, customer, company, donor, or private project names/);

  for (const version of [
    "0.4.3", "0.4.2", "0.4.1", "0.4.0",
    "0.3.9", "0.3.8", "0.3.7", "0.3.6", "0.3.5", "0.3.2", "0.3.1", "0.3.0",
    "0.2.22", "0.2.21", "0.2.20", "0.2.19", "0.2.18", "0.2.17", "0.2.16",
    "0.2.15", "0.2.14", "0.2.13", "0.2.12", "0.2.11", "0.2.10",
  ]) {
    assert.match(changelog, new RegExp(`^## ${version}:`, "m"), `missing thegoalbuddy ${version}`);
  }

  assert.match(changelog, /^## Goal Maker Package History$/m);
  for (const version of ["0.2.10", "0.2.9", "0.2.8", "0.2.7", "0.2.6", "0.2.5", "0.2.1", "0.2.0", "0.1.4", "0.1.3", "0.1.2", "0.1.1", "0.1.0"]) {
    assert.match(changelog, new RegExp(`^### ${version}:`, "m"), `missing Goal Maker ${version}`);
  }

  for (const image of [
    "goalbuddy-v0.4.0-release.png",
    "goalbuddy-v0.3.7-release.png",
    "goalbuddy-v0.3.5-release.png",
    "goalbuddy-v0.3.0-release.png",
  ]) {
    assert.match(changelog, new RegExp(`internal/assets/${image.replaceAll(".", "\\.")}`));
  }
});
