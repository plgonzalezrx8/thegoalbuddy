import {
  sectorTasks,
  renderMap,
  renderList,
  drawSequence,
  star,
  icon,
  observation,
  statusLabel,
  evidenceText,
} from "./constellation.js";
let currentBoard = null;
let eventSource = null;
let currentSettings = null;

const boardEl = document.getElementById("board");
const liveStateEl = document.getElementById("live-state");
const liveDotEl = document.getElementById("live-dot");
const boardSwitcherEl = document.getElementById("board-switcher");
const settingsButtonEl = document.getElementById("settings-button");
const settingsPopoverEl = document.getElementById("settings-popover");
let selectedTask = null;
let dialogTrigger = null;
let sector = 0;
let listMode = false;
let helpOpen = false;
let mapRendering = null;
const narrowScreen = window.matchMedia("(max-width: 640px)");
const modalEl = document.getElementById("task-modal");
const modalTitleEl = document.getElementById("modal-title");
const modalKickerEl = document.getElementById("modal-kicker");
const modalBodyEl = document.getElementById("modal-body");
const settingsStorageKey = "goalbuddy.localBoardSettings.v1";
const settingsDefaults = {
  theme: "system",
  density: "comfortable",
  completedVisibility: "show",
  boardOpenBehavior: "last",
  motion: "system",
  lastBoardPath: "",
};
const settingsOptions = {
  theme: new Set(["system", "light", "dark"]),
  density: new Set(["comfortable", "compact"]),
  completedVisibility: new Set(["show", "collapse"]),
  boardOpenBehavior: new Set(["last", "newest"]),
  motion: new Set(["system", "reduce", "allow"]),
};

