/** Assertions for untrusted CLI/manifest JSON: narrow before reading fields. */
import assert from "node:assert/strict";
import { isRecord } from "../../cli/contracts.mjs";
export function object(value: unknown): Record<string, unknown> {
  assert.ok(isRecord(value), "expected JSON object");
  return value;
}
export function parseObject(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  return object(value);
}
export function array(value: unknown): unknown[] { assert.ok(Array.isArray(value), "expected JSON array"); return value; }
export function text(value: unknown): string { if (typeof value !== "string") assert.fail("expected JSON string"); return value; }
export function texts(value: unknown): string[] { return array(value).map(text); }
