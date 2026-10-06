#!/usr/bin/env node
import { appendFileSync } from "node:fs";

// Synthetic installation contract only; never runs an agent or model.
if (process.env.GOALBUDDY_SMOKE_SYNTHETIC_CODEX !== "1") process.exit(2);
const log = process.env.GOALBUDDY_SMOKE_CODEX_LOG;
if (!log) throw new Error("Synthetic package Codex fixture requires an isolated call log.");
const args = process.argv.slice(2);
appendFileSync(log, JSON.stringify(args) + "\n");
if (args.join(" ") === "--version") console.log("codex-cli 0.128.0");
else if (args.join(" ") === "login status") console.log("Logged in with ChatGPT (synthetic fixture)");
else if (args.join(" ") === "features list") console.log("goals                               under development  true");
else if (args.slice(0, 3).join(" ") === "plugin marketplace add") console.log("Added marketplace (synthetic fixture)");
else process.exit(2);
