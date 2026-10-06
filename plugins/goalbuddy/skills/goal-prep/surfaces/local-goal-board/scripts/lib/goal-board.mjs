import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const VALID_STATUSES = new Set(["queued", "active", "blocked", "done"]);
const COLUMN_ORDER = ["todo", "in-progress", "blocked", "completed"];
const __dirname = dirname(fileURLToPath(import.meta.url));
const surfaceRoot = resolve(__dirname, "../..");
const assetDir = join(surfaceRoot, "assets");
const uiDir = join(surfaceRoot, "ui");

export class GoalBoardError extends Error {
  constructor(message) {
    super(message);
    this.name = "GoalBoardError";
  }
}

export async function loadGoalBoard(goalDir) {
  const root = resolve(goalDir);
  const statePath = join(root, "state.yaml");
  if (!existsSync(statePath)) {
    throw new GoalBoardError(`Missing state.yaml: ${statePath}`);
  }
  const text = await readFile(statePath, "utf8");
  return normalizeGoalBoard(parseGoalStateText(text), root);
}

export function createBoardPayload(goalDir, options = {}) {
  const includeSubgoals = options.includeSubgoals !== false;
  const root = resolve(goalDir);
  const statePath = join(root, "state.yaml");
  if (!existsSync(statePath)) {
    throw new GoalBoardError(`Missing state.yaml: ${statePath}`);
  }

  const document = parseGoalStateText(readFileSync(statePath, "utf8"));
  const parseWarning = document.__parseWarning || "";
  const board = normalizeGoalBoard(document, root);
  const noteIndex = loadNotes(root);
  const tasks = board.tasks
    .map((task) => attachTaskNote(task, noteIndex))
    .map((task) => (includeSubgoals ? attachTaskSubgoal(task, root) : task));
  const columns = buildColumns(tasks);
  const stateStat = statSync(statePath);

  return {
    generatedAt: new Date().toISOString(),
    ...(parseWarning ? { parseWarning } : {}),
    source: {
      goalDir: root,
      statePath,
      stateMtimeMs: stateStat.mtimeMs,
      notesDir: join(root, "notes"),
    },
    goal: {
      title: board.title,
      slug: board.slug,
      kind: board.kind,
      status: board.status,
      tranche: board.tranche,
      activeTask: board.activeTask,
      completionCriteria: board.completionCriteria,
      finalProof: board.finalProof,
    },
    verification: board.verification,
    executor: executorObservation(board),
    counts: {
      total: tasks.length,
      todo: columns.find((column) => column.id === "todo").tasks.length,
      inProgress: columns.find((column) => column.id === "in-progress").tasks
        .length,
      blocked: columns.find((column) => column.id === "blocked").tasks.length,
      completed: columns.find((column) => column.id === "completed").tasks
        .length,
    },
    columns,
    tasks,
    notes: Object.values(noteIndex).map(({ path, title, mtimeMs }) => ({
      path,
      title,
      mtimeMs,
    })),
  };
}

function executorObservation(board) {
  if (board.status === "done") {
    return { status: "complete", label: "Complete", observed: false };
  }
  if (board.status === "blocked") {
    return { status: "waiting", label: "Waiting", observed: false };
  }
  return {
    status: "not-observed",
    label: "Not observed",
    observed: false,
    detail:
      "The local board displays state. It does not prove that an executor is running.",
  };
}