document.addEventListener("click", (event) => {
  const card = event.target.closest("[data-task-id]");
  if (card)
    openTask(card.dataset.taskId, card.dataset.parentTaskId || "", card);
  if (event.target.closest("[data-close-modal]")) closeModal();
  if (!settingsPopoverEl.hidden && !event.target.closest(".settings-wrap"))
    closeSettings(false);
});
modalEl.addEventListener("close", () => {
  selectedTask = null;
  helpOpen = false;
  const key = dialogTrigger?.dataset.taskKey;
  const replacement =
    key &&
    [...document.querySelectorAll("[data-task-key]")].find(
      (node) => node.dataset.taskKey === key,
    );
  (dialogTrigger?.isConnected
    ? dialogTrigger
    : replacement || document.getElementById("goal-title")
  )?.focus();
});
modalEl.addEventListener("click", (event) => {
  if (event.target === modalEl) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (modalEl.open && event.key === "Tab") {
    const targets = [
      ...modalEl.querySelectorAll(
        'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]',
      ),
    ].filter((node) => node.getClientRects().length && node.tabIndex >= 0);
    const first = targets[0],
      last = targets.at(-1);
    if (!first) {
      event.preventDefault();
      modalEl.focus();
    } else if (
      event.shiftKey &&
      (document.activeElement === first ||
        !modalEl.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        !modalEl.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  }
  if (event.key === "Escape" && !settingsPopoverEl.hidden && !modalEl.open)
    closeSettings();
});
document
  .getElementById("settings-close")
  .addEventListener("click", () => closeSettings());
document.getElementById("view-toggle").addEventListener("click", () => {
  listMode = !listMode;
  renderBoard(currentBoard);
});
document.getElementById("sector-prev").addEventListener("click", () => {
  sector--;
  renderBoard(currentBoard);
});
document.getElementById("sector-next").addEventListener("click", () => {
  sector++;
  renderBoard(currentBoard);
});
document.getElementById("help-button").addEventListener("click", showHelp);
window.addEventListener("resize", () => {
  if (mapRendering)
    drawSequence(
      mapRendering.canvas,
      mapRendering.tasks,
      mapRendering.positions,
      currentSettings?.theme === "light",
    );
});
narrowScreen.addEventListener("change", () => renderBoard(currentBoard));

boardSwitcherEl.addEventListener("change", () => {
  if (boardSwitcherEl.value && boardSwitcherEl.value !== window.location.href) {
    window.location.href = boardSwitcherEl.value;
  }
});

settingsButtonEl.addEventListener("click", () => {
  if (settingsPopoverEl.hidden) {
    openSettings();
  } else {
    closeSettings();
  }
});

settingsPopoverEl.addEventListener("change", (event) => {
  const control = event.target.closest("[data-setting]");
  if (!control) return;
  saveSettings({
    ...currentSettings,
    [control.dataset.setting]: control.value,
  });
});

async function loadBoard() {
  const response = await fetch("./api/board", { cache: "no-store" });
  if (!response.ok) throw new Error("Board request failed");
  renderBoard(await response.json());
}

async function loadBoardSwitcher() {
  const response = await fetch("../api/boards", { cache: "no-store" });
  if (!response.ok) return;
  const payload = await response.json();
  renderBoardSwitcher(payload.boards || []);
}

async function loadSettings() {
  try {
    const response = await fetch("../api/settings", { cache: "no-store" });
    if (!response.ok) throw new Error("Settings request failed");
    const payload = await response.json();
    currentSettings = normalizeSettings(payload.settings);
    storeSettings(currentSettings);
  } catch {
    currentSettings = readStoredSettings();
  }
  applySettings(currentSettings);
}

async function saveSettings(nextSettings) {
  currentSettings = normalizeSettings(nextSettings);
  storeSettings(currentSettings);
  applySettings(currentSettings);
  try {
    const response = await fetch("../api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: currentSettings }),
    });
    if (!response.ok) throw new Error("Settings save failed");
    const payload = await response.json();
    currentSettings = normalizeSettings(payload.settings);
    storeSettings(currentSettings);
    applySettings(currentSettings);
  } catch {
    // Keep the localStorage fallback active when the local settings API is unavailable.
  }
  return currentSettings;
}

function storeSettings(settings) {
  try {
    window.localStorage?.setItem(settingsStorageKey, JSON.stringify(settings));
  } catch {
    /* Viewing never requires writable browser storage. */
  }
}

function readStoredSettings() {
  try {
    return normalizeSettings(
      JSON.parse(window.localStorage?.getItem(settingsStorageKey) || "{}"),
    );
  } catch {
    return { ...settingsDefaults };
  }
}

function normalizeSettings(settings) {
  const normalized = { ...settingsDefaults };
  if (!settings || typeof settings !== "object" || Array.isArray(settings))
    return normalized;
  for (const [key, allowed] of Object.entries(settingsOptions)) {
    if (allowed.has(settings[key])) normalized[key] = settings[key];
  }
  if (
    typeof settings.lastBoardPath === "string" &&
    /^\/[a-z0-9][a-z0-9-]*\/$/.test(settings.lastBoardPath)
  ) {
    normalized.lastBoardPath = settings.lastBoardPath;
  }
  return normalized;
}

function applySettings(settings) {
  const normalized = normalizeSettings(settings);
  document.documentElement.dataset.theme = normalized.theme;
  document.documentElement.dataset.density = normalized.density;
  document.documentElement.dataset.completedVisibility =
    normalized.completedVisibility;
  document.documentElement.dataset.boardOpenBehavior =
    normalized.boardOpenBehavior;
  document.documentElement.dataset.motion = normalized.motion;
  for (const control of settingsPopoverEl.querySelectorAll("[data-setting]")) {
    control.value =
      normalized[control.dataset.setting] ||
      settingsDefaults[control.dataset.setting];
  }
  if (currentBoard) renderBoard(currentBoard);
}

function rememberCurrentBoard() {
  const boardPath = normalizePath(window.location.pathname);
  if (!/^\/[a-z0-9][a-z0-9-]*\/$/.test(boardPath)) return;
  const nextSettings = normalizeSettings({
    ...currentSettings,
    lastBoardPath: boardPath,
  });
  currentSettings = nextSettings;
  storeSettings(nextSettings);
  fetch("../api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: nextSettings }),
  }).catch(() => {});
}

function openSettings() {
  settingsPopoverEl.hidden = false;
  settingsButtonEl.setAttribute("aria-expanded", "true");
  settingsPopoverEl.querySelector("[data-setting]")?.focus();
}

