import "fake-indexeddb/auto";
import { expect, it, vi } from "vitest";
import { HubDB, readState } from "../db/schema";
import { initializeV3 } from "../db/migrateV3";
import { emptyDemoSeed } from "../demoCatalog";
import { assessChecklist, cancelChecklistAssessment } from "./checklistAssessment";
import { createBackup, restoreBackup } from "../db/backup";

async function fixture() {
  const db = new HubDB("assess-" + crypto.randomUUID());
  await initializeV3(db, JSON.stringify(emptyDemoSeed()), "absent-" + crypto.randomUUID());
  const at = new Date().toISOString();
  await db.table("works").add({ id: "w", agentId: "demo-writing", title: "Review", description: "", owner: "staff", createdBy: "staff", createdAt: at, updatedAt: at, status: "active", archived: false, manual: false, externalUrl: "", checks: [{ id: "c1", label: "Evidence", done: false }, { id: "c2", label: "Approval", done: true }], notes: [], inputIds: [], outputIds: [], activeThreadId: "t" });
  await db.table("threads").add({ id: "t", workId: "w", title: "Review", createdAt: at, model: "", srIds: [], activeBundleIds: [] });
  await db.table("profiles").update("demo", { mode: "api", baseUrl: "https://mock.invalid", defaultModel: "model" });
  return db;
}
it("applies achieved and unmet, preserves unknown, and leaves work status alone", async () => {
  const db = await fixture();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ results: [
    { id: "c1", verdict: "achieved", reason: "Source", references: [] },
    { id: "c2", verdict: "unknown", reason: "Unclear", references: [] },
  ] }) } }] }))));
  try {
    const result = await assessChecklist(db, "w", { actorId: "staff", role: "staff", tabId: "tab", commandId: "a" }, "key");
    expect(result.score).toEqual({ achieved: 1, total: 2, unknown: 1 });
    const state = await readState(db);
    expect(state.works.find(w => w.id === "w")?.checks.map(c => c.done)).toEqual([true, true]);
    expect(state.works.find(w => w.id === "w")?.status).toBe("active");
    expect(state.checklistAssessments).toHaveLength(1);
    expect(state.messages).toHaveLength(0);
  } finally { vi.unstubAllGlobals(); await db.delete(); }
});
it("keeps a late result for review without applying it after a manual checklist edit", async () => {
  const db = await fixture();
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  try {
    const pending = assessChecklist(db, "w", { actorId: "staff", role: "staff", tabId: "tab", commandId: "b" }, "key");
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await db.table("works").update("w", { checks: [{ id: "c1", label: "Evidence", done: true }, { id: "c2", label: "Approval", done: true }] });
    finish(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ results: [
      { id: "c1", verdict: "unmet", reason: "Missing", references: [] }, { id: "c2", verdict: "unmet", reason: "Missing", references: [] },
    ] }) } }] })));
    const result = await pending;
    expect(result.applied).toBe(false);
    expect((await db.table("works").get("w")).checks.map((c: { done: boolean }) => c.done)).toEqual([true, true]);
  } finally { vi.unstubAllGlobals(); await db.delete(); }
});
it("does not apply an assessment when conversation evidence changes while waiting", async () => {
  const db = await fixture();
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  try {
    const pending = assessChecklist(db, "w", { actorId: "staff", role: "staff", tabId: "tab", commandId: "e" }, "key");
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await db.table("messages").add({ id: "late-message", threadId: "t", role: "user", actor: "staff", content: "new evidence", at: new Date().toISOString(), kind: "request", source: "human", contextIds: [], fileIds: [] });
    finish(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ results: [
      { id: "c1", verdict: "achieved", reason: "Earlier evidence", references: [] },
      { id: "c2", verdict: "unmet", reason: "Earlier evidence", references: [] },
    ] }) } }] })));
    expect((await pending).applied).toBe(false);
    expect((await db.table("works").get("w")).checks.map((c: {done:boolean}) => c.done)).toEqual([false, true]);
  } finally { vi.unstubAllGlobals(); await db.delete(); }
});
it("does not apply an assessment when selected material changes while waiting", async () => {
  const db = await fixture();
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  try {
    const pending = assessChecklist(db, "w", { actorId: "staff", role: "staff", tabId: "tab", commandId: "f" }, "key");
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await db.table("artifacts").add({ id: "new-file", workId: "w", name: "new.txt", mime: "text/plain", size: 3, version: 1, content: "new", createdBy: "staff", createdAt: new Date().toISOString() });
    await db.table("taskInputs").add({ id: "new-input", workId: "w", artifactId: "new-file", main: false, at: new Date().toISOString() });
    finish(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ results: [
      { id: "c1", verdict: "achieved", reason: "Old evidence", references: [] },
      { id: "c2", verdict: "unmet", reason: "Old evidence", references: [] },
    ] }) } }] })));
    expect((await pending).applied).toBe(false);
    expect((await db.table("works").get("w")).checks.map((c: {done:boolean}) => c.done)).toEqual([false, true]);
  } finally { vi.unstubAllGlobals(); await db.delete(); }
});
it("restores assessment evidence and checked state through a full backup", async () => {
  const db = await fixture();
  const copy = new HubDB("assess-copy-" + crypto.randomUUID());
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ results: [
    { id: "c1", verdict: "achieved", reason: "Evidence", references: [] },
    { id: "c2", verdict: "unmet", reason: "Missing", references: [] },
  ] }) } }] }))));
  try {
    await assessChecklist(db, "w", { actorId: "staff", role: "staff", tabId: "tab", commandId: "c" }, "key");
    const backup = await createBackup(db);
    await restoreBackup(copy, backup);
    const restored = await readState(copy);
    expect(restored.checklistAssessments?.[0].score).toEqual({ achieved: 1, total: 2, unknown: 0 });
    expect(restored.works.find(w => w.id === "w")?.checks.map(c => c.done)).toEqual([true, false]);
  } finally { vi.unstubAllGlobals(); await db.delete(); await copy.delete(); }
});
it("cancels a pending assessment without changing checklist values", async () => {
  const db = await fixture();
  vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(Error("aborted")), { once: true });
  })));
  try {
    const ctx = { actorId: "staff", role: "staff" as const, tabId: "tab", commandId: "d" };
    const pending = assessChecklist(db, "w", ctx, "key");
    await vi.waitFor(async () => expect(await db.table("checklistAssessments").count()).toBe(1));
    const id = (await db.table("checklistAssessments").toArray())[0].id;
    await cancelChecklistAssessment(db, id, ctx);
    await expect(pending).rejects.toThrow();
    expect((await db.table("checklistAssessments").get(id)).status).toBe("cancelled");
    expect((await db.table("works").get("w")).checks.map((c: {done:boolean}) => c.done)).toEqual([false, true]);
  } finally { vi.unstubAllGlobals(); await db.delete(); }
});
