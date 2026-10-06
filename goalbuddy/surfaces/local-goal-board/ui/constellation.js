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
    .sort(
      (a, b) => rank[a.task.status] - rank[b.task.status] || a.order - b.order,
    );
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
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
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
  return (
    {
      active: "In progress",
      done: "Completed",
      blocked: "Needs attention",
      queued: "Pending",
    }[status] || status
  );
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
  button.setAttribute(
    "aria-label",
    task.title + ". " + statusLabel(task.status) + ". Inspect task.",
  );
  if (!compact) {
    button.style.left = position.x * 100 + "%";
    button.style.top = position.y * 100 + "%";
    if (task.status === "blocked" && position.x < 0.75)
      button.classList.add("is-side-label");
    if (position.x > 0.75) button.classList.add("is-edge");
    button.append(element("span", "task-id", task.id));
  }
  const label = element("span", "star-label");
  label.append(element("span", "task-title", task.title));
  if (!compact)
    label.append(element("span", "status-label", statusLabel(task.status)));
  const update = observation(task);
  if (update) label.append(element("span", "task-observation", update));
  if (evidenceText(task) && !compact) {
    const evidence = element("span", "task-evidence");
    const copy = element("span", "", evidenceText(task));
    copy.append(
      element(
        "span",
        "evidence-caption",
        "Receipt evidence · inspect to review",
      ),
    );
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
  const positions =
    tasks.length === 1
      ? [{ x: 0.43, y: 0.38 }]
      : tasks.length === 2
        ? [POSITIONS[0], POSITIONS[2]]
        : POSITIONS;
  tasks.forEach((task, i) =>
    fragment.append(renderStarTask(task, positions[i])),
  );
  const destination = element("div", "destination");
  const copy = element("div");
  copy.append(
    element("p", "eyebrow", "Destination"),
    element("h2", "", "Goal"),
    element("p", "", goal.title),
  );
  destination.append(star(), copy);
  fragment.append(destination);
  return { fragment, canvas, positions };
}
export function drawSequence(canvas, tasks, positions, light = false) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const { width, height } = parent.getBoundingClientRect();
  const density = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * density);
  canvas.height = Math.round(height * density);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
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
    const a = point(positions[i]),
      b = point(positions[i + 1]);
    ctx.beginPath();
    ctx.strokeStyle = colors[tasks[i].status] || colors.queued;
    ctx.setLineDash(
      tasks[i].status === "blocked" || tasks[i].status === "queued"
        ? [6, 7]
        : [],
    );
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
  for (const task of ordered) fragment.append(renderStarTask(task, null, true));
  if (collapseDone && done.length) {
    const details = element("details", "completed-disclosure");
    details.dataset.detailKey = "completed";
    details.append(
      element(
        "summary",
        "",
        done.length + " completed " + (done.length === 1 ? "task" : "tasks"),
      ),
    );
    for (const task of done) details.append(renderStarTask(task, null, true));
    fragment.append(details);
  } else
    for (const task of done) fragment.append(renderStarTask(task, null, true));
  return fragment;
}
