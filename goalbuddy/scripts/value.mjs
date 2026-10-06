// Generated from goalbuddy/scripts/value.mts; do not edit.
/** Narrow unknown external values before property access. */
export function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function record(value) {
    return isRecord(value) ? value : {};
}
export function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
export function errorCode(error) { return record(error).code; }
