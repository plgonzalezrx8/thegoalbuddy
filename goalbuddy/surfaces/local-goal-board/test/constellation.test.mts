import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGoalBoard, createBoardPayload } from "../scripts/lib/goal-board.mjs";
import { sectorTasks, readBoardPayload, readBoardSummaries } from "../ui/constellation.js";

test("exposes owner criteria, verification and decision provenance without inventing proof", () => {
  const board = normalizeGoalBoard({ version: 2, goal: {
    title: "Keyboard", oracle: { signal: "Tab and Escape work", final_proof: "Recorded walkthrough" },
    intake: { completion_proof: "Every dialog is accessible" },
  }, checks: { last_verification: { result: "pass", task: "T001", commands: ["npm test"] } }, tasks: [
    { id: "T001", status: "done", objective: "Map focus", receipt: { result: "done", evidence: ["focus.md"] } },
    { id: "T002", status: "blocked", objective: "Resolve Escape", receipt: { result: "blocked", summary: "Need an Escape decision", required_reply: "Close the nested dialog" } },
  ] });
  assert.equal(board.completionCriteria, "Tab and Escape work");
  assert.equal(board.finalProof, "Recorded walkthrough");
  assert.equal(board.verification.result, "pass");
  assert.equal(board.verification.task, "T001");
  assert.deepEqual(board.tasks[0].receipt.evidence, ["focus.md"]);
  assert.equal(board.tasks[1].blockerReason, "Need an Escape decision");
  assert.equal(board.tasks[1].receipt.requiredReply, "Close the nested dialog");
});

test("allows a preparing empty board and rejects absent or invalid tasks", () => {
  assert.deepEqual(normalizeGoalBoard({ version: 2, goal: { title: "Preparing" }, tasks: [] }).tasks, []);
  assert.throws(() => normalizeGoalBoard({ version: 2, goal: {} }), /tasks list/);
  assert.throws(() => normalizeGoalBoard({ version: 2, goal: {}, tasks: "bad" }), /tasks list/);
});

test("does not treat a receipt or missing check as verified completion", () => {
  const board = normalizeGoalBoard({ version: 2, goal: {}, tasks: [
    { id: "T001", status: "done", receipt: "Finished mapping" },
    { id: "T002", status: "blocked" },
  ] });
  assert.equal(board.completionCriteria, "");
  assert.equal(board.verification.result, "unknown");
  assert.equal(board.tasks[0].receipt.present, true);
  assert.equal(board.tasks[1].blockerReason, "");
});

test("sectors prioritize current and blocked work without dropping any task", () => {
  const tasks = Array.from({ length: 14 }, (_, i) => ({ id: `T${i}`, status: i === 10 ? "active" : i === 11 ? "blocked" : i < 9 ? "done" : "queued" }));
  const first = sectorTasks(tasks);
  assert.ok(first.tasks.some(task => task.status === "active"));
  assert.ok(first.tasks.some(task => task.status === "blocked"));
  const seen = Array.from({ length: first.total }, (_, sector) => sectorTasks(tasks, sector).tasks).flat();
  assert.equal(seen.length, tasks.length);
  assert.equal(new Set(seen.map(task => task.id)).size, tasks.length);
  assert.equal(sectorTasks(tasks, 999).page, first.total - 1);
  assert.equal(sectorTasks(tasks, -1).page, 0);
  assert.equal(sectorTasks(tasks, 0, true).tasks.some(task => task.status === "done"), false);
  assert.equal(sectorTasks([], 99).total, 1);
});

test("explicit Worker receipt blocker takes precedence over a general summary", () => {
  const board = normalizeGoalBoard({ version: 2, goal: {}, tasks: [{
    id: "T001", status: "blocked", type: "worker", receipt: {
      result: "blocked", blocked_reason: "Need production credentials",
      summary: "Code landed; verification is blocked", next_action: "Provide a test credential",
    },
  }] });
  assert.equal(board.tasks[0].blockerReason, "Need production credentials");
  assert.equal(board.tasks[0].nextAction, "Provide a test credential");
});


test("narrows board responses only after validating the rendered task and receipt fields", () => {
  const payload = createBoardPayload("goalbuddy/surfaces/local-goal-board/examples/sample-goal");
  assert.equal(readBoardPayload(payload), payload);
  for (const invalid of [null, [], { ...payload, tasks: "invalid" }, { ...payload, tasks: [{ ...payload.tasks[0], receipt: { present: true, summary: 17 } }] }, { ...payload, counts: { blocked: "many" } }, { ...payload, source: { statePath: "state.yaml" } }]) {
    assert.throws(() => readBoardPayload(invalid), /Invalid board response/);
  }
  assert.deepEqual(readBoardSummaries(undefined), []);
  assert.deepEqual(readBoardSummaries([{ url: "javascript:alert(1)" }]), []);
});
