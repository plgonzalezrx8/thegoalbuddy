import assert from "node:assert/strict";
import { createServer } from "node:http";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { installSitesCredentialRouting } from "./sites-browser-auth.mjs";
import { chromium, type Browser, type Page } from "playwright-core";
import { errorMessage, isDirectRun, repoRoot, writeJson } from "./common.mjs";

const evidence = join(repoRoot, "audit/typescript-sites-migration/browser");
async function staticServer() {
  const base = join(repoRoot, "dist");
  const server = createServer((req, res) => {
    const path = resolve(base, "." + new URL(req.url || "/", "http://localhost").pathname.replace(/\/$/, "/index.html"));
    if (!path.startsWith(base + "/") || !existsSync(path)) { res.writeHead(404); res.end(); return; }
    const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2" };
    res.setHeader("Content-Type", types[extname(path)] || "application/octet-stream"); res.end(readFileSync(path));
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No static server address.");
  return { server, url: `http://127.0.0.1:${address.port}/` };
}
async function website(page: Page, url: string, prefix: string) {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  const response = await page.goto(url, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200);
  assert.match(await page.title(), /thegoalbuddy/);
  assert.equal(await page.locator('script[src="./script.js"]').getAttribute("type"), "module");
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), "https://thegoalbuddy.pete-nektarios.chatgpt.site");
  // Browser lazy-loading defers offscreen example images; exercise each image
  // before treating their unloaded initial state as a missing asset.
  for (const image of await page.locator("img").all()) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(async node => { if (node instanceof HTMLImageElement) await node.decode(); });
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    assert.ok(dimensions.scroll <= dimensions.client + 1, `Website horizontal overflow at ${width}px`);
    await page.screenshot({ path: join(evidence, `${prefix}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  const button = page.locator("[data-copy]").first();
  await button.focus(); await button.press("Space");
  await page.locator(".copy-toast").filter({ hasText: "Command copied" }).waitFor();
  assert.equal(await button.evaluate(node => node === document.activeElement), true);
  // Simulate a denied clipboard capability inside the real browser, not a VM stub.
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("QA denied clipboard"); } } }));
  await button.focus(); await button.press("Space");
  await page.locator(".copy-toast").filter({ hasText: "Could not copy" }).waitFor();
  assert.equal(await button.evaluate(node => node === document.activeElement), true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
  assert.ok(await page.locator('a[href="https://github.com/plgonzalezrx8/thegoalbuddy"]').count());
  const assets = await page.evaluate(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
  assert.equal(assets, true);
  assert.deepEqual(failures, []);
  return { status: "pass", url, widths: [1440, 390], esm: "pass", clipboardSuccessFailureFocus: "pass", images: "pass", reducedMotion: "pass", pageErrors: failures };
}
async function board(browser: Browser) {
  const fixture = mkdtempSync(join(tmpdir(), "thegoalbuddy-browser-board-"));
  const goal = join(fixture, "first"); const second = join(fixture, "second");
  cpSync(join(repoRoot, "goalbuddy/surfaces/local-goal-board/examples/keyboard-navigation"), goal, { recursive: true });
  cpSync(goal, second, { recursive: true });
  const secondState = join(second, "state.yaml"); writeFileSync(secondState, readFileSync(secondState, "utf8").replace("slug: keyboard-navigation", "slug: second-board").replace('title: "Make keyboard navigation dependable."', 'title: "Second board"'));
  const probe = createServer(); await new Promise<void>(done => probe.listen(0, "127.0.0.1", done));
  const address = probe.address(); if (!address || typeof address === "string") throw new Error("No board QA port.");
  const port = address.port; await new Promise<void>(done => probe.close(() => done()));
  const child = spawn(process.execPath, [join(repoRoot, "goalbuddy/surfaces/local-goal-board/scripts/local-goal-board.mjs"), "--goal", goal, "--port", String(port), "--json"], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = ""; let stderr = ""; child.stdout.on("data", bytes => { stdout += String(bytes); }); child.stderr.on("data", bytes => { stderr += String(bytes); });
  const context = await browser.newContext(); const page = await context.newPage();
  const failures: string[] = []; page.on("pageerror", error => failures.push(error.message));
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/boards`)).ok) break; } catch {} await new Promise(done => setTimeout(done, 50)); }
    assert.equal(child.exitCode, null, stderr);
    const registration = await fetch(`${base}/api/boards`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goalDir: second }) });
    assert.equal(registration.status, 200);
    await page.goto(`${base}/keyboard-navigation/`); await page.locator("[data-task-id]").first().waitFor();
    assert.match(await page.locator("#goal-title").innerText(), /keyboard navigation/);
    const task = page.locator("[data-task-id]").first(); await task.focus(); await task.press("Enter");
    await page.locator("#task-modal[open]").waitFor(); await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.querySelector("#task-modal")?.contains(document.activeElement)), true);
    await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Escape");
    await page.locator("#task-modal[open]").waitFor({ state: "hidden" });
    assert.equal(await page.locator("[data-task-id]").first().evaluate(node => node === document.activeElement), true);
    await page.locator("#settings-button").click(); await page.locator("#setting-motion").selectOption("reduce");
    await page.locator("#setting-density").selectOption("compact"); await page.locator("#settings-close").click();
    await page.reload(); await page.locator("[data-task-id]").first().waitFor(); await page.locator("#settings-button").click();
    assert.equal(await page.locator("#setting-motion").inputValue(), "reduce"); assert.equal(await page.locator("#setting-density").inputValue(), "compact");
    await page.locator("#settings-close").click();
    assert.equal(await page.locator("#board-switcher option").count(), 2);
    for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 960 }); await page.screenshot({ path: join(evidence, `board-${width}.png`), fullPage: true }); }
    const state = join(goal, "state.yaml"); const original = readFileSync(state, "utf8");
    writeFileSync(state, original.replace('title: "Make keyboard navigation dependable."', 'title: "QA live update"'));
    await page.locator("#goal-title").filter({ hasText: "QA live update" }).waitFor();
    child.kill("SIGTERM");
    await page.locator("#live-state").filter({ hasText: /Reconnecting|reconnect|offline|Offline|Disconnected|disconnected/ }).waitFor({ timeout: 10000 });
    assert.deepEqual(failures, []);
    return { status: "pass", port, keyboardDialogFocus: "pass", settingsPersistence: "pass", multiBoard: "pass", liveUpdate: "pass", reconnect: "pass", widths: [1440, 390], pageErrors: failures };
  } finally { if (child.exitCode === null) child.kill("SIGTERM"); await context.close(); rmSync(fixture, { recursive: true, force: true }); }
}
export async function browserQa() {
  mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"], headless: true });
  const local = await staticServer();
  try {
    const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
    const websiteResult = await website(await context.newPage(), local.url, "website-local"); await context.close();
    const boardResult = await board(browser);
    writeJson(join(evidence, "local-results.json"), { browser: await browser.version(), website: websiteResult, board: boardResult });
    console.log("Actual Chromium website and local board acceptance passed.");
  } finally { await browser.close(); await new Promise<void>(done => local.server.close(() => done())); }
}

