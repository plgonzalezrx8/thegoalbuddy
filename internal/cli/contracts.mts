/** Runtime boundary contracts shared by dependency-free CLI and release tools. */
export interface CommandResult {
  status: number | null;
  stdout?: string;
  stderr?: string;
  error?: unknown;
}
export type NpmRunner = (args: string[]) => CommandResult;
export interface PackageIdentity { name: string; version: string }
export interface PackageMetadata extends PackageIdentity {
  bin: Record<string, string>;
  repository?: { url?: string };
  publishConfig?: { registry?: string; access?: string };
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function parseJson(text: string): unknown { return JSON.parse(text); }
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function parsePackage(value: unknown): PackageMetadata {
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.version !== "string") {
    throw new Error("Package metadata must include a string name and version.");
  }
  const bin: Record<string, string> = {};
  if (isRecord(value.bin)) {
    for (const [key, entry] of Object.entries(value.bin)) {
      if (typeof entry !== "string") throw new Error("Package binary paths must be strings.");
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
export function registryErrorCode(value: unknown): unknown {
  return isRecord(value) && isRecord(value.error) ? value.error.code : undefined;
}
