export type Role = "staff" | "requester" | "admin";
export type User = { id: string; name: string; team: string };
export type Agent = {
  catalog?: boolean;
  revision?: number;
  id: string;
  name: string;
  lv1: string;
  lv2: string;
  summary: string;
  link1: string;
  link2: string;
  owner: string;
  status: "open" | "working" | "testing" | "unconfigured" | "retired";
  examples: string[];
  imageId?: string;
  intake: boolean;
  connectionMode: "api" | "external" | "hybrid";
  profileId: string;
  defaultModel: string;
  checklist: string[];
  color: string;
};
export type ConnectionProfile = {
  adapter?: "chat-completions" | "openwebui";
  filesPath?: string;
  fileStatusPath?: string;
  revision?: number;
  maxRequestBytes?: number;
  id: string;
  name: string;
  mode: "demo" | "api";
  baseUrl: string;
  chatPath: string;
  modelsPath: string;
  models: string[];
  defaultModel: string;
  sendNames: boolean;
};
export type WorkStatus = "waiting" | "active" | "review" | "done";
export type WorkItem = {
  legacyWorkId?: string;
  titleSource?: "fallback" | "manual" | "ai";
  revision?: number;
  id: string;
  agentId: string;
  title: string;
  description: string;
  owner: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  status: WorkStatus;
  archived: boolean;
  manual: boolean;
  externalUrl: string;
  checks: { id: string; label: string; done: boolean }[];
  notes: { id: string; text: string; actor: string; at: string }[];
  inputIds: string[];
  outputIds: string[];
  activeThreadId: string;
};
export type Conversation = {
  selectedInputIds?: string[];
  id: string;
  workId: string;
  title: string;
  createdAt: string;
  model: string;
  srIds: string[];
  activeBundleIds: string[];
};
export type Message = {
  sequence?: number;
  requestId?: string;
  id: string;
  threadId: string;
  role: "user" | "assistant";
  actor: string;
  content: string;
  at: string;
  kind: "request" | "discussion" | "reply";
  source: "demo" | "api" | "human";
  model?: string;
  contextIds: string[];
  fileIds: string[];
  requestSnapshot?: string;
  visibleToRequester?: string;
};
export type ArtifactVersion = {
  legacyWorkId?: string;
  originThreadId?: string;
  sourceMessageIds?: string[];
  role?: "input" | "output";
  id: string;
  workId: string;
  name: string;
  mime: string;
  size: number;
  version: number;
  createdBy: string;
  createdAt: string;
  blobId?: string;
  content?: string;
  previousId?: string;
};
export type ContextExcerpt = {
  messageId: string;
  threadId: string;
  actor: string;
  content: string;
  at: string;
};
export type ContextBundle = {
  id: string;
  name: string;
  sourceWorkId: string;
  createdBy: string;
  createdAt: string;
  excerpts: ContextExcerpt[];
  artifactIds: string[];
  summary: string;
  note: string;
};
export type Handoff = {
  id: string;
  sourceWorkId: string;
  targetWorkId: string;
  targetThreadId: string;
  bundleId: string;
  actor: string;
  at: string;
  active: boolean;
  detachedAt?: string;
};
export type SharedResult = {
  id: string;
  sourceWorkId: string;
  text: string;
  artifactIds: string[];
  actor: string;
  at: string;
};
export type ServiceRequest = {
  titleSource?: "fallback" | "manual" | "ai";
  tagId?: string;
  id: string;
  number?: string;
  title: string;
  requester: string;
  workId: string;
  threadId: string;
  status: "draft" | "received" | "responded" | "closed";
  createdAt: string;
  submittedAt?: string;
  results: SharedResult[];
};
export type Activity = {
  transition?: {
    from: WorkStatus;
    to: WorkStatus;
    reason: string;
    owner: string;
    agentId: string;
    completionId?: string;
  };
  id: string;
  workId: string;
  actor: string;
  at: string;
  action: string;
  detail: string;
};
export type Notification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  link: string;
  at: string;
  read: boolean;
};
export type HubState = {
  checklistAssessments?: ChecklistAssessment[];
  hubVersion?: 3;
  tags?: Tag[];
  taskTags?: TaskTag[];
  taskInputs?: TaskInput[];
  catalogOrders?: CatalogOrder[];
  requestRecords?: RequestRecord[];
  completions?: CompletionSnapshot[];
  version: 1;
  users: User[];
  session: { userId: string; role: Role };
  agents: Agent[];
  profiles: ConnectionProfile[];
  works: WorkItem[];
  threads: Conversation[];
  messages: Message[];
  artifacts: ArtifactVersion[];
  bundles: ContextBundle[];
  handoffs: Handoff[];
  requests: ServiceRequest[];
  activities: Activity[];
  notifications: Notification[];
};
export type ChecklistAssessment = {
  id: string;
  tabId: string;
  leaseUntil: number;
  workId: string;
  actorId: string;
  at: string;
  model: string;
  status: "pending" | "completed" | "conflict" | "failed" | "cancelled";
  snapshot: { checks: WorkItem["checks"]; messageIds: string[]; fileIds: string[]; inputFlags?: { artifactId: string; main: boolean }[] };
  results: { id: string; verdict: "achieved" | "unmet" | "unknown"; reason: string; references: string[] }[];
  score: { achieved: number; total: number; unknown: number };
  applied: boolean;
  changes: { id: string; before: boolean; after: boolean }[];
  error?: string;
};
export type RequestRecord = {
  kind?: "chat" | "assessment";
  transport?: "inline" | "openwebui";
  phase?: "uploading" | "processing" | "chat";
  fileVersions?: { artifactId: string; version: number; main: boolean }[];
  profileSnapshot?: ConnectionProfile;
  id: string;
  threadId: string;
  workId: string;
  actorId: string;
  role: Role;
  tabId: string;
  status:
    | "pending"
    | "streaming"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "interrupted";
  createdAt: string;
  finishedAt?: string;
  requestedModel: string;
  actualModel?: string;
  source: "demo" | "api";
  contextIds: string[];
  fileIds: string[];
  userMessageId: string;
  snapshot: {
    model: string;
    messages: { role: string; contentId: string; name?: string }[];
    stream: false;
  };
  leaseToken: string;
  leaseUntil: number;
  error?: string;
  retryOf?: string;
};
export type CompletionSnapshot = {
  inputs?: TaskInput[];
  tags?: Tag[];
  id: string;
  workId: string;
  at: string;
  actor: string;
  reason: string;
  legacy: boolean;
  work: WorkItem;
};
export type Action =
  | { type: "sr.register"; workId: string; id: string }
  | {
      type: "tag.attach";
      workId: string;
      label: string;
      kind: "keyword" | "sr";
    }
  | { type: "tag.detach"; workId: string; tagId: string }
  | {
      type: "input.set";
      workId: string;
      artifactId: string;
      selected: boolean;
      main?: boolean;
    }
  | { type: "catalog.order"; agentIds: string[]; expectedRevision: number }
  | { type: "sr.title"; srId: string; title: string; source: "manual" | "ai" }
  | { type: "session"; userId: string; role: Role }
  | { type: "agent.save"; agent: Agent }
  | { type: "profile.save"; profile: ConnectionProfile }
  | {
      type: "work.create";
      agentId: string;
      title: string;
      owner: string;
      manual?: boolean;
      archived?: boolean;
      id?: string;
    }
  | {
      type: "work.edit";
      expectedRevision?: number;
      workId: string;
      title?: string;
      description?: string;
      owner?: string;
      manual?: boolean;
      archived?: boolean;
      externalUrl?: string;
    }
  | { type: "work.status"; workId: string; status: WorkStatus; reason: string }
  | { type: "work.check"; workId: string; checkId: string; done: boolean }
  | { type: "work.check.add"; workId: string; label: string }
  | { type: "work.note"; workId: string; text: string }
  | { type: "thread.create"; workId: string; title: string; id?: string }
  | { type: "thread.select"; workId: string; threadId: string }
  | { type: "thread.model"; threadId: string; model: string }
  | { type: "thread.sr"; threadId: string; srIds: string[] }
  | { type: "message.add"; message: Message }
  | {
      type: "artifact.add";
      artifact: ArtifactVersion;
      kind: "input" | "output";
    }
  | {
      type: "artifact.unlink";
      workId: string;
      artifactId: string;
      kind: "input" | "output";
    }
  | { type: "bundle.save"; bundle: ContextBundle }
  | { type: "context.import"; threadId: string; bundle: ContextBundle }
  | { type: "thread.inputs"; threadId: string; fileIds: string[] }
  | { type: "context.attach"; threadId: string; bundleId: string }
  | { type: "context.detach"; threadId: string; bundleId: string }
  | {
      type: "handoff";
      bundle: ContextBundle;
      targetWorkId?: string;
      targetAgentId?: string;
      title?: string;
      owner?: string;
      srIds: string[];
      newWorkId?: string;
    }
  | { type: "handoff.detach"; handoffId: string }
  | { type: "sr.start"; title: string; id?: string; workId?: string }
  | { type: "sr.submit"; srId: string }
  | {
      type: "sr.share";
      srId: string;
      workId: string;
      text: string;
      artifactIds: string[];
    }
  | {
      type: "sr.status";
      srId: string;
      status: "received" | "responded" | "closed";
    }
  | { type: "notification.read"; id: string };

export type Tag = {
  id: string;
  kind: "keyword" | "sr";
  label: string;
  key: string;
  color: string;
};
export type TaskTag = {
  id: string;
  workId: string;
  tagId: string;
  at: string;
  order?: number;
};
export type TaskInput = {
  id: string;
  workId: string;
  artifactId: string;
  main: boolean;
  at: string;
};
export type CatalogOrder = { id: string; agentIds: string[]; revision: number };
