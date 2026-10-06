/** Normalized, read-only board views. Raw YAML and HTTP data remain unknown until checked. */
export type BoardTaskStatus = "queued" | "active" | "blocked" | "done";
export type BoardColumnId = "todo" | "in-progress" | "blocked" | "completed";

export interface BoardCommand {
  cmd: string;
  status: string;
}

export interface BoardReceipt {
  present: boolean;
  summary: string;
  result: string;
  note: string;
  decision?: string;
  requiredReply?: string;
  waitingForApproval?: boolean;
  changedFiles?: string[];
  commands?: BoardCommand[];
  evidence?: string[];
}

export interface BoardNote {
  path: string;
  title: string;
  content: string;
  mtimeMs: number;
}

export interface BoardSubgoal {
  status: string;
  path: string;
  owner: string;
  createdFrom: string;
  depth: number;
  rollupReceipt: string;
  board: BoardPayload | null;
}

export interface BoardTask {
  id: string;
  title: string;
  objective: string;
  status: BoardTaskStatus;
  column: BoardColumnId;
  type: string;
  assignee: string;
  harness: string;
  active: boolean;
  inputs: string[];
  constraints: string[];
  expectedOutput: string[];
  allowedFiles: string[];
  verify: string[];
  stopIf: string[];
  blockerReason: string;
  nextAction: string;
  update: string;
  subgoal: BoardSubgoal | null;
  receipt: BoardReceipt;
  note?: BoardNote | null;
}

export interface BoardGoal {
  title: string;
  slug: string;
  kind?: string;
  status: string;
  tranche: string;
  activeTask: string;
  completionCriteria?: string;
  finalProof?: string;
}

export interface BoardVerification {
  result: string;
  task: string;
  commands: BoardCommand[];
}

export interface NormalizedGoalBoard extends BoardGoal {
  kind: string;
  completionCriteria: string;
  finalProof: string;
  goalDir: string;
  verification: BoardVerification;
  tasks: BoardTask[];
}

export interface BoardColumn<T = BoardTask> {
  id: BoardColumnId;
  title: string;
  description: string;
  tasks: T[];
}

export interface BoardPayload {
  generatedAt: string;
  parseWarning?: string;
  error?: string;
  source?: {
    goalDir: string;
    statePath: string;
    stateMtimeMs: number;
    notesDir: string;
  };
  goal: BoardGoal;
  verification?: BoardVerification;
  executor?: {
    status: string;
    label: string;
    observed: boolean;
    detail?: string;
  };
  counts?: {
    total: number;
    todo: number;
    inProgress: number;
    blocked: number;
    completed: number;
  };
  columns: BoardColumn[];
  tasks: BoardTask[];
  notes: Pick<BoardNote, "path" | "title" | "mtimeMs">[];
}

export interface BoardSummary {
  goalDir: string;
  appDir: string;
  title: string;
  slug: string;
  url: string;
  hubUrl: string;
  indexUrl: string;
  apiUrl: string;
  startedAt: string;
}

/** Successful normalization always includes these fields; unavailable-board responses do not. */
export interface CompleteBoardPayload extends BoardPayload {
  source: NonNullable<BoardPayload["source"]>;
  counts: NonNullable<BoardPayload["counts"]>;
  verification: BoardVerification;
  executor: NonNullable<BoardPayload["executor"]>;
}
