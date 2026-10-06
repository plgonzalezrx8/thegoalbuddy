// Generated from goalbuddy/scripts/receipt-provenance.mts; do not edit.
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { isRecord } from "./value.mjs";
// Identity is optional for legacy manually recorded receipts, mandatory for
// external dispatch. Never strip supplied provenance before checking it.
export function receiptErrors(receipt, { taskId, boardPath, role, harness, requireIdentity = false, status, validateRoleFields = true } = {}) {
    const errors = [];
    if (!isRecord(receipt))
        return ["Receipt must be an object."];
    if (receipt.result !== "done" && receipt.result !== "blocked")
        errors.push("Receipt result must be done or blocked.");
    if (status && status !== receipt.result)
        errors.push("Requested status conflicts with receipt result.");
    if (requireIdentity && !receipt.task_id)
        errors.push("Receipt task_id is required for dispatch.");
    if (requireIdentity && !receipt.board_path)
        errors.push("Receipt board_path is required for dispatch.");
    if (receipt.task_id !== undefined && receipt.task_id !== taskId)
        errors.push(`Receipt task_id does not match ${taskId}.`);
    if (receipt.board_path !== undefined && !sameBoard(receipt.board_path, boardPath))
        errors.push("Receipt board_path does not match the selected board.");
    if (receipt.role !== undefined && receipt.role !== role)
        errors.push("Receipt role does not match the selected task.");
    if (harness && receipt.harness !== undefined && receipt.harness !== harness)
        errors.push("Receipt harness does not match dispatch harness.");
    if (validateRoleFields && receipt.result === "done") {
        if (role === "worker") {
            if (!Array.isArray(receipt.changed_files) || !receipt.changed_files.length)
                errors.push("Done Worker receipt must list changed_files.");
            if (!Array.isArray(receipt.commands) || !receipt.commands.length || receipt.commands.some((command) => !isRecord(command) || typeof command.cmd !== "string" || !command.cmd.trim() || command.status !== "pass"))
                errors.push("Done Worker receipt must include passing commands.");
            if (typeof receipt.summary !== "string" || !receipt.summary.trim())
                errors.push("Done Worker receipt must include summary.");
        }
        else if (role === "judge" && typeof receipt.decision !== "string") {
            errors.push("Done Judge receipt must include decision.");
        }
        else if (role === "scout" && (typeof receipt.summary !== "string" || (!Array.isArray(receipt.evidence) && !receipt.note))) {
            errors.push("Done Scout receipt must include summary and evidence or note.");
        }
    }
    return errors;
}
export function dispatchReportErrors(report, context) {
    if (!isRecord(report))
        return ["Dispatch report must be an object."];
    const errors = [];
    const scope = isRecord(report.scope_check) ? report.scope_check : {};
    if (report.ok !== true)
        errors.push("Dispatch report was not successful.");
    const violationLength = typeof scope.violations === "string" || Array.isArray(scope.violations)
        ? scope.violations.length : isRecord(scope.violations) ? Number(scope.violations.length) : 0;
    if (scope.status !== "clean" || violationLength > 0)
        errors.push("Dispatch report requires a clean scope verdict without violations.");
    if (report.exit_status !== 0)
        errors.push("Dispatch executor did not exit successfully.");
    if (!report.task_id || report.task_id !== context.taskId)
        errors.push("Dispatch task_id does not match the selected task.");
    if (!sameBoard(report.board_path, context.boardPath))
        errors.push("Dispatch board_path does not match the selected board.");
    if (!["scout", "judge", "worker", "pm"].some((role) => role === report.role) || report.role !== context.role)
        errors.push("Dispatch role does not match the selected task.");
    if (!["codex", "claude-code"].some((harness) => harness === report.harness))
        errors.push("Dispatch harness must be codex or claude-code.");
    errors.push(...receiptErrors(report.receipt, { ...context, harness: report.harness, requireIdentity: true }));
    return errors;
}
function sameBoard(left, right) {
    if (typeof left !== "string" || !left.trim() || typeof right !== "string")
        return false;
    const canonical = (path) => { try {
        return realpathSync(resolve(path));
    }
    catch {
        return resolve(path);
    } };
    return canonical(left) === canonical(right);
}