export function normalizeGoalBoard(document, goalDir = "<memory>") {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new GoalBoardError("Goal state must be a YAML mapping.");
  }
  if (Number(document.version) !== 2) {
    throw new GoalBoardError(
      'Only thegoalbuddy v2 state.yaml files are supported: the board is missing top-level "version: 2". Start from templates/state.yaml bundled with the goal-prep skill.',
    );
  }
  if (!document.goal || typeof document.goal !== "object") {
    throw new GoalBoardError("Missing goal metadata.");
  }
  if (!Array.isArray(document.tasks)) {
    throw new GoalBoardError("Missing tasks list.");
  }

  const tasks = document.tasks.map((task, index) => normalizeTask(task, index));
  const activeTasks = tasks.filter((task) => task.status === "active");

  return {
    goalDir,
    title: cleanText(document.goal.title || "Untitled goal"),
    slug: cleanText(document.goal.slug || "untitled-goal"),
    kind: cleanText(document.goal.kind || "open_ended"),
    tranche: cleanText(document.goal.tranche || ""),
    status: cleanText(document.goal.status || "active"),
    activeTask: cleanText(document.active_task || activeTasks[0]?.id || ""),
    completionCriteria: cleanText(
      document.goal.oracle?.signal ||
        document.goal.intake?.completion_proof ||
        "",
    ),
    finalProof: cleanText(document.goal.oracle?.final_proof || ""),
    verification: {
      result: cleanText(
        document.checks?.last_verification?.result || "unknown",
      ),
      task: cleanText(document.checks?.last_verification?.task || ""),
      commands: normalizeCommands(document.checks?.last_verification?.commands),
    },
    tasks,
  };
}

export function normalizeTask(task, index) {
  if (!task || typeof task !== "object" || Array.isArray(task)) {
    throw new GoalBoardError(`Task ${index + 1} must be a mapping.`);
  }

  const id = cleanText(task.id);
  const status = normalizeTaskStatus(task.status);
  if (!id) throw new GoalBoardError(`Task ${index + 1} is missing id.`);
  if (!VALID_STATUSES.has(status)) {
    throw new GoalBoardError(`Task ${id} has unsupported status "${status}".`);
  }

  return {
    id,
    title: titleForTask(task),
    objective: cleanText(task.objective || ""),
    status,
    column: columnForStatus(status),
    type: cleanText(task.type || "pm"),
    assignee: cleanText(task.assignee || ""),
    harness: cleanText(task.receipt?.harness || task.harness || ""),
    active: status === "active",
    inputs: normalizeStringList(task.inputs),
    constraints: normalizeStringList(task.constraints),
    expectedOutput: normalizeStringList(task.expected_output),
    allowedFiles: normalizeStringList(task.allowed_files),
    verify: normalizeStringList(task.verify),
    stopIf: normalizeStringList(task.stop_if),
    blockerReason: cleanText(
      task.blocker_reason ||
        task.blocked_reason ||
        task.receipt?.blocked_reason ||
        (status === "blocked"
          ? task.receipt?.summary || task.receipt?.decision || ""
          : ""),
    ),
    nextAction: cleanText(task.next_action || task.receipt?.next_action || ""),
    update: cleanText(task.update || task.receipt?.summary || ""),
    subgoal: normalizeSubgoal(task.subgoal),
    receipt: normalizeReceipt(task.receipt),
  };
}

export function buildColumns(tasks) {
  const byColumn = new Map(COLUMN_ORDER.map((id) => [id, []]));
  for (const task of tasks) {
    byColumn.get(task.column).push(task);
  }

  for (const [columnId, columnTasks] of byColumn.entries()) {
    columnTasks.sort((left, right) =>
      compareColumnTasks(columnId, left, right),
    );
  }

  return [
    {
      id: "todo",
      title: "Todo",
      description: "Queued work ready to pull",
      tasks: byColumn.get("todo"),
    },
    {
      id: "in-progress",
      title: "In Progress",
      description: "Active task work",
      tasks: byColumn.get("in-progress"),
    },
    {
      id: "blocked",
      title: "Blocked",
      description: "Needs unblock or a smaller slice",
      tasks: byColumn.get("blocked"),
    },
    {
      id: "completed",
      title: "Completed",
      description: "Receipted work",
      tasks: byColumn.get("completed"),
    },
  ];
}

export function writeBoardApp(goalDir) {
  const appDir = join(resolve(goalDir), ".goalbuddy-board");
  mkdirSync(appDir, { recursive: true });
  for (const filename of [
    "index.html",
    "styles.css",
    "app.js",
    "constellation.js",
  ]) {
    copyFileSync(join(uiDir, filename), join(appDir, filename));
  }
  for (const filename of readdirSync(assetDir)) {
    if (statSync(join(assetDir, filename)).isFile()) {
      copyFileSync(join(assetDir, filename), join(appDir, filename));
    }
  }
  return appDir;
}