function closeSettings(restoreFocus = true) {
  settingsPopoverEl.hidden = true;
  settingsButtonEl.setAttribute("aria-expanded", "false");
  if (restoreFocus) settingsButtonEl.focus();
}

function connectEvents() {
  eventSource = new EventSource("./events");
  eventSource.addEventListener("board", (event) => {
    setLiveState("Board connected", true);
    renderBoard(JSON.parse(event.data));
  });
  eventSource.addEventListener("error", () => {
    setLiveState("Reconnecting", false);
  });
}

function renderBoard(board) {
  if (!board) return;
  const dockElement = document.getElementById("focus-dock");
  const observatory = document.querySelector(".observatory");
  if (narrowScreen.matches && dockElement.parentElement !== observatory)
    observatory.insertBefore(
      dockElement,
      document.querySelector(".constellation-area"),
    );
  else if (!narrowScreen.matches && dockElement.parentElement === observatory)
    observatory.after(dockElement);
  const previous = currentBoard;
  const focusKey = document.activeElement?.dataset.taskKey;
  currentBoard = board;
  document.getElementById("goal-title").textContent = board.goal.title;
  document.title = board.goal.title + " · thegoalbuddy";
  document.getElementById("goal-criteria").textContent =
    board.goal.completionCriteria ||
    "Completion criteria have not been recorded.";
  document.getElementById("goal-tranche").textContent = board.goal
    .completionCriteria
    ? ""
    : board.goal.tranche || "";
  document.getElementById("goal-status").textContent = board.goal.status;
  document.getElementById("goal-executor").textContent =
    "Agent activity not confirmed";
  document.getElementById("goal-executor").title =
    board.executor?.detail ||
    "The board reads local files; it does not observe the coding tool.";
  const changedAt = board.source?.stateMtimeMs
    ? new Date(board.source.stateMtimeMs)
    : null;
  const timeEl = document.getElementById("goal-updated");
  timeEl.textContent = changedAt
    ? changedAt.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }) +
      " · " +
      changedAt.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : "State change time unavailable";
  if (changedAt) timeEl.dateTime = changedAt.toISOString();
  document.getElementById("timezone").textContent =
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const verification = board.verification;
  document.getElementById("verification-status").textContent =
    verification?.result && verification.result !== "unknown"
      ? "Last recorded check: " +
        verification.result +
        (verification.task ? " · " + verification.task : "")
      : "Verification not recorded";
  const status = document.getElementById("board-status");
  if (board.error) {
    boardEl.className = "constellation";
    boardEl.replaceChildren(renderBoardError(board.error));
    document.getElementById("focus-dock").replaceChildren();
    status.textContent = "Board unavailable. Last task details may be stale.";
    refreshSelectedTask();
    return;
  }
  const tasks = board.tasks || [];
  const effectiveList = listMode || narrowScreen.matches;
  const collapsed = currentSettings?.completedVisibility === "collapse";
  const slice = sectorTasks(tasks, sector, collapsed);
  sector = slice.page;
  boardEl.className = effectiveList
    ? "constellation task-list"
    : "constellation";
  mapRendering = null;
  if (tasks.length === 0) {
    const empty = el("section", "empty-state");
    empty.append(
      el("h2", "", "Your goal is taking shape."),
      el(
        "p",
        "",
        "Goal Prep is preparing the task list. The first task will appear here when state.yaml changes.",
      ),
    );
    boardEl.replaceChildren(empty);
  } else if (effectiveList)
    boardEl.replaceChildren(renderList(tasks, collapsed));
  else if (slice.tasks.length === 0) {
    const empty = el("section", "empty-state");
    empty.append(
      el("h2", "", "Completed work is collapsed."),
      el(
        "p",
        "",
        "Open Task list to review the completed tasks and their receipts.",
      ),
    );
    boardEl.replaceChildren(empty);
  } else {
    const map = renderMap(slice.tasks, board.goal);
    boardEl.replaceChildren(map.fragment);
    mapRendering = { ...map, tasks: slice.tasks };
    requestAnimationFrame(() => {
      if (mapRendering?.canvas === map.canvas)
        drawSequence(
          map.canvas,
          slice.tasks,
          map.positions,
          currentSettings?.theme === "light",
        );
    });
  }
  if (board.parseWarning)
    boardEl.prepend(renderBoardWarning(board.parseWarning));
  const counts = board.counts || {};
  document.getElementById("sector-label").textContent = effectiveList
    ? tasks.length + " tasks · " + (counts.blocked || 0) + " need attention"
    : slice.total > 1
      ? "Constellation " + (slice.page + 1) + " / " + slice.total
      : "";
  document.getElementById("sector-nav").hidden =
    effectiveList || slice.total <= 1;
  document.getElementById("sector-prev").disabled = sector === 0;
  document.getElementById("sector-next").disabled = sector === slice.total - 1;
  document.getElementById("view-toggle").textContent = listMode
    ? "Constellation"
    : "Task list";
  document.getElementById("view-toggle").hidden = narrowScreen.matches;
  document
    .getElementById("view-toggle")
    .setAttribute("aria-pressed", String(listMode));
  document.getElementById("sequence-note").textContent = effectiveList
    ? "Current work and blockers first · recorded task state"
    : "Task sequence · lines do not imply dependencies";
  renderDock(tasks, board.goal);
  const changed =
    previous && JSON.stringify(previous.tasks) !== JSON.stringify(tasks);
  status.textContent = changed ? "Local task state updated." : "";
  if (
    !tasks.some((task) => task.status === "active") &&
    board.goal.status === "active" &&
    tasks.length
  )
    status.textContent =
      "No active task is recorded. Continue in your coding tool to choose the next step.";
  refreshSelectedTask();
  if (focusKey && !modalEl.open) {
    const replacement = [...document.querySelectorAll("[data-task-key]")].find(
      (node) =>
        node.dataset.taskKey === focusKey && node.getClientRects().length,
    );
    (replacement || document.getElementById("goal-title")).focus({
      preventScroll: true,
    });
  }
}
function renderDock(tasks, goal) {
  const dock = document.getElementById("focus-dock");
  const active =
    tasks.find(
      (task) => task.id === goal.activeTask && task.status === "active",
    ) || tasks.find((task) => task.status === "active");
  const blocked = tasks.find((task) => task.status === "blocked");
  const focus =
    active ||
    blocked ||
    tasks.find((task) => task.status === "queued") ||
    tasks.at(-1);
  const current = el("div", "dock-current");
  const image = star("dock-star");
  if (focus?.status === "blocked") image.style.filter = "hue-rotate(172deg)";
  const body = el("div", "dock-body");
  body.append(
    el(
      "p",
      "eyebrow",
      active
        ? "Current task"
        : blocked
          ? "Needs attention"
          : focus?.status === "done"
            ? "Recorded completion"
            : "Next task",
    ),
  );
  body.append(el("h2", "", focus?.title || "Preparing your goal"));
  if (focus?.nextAction)
    body.append(el("p", "dock-next-action", "Next: " + focus.nextAction));
  body.append(
    el(
      "p",
      "",
      focus
        ? observation(focus) ||
            "Inspect the objective, constraints and evidence."
        : "Tasks will appear as local state changes.",
    ),
  );
  current.append(image, body);
  const action = el("button", "dock-action");
  action.type = "button";
  action.append(
    icon("telescope"),
    el(
      "span",
      "",
      blocked && !active ? "Review blocker" : "Inspect current task",
    ),
    icon("arrow-right"),
  );
  if (focus) {
    action.dataset.taskId = focus.id;
    action.dataset.taskKey = focus.id;
  } else {
    action.textContent = "How to continue";
    action.addEventListener("click", showHelp);
  }
  const next = el("div", "dock-next");
  next.append(el("p", "eyebrow", blocked ? "Needs attention" : "Next"));
  const nextTask = blocked || tasks.find((task) => task.status === "queued");
  next.append(
    el(
      "h3",
      "",
      nextTask?.title ||
        (goal.status === "done"
          ? "Review the final proof"
          : "No next task recorded"),
    ),
  );
  next.append(
    el(
      "p",
      "",
      nextTask
        ? nextTask.nextAction || statusLabel(nextTask.status)
        : goal.status === "done"
          ? "Task status is not a substitute for final goal proof."
          : "Choose the next step in your coding tool.",
    ),
  );
  if (nextTask) {
    const inspect = el(
      "button",
      "text-button",
      "Inspect " + (blocked ? "blocker" : "next task"),
    );
    inspect.dataset.taskId = nextTask.id;
    inspect.dataset.taskKey = nextTask.id;
    inspect.type = "button";
    next.append(inspect);
  }
  dock.replaceChildren(current, action, next);
}

