import type { HubState } from "../types";
import { entityNames } from "./schema";
import { normalizeTag } from "../hub";
export function validateState(value: unknown): asserts value is HubState {
  const s = value as HubState;
  if (!s || s.version !== 1)
    throw Error("지원하지 않는 메타데이터 버전입니다.");
  const required: Record<string, string[]> = {
    users: ["name", "team"],
    agents: [
      "name",
      "lv1",
      "lv2",
      "summary",
      "link1",
      "link2",
      "owner",
      "status",
      "connectionMode",
      "profileId",
      "defaultModel",
      "color",
    ],
    profiles: [
      "name",
      "mode",
      "baseUrl",
      "chatPath",
      "modelsPath",
      "defaultModel",
    ],
    works: [
      "agentId",
      "title",
      "description",
      "owner",
      "createdBy",
      "createdAt",
      "updatedAt",
      "status",
      "externalUrl",
      "activeThreadId",
    ],
    threads: ["workId", "title", "createdAt", "model"],
    messages: ["threadId", "role", "actor", "content", "at", "kind", "source"],
    artifacts: ["workId", "name", "mime", "createdBy", "createdAt"],
    bundles: [
      "name",
      "sourceWorkId",
      "createdBy",
      "createdAt",
      "summary",
      "note",
    ],
    handoffs: [
      "sourceWorkId",
      "targetWorkId",
      "targetThreadId",
      "bundleId",
      "actor",
      "at",
    ],
    requests: [
      "title",
      "requester",
      "workId",
      "threadId",
      "status",
      "createdAt",
    ],
    activities: ["workId", "actor", "at", "action", "detail"],
    notifications: ["userId", "title", "body", "link", "at"],
    requestRecords: [
      "threadId",
      "workId",
      "actorId",
      "role",
      "tabId",
      "status",
      "createdAt",
      "requestedModel",
      "source",
      "userMessageId",
      "leaseToken",
    ],
    completions: ["workId", "at", "actor", "reason"],
    tags: ["kind", "label", "key", "color"],
    taskTags: ["workId", "tagId", "at"],
    taskInputs: ["workId", "artifactId", "at"],
    catalogOrders: [],
  };
  for (const name of entityNames) {
    const rows =
      s[name] ??
      ([
        "requestRecords",
        "completions",
        "tags",
        "taskTags",
        "taskInputs",
        "catalogOrders",
      ].includes(name)
        ? []
        : undefined);
    if (!Array.isArray(rows)) throw Error(`${name} 목록이 올바르지 않습니다.`);
    const ids = new Set();
    for (const row of rows) {
      if (!row || typeof row.id !== "string" || !row.id || ids.has(row.id))
        throw Error(`${name} ID가 잘못되거나 중복됩니다.`);
      ids.add(row.id);
      for (const field of required[name])
        if (
          typeof (row as unknown as Record<string, unknown>)[field] !== "string"
        )
          throw Error(`${name}.${field} 형식 오류`);
    }
  }
  const id = (name: (typeof entityNames)[number], key: string) => {
    if (!(s[name] ?? []).some((x) => x.id === key))
      throw Error(`${name} 참조가 없습니다: ${key}`);
  };
  const list = (v: unknown): string[] => {
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string"))
      throw Error("ID 목록 형식 오류");
    return v;
  };
  const member = (v: string, values: string[]) => {
    if (!values.includes(v)) throw Error(`지원하지 않는 상태: ${v}`);
  };
  for (const a of s.agents) {
    id("users", a.owner);
    member(a.status, ["open", "working", "testing", "unconfigured", "retired"]);
    member(a.connectionMode, ["api", "external", "hybrid"]);
    if (a.connectionMode !== "external") id("profiles", a.profileId);
    list(a.examples);
    list(a.checklist);
    if (typeof a.intake !== "boolean") throw Error("접수 역할 형식 오류");
  }
  if (
    s.agents.filter((a) => a.intake).length !== 1 ||
    s.agents.some((a) => a.intake && a.status === "retired")
  )
    throw Error("사용 가능한 접수 에이전트가 한 개 필요합니다.");
  for (const p of s.profiles) {
    member(p.mode, ["api", "demo"]);
    list(p.models);
    if ("apiKey" in p) throw Error("백업에 API 키를 포함할 수 없습니다.");
  }
  for (const w of s.works) {
    id("agents", w.agentId);
    id("users", w.owner);
    id("users", w.createdBy);
    member(w.status, ["waiting", "active", "review", "done"]);
    id("threads", w.activeThreadId);
    if (s.threads.find((t) => t.id === w.activeThreadId)?.workId !== w.id)
      throw Error("업무와 대화 소속 불일치");
    for (const key of [...list(w.inputIds), ...list(w.outputIds)])
      id("artifacts", key);
    if (
      !Array.isArray(w.checks) ||
      w.checks.some(
        (c) =>
          !c ||
          typeof c.id !== "string" ||
          typeof c.label !== "string" ||
          typeof c.done !== "boolean",
      ) ||
      !Array.isArray(w.notes) ||
      w.notes.some(
        (n) =>
          !n ||
          typeof n.text !== "string" ||
          typeof n.actor !== "string" ||
          typeof n.at !== "string",
      )
    )
      throw Error("체크리스트/메모 형식 오류");
    if (typeof w.manual !== "boolean" || typeof w.archived !== "boolean")
      throw Error("업무 설정 형식 오류");
  }
  for (const t of s.threads) {
    id("works", t.workId);
    list(t.srIds).forEach((x) => id("requests", x));
    list(t.activeBundleIds).forEach((x) => id("bundles", x));
    list(t.selectedInputIds ?? []).forEach((x) => id("artifacts", x));
  }
  for (const m of s.messages) {
    id("threads", m.threadId);
    member(m.role, ["user", "assistant"]);
    member(m.kind, ["request", "discussion", "reply"]);
    list(m.fileIds).forEach((x) => id("artifacts", x));
    list(m.contextIds).forEach((x) => id("bundles", x));
    if (m.visibleToRequester) id("users", m.visibleToRequester);
  }
  for (const f of s.artifacts) {
    id("works", f.workId);
    if (
      !Number.isInteger(f.version) ||
      f.version < 1 ||
      !Number.isFinite(f.size) ||
      f.size < 0
    )
      throw Error("파일 버전/크기 오류");
    if (f.previousId) id("artifacts", f.previousId);
    if (!f.blobId && typeof f.content !== "string")
      throw Error("원문 참조가 없는 파일입니다.");
  }
  for (const b of s.bundles) {
    id("works", b.sourceWorkId);
    list(b.artifactIds).forEach((x) => id("artifacts", x));
    if (!Array.isArray(b.excerpts)) throw Error("대화 발췌 형식 오류");
    for (const e of b.excerpts) {
      if (
        typeof e.content !== "string" ||
        typeof e.actor !== "string" ||
        typeof e.at !== "string"
      )
        throw Error("발췌 형식 오류");
      id("messages", e.messageId);
      id("threads", e.threadId);
    }
  }
  for (const h of s.handoffs) {
    id("works", h.sourceWorkId);
    id("works", h.targetWorkId);
    id("threads", h.targetThreadId);
    id("bundles", h.bundleId);
    if (typeof h.active !== "boolean") throw Error("연결 상태 오류");
  }
  for (const r of s.requests) {
    id("users", r.requester);
    id("works", r.workId);
    id("threads", r.threadId);
    member(r.status, ["draft", "received", "responded", "closed"]);
    if (!Array.isArray(r.results)) throw Error("공유 결과 형식 오류");
    for (const result of r.results) {
      if (typeof result.text !== "string" || typeof result.at !== "string")
        throw Error("공유 결과 형식 오류");
      id("works", result.sourceWorkId);
      id("users", result.actor);
      list(result.artifactIds).forEach((x) => id("artifacts", x));
    }
  }
  for (const r of s.requestRecords ?? []) {
    id("threads", r.threadId);
    id("works", r.workId);
    id("users", r.actorId);
    id("messages", r.userMessageId);
    member(r.status, [
      "pending",
      "streaming",
      "succeeded",
      "failed",
      "cancelled",
      "interrupted",
    ]);
    if (
      !r.snapshot ||
      typeof r.snapshot.model !== "string" ||
      !Array.isArray(r.snapshot.messages) ||
      r.snapshot.messages.some(
        (m) =>
          typeof m.contentId !== "string" ||
          !["user", "assistant", "system"].includes(m.role),
      )
    )
      throw Error("요청 스냅샷 형식 오류");
    list(r.contextIds).forEach((x) => id("bundles", x));
    list(r.fileIds).forEach((x) => id("artifacts", x));
  }
  for (const c of s.completions ?? []) {
    id("works", c.workId);
    if (
      c.work?.id !== c.workId ||
      typeof c.legacy !== "boolean" ||
      !Array.isArray(c.work.checks) ||
      c.work.checks.some(
        (x) =>
          !x ||
          typeof x.id !== "string" ||
          typeof x.label !== "string" ||
          typeof x.done !== "boolean",
      ) ||
      !Array.isArray(c.work.notes) ||
      typeof c.work.title !== "string" ||
      typeof c.work.owner !== "string" ||
      c.work.status !== "done"
    )
      throw Error("완료 스냅샷 형식 오류");
    id("users", c.work.owner);
    id("agents", c.work.agentId);
    for (const file of [...list(c.work.inputIds), ...list(c.work.outputIds)])
      id("artifacts", file);
  }
  const keys = new Set<string>();
  for (const t of s.tags ?? []) {
    member(t.kind, ["sr", "keyword"]);
    const key = t.kind + ":" + t.key;
    if (
      !t.key ||
      t.key !== normalizeTag(t.label) ||
      keys.has(key) ||
      !/^#[a-fA-F0-9]{6}$/.test(t.color)
    )
      throw Error("중복 또는 잘못된 태그");
    keys.add(key);
  }
  const relations = new Set<string>();
  for (const t of s.taskTags ?? []) {
    id("works", t.workId);
    id("tags", t.tagId);
    const key = t.workId + ":" + t.tagId;
    if (relations.has(key)) throw Error("중복 태그 연결");
    relations.add(key);
  }
  relations.clear();
  for (const i of s.taskInputs ?? []) {
    id("works", i.workId);
    id("artifacts", i.artifactId);
    const key = i.workId + ":" + i.artifactId;
    if (relations.has(key) || typeof i.main !== "boolean")
      throw Error("중복 또는 잘못된 입력 선택");
    relations.add(key);
  }
  for (const c of s.catalogOrders ?? []) {
    if (
      !Number.isInteger(c.revision) ||
      c.revision < 0 ||
      new Set(list(c.agentIds)).size !== s.agents.length ||
      c.agentIds.length !== s.agents.length
    )
      throw Error("카탈로그 순서 오류");
    c.agentIds.forEach((x) => id("agents", x));
  }
  if (
    s.hubVersion === 3 &&
    s.works.some((w) => s.threads.filter((t) => t.workId === w.id).length !== 1)
  )
    throw Error("대화와 업무는 1:1이어야 합니다.");
}
