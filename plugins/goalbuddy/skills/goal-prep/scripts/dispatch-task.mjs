#!/usr/bin/env node
// Generated from goalbuddy/scripts/dispatch-task.mts; do not edit.
// Dispatch one board task to an external harness CLI and verify the result.
// Read-only toward state.yaml: prints the receipt and scope verdict; the PM records them.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, readlinkSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { formatPrompt, loadBoard, renderTaskPrompt, resolveBoardPath, selectTask } from "./render-task-prompt.mjs";
import { receiptErrors } from "./receipt-provenance.mjs";
import { isRecord, errorMessage, errorCode } from "./value.mjs";
const HARNESSES = new Set(["codex", "claude-code"]);
const READ_ONLY_ROLES = new Set(["scout", "judge"]);
if (isDirectRun()) {
    try {
        const options = parseDispatchArgs(process.argv.slice(2));
        const report = dispatchTask(options);
        if (options.json) {
            console.log(JSON.stringify(report, null, 2));
        }
        else {
            printHumanReport(report);
        }
        process.exitCode = report.ok ? 0 : 1;
    }
    catch (error) {
        console.error(errorMessage(error));
        process.exitCode = 1;
    }
}
function isDirectRun() {
    if (!process.argv[1])
        return false;
    return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
export function parseDispatchArgs(args) {
    const options = { goalRoot: "", taskId: "", to: "", model: "", timeoutSeconds: 1200, json: false };
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "--json")
            options.json = true;
        else if (arg === "--task")
            options.taskId = args[++index] || "";
        else if (arg.startsWith("--task="))
            options.taskId = arg.slice("--task=".length);
        else if (arg === "--to")
            options.to = args[++index] || "";
        else if (arg.startsWith("--to="))
            options.to = arg.slice("--to=".length);
        else if (arg === "--model")
            options.model = args[++index] || "";
        else if (arg.startsWith("--model="))
            options.model = arg.slice("--model=".length);
        else if (arg === "--timeout")
            options.timeoutSeconds = Number(args[++index] || 0) || 1200;
        else if (arg.startsWith("--timeout="))
            options.timeoutSeconds = Number(arg.slice("--timeout=".length)) || 1200;
        else if (arg.startsWith("-"))
            throw new Error(`Unknown argument: ${arg}`);
        else if (!options.goalRoot)
            options.goalRoot = arg;
        else
            throw new Error(`Unexpected argument: ${arg}`);
    }
    if (!options.goalRoot) {
        throw new Error("Usage: node dispatch-task.mjs <goal-root> --to codex|claude-code [--task T###] [--model <name>] [--timeout <seconds>] [--json]");
    }
    return options;
}
export function dispatchTask(options) {
    const boardPath = resolveBoardPath({ goalRoot: options.goalRoot });
    const board = loadBoard(boardPath);
    const task = selectTask(board, options.taskId);
    const to = options.to || cleanScalar(task.harness) || "";
    if (!HARNESSES.has(to)) {
        return failure(`Unknown or missing dispatch target "${to}". Use --to codex or --to claude-code (or set harness: on the task card).`, { task_id: task.id });
    }
    const rendered = renderTaskPrompt({ goalRoot: options.goalRoot, taskId: options.taskId, json: false });
    const role = rendered.payload.task.type;
    const prompt = [
        formatPrompt(rendered.payload, { includePmObservationContract: false }),
        "",
        "Dispatch notes:",
        `- Work only inside the current directory: ${process.cwd()}`,
        "- Do not edit state.yaml or any thegoalbuddy control files; the PM records your receipt.",
        `- End your reply with exactly one goalbuddy_receipt_v1 JSON object, including "harness": "${to}".`,
    ].join("\n");
    const before = gitSnapshot(boardPath);
    if (before.error)
        return failure(before.error, { task_id: task.id, board_path: boardPath, scope_check: { status: "unverified", changed_files: [], violations: [] } });
    const run = runHarness(to, prompt, { model: options.model, sandbox: rendered.payload.metadata.sandbox, role, timeoutSeconds: options.timeoutSeconds });
    const after = gitSnapshot(boardPath);
    const scope = scopeCheck({ before, after, role, allowedFiles: rendered.payload.task.allowed_files, controlFiles: new Set([...(before.controlFiles || []), ...(after.controlFiles || [])]) });
    if (run.error) {
        return failure(run.error, {
            task_id: task.id,
            harness: to,
            role,
            exit_status: run.status ?? null,
            timeout_semantics: run.timedOut ? "hard_execution_deadline" : null,
            scope_check: scope,
        });
    }
    const receipt = extractReceipt(`${run.stdout}\n${run.stderr}`);
    if (receipt && !receipt.harness)
        receipt.harness = to;
    const provenanceErrors = receipt ? receiptErrors(receipt, { taskId: task.id, boardPath, role, harness: to, requireIdentity: true }) : [];
    const report = {
        ok: Boolean(receipt) && provenanceErrors.length === 0 && scope.status === "clean" && run.status === 0,
        board_path: boardPath,
        harness: to,
        task_id: task.id,
        role,
        exit_status: run.status,
        receipt: receipt || null,
        scope_check: scope,
    };
    if (provenanceErrors.length)
        report.error = provenanceErrors.join(" ");
    if (scope.status === "unverified")
        report.error = scope.reason;
    if (!receipt) {
        report.error = "No goalbuddy_receipt_v1 object found in the harness output.";
        report.output_tail = `${run.stdout}`.slice(-2000);
    }
    return report;
}
function failure(message, extra = {}) {
    return { ok: false, error: message, receipt: null, scope_check: { status: "skipped" }, ...extra };
}
function runHarness(to, prompt, { model, sandbox, role, timeoutSeconds }) {
    const command = harnessCommand(to, prompt, { model, sandbox, role });
    const result = spawnSync(command.file, command.args, {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: timeoutSeconds * 1000,
        shell: process.platform === "win32",
        env: process.env,
        maxBuffer: 32 * 1024 * 1024,
    });
    if (errorCode(result.error) === "ENOENT") {
        return { error: `The ${to} CLI ("${command.file}") was not found on PATH. Install it or choose another --to target.` };
    }
    if (errorCode(result.error) === "ETIMEDOUT") {
        return {
            error: `The ${to} CLI hit its hard execution timeout after ${timeoutSeconds}s. Inspect the scope check and working tree for partial writes before fallback.`,
            status: result.status,
            timedOut: true,
        };
    }
    if (result.error)
        return { error: errorMessage(result.error) };
    return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
}
export function harnessCommand(to, prompt, { model = "", sandbox = "workspace-write", role = "worker" } = {}) {
    if (to === "codex") {
        const args = ["exec", "--skip-git-repo-check", "-c", `sandbox_mode=${JSON.stringify(sandbox)}`];
        if (model)
            args.push("-c", `model=${JSON.stringify(model)}`);
        args.push(prompt);
        return { file: "codex", args };
    }
    const args = ["-p", prompt];
    if (model)
        args.push("--model", model);
    if (!READ_ONLY_ROLES.has(role))
        args.push("--permission-mode", "acceptEdits");
    return { file: "claude", args };
}
export function extractReceipt(output) {
    const text = String(output || "").replace(/```[a-z]*\n?/gi, "");
    const key = '"goalbuddy_receipt_v1"';
    let searchFrom = text.length;
    while (true) {
        const keyIndex = text.lastIndexOf(key, searchFrom);
        if (keyIndex === -1)
            break;
        const start = text.lastIndexOf("{", keyIndex);
        if (start !== -1) {
            const candidate = parseBalancedObject(text, start);
            const receipt = isRecord(candidate) ? candidate.goalbuddy_receipt_v1 ?? candidate : null;
            if (isReceiptShaped(receipt))
                return receipt;
        }
        if (keyIndex === 0)
            break;
        searchFrom = keyIndex - 1;
    }
    // Fallback: models often return the receipt bare, without the envelope.
    // Scan candidate objects from the end of the output (receipts come last).
    const starts = [];
    for (let index = 0; index < text.length; index += 1) {
        if (text[index] === "{" && (index === 0 || /[\s`:>]/.test(text[index - 1])))
            starts.push(index);
    }
    for (let attempt = starts.length - 1, tried = 0; attempt >= 0 && tried < 50; attempt -= 1, tried += 1) {
        const candidate = parseBalancedObject(text, starts[attempt]);
        if (isReceiptShaped(candidate))
            return candidate;
    }
    return null;
}
function parseBalancedObject(text, start) {
    let depth = 0;
    let inString = false;
    for (let index = start; index < text.length; index += 1) {
        const char = text[index];
        if (inString) {
            if (char === "\\")
                index += 1;
            else if (char === '"')
                inString = false;
            continue;
        }
        if (char === '"')
            inString = true;
        else if (char === "{")
            depth += 1;
        else if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                try {
                    return JSON.parse(text.slice(start, index + 1));
                }
                catch {
                    return null;
                }
            }
        }
    }
    return null;
}
function isReceiptShaped(candidate) {
    if (!isRecord(candidate))
        return false;
    if (candidate.result !== "done" && candidate.result !== "blocked")
        return false;
    return ["task_id", "decision", "summary", "changed_files", "evidence"].some((field) => field in candidate);
}
// Compare the actual pre/post-dispatch working tree and index, not the
// filenames dirty relative to HEAD. NUL-delimited Git output preserves names.
function gitSnapshot(boardPath) {
    const git = (args) => {
        const result = spawnSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
        if (result.error || result.status !== 0)
            throw new Error(result.error?.message || result.stderr.trim() || "Git scope snapshot failed.");
        return result.stdout;
    };
    try {
        const root = resolve(git(["rev-parse", "--show-toplevel"]).trim());
        const boardRelative = relative(root, boardPath);
        if (boardRelative === ".." || boardRelative.startsWith(`..${sep}`))
            throw new Error("Dispatch board must be inside the Git working tree.");
        const paths = new Set(git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).split("\0").filter(Boolean));
        const index = new Map();
        for (const entry of git(["ls-files", "--stage", "-z"]).split("\0").filter(Boolean)) {
            const tab = entry.indexOf("\t");
            const path = entry.slice(tab + 1);
            index.set(path, `${index.get(path) || ""}${entry.slice(0, tab)};`);
        }
        const controlFiles = new Set();
        const collectGoal = (dir) => {
            let entries;
            try {
                entries = readdirSync(dir, { withFileTypes: true });
            }
            catch (error) {
                if (errorCode(error) === "ENOENT")
                    return;
                throw error;
            }
            for (const entry of entries) {
                const path = join(dir, entry.name);
                if (entry.isDirectory())
                    collectGoal(path);
                else {
                    const name = relative(root, path).split(sep).join("/");
                    paths.add(name);
                    if (["state.yaml", "goal.md"].includes(entry.name))
                        controlFiles.add(name);
                }
            }
        };
        // Goal state is often gitignored. Protect it independently of Git's ignore rules.
        collectGoal(join(root, "docs", "goals"));
        collectGoal(dirname(boardPath));
        const files = new Map();
        for (const path of paths) {
            const diskPath = join(root, path);
            let content = null;
            try {
                const stat = lstatSync(diskPath);
                if (stat.isSymbolicLink()) {
                    content = `link:${stat.mode}:${readlinkSync(diskPath)}`;
                    try {
                        // Include a file symlink's referent: changing it leaves the link itself unchanged.
                        if (statSync(diskPath).isFile())
                            content += `:${createHash("sha256").update(readFileSync(diskPath)).digest("hex")}`;
                    }
                    catch (error) {
                        if (errorCode(error) !== "ENOENT")
                            throw error;
                    }
                }
                else if (stat.isFile())
                    content = `file:${stat.mode}:${createHash("sha256").update(readFileSync(diskPath)).digest("hex")}`;
                else
                    throw new Error(`Cannot snapshot non-file path: ${path}`);
            }
            catch (error) {
                if (errorCode(error) !== "ENOENT")
                    throw error;
            }
            files.set(path, JSON.stringify([content, index.get(path) || null]));
        }
        return { files, controlFiles };
    }
    catch (error) {
        return { error: `Cannot verify dispatch scope: ${errorMessage(error)}` };
    }
}
export function scopeCheck({ before, after, role, allowedFiles = [], controlFiles = new Set() }) {
    if (!before || !after || (!(before instanceof Map) && before.error) || (!(after instanceof Map) && after.error))
        return { status: "unverified", changed_files: [], violations: [], reason: (!(before instanceof Map) && before?.error) || (!(after instanceof Map) && after?.error) || "Content snapshots are required to verify dispatch scope." };
    const previous = before instanceof Map ? before : before.files;
    const current = after instanceof Map ? after : after.files;
    if (!(previous instanceof Map) || !(current instanceof Map))
        return { status: "unverified", changed_files: [], violations: [], reason: "Content snapshots are required to verify dispatch scope." };
    const changed = [...new Set([...previous.keys(), ...current.keys()])].filter((file) => previous.get(file) !== current.get(file)).sort();
    if (READ_ONLY_ROLES.has(role)) {
        return changed.length
            ? { status: "violations", changed_files: changed, violations: changed, reason: `Read-only role "${role}" modified files.` }
            : { status: "clean", changed_files: changed, violations: [] };
    }
    const violations = changed.filter((file) => controlFiles.has(file)
        || /(^|\/)docs\/goals\/.*\/(state\.yaml|goal\.md)$/.test(file)
        || !allowedFiles.some((pattern) => matchesPattern(file, pattern)));
    return violations.length
        ? { status: "violations", changed_files: changed, violations, reason: "Files changed outside allowed_files or authoritative goal files were modified." }
        : { status: "clean", changed_files: changed, violations: [] };
}
export function matchesPattern(file, pattern) {
    const normalized = String(pattern || "").replace(/\\/g, "/").trim();
    if (!normalized)
        return false;
    if (normalized === file)
        return true;
    if (normalized.endsWith("/**"))
        return file.startsWith(normalized.slice(0, -2));
    if (!normalized.includes("*"))
        return false;
    const source = normalized.split("*").map(escapeRegExp).join("[^/]*");
    return new RegExp(`^${source}$`).test(file);
}
function escapeRegExp(value) {
    return String(value).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}
function cleanScalar(value) {
    return typeof value === "string" ? value.trim() : "";
}
function printHumanReport(report) {
    if (report.error)
        console.log(`Dispatch failed: ${report.error}`);
    if (report.receipt) {
        console.log(`Receipt from ${report.harness} for ${report.task_id} (${report.role}): result ${report.receipt.result}`);
        console.log(JSON.stringify(report.receipt, null, 2));
    }
    if (report.scope_check) {
        console.log(`Scope check: ${report.scope_check.status}`);
        if (report.scope_check.violations?.length) {
            console.log(`Violations: ${report.scope_check.violations.join(", ")}`);
        }
    }
    console.log(report.ok
        ? "Dispatch ok. Record the receipt on the task card (state.yaml) as the PM."
        : "Dispatch NOT ok. Inspect the working tree and receipt before recording anything.");
}