function renderBoardWarning(message) {
  const node = el("section", "board-warning");
  node.append(
    el("strong", "", "Degraded board view. "),
    el("span", "", message),
  );
  return node;
}

function renderBoardError(message) {
  const node = el("section", "board-error");
  node.append(
    el("h2", "", "thegoalbuddy could not parse this board"),
    el("p", "", message),
  );
  return node;
}

function renderBoardSwitcher(boards) {
  boardSwitcherEl
    .closest(".board-switcher")
    .classList.toggle("is-empty", boards.length <= 1);
  const currentPath = normalizePath(window.location.pathname);
  const options = boards.map((board) => {
    const option = document.createElement("option");
    option.value = board.url;
    option.textContent = boardOptionLabel(board);
    const boardPath = normalizePath(
      new URL(board.url, window.location.href).pathname,
    );
    if (boardPath === currentPath) option.selected = true;
    return option;
  });
  boardSwitcherEl.replaceChildren(...options);
}

function findTask(selection) {
  if (!selection) return null;
  if (selection.parentId)
    return currentBoard?.tasks
      .find((task) => task.id === selection.parentId)
      ?.subgoal?.board?.tasks.find((task) => task.id === selection.id);
  return currentBoard?.tasks.find((task) => task.id === selection.id);
}
function openTask(taskId, parentId = "", trigger = document.activeElement) {
  const selection = { id: taskId, parentId };
  const task = findTask(selection);
  if (!task) return;
  selectedTask = selection;
  helpOpen = false;
  if (!modalEl.open) dialogTrigger = trigger;
  renderInspector(task);
  if (!modalEl.open) modalEl.showModal();
  modalEl.querySelector("[data-close-modal]").focus();
}
function renderInspector(task) {
  const focused = document.activeElement;
  const focusedInside = modalBodyEl.contains(focused);
  const key = focused?.dataset.focusKey || focused?.dataset.taskKey;
  const openDetails = [...modalBodyEl.querySelectorAll("details[open]")].map(
    (node) => node.dataset.detailKey,
  );
  const scroll = modalBodyEl.scrollTop;
  modalKickerEl.textContent = task.id + " · " + statusLabel(task.status);
  modalTitleEl.textContent = task.title;
  modalBodyEl.replaceChildren(renderTaskDetail(task));
  for (const node of modalBodyEl.querySelectorAll("details"))
    if (openDetails.includes(node.dataset.detailKey)) node.open = true;
  if (key)
    [...modalBodyEl.querySelectorAll("[data-focus-key], [data-task-key]")]
      .find(
        (node) => node.dataset.focusKey === key || node.dataset.taskKey === key,
      )
      ?.focus({ preventScroll: true });
  if (
    focusedInside &&
    !focused.isConnected &&
    document.activeElement === document.body
  )
    modalEl.querySelector("[data-close-modal]").focus({ preventScroll: true });
  modalBodyEl.scrollTop = scroll;
}
function refreshSelectedTask() {
  if (!selectedTask || !modalEl.open || helpOpen) return;
  const task = findTask(selectedTask);
  if (task) renderInspector(task);
  else {
    modalTitleEl.textContent = "Task no longer available";
    modalBodyEl.replaceChildren(
      el(
        "p",
        "detail-lead",
        "This task was removed or its board is unavailable. Close this view to inspect the current board.",
      ),
    );
    modalEl.querySelector("[data-close-modal]").focus();
  }
}
function closeModal() {
  if (modalEl.open) modalEl.close();
}
function renderTaskDetail(task) {
  const root = el("div");
  if (selectedTask?.parentId) {
    const back = el("button", "text-button", "Back to parent task");
    back.type = "button";
    back.dataset.taskId = selectedTask.parentId;
    back.dataset.taskKey = selectedTask.parentId;
    root.append(back);
  }
  root.append(el("p", "detail-lead", task.objective || task.title));
  if (task.status === "blocked")
    root.append(
      detailText(
        "What is needed",
        task.blockerReason ||
          "The blocker reason has not been recorded. Ask the goal coordinator to record it in state.yaml.",
      ),
    );
  if (task.nextAction) root.append(detailText("Next action", task.nextAction));
  if (task.receipt?.requiredReply)
    root.append(detailText("Required reply", task.receipt.requiredReply));
  const grid = el("dl", "detail-grid");
  for (const [label, value] of [
    ["Status", statusLabel(task.status)],
    ["Assigned to", task.assignee || task.type],
    ["Coding tool", task.harness],
  ]) {
    if (!value) continue;
    const item = el("div", "detail-item");
    item.append(el("dt", "", label), el("dd", "", value));
    grid.append(item);
  }
  root.append(grid);
  if (task.receipt?.present) {
    root.append(
      detailText(
        "Recorded receipt",
        task.receipt.summary || "Receipt recorded without a summary.",
      ),
    );
  }
  if (task.receipt?.evidence?.length || task.receipt?.note) {
    const section = detailList("Evidence", [
      ...(task.receipt.evidence || []),
      ...(task.receipt.note ? [task.receipt.note] : []),
    ]);
    section.classList.add("receipt-evidence");
    section.append(
      el(
        "p",
        "proof-caption",
        "Recorded evidence paths. Receipt presence alone does not establish that verification passed.",
      ),
    );
    root.append(section);
  }
  if (task.receipt?.commands?.length)
    root.append(
      detailList(
        "Recorded checks",
        task.receipt.commands.map(
          (command) => (command.status || "not recorded") + ": " + command.cmd,
        ),
      ),
    );
  if (task.verify?.length)
    root.append(detailList("Required verification", task.verify));
  if (task.note?.content) {
    const section = el("section", "detail-section");
    section.append(
      el("h3", "", task.note.title || task.note.path),
      el("pre", "note", task.note.content),
    );
    root.append(section);
  }
  if (task.receipt?.decision)
    root.append(detailText("Recorded decision", task.receipt.decision));
  if (task.subgoal) root.append(renderSubgoal(task.subgoal, task.id));
  const technical = el("details", "technical-details");
  technical.dataset.detailKey = "technical";
  const summary = el("summary", "", "Scope and constraints");
  summary.dataset.focusKey = "technical";
  technical.append(summary);
  for (const [label, values] of [
    ["Inputs", task.inputs],
    ["Constraints", task.constraints],
    ["Expected output", task.expectedOutput],
    ["Allowed files", task.allowedFiles],
    ["Stop conditions", task.stopIf],
    ["Changed files", task.receipt?.changedFiles],
  ])
    if (values?.length) technical.append(detailList(label, values));
  if (technical.childNodes.length > 1) root.append(technical);
  return root;
}
function showHelp() {
  dialogTrigger = document.activeElement;
  selectedTask = null;
  helpOpen = true;
  modalKickerEl.textContent = "Using thegoalbuddy";
  modalTitleEl.textContent = "Keep moving toward your goal.";
  const root = el("div");
  root.append(
    el(
      "p",
      "detail-lead",
      "The board reads your local files. Continue the work in Codex or Claude Code.",
    ),
  );
  const list = el("ol", "help-steps");
  for (const [title, copy] of [
    [
      "Start",
      "Run $goal-prep in Codex or /goal-prep in Claude Code. Describe the outcome, then use the execution command printed by preparation.",
    ],
    [
      "Resume",
      "Open your coding tool in the project, read goal.md and state.yaml, and continue the active task using the saved Run Command in goal.md.",
    ],
    [
      "Unblock",
      "Inspect the blocked task, provide the missing decision or input in your coding tool, and ask the goal coordinator to record it and select the next safe task.",
    ],
  ]) {
    const item = el("li");
    item.append(el("strong", "", title), el("p", "", copy));
    list.append(item);
  }
  root.append(list);
  if (currentBoard?.source?.statePath)
    root.append(
      detailText("Current local state", currentBoard.source.statePath),
    );
  if (currentBoard?.goal?.finalProof)
    root.append(
      detailText("Final proof required", currentBoard.goal.finalProof),
    );
  modalBodyEl.replaceChildren(root);
  if (!modalEl.open) modalEl.showModal();
  modalEl.querySelector("[data-close-modal]").focus();
}

