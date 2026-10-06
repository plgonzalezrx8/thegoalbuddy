export interface BoardSettings { theme: "system" | "light" | "dark"; density: "comfortable" | "compact"; completedVisibility: "show" | "collapse"; boardOpenBehavior: "last" | "newest"; motion: "system" | "reduce" | "allow"; lastBoardPath: string }
export type BoardSettingKey = Exclude<keyof BoardSettings, "lastBoardPath">;
