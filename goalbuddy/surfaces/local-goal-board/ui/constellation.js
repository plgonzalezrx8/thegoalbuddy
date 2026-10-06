// Generated from goalbuddy/surfaces/local-goal-board/ui/constellation.ts; do not edit.
/** The constellation is a view of recorded task order, not an inferred dependency graph. */
export const SECTOR_SIZE = 4;
const POSITIONS = [
    { x: 0.09, y: 0.5 },
    { x: 0.34, y: 0.29 },
    { x: 0.6, y: 0.12 },
    { x: 0.88, y: 0.4 },
];
export function sectorTasks(tasks, sector = 0, collapseDone = false) {
    const candidates = collapseDone
        ? tasks.filter((task) => task.status !== "done")
        : [...tasks];
    const rank = { active: 0, blocked: 1, queued: 2, done: 3 };
    const prioritized = candidates
        .map((task, order) => ({ task, order }))
        .sort((a, b) => rank[a.task.status] - rank[b.task.status] || a.order - b.order);
    const total = Math.max(1, Math.ceil(prioritized.length / SECTOR_SIZE));
    const page = Math.min(Math.max(0, sector), total - 1);
    return {
        tasks: prioritized
            .slice(page * SECTOR_SIZE, (page + 1) * SECTOR_SIZE)
            .sort((a, b) => a.order - b.order)
            .map((item) => item.task),
        total,
        page,
    };
}
export function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className)
        node.className = className;
    if (text !== "")
        node.textContent = text;
    return node;
}
export function icon(name) {
    const image = element("img", "icon");
    image.src = "./icon-" + name + ".svg";
    image.alt = "";
    return image;
}
export function star(className = "star-image") {
    const image = element("img", className);
    image.src = "./constellation-star.png";
    image.alt = "";
    return image;
}
export function statusLabel(status) {
    return ({
        active: "In progress",
        done: "Completed",
        blocked: "Needs attention",
        queued: "Pending",
    }[status] || status);
}
export function observation(task) {
    if (task.status === "blocked")
        return task.blockerReason || "Blocker reason has not been recorded.";
    return task.update || task.receipt?.summary || "";
}
export function evidenceText(task) {
    return task.receipt?.evidence?.[0] || task.receipt?.note || "";
}
export function renderStarTask(task, position, compact = false) {
    const button = element("button", compact ? "task-row" : "star-node");
    button.type = "button";
    button.dataset.taskId = task.id;
    button.dataset.taskKey = task.id;
    button.dataset.status = task.status;
    button.setAttribute("aria-label", task.title + ". " + statusLabel(task.status) + ". Inspect task.");
    if (!compact && position) {
        button.style.left = position.x * 100 + "%";
        button.style.top = position.y * 100 + "%";
        if (task.status === "blocked" && position.x < 0.75)
            button.classList.add("is-side-label");
        if (position.x > 0.75)
            button.classList.add("is-edge");
        button.append(element("span", "task-id", task.id));
    }
    const label = element("span", "star-label");
    label.append(element("span", "task-title", task.title));
    if (!compact)
        label.append(element("span", "status-label", statusLabel(task.status)));
    const update = observation(task);
    if (update)
        label.append(element("span", "task-observation", update));
    if (evidenceText(task) && !compact) {
        const evidence = element("span", "task-evidence");
        const copy = element("span", "", evidenceText(task));
        copy.append(element("span", "evidence-caption", "Receipt evidence · inspect to review"));
        evidence.append(icon("file-description"), copy);
        label.append(evidence);
    }
    button.append(star(), label);
    if (compact)
        button.append(element("span", "status-label", statusLabel(task.status)));
    return button;
}
export function renderMap(tasks, goal) {
    const fragment = document.createDocumentFragment();
    const canvas = element("canvas");
    canvas.setAttribute("aria-hidden", "true");
    fragment.append(canvas);
    const positions = tasks.length === 1
        ? [{ x: 0.43, y: 0.38 }]
        : tasks.length === 2
            ? [POSITIONS[0], POSITIONS[2]]
            : POSITIONS;
    tasks.forEach((task, i) => fragment.append(renderStarTask(task, positions[i])));
    const destination = element("div", "destination");
    const copy = element("div");
    copy.append(element("p", "eyebrow", "Destination"), element("h2", "", "Goal"), element("p", "", goal.title));
    destination.append(star(), copy);
    fragment.append(destination);
    return { fragment, canvas, positions };
}
export function drawSequence(canvas, tasks, positions, light = false) {
    const parent = canvas.parentElement;
    if (!parent)
        return;
    const { width, height } = parent.getBoundingClientRect();
    const density = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return;
    ctx.scale(density, density);
    ctx.lineWidth = 1.4;
    const colors = light
        ? {
            done: "#44805c",
            active: "#4386a4",
            blocked: "#a56626",
            queued: "#73818b",
        }
        : {
            done: "#b0dc8f",
            active: "#8bc8ed",
            blocked: "#b99551",
            queued: "#8c9ca6",
        };
    const point = (position) => ({
        x: position.x * width,
        y: position.y * height,
    });
    for (let i = 0; i < tasks.length - 1; i++) {
        const a = point(positions[i]), b = point(positions[i + 1]);
        ctx.beginPath();
        ctx.strokeStyle = colors[tasks[i].status] || colors.queued;
        ctx.setLineDash(tasks[i].status === "blocked" || tasks[i].status === "queued"
            ? [6, 7]
            : []);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }
    if (tasks.length) {
        const origin = point(positions[Math.min(tasks.length - 1, 2)]);
        ctx.beginPath();
        ctx.strokeStyle = colors.done;
        ctx.setLineDash([6, 8]);
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(0.82 * width, -0.26 * height + 70);
        ctx.stroke();
    }
}
export function renderList(tasks, collapseDone = false) {
    const fragment = document.createDocumentFragment();
    const pending = tasks.filter((task) => task.status !== "done");
    const done = tasks.filter((task) => task.status === "done");
    const rank = { active: 0, blocked: 1, queued: 2, done: 3 };
    const ordered = [...pending].sort((a, b) => rank[a.status] - rank[b.status]);
    for (const task of ordered)
        fragment.append(renderStarTask(task, null, true));
    if (collapseDone && done.length) {
        const details = element("details", "completed-disclosure");
        details.dataset.detailKey = "completed";
        details.append(element("summary", "", done.length + " completed " + (done.length === 1 ? "task" : "tasks")));
        for (const task of done)
            details.append(renderStarTask(task, null, true));
        fragment.append(details);
    }
    else
        for (const task of done)
            fragment.append(renderStarTask(task, null, true));
    return fragment;
}
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function strings(value) { return Array.isArray(value) && value.every(item => typeof item === "string"); }
function isTask(value) {
    if (!isRecord(value) || typeof value.active !== "boolean" || !["queued", "active", "blocked", "done"].includes(String(value.status)) || !["todo", "in-progress", "blocked", "completed"].includes(String(value.column)))
        return false;
    for (const key of ["id", "title", "objective", "column", "type", "assignee", "harness", "blockerReason", "nextAction", "update"])
        if (typeof value[key] !== "string")
            return false;
    for (const key of ["inputs", "constraints", "expectedOutput", "allowedFiles", "verify", "stopIf"])
        if (!strings(value[key]))
            return false;
    const receipt = value.receipt;
    if (!isRecord(receipt) || typeof receipt.present !== "boolean")
        return false;
    for (const key of ["summary", "result", "note"])
        if (typeof receipt[key] !== "string")
            return false;
    if (receipt.waitingForApproval !== undefined && typeof receipt.waitingForApproval !== "boolean")
        return false;
    for (const key of ["decision", "requiredReply"])
        if (receipt[key] !== undefined && typeof receipt[key] !== "string")
            return false;
    for (const key of ["changedFiles", "evidence"])
        if (receipt[key] !== undefined && !strings(receipt[key]))
            return false;
    if (receipt.commands !== undefined && (!Array.isArray(receipt.commands) || !receipt.commands.every(command => isRecord(command) && typeof command.cmd === "string" && typeof command.status === "string")))
        return false;
    if (value.note !== undefined && value.note !== null && (!isRecord(value.note) || typeof value.note.path !== "string" || typeof value.note.title !== "string" || typeof value.note.content !== "string" || typeof value.note.mtimeMs !== "number"))
        return false;
    const child = value.subgoal;
    if (child !== null) {
        if (!isRecord(child) || typeof child.depth !== "number")
            return false;
        for (const key of ["status", "path", "owner", "createdFrom", "rollupReceipt"])
            if (typeof child[key] !== "string")
                return false;
        if (child.board !== null && !isBoardPayload(child.board))
            return false;
    }
    return true;
}
function isBoardPayload(value) {
    if (!isRecord(value) || typeof value.generatedAt !== "string" || !isRecord(value.goal) || !Array.isArray(value.tasks) || !value.tasks.every(isTask))
        return false;
    for (const key of ["title", "slug", "status", "tranche", "activeTask"])
        if (typeof value.goal[key] !== "string")
            return false;
    for (const key of ["kind", "completionCriteria", "finalProof"])
        if (value.goal[key] !== undefined && typeof value.goal[key] !== "string")
            return false;
    for (const key of ["error", "parseWarning"])
        if (value[key] !== undefined && typeof value[key] !== "string")
            return false;
    if (!Array.isArray(value.columns) || !value.columns.every(column => isRecord(column) && ["todo", "in-progress", "blocked", "completed"].includes(String(column.id)) && typeof column.title === "string" && typeof column.description === "string" && Array.isArray(column.tasks) && column.tasks.every(isTask)))
        return false;
    if (value.source !== undefined && (!isRecord(value.source) || typeof value.source.goalDir !== "string" || typeof value.source.notesDir !== "string" || typeof value.source.statePath !== "string" || typeof value.source.stateMtimeMs !== "number"))
        return false;
    if (value.verification !== undefined && (!isRecord(value.verification) || typeof value.verification.result !== "string" || typeof value.verification.task !== "string" || !Array.isArray(value.verification.commands) || !value.verification.commands.every(command => isRecord(command) && typeof command.cmd === "string" && typeof command.status === "string")))
        return false;
    if (value.executor !== undefined && (!isRecord(value.executor) || typeof value.executor.status !== "string" || typeof value.executor.label !== "string" || typeof value.executor.observed !== "boolean" || (value.executor.detail !== undefined && typeof value.executor.detail !== "string")))
        return false;
    if (value.counts !== undefined && (!isRecord(value.counts) || !["total", "todo", "inProgress", "blocked", "completed"].every(key => typeof record(value.counts)[key] === "number")))
        return false;
    if (!Array.isArray(value.notes) || !value.notes.every(note => isRecord(note) && typeof note.path === "string" && typeof note.title === "string" && typeof note.mtimeMs === "number"))
        return false;
    return true;
}
export function readBoardPayload(value) {
    if (!isBoardPayload(value))
        throw new Error("Invalid board response");
    return value;
}
export function readBoardSummaries(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => isRecord(item) && ["goalDir", "appDir", "title", "slug", "url", "hubUrl", "indexUrl", "apiUrl", "startedAt"].every(key => typeof item[key] === "string"));
}
function record(value) { return isRecord(value) ? value : {}; }
