import { describe, it, expect } from "vitest";
import { transitionWork, getProgress, mergeStageStructure } from "./domain";
import type { Work, Stage } from "./types";
const stage = (id: string, status: Stage["status"], done = true): Stage => ({
  id,
  name: id,
  short: id,
  mode: "assistant",
  assistant: "FDS",
  status,
  inputs: [],
  outputs: [],
  checklist: [{ id: "check", label: "review", done }],
  messages: [],
  notes: [],
});
const fixture = (): Work => ({
  id: "w",
  title: "ET",
  description: "",
  system: "ET",
  owner: "Kim",
  priority: "보통",
  due: "2026-09-20",
  externalId: "CR-1",
  template: "ET",
  createdAt: "2026-09-16",
  stages: [
    {
      ...stage("urs", "active"),
      outputs: ["a", "b"],
      messages: [
        {
          id: "m",
          role: "user",
          content: "Keep me",
          actor: "Kim",
          at: "2026-09-16",
        },
      ],
    },
    stage("fds", "pending"),
    stage("dev", "pending"),
  ],
});
describe("workflow transitions", () => {
  it('blocks a reordered review from creating a second active stage',()=>{
    const w=fixture();w.stages[0].status='review';w.stages[1].status='review';w.stages[2].status='active';
    expect(()=>transitionWork(w,'urs','next','fds',[],'')).toThrow(/진행 중/);
  });
  it('reopens a completed single task with a reason and preserves records',()=>{
    const w=fixture();w.stages=[w.stages[0]];w.stages[0].status='done';
    expect(()=>transitionWork(w,'urs','reopen','urs',[],'')).toThrow(/사유/);
    const n=transitionWork(w,'urs','reopen','urs',[],'검토 조건 변경');
    expect(n.stages[0].status).toBe('active');expect(n.stages[0].checklist.every(c=>!c.done)).toBe(true);
    expect(n.stages[0].messages).toEqual(w.stages[0].messages);expect(n.stages[0].outputs).toEqual(w.stages[0].outputs);
  });
  it('blocks advancing a later review while an earlier task is active', () => {
    const w=fixture();w.stages[1].status='review';w.stages[1].checklist.forEach(c=>c.done=true);
    expect(()=>transitionWork(w,'fds','next','dev',[],'')).toThrow(/이전/);
    expect(()=>transitionWork(w,'fds','skip','dev',[],'later')).toThrow(/이전/);
  });
  it('does not reactivate a completed successor when advancing after reordering', () => {
    const w=fixture();w.stages[1].status='done';
    expect(()=>transitionWork(w,'urs','next','fds',[],'')).toThrow(/완료/);
  });
  it("blocks advancement while required checks are incomplete", () => {
    const w = fixture();
    w.stages[0].checklist[0].done = false;
    expect(() => transitionWork(w, "urs", "next", "fds", ["a"], "")).toThrow(
      /체크리스트/,
    );
  });
  it("transfers only selected output references and preserves source and conversation", () => {
    const w = fixture();
    const n = transitionWork(w, "urs", "next", "fds", ["b"], "");
    expect(n.stages[1].inputs).toEqual(["b"]);
    expect(n.stages[0].status).toBe("done");
    expect(n.stages[1].status).toBe("active");
    expect(n.stages[0].outputs).toEqual(["a", "b"]);
    expect(n.stages[0].messages[0].content).toBe("Keep me");
    expect(w.stages[0].status).toBe("active");
  });
  it("rejects file references outside the source outputs", () =>
    expect(() =>
      transitionWork(fixture(), "urs", "next", "fds", ["unknown"], ""),
    ).toThrow(/산출물/));
  it("requires an explanation for skipping", () =>
    expect(() =>
      transitionWork(fixture(), "urs", "skip", "fds", [], " "),
    ).toThrow(/사유/));
  it("marks a skipped stage and activates its target even with unchecked items", () => {
    const w = fixture();
    w.stages[0].checklist[0].done = false;
    const n = transitionWork(
      w,
      "urs",
      "skip",
      "fds",
      [],
      "기존 승인 문서 사용",
    );
    expect(n.stages[0].status).toBe("skipped");
    expect(n.stages[1].status).toBe("active");
  });
  it("reopens a prior stage and flags downstream completed work without erasing sessions", () => {
    const w = fixture();
    w.stages[0].status = "done";
    w.stages[1].status = "done";
    w.stages[2].status = "active";
    const n = transitionWork(w, "dev", "back", "urs", [], "요구사항 수정");
    expect(n.stages.map((s) => s.status)).toEqual([
      "active",
      "review",
      "review",
    ]);
    expect(n.stages[0].messages).toHaveLength(1);
    expect(n.stages[0].checklist[0].done).toBe(false);
  });
  it("rejects a forward target for a back transition", () =>
    expect(() =>
      transitionWork(fixture(), "urs", "back", "fds", [], "수정"),
    ).toThrow(/이전/));
  it("does not allow ordinary advancement to jump over an intermediate stage", () =>
    expect(() =>
      transitionWork(fixture(), "urs", "next", "dev", [], ""),
    ).toThrow(/다음/));
  it("counts completed and skipped stages without treating review as completed", () => {
    const w = fixture();
    w.stages[0].status = "done";
    w.stages[1].status = "skipped";
    w.stages[2].status = "review";
    expect(getProgress(w)).toBe(67);
  });
  it("blocks final completion if earlier stages still need review", () => {
    const w = fixture();
    w.stages[0].status = "done";
    w.stages[1].status = "review";
    w.stages[2].status = "active";
    expect(() => transitionWork(w, "dev", "next", "", [], "")).toThrow(
      /미완료/,
    );
  });
  it("completes the final stage when every earlier stage is resolved", () => {
    const w = fixture();
    w.stages[0].status = "done";
    w.stages[1].status = "skipped";
    w.stages[2].status = "active";
    const n = transitionWork(w, "dev", "next", "", [], "");
    expect(getProgress(n)).toBe(100);
  });
  it("rejects rewinding from a pending stage without duplicating the active stage", () =>
    expect(() =>
      transitionWork(fixture(), "dev", "back", "fds", [], "수정"),
    ).toThrow(/대기/));
  it("merges structural edits while preserving messages and file refs saved after the editor opened", () => {
    const w = fixture();
    const proposed = structuredClone(w.stages);
    proposed[0].name = "새 이름";
    w.stages[0].messages.push({
      id: "late",
      role: "assistant",
      content: "new response",
      actor: "assistant",
      at: "2026-09-16",
    });
    w.stages[0].outputs.push("late-file");
    const stages = mergeStageStructure(w, proposed);
    expect(stages[0].name).toBe("새 이름");
    expect(stages[0].messages).toHaveLength(2);
    expect(stages[0].outputs).toContain("late-file");
  });
  it("blocks deletion if a previously empty stage received work while editing", () => {
    const w = fixture();
    const proposed = w.stages.slice(0, 2);
    w.stages[2].notes.push({
      id: "late",
      text: "new note",
      actor: "Kim",
      at: "2026-09-16",
    });
    expect(() => mergeStageStructure(w, proposed)).toThrow(/기록/);
  });
});
