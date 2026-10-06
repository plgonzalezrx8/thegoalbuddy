import { object, array, text, texts, parseObject } from "./fixtures/cli-json.mjs";
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const pkg = parseObject(readFileSync("package.json", "utf8"));
const marketplace = parseObject(readFileSync(".agents/plugins/marketplace.json", "utf8"));
const claudeMarketplace = parseObject(readFileSync(".claude-plugin/marketplace.json", "utf8"));
const plugin = parseObject(readFileSync("plugins/goalbuddy/.codex-plugin/plugin.json", "utf8"));
const claudePlugin = parseObject(readFileSync("plugins/goalbuddy/.claude-plugin/plugin.json", "utf8"));

test("thegoalbuddy plugin is exposed through a Codex marketplace manifest", () => {
  assert.equal(marketplace.name, "thegoalbuddy");
  assert.equal(object(marketplace.interface).displayName, "thegoalbuddy");
  assert.equal(array(marketplace.plugins).length, 1);

  const entry = object(array(marketplace.plugins)[0]);
  assert.equal(entry.name, "thegoalbuddy");
  assert.equal(object(entry.source).source, "local");
  assert.equal(object(entry.source).path, "./plugins/goalbuddy");
  assert.equal(object(entry.policy).installation, "INSTALLED_BY_DEFAULT");
  assert.equal(entry.category, "Coding");
});

test("thegoalbuddy plugin is exposed through a Claude marketplace manifest", () => {
  assert.equal(claudeMarketplace.name, "thegoalbuddy");
  assert.equal(object(claudeMarketplace.owner).name, "plgonzalezrx8");
  assert.equal(array(claudeMarketplace.plugins).length, 1);

  const entry = object(array(claudeMarketplace.plugins)[0]);
  assert.equal(entry.name, "thegoalbuddy");
  assert.equal(entry.source, "./plugins/goalbuddy");
  assert.ok(texts(pkg.files).includes(".claude-plugin/marketplace.json"));
});

test("thegoalbuddy plugin metadata tracks the package release", () => {
  assert.equal(plugin.name, pkg.name);
  assert.equal(plugin.version, pkg.version);
  assert.equal(plugin.repository, "https://github.com/plgonzalezrx8/thegoalbuddy");
  assert.equal(plugin.skills, "./skills/");
});

test("Claude plugin metadata stays aligned with package release", () => {
  assert.equal(claudePlugin.name, pkg.name);
  assert.equal(claudePlugin.version, pkg.version);
  assert.equal(claudePlugin.description, plugin.description);
  assert.ok(!texts(claudePlugin.keywords).includes("extensions"));
});

test("thegoalbuddy plugin delegates composer invocation to Goal Prep", () => {
  assert.deepEqual(object(plugin.interface).defaultPrompt, [
    "$goal-prep prepare a thegoalbuddy board for this goal",
  ]);
});
