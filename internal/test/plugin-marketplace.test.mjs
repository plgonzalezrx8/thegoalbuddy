import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const marketplace = JSON.parse(readFileSync(".agents/plugins/marketplace.json", "utf8"));
const claudeMarketplace = JSON.parse(readFileSync(".claude-plugin/marketplace.json", "utf8"));
const plugin = JSON.parse(readFileSync("plugins/goalbuddy/.codex-plugin/plugin.json", "utf8"));
const claudePlugin = JSON.parse(readFileSync("plugins/goalbuddy/.claude-plugin/plugin.json", "utf8"));

test("thegoalbuddy plugin is exposed through a Codex marketplace manifest", () => {
  assert.equal(marketplace.name, "thegoalbuddy");
  assert.equal(marketplace.interface.displayName, "thegoalbuddy");
  assert.equal(marketplace.plugins.length, 1);

  const [entry] = marketplace.plugins;
  assert.equal(entry.name, "thegoalbuddy");
  assert.equal(entry.source.source, "local");
  assert.equal(entry.source.path, "./plugins/goalbuddy");
  assert.equal(entry.policy.installation, "INSTALLED_BY_DEFAULT");
  assert.equal(entry.category, "Coding");
});

test("thegoalbuddy plugin is exposed through a Claude marketplace manifest", () => {
  assert.equal(claudeMarketplace.name, "thegoalbuddy");
  assert.equal(claudeMarketplace.owner.name, "plgonzalezrx8");
  assert.equal(claudeMarketplace.plugins.length, 1);

  const [entry] = claudeMarketplace.plugins;
  assert.equal(entry.name, "thegoalbuddy");
  assert.equal(entry.source, "./plugins/goalbuddy");
  assert.ok(pkg.files.includes(".claude-plugin/marketplace.json"));
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
  assert.ok(!claudePlugin.keywords.includes("extensions"));
});

test("thegoalbuddy plugin delegates composer invocation to Goal Prep", () => {
  assert.deepEqual(plugin.interface.defaultPrompt, [
    "$goal-prep prepare a thegoalbuddy board for this goal",
  ]);
});
