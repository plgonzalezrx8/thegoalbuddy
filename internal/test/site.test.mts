import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

type ClickHandler = () => Promise<void>;

function browserFixture(clipboard: "success" | "denied" | "fallback", fallbackSucceeds = true) {
  let activeElement: FakeElement | null = null;
  let click: ClickHandler | undefined;
  const copied: string[] = [];
  const timers: Array<() => void> = [];
  class FakeElement {
    textContent = "";
    classList = { add() {}, remove() {} };
    focus(): void { activeElement = this; }
  }
  class FakeButton extends FakeElement {
    dataset = { copy: "npx thegoalbuddy@latest" };
    label = new FakeElement();
    private isDisabled = false;
    get disabled(): boolean { return this.isDisabled; }
    set disabled(value: boolean) {
      this.isDisabled = value;
      if (value && activeElement === this) activeElement = null;
    }
    querySelector(): FakeElement { return this.label; }
    addEventListener(_name: string, handler: ClickHandler): void { click = handler; }
    getAttribute(name: string): string | null { return name === "data-copy" ? this.dataset.copy : null; }
  }
  class FakeTextarea extends FakeElement {
    value = "";
    style = { position: "", opacity: "" };
    removed = false;
    setAttribute() {}
    select(): void { activeElement = this; }
    remove(): void { this.removed = true; }
  }
  const toast = new FakeElement();
  const button = new FakeButton();
  const fields: FakeTextarea[] = [];
  activeElement = button;
  const navigator = clipboard === "fallback" ? {} : {
    clipboard: { async writeText(value: string): Promise<void> {
      if (clipboard === "denied") throw new Error("Permission denied");
      copied.push(value);
    } },
  };
  const document = {
    get activeElement() { return activeElement; },
    querySelector() { return toast; },
    querySelectorAll() { return [button]; },
    createElement() { const field = new FakeTextarea(); fields.push(field); return field; },
    body: { append() {} },
    execCommand() { if (fallbackSucceeds) copied.push(fields.at(-1)?.value ?? ""); return fallbackSucceeds; },
  };
  const setTimeout = (callback: () => void): number => { timers.push(callback); return timers.length; };
  // The browser code has no imports or runtime exports. Remove only the
  // compiler's empty module marker for this DOM fixture. Genuine browser
  // acceptance separately verifies loading through the HTML module script.
  const script = readFileSync(resolve("internal/site/script.js"), "utf8").replace(/^export \{\};\s*$/m, "");
  assert.doesNotMatch(script, /^\s*(?:import|export)\s/m, "fixture must not erase runtime module semantics");
  runInNewContext(script, {
    document, navigator, HTMLElement: FakeElement, HTMLButtonElement: FakeButton,
    setTimeout, clearTimeout() {}, window: { setTimeout, clearTimeout() {} },
  });
  return {
    button, toast, copied, fields, timers,
    async click() { assert.ok(click, "copy listener must be registered"); await click(); },
    activeElement() { return activeElement; },
  };
}

test("website clipboard success restores keyboard focus after temporarily disabling the button", async () => {
  const browser = browserFixture("success");
  await browser.click();
  assert.deepEqual(browser.copied, [browser.button.dataset.copy]);
  assert.equal(browser.button.label.textContent, "Copied");
  assert.equal(browser.button.disabled, false);
  assert.equal(browser.activeElement(), browser.button, "copy completion must restore focus to the enabled button");
});

test("website denied clipboard reports failure truthfully and restores focus", async () => {
  const browser = browserFixture("denied");
  await browser.click();
  assert.deepEqual(browser.copied, []);
  assert.equal(browser.button.label.textContent, "Select text");
  assert.match(browser.toast.textContent, /Could not copy/);
  assert.equal(browser.activeElement(), browser.button);
});

test("website clipboard fallback cleans temporary fields and restores keyboard focus", async () => {
  for (const success of [true, false]) {
    const browser = browserFixture("fallback", success);
    await browser.click();
    assert.equal(browser.fields.length, 1);
    assert.equal(browser.fields[0]?.removed, true);
    assert.equal(browser.activeElement(), browser.button);
    assert.equal(browser.button.label.textContent, success ? "Copied" : "Select text");
    assert.match(browser.toast.textContent, success ? /Command copied/ : /Could not copy/);
  }
});
