import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "playwright-core";
import { installSitesCredentialRouting } from "./sites-browser-auth.mjs";
import { isDirectRun, repoRoot, writeJson } from "./common.mjs";
import { join } from "node:path";

export async function sitesAuthQa(): Promise<void> {
  const selectedHeaders: Array<string | undefined> = [];
  let foreignHeader: string | undefined;
  const foreign = createServer((req, res) => { foreignHeader = req.headers["oai-sites-authorization"]?.toString(); res.end("foreign origin"); });
  await new Promise<void>(done => foreign.listen(0, "127.0.0.1", done));
  const foreignAddress = foreign.address(); if (!foreignAddress || typeof foreignAddress === "string") throw new Error("Missing foreign fixture port.");
  const foreignUrl = `http://127.0.0.1:${foreignAddress.port}/`;
  const selected = createServer((req, res) => { selectedHeaders.push(req.headers["oai-sites-authorization"]?.toString()); res.writeHead(302, { Location: req.url === "/same" ? "/" : foreignUrl }); res.end(); });
  await new Promise<void>(done => selected.listen(0, "127.0.0.1", done));
  const selectedAddress = selected.address(); if (!selectedAddress || typeof selectedAddress === "string") throw new Error("Missing selected fixture port.");
  const selectedUrl = `http://127.0.0.1:${selectedAddress.port}/`;
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"], headless: true });
  try {
    const page = await browser.newPage({ serviceWorkers: "block" });
    await installSitesCredentialRouting(page, new URL(selectedUrl).origin, "SYNTHETIC_SECRET_SENTINEL");
    await page.goto(selectedUrl + "same", { waitUntil: "networkidle" });
    assert.ok(selectedHeaders.length >= 2 && selectedHeaders.every(header => header === "Bearer SYNTHETIC_SECRET_SENTINEL"), "selected origin and its same-origin redirect must receive their credential");
    assert.equal(foreignHeader, undefined, "redirect to foreign origin must receive no Sites credential");
    writeJson(join(repoRoot, "audit/typescript-sites-migration/browser/sites-auth-results.json"), { status: "pass", browser: await browser.version(), selectedOriginAuthenticated: true, sameOriginRedirectAuthenticated: true, foreignRedirectCredentialAbsent: true, realCredentialsUsed: false });
    console.log("Actual Chromium Sites credential redirect boundary passed.");
  } finally {
    await browser.close();
    await Promise.all([foreign, selected].map(server => new Promise<void>(done => server.close(() => done()))));
  }
}
if (isDirectRun(import.meta.url)) sitesAuthQa().catch(error => {
  console.error(error instanceof assert.AssertionError && error.actual !== undefined && error.expected === undefined
    ? "Assertion failed: redirect to foreign origin must receive no Sites credential."
    : "Sites credential redirect boundary verification failed before its redirect assertion.");
  process.exitCode = 1;
});