async function hostedQa(value: unknown) {
  if (!value || typeof value !== "object" || !("url" in value) || typeof value.url !== "string" || !("token" in value) || typeof value.token !== "string" || !("version_id" in value) || typeof value.version_id !== "string") throw new Error("Incomplete hosted QA packet.");
  const origin = new URL(value.url).origin;
  if (origin !== "https://thegoalbuddy.pete-nektarios.chatgpt.site" || ![origin, origin + "/"].includes(value.url)) throw new Error("Hosted QA credential is restricted to its literal selected Site origin.");
  const token = value.token;
  mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"], headless: true });
  try {
    const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], serviceWorkers: "block" });
    const page = await context.newPage();
    await installSitesCredentialRouting(page, origin, token);
    const result = await website(page, value.url, "website-hosted");
    const anonymousContext = await browser.newContext({ serviceWorkers: "block" });
    let anonymousStatus: number;
    try {
      const anonymous = await anonymousContext.request.get(value.url, { maxRedirects: 0 });
      anonymousStatus = anonymous.status();
      assert.ok([301, 302, 303, 307, 308, 401, 403].includes(anonymousStatus), "Owner-private Site must challenge fresh anonymous access.");
    } finally { await anonymousContext.close(); }
    writeJson(join(evidence, "hosted-results.json"), { browser: await browser.version(), version_id: value.version_id, website: result, access: "owner-private", anonymousStatus });
    await context.close();
    console.log("Hosted owner-private Site browser acceptance and anonymous-access boundary passed.");
  } finally { await browser.close(); }
}
if (isDirectRun(import.meta.url)) {
  if (process.argv.includes("--hosted")) {
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdout.write("Ready for hosted QA JSON on stdin (input is hidden).\n");
    let buffer = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      buffer += chunk;
      if (!buffer.includes("\n")) return;
      process.stdin.pause();
      let input: unknown;
      try { input = JSON.parse(buffer.slice(0, buffer.indexOf("\n"))); }
      catch {
        buffer = "";
        console.error("Invalid hosted QA credential packet."); process.exitCode = 1;
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.destroy(); return;
      }
      buffer = "";
      hostedQa(input).catch(() => { console.error("Hosted Site browser verification failed."); process.exitCode = 1; }).finally(() => { if (process.stdin.isTTY) process.stdin.setRawMode(false); process.stdin.destroy(); });
    });
  } else browserQa().catch(error => { console.error(error instanceof Error ? error.stack : errorMessage(error)); process.exitCode = 1; });
}