function attachTaskNote(task, noteIndex) {
  const notePath = task.receipt.note || "";
  if (!notePath) return task;
  const normalized = notePath.replaceAll("\\", "/").replace(/^\.?\//, "");
  return {
    ...task,
    note: noteIndex[normalized] || null,
  };
}

function attachTaskSubgoal(task, goalDir) {
  if (!task.subgoal) return task;
  const childStatePath = resolve(goalDir, task.subgoal.path);
  validateChildSubgoalPath(task, goalDir, childStatePath);
  const childGoalDir = dirname(childStatePath);
  if (!existsSync(childStatePath)) {
    throw new GoalBoardError(
      `Missing sub-goal state for ${task.id}: ${task.subgoal.path}`,
    );
  }

  return {
    ...task,
    subgoal: {
      ...task.subgoal,
      board: createBoardPayload(childGoalDir, { includeSubgoals: false }),
    },
  };
}

function validateChildSubgoalPath(task, goalDir, childStatePath) {
  if (task.subgoal.depth !== 1) {
    throw new GoalBoardError(
      `Invalid sub-goal depth for ${task.id}: only depth 1 is supported.`,
    );
  }
  const childRelativePath = relative(goalDir, childStatePath);
  if (!isInsideRoot(childRelativePath)) {
    throw new GoalBoardError(
      `Invalid sub-goal path for ${task.id}: ${task.subgoal.path} must stay inside the goal root.`,
    );
  }
  const parts = childRelativePath.split(/[\\/]+/);
  if (
    parts.length !== 3 ||
    parts[0] !== "subgoals" ||
    parts[2] !== "state.yaml"
  ) {
    throw new GoalBoardError(
      `Invalid sub-goal path for ${task.id}: ${task.subgoal.path} must be subgoals/<slug>/state.yaml.`,
    );
  }
}

function isInsideRoot(relativePath) {
  return (
    relativePath &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

function loadNotes(goalDir) {
  const notesDir = join(goalDir, "notes");
  if (!existsSync(notesDir)) return {};

  const notes = {};
  for (const entry of readdirSync(notesDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const path = `notes/${entry.name}`;
    const absolute = join(notesDir, entry.name);
    const content = readFileSync(absolute, "utf8");
    notes[path] = {
      path,
      title: noteTitle(content, entry.name),
      content,
      mtimeMs: statSync(absolute).mtimeMs,
    };
  }
  return notes;
}

function noteTitle(content, filename) {
  const heading = content.split(/\r?\n/).find((line) => line.startsWith("# "));
  return heading
    ? heading.replace(/^#\s+/, "").trim()
    : basename(filename, ".md");
}

function normalizeReceipt(receipt) {
  if (!receipt) return { present: false, summary: "", result: "", note: "" };
  if (typeof receipt === "string") {
    return { present: true, summary: cleanText(receipt), result: "", note: "" };
  }
  if (Array.isArray(receipt) || typeof receipt !== "object") {
    return { present: true, summary: cleanText(receipt), result: "", note: "" };
  }
  return {
    present: true,
    result: cleanText(receipt.result || ""),
    summary: cleanText(
      receipt.summary ||
        receipt.decision ||
        receipt.note ||
        receipt.result ||
        "",
    ),
    decision: cleanText(receipt.decision || ""),
    requiredReply: cleanText(receipt.required_reply || ""),
    waitingForApproval: receipt.waiting_for_user_approval === true,
    note: cleanText(receipt.note || ""),
    changedFiles: normalizeStringList(receipt.changed_files),
    commands: normalizeCommands(receipt.commands),
    evidence: normalizeStringList(receipt.evidence),
  };
}

function normalizeSubgoal(subgoal) {
  if (!subgoal || typeof subgoal !== "object" || Array.isArray(subgoal))
    return null;
  return {
    status: cleanText(subgoal.status || ""),
    path: cleanText(subgoal.path || ""),
    owner: cleanText(subgoal.owner || ""),
    createdFrom: cleanText(subgoal.created_from || ""),
    depth: Number(subgoal.depth || 0),
    rollupReceipt: cleanText(subgoal.rollup_receipt || ""),
    board: null,
  };
}

function normalizeCommands(commands) {
  if (!commands) return [];
  if (!Array.isArray(commands))
    return [cleanText(commands)]
      .filter(Boolean)
      .map((cmd) => ({ cmd, status: "" }));
  return commands
    .map((command) => {
      if (typeof command === "string")
        return { cmd: cleanText(command), status: "" };
      return {
        cmd: cleanText(command?.cmd || ""),
        status: cleanText(command?.status || ""),
      };
    })
    .filter((command) => command.cmd || command.status);
}

function titleForTask(task) {
  if (task.title) return compactTaskTitle(task.title);
  const objective = cleanText(task.objective || "Untitled task");
  return compactTaskTitle(objective);
}

function compactTaskTitle(value) {
  const text = cleanText(value).replace(/\.$/, "");
  const routeMatch = text.match(
    /^Implement\b.*?\s(\/[A-Za-z0-9_./:-]+)\s+(route|queue slice|slice)\b/i,
  );
  if (routeMatch) return `Implement ${routeMatch[1]} ${routeMatch[2]}`;

  const firstClause = text
    .split(
      /(?<=[.!?])\s+|\s+(?:Use only|Add|Match|Render|Clearly label|Do not)\b/i,
    )[0]
    .replace(/\bas the next first-milestone slice\b/gi, "")
    .replace(/\bblocker documentation\b/gi, "blocker docs")
    .replace(/\benv\/setup notes\b/gi, "setup notes")
    .replace(/\s+/g, " ")
    .replace(/[.;:,]\s*$/, "")
    .trim();

  return firstClause || text;
}

function columnForStatus(status) {
  if (status === "blocked") return "blocked";
  if (status === "done") return "completed";
  if (status === "queued") return "todo";
  return "in-progress";
}

function taskSortKey(task) {
  const rank =
    task.status === "active"
      ? "0"
      : task.status === "queued"
        ? "1"
        : task.status === "blocked"
          ? "2"
          : "3";
  return `${rank}:${task.id}`;
}

function compareColumnTasks(columnId, left, right) {
  const order = taskSortKey(left).localeCompare(taskSortKey(right));
  if (columnId === "completed") return -order;
  return order;
}

function normalizeStringList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  return [cleanText(value)].filter(Boolean);
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeTaskStatus(value) {
  const status = cleanText(value);
  if (status === "complete" || status === "completed") return "done";
  return status;
}

export function parseGoalStateText(text) {
  try {
    const lines = tokenizeYaml(text);
    if (!lines.length) throw new GoalBoardError("Goal state is empty.");
    const [value, nextIndex] = parseBlock(lines, 0, lines[0].indent);
    if (nextIndex < lines.length) {
      throw new GoalBoardError(
        `Could not parse line ${lines[nextIndex].number}.`,
      );
    }
    return value;
  } catch (error) {
    if (error instanceof GoalBoardError && canRecoverBoardSubset(error)) {
      const document = parseGoalBoardSubset(text);
      document.__parseWarning = `Strict parse failed (${error.message}) Showing a best-effort fallback view; fields the fallback parser cannot read are omitted. Fix state.yaml formatting to see the full board.`;
      return document;
    }
    throw error;
  }
}

function canRecoverBoardSubset(error) {
  return /Could not parse line|Expected key\/value pair|Expected mapping|Block scalar YAML|Unsupported odd indentation/.test(
    error.message,
  );
}

function parseGoalBoardSubset(text) {
  const tasks = parseTaskSubsets(text);
  if (!tasks.length) throw new GoalBoardError("Missing non-empty tasks list.");
  return {
    version: parseYamlScalar(findTopLevelScalar(text, "version") || "2"),
    goal: {
      title: parseYamlScalar(
        findNestedScalar(text, "goal", "title") || "Untitled goal",
      ),
      slug: parseYamlScalar(
        findNestedScalar(text, "goal", "slug") || "untitled-goal",
      ),
      kind: parseYamlScalar(
        findNestedScalar(text, "goal", "kind") || "open_ended",
      ),
      tranche: parseYamlScalar(findNestedScalar(text, "goal", "tranche") || ""),
      status: parseYamlScalar(
        findNestedScalar(text, "goal", "status") || "active",
      ),
    },
    active_task: parseYamlScalar(findTopLevelScalar(text, "active_task") || ""),
    tasks,
  };
}

function parseTaskSubsets(text) {
  const tasksText = findTopLevelSection(text, "tasks");
  if (!tasksText) return [];
  const taskBlocks = [];
  let current = [];
  for (const line of tasksText.split("\n")) {
    if (/^  - id:/.test(line)) {
      if (current.length) taskBlocks.push(current.join("\n"));
      current = [line];
    } else if (current.length) {
      current.push(line);
    }
  }
  if (current.length) taskBlocks.push(current.join("\n"));
  return taskBlocks.map((block) => ({
    id: parseYamlScalar(findTaskScalar(block, "id") || ""),
    type: parseYamlScalar(findTaskScalar(block, "type") || "pm"),
    assignee: parseYamlScalar(findTaskScalar(block, "assignee") || ""),
    harness: parseYamlScalar(findTaskScalar(block, "harness") || ""),
    status: parseYamlScalar(findTaskScalar(block, "status") || "queued"),
    title: parseYamlScalar(findTaskScalar(block, "title") || ""),
    objective: parseYamlScalar(findTaskScalar(block, "objective") || ""),
    inputs: findTaskList(block, "inputs"),
    constraints: findTaskList(block, "constraints"),
    expected_output: findTaskList(block, "expected_output"),
    allowed_files: findTaskList(block, "allowed_files"),
    verify: findTaskList(block, "verify"),
    stop_if: findTaskList(block, "stop_if"),
    subgoal: findTaskSubgoal(block),
    receipt: findTaskReceipt(block),
  }));
}

function findTopLevelScalar(text, key) {
  return findScalar(
    text,
    new RegExp(`^${escapeRegExp(key)}:\\s*(.*?)\\s*$`, "m"),
  );
}

function findNestedScalar(text, section, key) {
  return findScalar(
    findTopLevelSection(text, section),
    new RegExp(`^  ${escapeRegExp(key)}:\\s*(.*?)\\s*$`, "m"),
  );
}

function findTaskScalar(text, key) {
  if (key === "id") return findScalar(text, /^  - id:\s*(.*?)\s*$/m);
  return findScalar(
    text,
    new RegExp(`^    ${escapeRegExp(key)}:\\s*(.*?)\\s*$`, "m"),
  );
}

function findScalar(text, pattern) {
  const source = String(text || "");
  const match = source.match(pattern);
  if (!match) return "";
  if (!/^[|>][+-]?$/.test(match[1])) return match[1];
  return blockScalarText(source, match.index, match[0]);
}

function blockScalarText(source, matchIndex, matchedLine) {
  const keyIndent = matchedLine.match(/^ */)[0].length;
  const following = source
    .slice(matchIndex + matchedLine.length)
    .split("\n")
    .slice(1);
  const collected = [];
  for (const line of following) {
    if (!line.trim()) continue;
    if (line.match(/^ */)[0].length <= keyIndent) break;
    collected.push(line.trim());
  }
  return collected.join(" ");
}

function findTopLevelSection(text, key) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const start = lines.findIndex((line) => line.trim() === `${key}:`);
  if (start === -1) return "";
  const section = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\S/.test(line)) break;
    section.push(line);
  }
  return section.join("\n");
}

function findIndentedSection(text, key, indent) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const prefix = " ".repeat(indent);
  const start = lines.findIndex(
    (line) => line.trim() === `${key}:` && line.startsWith(prefix),
  );
  if (start === -1) return "";
  const section = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() && !line.startsWith(`${prefix}  `)) break;
    section.push(line);
  }
  return section.join("\n");
}

