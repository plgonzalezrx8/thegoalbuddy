import type { Page } from "playwright-core";

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Chromium QA only: CDP pauses each redirect hop before its network request. */
export async function installSitesCredentialRouting(page: Page, origin: string, token: string): Promise<void> {
  const session = await page.context().newCDPSession(page);
  async function continueRequest(value: unknown): Promise<void> {
    if (!object(value) || typeof value.requestId !== "string") return;
    const requestId = value.requestId;
    try {
      if (!object(value.request) || typeof value.request.url !== "string" || !object(value.request.headers)) throw new Error("Invalid paused request metadata.");
      const headers: Array<{ name: string; value: string }> = [];
      for (const [name, header] of Object.entries(value.request.headers)) {
        if (name.toLowerCase() === "oai-sites-authorization") continue;
        if (typeof header !== "string") throw new Error("Invalid paused request header.");
        headers.push({ name, value: header });
      }
      if (new URL(value.request.url).origin === origin) headers.push({ name: "OAI-Sites-Authorization", value: `Bearer ${token}` });
      // CDP overrides apply to this paused request only. Every redirect pauses
      // again, and foreign requests have any Sites authorization stripped.
      await session.send("Fetch.continueRequest", { requestId, headers });
    } catch {
      // Protocol errors can include request metadata; expose no raw diagnostic.
      try { await session.send("Fetch.failRequest", { requestId, errorReason: "Failed" }); } catch { /* Page/session may already be closed. */ }
    }
  }
  session.on("Fetch.requestPaused", (value: unknown) => { void continueRequest(value); });
  await session.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
}
