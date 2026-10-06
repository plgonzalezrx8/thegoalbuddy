/** Raw external values remain unknown until the relevant runtime validator narrows them. */
export type Scalar = string | number | boolean | null;
export type GoalRole = "scout" | "judge" | "worker" | "pm";
export type ReasoningHint = "low" | "medium" | "high" | "xhigh";
export type RawGoalTask = Record<string, unknown>;
export interface LoadedTask extends RawGoalTask { id: string; }
export interface LoadedBoard {
  path: string;
  root: string;
  document: Record<string, unknown>;
  tasks: RawGoalTask[];
  goal: Record<string, unknown>;
  activeTask: unknown;
}
export interface PromptOptions { goalRoot?: string; boardPath?: string; taskId?: string; json?: boolean; parallelPlan?: boolean; }
