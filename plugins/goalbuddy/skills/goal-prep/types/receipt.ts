/** External dispatch commands use cmd; persisted board command evidence has its own parser. */
export interface ExternalCommand { cmd: string; status: "pass"; }
export interface ReceiptContext {
  taskId?: string;
  boardPath?: string;
  role?: unknown;
  harness?: unknown;
  requireIdentity?: boolean;
  status?: string;
  validateRoleFields?: boolean;
}
export interface ScopeVerdict { status: string; changed_files?: string[]; violations?: string[]; reason?: string; }
export type Receipt = Record<string, unknown> & { result: "done" | "blocked" };
