export type StageStatus = "pending" | "active" | "done" | "skipped" | "review";
export type Mode = "assistant" | "manual";
export type ChatThread = {
  id: string;
  title: string;
  createdAt: string;
  model?: string;
};
export type Connection = {
  mode: "demo" | "api";
  baseUrl: string;
  chatPath: string;
  modelsPath: string;
  models: string[];
  defaultModel: string;
  sendNames: boolean;
};
export type TaskModule = {
  id: string;
  name: string;
  short: string;
  description: string;
  mode: Mode;
  assistant: string;
  defaultModel?: string;
  checklist: string[];
};
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actor: string;
  at: string;
  files?: string[];
  threadId?: string;
  model?: string;
  source?: "demo" | "api";
  kind?: "discussion" | "prompt";
  attachmentText?: string;
};
export type Stage = {
  id: string;
  moduleId?: string;
  defaultModel?: string;
  threads?: ChatThread[];
  activeThreadId?: string;
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
  stages: (Pick<
    Stage,
    "name" | "short" | "mode" | "assistant" | "moduleId" | "defaultModel"
  > & { checklist?: Stage["checklist"] })[];
};
export type AppState = {
  modules?: TaskModule[];
  connection?: Connection;
  works: Work[];
  artifacts: Artifact[];
  events: AuditEvent[];
  templates: Template[];
  profile: string;
  externalUrl: string;
};
export type Update = (recipe: (state: AppState) => AppState) => void;