function findTaskList(text, key) {
  const inline = findTaskScalar(text, key);
  if (inline) {
    const parsed = parseYamlScalar(inline);
    if (Array.isArray(parsed)) return parsed.map(cleanText).filter(Boolean);
    return cleanText(parsed) ? [cleanText(parsed)] : [];
  }
  const section = findIndentedSection(text, key, 4);
  return section
    .split("\n")
    .map((line) => line.match(/^      -\s*(.*?)\s*$/)?.[1] || "")
    .map(parseYamlScalar)
    .map(cleanText)
    .filter(Boolean);
}

function findTaskSubgoal(text) {
  const inline = findTaskScalar(text, "subgoal");
  if (inline && parseYamlScalar(inline) === null) return null;
  const section = findIndentedSection(text, "subgoal", 4);
  if (!section) return null;
  return {
    status: parseYamlScalar(
      findScalar(section, /^      status:\s*(.*?)\s*$/m) || "active",
    ),
    path: parseYamlScalar(
      findScalar(section, /^      path:\s*(.*?)\s*$/m) || "",
    ),
    owner: parseYamlScalar(
      findScalar(section, /^      owner:\s*(.*?)\s*$/m) || "",
    ),
    created_from: parseYamlScalar(
      findScalar(section, /^      created_from:\s*(.*?)\s*$/m) || "",
    ),
    depth: parseYamlScalar(
      findScalar(section, /^      depth:\s*(.*?)\s*$/m) || "1",
    ),
    rollup_receipt: parseYamlScalar(
      findScalar(section, /^      rollup_receipt:\s*(.*?)\s*$/m) || "null",
    ),
  };
}

