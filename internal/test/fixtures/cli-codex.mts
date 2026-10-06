/** Synthetic native CLI used to test installer contracts; no model execution. */
import { existsSync } from "node:fs";
const args = process.argv.slice(2);
const [command, subcommand, action] = args;
if (process.env.THEGOALBUDDY_FIXTURE_REQUIRE_HOME === "true" && !existsSync(process.env.CODEX_HOME || "")) {
  console.error("fresh Codex home missing"); process.exit(1);
}
if (command === "--version") { console.log("codex-cli 0.128.0"); process.exit(0); }
if (command === "login" && subcommand === "status") {
  const loggedIn = process.env.THEGOALBUDDY_FIXTURE_LOGGED_IN !== "false";
  console.log(loggedIn ? "Logged in with ChatGPT" : "Not logged in"); process.exit(loggedIn ? 0 : 1);
}
if (command === "features" && subcommand === "list") {
  console.log(`goals                               under development  ${process.env.THEGOALBUDDY_FIXTURE_GOALS !== "false"}`);
  process.exit(0);
}
if (command === "plugin" && subcommand === "marketplace" && action === "add") {
  console.log("Added marketplace goalbuddy"); process.exit(0);
}
process.exit(2);