function renderSubgoal(subgoal, parentTaskId) {
  const section = el("section", "detail-section subgoal-section");
  const header = el("div", "subgoal-header");
  const titleWrap = el("div");
  const board = subgoal.board;
  titleWrap.append(
    el("h3", "subgoal-title", board?.goal?.title || "Sub-goal"),
    el(
      "p",
      "subgoal-meta",
      [
        subgoal.path,
        subgoal.owner ? `owner: ${subgoal.owner}` : "",
        subgoal.depth ? `depth: ${subgoal.depth}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    ),
  );
  header.append(titleWrap, subgoalBadge(subgoal));
  section.append(header);

  if (!board?.columns?.length) {
    section.append(el("p", "", "No child board payload."));
    return section;
  }

  const boardEl = el("div", "subgoal-board");
  for (const task of board.tasks || [])
    boardEl.append(renderSubgoalTask(task, parentTaskId));
  section.append(boardEl);

  if (subgoal.rollupReceipt) {
    section.append(detailText("Roll-up Receipt", subgoal.rollupReceipt));
  }

  return section;
}

function renderSubgoalTask(task, parentTaskId) {
  const card = el(
    "button",
    `subgoal-task-card ${task.active ? "is-active" : ""}`,
  );
  card.type = "button";
  card.dataset.taskId = task.id;
  card.dataset.parentTaskId = parentTaskId;
  card.dataset.taskKey = parentTaskId + "/" + task.id;
  const topline = el("div", "card-topline");
  topline.append(el("span", "task-id", task.id), statusBadge(task.status));
  const footer = el("div", "card-footer");
  footer.append(el("span", "badge role", task.assignee || task.type || "PM"));
  if (task.receipt?.present)
    footer.append(el("span", "badge", "Receipt recorded"));
  card.append(topline, el("h4", "subgoal-task-title", task.title), footer);
  return card;
}

function detailText(title, value) {
  const section = el("section", "detail-section");
  section.append(el("h3", "", title), el("p", "", value || "None"));
  return section;
}

function detailList(title, values) {
  const section = el("section", "detail-section");
  section.append(el("h3", "", title));
  if (!values?.length) {
    section.append(el("p", "", "None"));
    return section;
  }
  const list = el("ul");
  for (const value of values) list.append(el("li", "", value));
  section.append(list);
  return section;
}

function statusBadge(status) {
  const label =
    status === "done"
      ? "Completed"
      : status === "active"
        ? "Active"
        : status === "blocked"
          ? "Blocked"
          : "Queued";
  return el("span", `badge status-${status}`, label);
}

function subgoalBadge(subgoal) {
  return el(
    "span",
    `badge subgoal status-${subgoal.status}`,
    `Sub-goal ${subgoal.status || "linked"}`,
  );
}

function setLiveState(text, live) {
  liveStateEl.textContent = text;
  liveDotEl.classList.toggle("offline", !live);
  settingsButtonEl.setAttribute(
    "aria-label",
    `Settings. Board status: ${text}`,
  );
  settingsButtonEl.title = `Settings · ${text}`;
}

function normalizePath(pathname) {
  return pathname.endsWith("/") ? pathname : pathname + "/";
}

function boardOptionLabel(board) {
  const title =
    board.title || board.slug || board.goalDir || "thegoalbuddy board";
  return /[/\\]subgoals[/\\]/.test(board.goalDir || "")
    ? `Child: ${title}`
    : title;
}

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

loadSettings()
  .then(loadBoard)
  .then(() => {
    setLiveState("Board connected", true);
    rememberCurrentBoard();
    loadBoardSwitcher();
    window.setInterval(loadBoardSwitcher, 5000);
    connectEvents();
  })
  .catch((error) => {
    setLiveState("Board offline", false);
    boardEl.textContent = error.message;
  });
