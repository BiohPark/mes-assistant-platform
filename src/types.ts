export type StageStatus = "pending" | "active" | "done" | "skipped" | "review";
export type Mode = "assistant" | "manual";
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actor: string;
  at: string;
  files?: string[];
};
export type Stage = {
  id: string;
  name: string;
  short: string;
  mode: Mode;
  assistant: string;
  status: StageStatus;
  inputs: string[];
  outputs: string[];
  checklist: { id: string; label: string; done: boolean }[];
  messages: Message[];
  notes: { id: string; text: string; actor: string; at: string }[];
};
export type Work = {
  id: string;
  title: string;
  description: string;
  system: string;
  owner: string;
  priority: "높음" | "보통";
  due: string;
  externalId: string;
  template: string;
  stages: Stage[];
  createdAt: string;
};
export type Artifact = {
  id: string;
  name: string;
  mime: string;
  size: number;
  version: string;
  workId: string;
  stageId: string;
  createdBy: string;
  createdAt: string;
  content?: string;
  stored?: boolean;
};
export type AuditEvent = {
  id: string;
  workId: string;
  stageId: string;
  actor: string;
  action: string;
  detail: string;
  timestamp: string;
};
export type Template = {
  id: string;
  name: string;
  description: string;
  stages: Pick<Stage, "name" | "short" | "mode" | "assistant">[];
};
export type AppState = {
  works: Work[];
  artifacts: Artifact[];
  events: AuditEvent[];
  templates: Template[];
  profile: string;
  externalUrl: string;
};
export type Update = (recipe: (state: AppState) => AppState) => void;