function findTaskReceipt(text) {
  const inline = findTaskScalar(text, "receipt");
  if (inline && parseYamlScalar(inline) === null) return null;
  const section = findIndentedSection(text, "receipt", 4);
  if (!section) return null;
  return {
    result: parseYamlScalar(
      findScalar(section, /^      result:\s*(.*?)\s*$/m) || "",
    ),
    summary: parseYamlScalar(
      findScalar(section, /^      summary:\s*(.*?)\s*$/m) || "",
    ),
    decision: parseYamlScalar(
      findScalar(section, /^      decision:\s*(.*?)\s*$/m) || "",
    ),
    note: parseYamlScalar(
      findScalar(section, /^      note:\s*(.*?)\s*$/m) || "",
    ),
    changed_files: findReceiptList(section, "changed_files"),
    commands: findReceiptCommands(section),
    evidence: [],
  };
}

function findReceiptList(text, key) {
  const section = findIndentedSection(text, key, 6);
  return section
    .split("\n")
    .map((line) => line.match(/^        -\s*(.*?)\s*$/)?.[1] || "")
    .map(parseYamlScalar)
    .map(cleanText)
    .filter(Boolean);
}

function findReceiptCommands(text) {
  const section = findIndentedSection(text, "commands", 6);
  const blocks = [];
  let current = [];
  for (const line of section.split("\n")) {
    if (/^        - cmd:/.test(line)) {
      if (current.length) blocks.push(current.join("\n"));
      current = [line];
    } else if (current.length) {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join("\n"));
  return blocks.map((block) => ({
    cmd: parseYamlScalar(
      findScalar(block, /^        - cmd:\s*(.*?)\s*$/m) || "",
    ),
    status: parseYamlScalar(
      findScalar(block, /^          status:\s*(.*?)\s*$/m) || "",
    ),
    note: parseYamlScalar(
      findScalar(block, /^          note:\s*(.*?)\s*$/m) || "",
    ),
  }));
}

function parseYamlScalar(value) {
  const text = stripComment(String(value ?? "")).trim();
  if (!text) return "";
  try {
    return parseScalar(text);
  } catch {
    if (
      (text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))
    ) {
      return text.slice(1, -1);
    }
    return text;
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenizeYaml(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((raw, index) => {
      const withoutComments = stripComment(raw).replace(/\s+$/, "");
      if (!withoutComments.trim()) return null;
      const indent = withoutComments.match(/^ */)[0].length;
      if (indent % 2 !== 0) {
        throw new GoalBoardError(
          `Unsupported odd indentation at line ${index + 1}.`,
        );
      }
      return {
        number: index + 1,
        indent,
        text: withoutComments.trimStart(),
      };
    })
    .filter(Boolean);
}

function stripComment(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previous = line[index - 1];
    if ((char === '"' || char === "'") && previous !== "\\") {
      quote = quote === char ? null : quote || char;
      continue;
    }
    if (char === "#" && !quote && (index === 0 || /\s/.test(previous))) {
      return line.slice(0, index);
    }
  }
  return line;
}

function parseBlock(lines, index, indent) {
  if (index >= lines.length) return [{}, index];
  if (lines[index].indent < indent) return [{}, index];
  if (lines[index].text.startsWith("- "))
    return parseArray(lines, index, indent);
  return parseObject(lines, index, indent);
}

function parseObject(lines, index, indent) {
  const object = {};
  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) break;
    if (line.indent !== indent || line.text.startsWith("- ")) break;

    const { key, valueText } = splitKeyValue(line);
    index += 1;

    if (valueText === "") {
      if (index < lines.length && lines[index].indent > indent) {
        const [child, nextIndex] = parseBlock(
          lines,
          index,
          lines[index].indent,
        );
        object[key] = child;
        index = nextIndex;
      } else {
        object[key] = {};
      }
    } else {
      object[key] = parseScalar(valueText);
    }
  }
  return [object, index];
}

