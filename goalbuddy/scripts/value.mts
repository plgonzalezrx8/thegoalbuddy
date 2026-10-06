/** Narrow unknown external values before property access. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function errorCode(error: unknown): unknown { return record(error).code; }
