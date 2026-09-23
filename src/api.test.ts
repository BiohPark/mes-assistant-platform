import { describe, it, expect, vi, afterEach } from "vitest";
import { buildRequest, callAssistant } from "./api";
import type { HubState } from "./types";
import { seed } from "./seed";
describe("API context boundary", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("excludes staff questions and staff-triggered answers from requester history", () => {
    const s = seed();
    const base = s.messages[0];
    s.messages.push(
      {
        ...base,
        id: "staff-private",
        actor: "staff",
        content: "STAFF QUESTION",
        kind: "request",
      },
      {
        ...base,
        id: "staff-answer",
        actor: "urs",
        role: "assistant",
        content: "PRIVATE REPLY",
        kind: "reply",
      },
    );
    s.session = { userId: "requester", role: "requester" };
    const serialized = JSON.stringify(
      buildRequest(s, "urs-work-thread", "내 요청"),
    );
    expect(serialized).not.toContain("STAFF QUESTION");
    expect(serialized).not.toContain("PRIVATE REPLY");
    expect(serialized).toContain("설비의 상태 변경 이력");
  });
  it("sends selected model and text bytes to API and records actual returned model", async () => {
    const s = seed();
    s.profiles[0].mode = "api";
    s.profiles[0].baseUrl = "https://ai.internal/v1/";
    s.threads[0].model = "session-override";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "actual-served-model",
          choices: [{ message: { content: "API response" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await callAssistant(
      s,
      "urs-work-thread",
      "확인",
      "temporary-key",
    );
    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe("https://ai.internal/v1/chat/completions");
    expect(body.model).toBe("session-override");
    expect(JSON.stringify(body.messages)).toContain(
      "표시 항목: 변경 전후 상태",
    );
    expect(init.headers.Authorization).toBe("Bearer temporary-key");
    expect(result.model).toBe("actual-served-model");
    expect(result.source).toBe("api");
    expect(result.snapshot).not.toContain("temporary-key");
  });
  it("rejects API errors instead of substituting a sample response", async () => {
    const s = seed();
    s.profiles[0].mode = "api";
    s.profiles[0].baseUrl = "https://ai.internal";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })),
    );
    await expect(
      callAssistant(s, "urs-work-thread", "확인", "bad-key"),
    ).rejects.toThrow("401");
  });
  it("does not send internal attachments or received bundles in requester intake", () => {
    const s = seed();
    s.session = { userId: "requester", role: "requester" };
    s.artifacts.push({
      id: "private-file",
      workId: "urs-work",
      name: "internal.txt",
      mime: "text/plain",
      size: 1,
      version: 1,
      createdBy: "staff",
      createdAt: "now",
      content: "PRIVATE FILE",
    });
    s.works[0].inputIds.push("private-file");
    s.bundles.push({
      id: "private-bundle",
      sourceWorkId: "fds-work",
      name: "internal",
      createdBy: "staff",
      createdAt: "now",
      excerpts: [],
      artifactIds: [],
      summary: "PRIVATE CONTEXT",
      note: "",
    });
    s.threads[0].activeBundleIds.push("private-bundle");
    const body = JSON.stringify(
      buildRequest(s, "urs-work-thread", "요청 내용"),
    );
    expect(body).not.toContain("PRIVATE FILE");
    expect(body).not.toContain("PRIVATE CONTEXT");
    expect(() => buildRequest(s, "fds-work-thread", "몰래 읽기")).toThrow();
  });
  const state = {
    session: { userId: "staff", role: "staff" },
    requests: [],
    agents: [{ id: "a", profileId: "p", defaultModel: "agent-model" }],
    profiles: [{ id: "p", defaultModel: "profile-model", sendNames: false }],
    works: [{ id: "w", agentId: "a", inputIds: [] }],
    threads: [
      { id: "t", workId: "w", model: "thread-model", activeBundleIds: [] },
    ],
    messages: [
      {
        id: "m",
        threadId: "t",
        role: "user",
        kind: "request",
        actor: "u",
        content: "previous question",
        requestSnapshot: "REMOVED SECRET",
        contextIds: ["b"],
      },
    ],
    bundles: [
      {
        id: "b",
        name: "old",
        excerpts: [{ content: "REMOVED SECRET" }],
        artifactIds: [],
        summary: "",
        note: "",
      },
    ],
    artifacts: [],
    users: [],
  } as unknown as HubState;
  it("never reattaches historical request snapshots", () => {
    const r = buildRequest(state, "t", "next");
    expect(JSON.stringify(r)).not.toContain("REMOVED SECRET");
    expect(r.model).toBe("thread-model");
  });
  it("sends only active snapshots and text file contents", () => {
    const s = structuredClone(state);
    s.threads[0].activeBundleIds = ["b"];
    expect(JSON.stringify(buildRequest(s, "t", "next"))).toContain(
      "REMOVED SECRET",
    );
  });
  it("uses agent then profile fallback", () => {
    const s = structuredClone(state);
    s.threads[0].model = "";
    expect(buildRequest(s, "t", "x").model).toBe("agent-model");
    s.agents[0].defaultModel = "";
    expect(buildRequest(s, "t", "x").model).toBe("profile-model");
  });
});
