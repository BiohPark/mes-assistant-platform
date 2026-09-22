import { describe, it, expect } from "vitest";
import { seed } from "./seed";
import { reduce, modelFor, canSeeWork, visibleMessages } from "./domain";
import type { ContextBundle } from "./types";
const bundle = (s: ReturnType<typeof seed>): ContextBundle => ({
  id: "bundle-test",
  name: "선택한 요구사항",
  sourceWorkId: s.works[0].id,
  createdBy: "staff",
  createdAt: new Date().toISOString(),
  excerpts: [],
  artifactIds: [...s.works[0].inputIds],
  summary: "요약",
  note: "선택 전달",
});
describe("Agent Hub independent work invariants", () => {
  it("keeps staff replies private and requires requester provenance on asynchronous replies", () => {
    let s = seed();
    const base = s.messages[0];
    s = reduce(s, {
      type: "message.add",
      message: {
        ...base,
        id: "private-answer",
        actor: "urs",
        role: "assistant",
        kind: "reply",
        source: "demo",
        content: "STAFF ONLY",
      },
    });
    s = reduce(s, { type: "session", userId: "requester", role: "requester" });
    expect(
      visibleMessages(s, "urs-work-thread").some(
        (m) => m.content === "STAFF ONLY",
      ),
    ).toBe(false);
    expect(() =>
      reduce(s, {
        type: "message.add",
        message: {
          ...base,
          id: "delayed-answer",
          actor: "urs",
          role: "assistant",
          kind: "reply",
          source: "demo",
          content: "OLD STAFF REQUEST",
        },
      }),
    ).toThrow();
    s = reduce(s, {
      type: "message.add",
      message: {
        ...base,
        id: "own-answer",
        actor: "urs",
        role: "assistant",
        kind: "reply",
        source: "demo",
        content: "REQUESTER REPLY",
        visibleToRequester: "requester",
      },
    });
    expect(
      visibleMessages(s, "urs-work-thread").some((m) => m.id === "own-answer"),
    ).toBe(true);
  });
  it("rejects existing retired handoff destinations atomically and preserves version snapshots", () => {
    let s = seed();
    const b = bundle(s);
    const before = structuredClone(s);
    expect(() =>
      reduce(s, {
        type: "handoff",
        bundle: b,
        targetWorkId: "legacy-work",
        srIds: [],
      }),
    ).toThrow();
    expect(s).toEqual(before);
    s = reduce(s, {
      type: "handoff",
      bundle: b,
      targetWorkId: "fds-work",
      srIds: [],
    });
    const old = s.artifacts[0];
    s = reduce(s, {
      type: "artifact.add",
      kind: "input",
      artifact: {
        ...old,
        id: "requirements-v2",
        version: 2,
        previousId: old.id,
        content: "NEW VERSION",
      },
    });
    expect(s.bundles.at(-1)?.artifactIds).toEqual([old.id]);
    expect(s.artifacts.find((f) => f.id === old.id)?.content).toBe(old.content);
    expect(() =>
      reduce(s, {
        type: "artifact.add",
        kind: "input",
        artifact: { ...old, content: "OVERWRITE" },
      }),
    ).toThrow();
  });
  it("blocks requester access to internal sibling threads and output creation", () => {
    let s = reduce(seed(), {
      type: "thread.create",
      workId: "urs-work",
      title: "내부 검토",
      id: "private-thread",
    });
    s = reduce(s, { type: "session", userId: "requester", role: "requester" });
    expect(() =>
      reduce(s, {
        type: "thread.model",
        threadId: "private-thread",
        model: "private",
      }),
    ).toThrow();
    expect(() =>
      reduce(s, { type: "thread.create", workId: "urs-work", title: "우회" }),
    ).toThrow();
    expect(() =>
      reduce(s, {
        type: "artifact.add",
        kind: "output",
        artifact: {
          id: "unauthorized",
          workId: "urs-work",
          name: "result",
          mime: "text/plain",
          size: 1,
          version: 1,
          content: "x",
          createdBy: "requester",
          createdAt: new Date().toISOString(),
        },
      }),
    ).toThrow();
  });
  it("can forward a received snapshot from independent target even after source archive", () => {
    let s = seed();
    const b = bundle(s);
    const m = s.messages[0];
    b.excerpts = [
      {
        messageId: m.id,
        threadId: m.threadId,
        actor: m.actor,
        content: m.content,
        at: m.at,
      },
    ];
    s = reduce(s, {
      type: "handoff",
      bundle: b,
      targetAgentId: "fds",
      newWorkId: "middle",
      title: "중간",
      owner: "staff",
      srIds: [],
    });
    s = reduce(s, {
      type: "work.edit",
      workId: b.sourceWorkId,
      archived: true,
    });
    const next = { ...b, id: "forwarded", sourceWorkId: "middle" };
    s = reduce(s, {
      type: "handoff",
      bundle: next,
      targetAgentId: "test",
      newWorkId: "last",
      title: "검증",
      owner: "staff",
      srIds: [],
    });
    expect(s.bundles.at(-1)?.excerpts).toEqual(b.excerpts);
  });
  it("creates an independent target and retains immutable context after source archive and detach", () => {
    let s = seed();
    const source = s.works[0];
    const b = bundle(s);
    s = reduce(s, {
      type: "handoff",
      bundle: b,
      targetAgentId: "fds",
      newWorkId: "target",
      title: "FDS 신규 업무",
      owner: "staff",
      srIds: [],
    });
    expect(s.works.find((w) => w.id === "target")?.status).toBe("waiting");
    expect(s.works.find((w) => w.id === source.id)?.status).toBe(source.status);
    expect(s.works.find((w) => w.id === source.id)?.checks).toEqual(
      source.checks,
    );
    b.summary = "mutated outside reducer";
    expect(s.bundles.at(-1)?.summary).toBe("요약");
    s = reduce(s, { type: "work.edit", workId: source.id, archived: true });
    s = reduce(s, { type: "handoff.detach", handoffId: s.handoffs.at(-1)!.id });
    expect(s.bundles.at(-1)?.artifactIds).toEqual(source.inputIds);
    expect(
      s.threads.find((t) => t.workId === "target")?.activeBundleIds,
    ).toEqual([]);
    expect(s.handoffs.at(-1)?.active).toBe(false);
  });
  it("requires reasons for unfinished completion and reopening without losing history", () => {
    let s = seed();
    const w = s.works[0];
    expect(() =>
      reduce(s, {
        type: "work.status",
        workId: w.id,
        status: "done",
        reason: "",
      }),
    ).toThrow();
    s = reduce(s, {
      type: "work.status",
      workId: w.id,
      status: "done",
      reason: "데모 검토 완료",
    });
    expect(() =>
      reduce(s, {
        type: "work.status",
        workId: w.id,
        status: "active",
        reason: "",
      }),
    ).toThrow();
    const msgs = s.messages;
    s = reduce(s, {
      type: "work.status",
      workId: w.id,
      status: "active",
      reason: "추가 요구사항",
    });
    expect(s.messages).toEqual(msgs);
    expect(s.activities.at(-1)?.action).toBe("업무 재개");
  });
  it("submits SR once, tags and notifies; internal tags never grant requester access", () => {
    let s = reduce(seed(), {
      type: "session",
      userId: "requester",
      role: "requester",
    });
    s = reduce(s, {
      type: "sr.start",
      title: "설비 신규 등록",
      id: "new-sr",
      workId: "intake-new",
    });
    s = reduce(s, { type: "sr.submit", srId: "new-sr" });
    const once = s;
    expect(s.works.find((w) => w.id === "intake-new")?.status).toBe("waiting");
    s = reduce(s, { type: "sr.submit", srId: "new-sr" });
    expect(s.requests).toEqual(once.requests);
    expect(s.notifications).toEqual(once.notifications);
    const sr = s.requests.find((r) => r.id === "new-sr")!;
    expect(s.threads.find((t) => t.id === sr.threadId)?.srIds).toContain(sr.id);
    expect(canSeeWork(s, "intake-new")).toBe(true);
    expect(canSeeWork(s, "fds-work")).toBe(false);
    expect(() =>
      reduce(s, { type: "work.note", workId: "fds-work", text: "비공개" }),
    ).toThrow();
  });
  it("protects intake retirement, excludes retired targets and honors model precedence", () => {
    let s = seed();
    s.session = { userId: "admin", role: "admin" };
    const intake = s.agents.find((a) => a.intake)!;
    expect(() =>
      reduce(s, {
        type: "agent.save",
        agent: { ...intake, status: "retired" },
      }),
    ).toThrow();
    expect(() =>
      reduce(s, {
        type: "work.create",
        agentId: "legacy",
        title: "금지",
        owner: "staff",
      }),
    ).toThrow();
    const t = s.threads[0];
    s.agents.find((a) => a.id === s.works[0].agentId)!.defaultModel =
      "agent-model";
    expect(modelFor(s, t.id)).toBe("agent-model");
    s = reduce(s, {
      type: "thread.model",
      threadId: t.id,
      model: "thread-model",
    });
    expect(modelFor(s, t.id)).toBe("thread-model");
  });
  it("requires explicit result sharing and preserves received artifacts on unlink", () => {
    let s = seed();
    const sr = s.requests.find((r) => r.number)!;
    expect(sr.results).toHaveLength(0);
    s = reduce(s, {
      type: "sr.share",
      srId: sr.id,
      workId: s.works[0].id,
      text: "요청 검토 결과",
      artifactIds: s.works[0].inputIds,
    });
    expect(s.requests.find((r) => r.id === sr.id)?.results).toHaveLength(1);
    const id = s.works[0].inputIds[0];
    s = reduce(s, {
      type: "artifact.unlink",
      workId: s.works[0].id,
      artifactId: id,
      kind: "input",
    });
    expect(s.artifacts.some((a) => a.id === id)).toBe(true);
  });
});
