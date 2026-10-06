// Generated from internal/cli/contracts.mts; do not edit.
export function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function parseJson(text) { return JSON.parse(text); }
export function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
export function parsePackage(value) {
    if (!isRecord(value) || typeof value.name !== "string" || typeof value.version !== "string") {
        throw new Error("Package metadata must include a string name and version.");
    }
    const bin = {};
    if (isRecord(value.bin)) {
        for (const [key, entry] of Object.entries(value.bin)) {
            if (typeof entry !== "string")
                throw new Error("Package binary paths must be strings.");
            bin[key] = entry;
        }
    }
    return {
        name: value.name, version: value.version, bin,
        ...(isRecord(value.repository) ? { repository: { url: typeof value.repository.url === "string" ? value.repository.url : undefined } } : {}),
        ...(isRecord(value.publishConfig) ? { publishConfig: {
                registry: typeof value.publishConfig.registry === "string" ? value.publishConfig.registry : undefined,
                access: typeof value.publishConfig.access === "string" ? value.publishConfig.access : undefined,
            } } : {}),
    };
}
export function registryErrorCode(value) {
    return isRecord(value) && isRecord(value.error) ? value.error.code : undefined;
}