function parseArray(lines, index, indent) {
  const array = [];
  while (index < lines.length) {
    const line = lines[index];
    if (line.indent !== indent || !line.text.startsWith("- ")) break;

    const content = line.text.slice(2).trim();
    index += 1;

    if (content === "") {
      if (index < lines.length && lines[index].indent > indent) {
        const [child, nextIndex] = parseBlock(
          lines,
          index,
          lines[index].indent,
        );
        array.push(child);
        index = nextIndex;
      } else {
        array.push(null);
      }
      continue;
    }

    if (isInlineMapping(content)) {
      const object = {};
      const { key, valueText } = splitKeyValue({
        text: content,
        number: line.number,
      });
      object[key] = valueText === "" ? {} : parseScalar(valueText);
      if (index < lines.length && lines[index].indent > indent) {
        const [child, nextIndex] = parseBlock(
          lines,
          index,
          lines[index].indent,
        );
        if (child && typeof child === "object" && !Array.isArray(child)) {
          Object.assign(object, child);
        } else {
          throw new GoalBoardError(
            `Expected mapping below line ${line.number}.`,
          );
        }
        index = nextIndex;
      }
      array.push(object);
    } else {
      array.push(parseScalar(content));
    }
  }
  return [array, index];
}

function splitKeyValue(line) {
  const separator = line.text.indexOf(":");
  if (separator <= 0) {
    throw new GoalBoardError(`Expected key/value pair at line ${line.number}.`);
  }
  return {
    key: line.text.slice(0, separator).trim(),
    valueText: line.text.slice(separator + 1).trim(),
  };
}

function isInlineMapping(text) {
  return /^[A-Za-z0-9_.-]+:\s*/.test(text);
}

function parseScalar(text) {
  if (text === "[]") return [];
  if (text === "{}") return {};
  if (text === "null" || text === "~") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (text.startsWith("[") && text.endsWith("]")) {
    const inner = text.slice(1, -1).trim();
    if (!inner) return [];
    return splitInlineArray(inner).map(parseScalar);
  }
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return unquote(text);
  }
  if (text === "|" || text === ">") {
    throw new GoalBoardError(
      "Block scalar YAML is not supported by this lightweight parser.",
    );
  }
  return text;
}

function unquote(text) {
  if (text.startsWith("'")) return text.slice(1, -1).replace(/''/g, "'");
  return text
    .slice(1, -1)
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\");
}

function splitInlineArray(text) {
  const values = [];
  let quote = null;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1];
    if ((char === '"' || char === "'") && previous !== "\\") {
      quote = quote === char ? null : quote || char;
      continue;
    }
    if (char === "," && !quote) {
      values.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  values.push(text.slice(start).trim());
  return values;
}
