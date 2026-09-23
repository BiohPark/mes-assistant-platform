import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { HubDB, readState } from "../db/schema";
import { initializeV3 } from "../db/migrateV3";
import { beginConversation } from "./draftService";
it("does not persist an empty task when initial request preparation fails", async () => {
  const db = new HubDB("draft-" + crypto.randomUUID());
  try {
    await initializeV3(db, null, "missing-" + crypto.randomUUID());
    const before = await readState(db);
    const a = before.agents.find((a) => a.intake)!;
    await db.table("profiles").update(a.profileId, { maxRequestBytes: 1024 });
    await expect(
      beginConversation(
        db,
        { agentId: a.id, text: "a".repeat(5000), intake: true },
        {
          actorId: "requester",
          role: "requester",
          tabId: "a",
          commandId: crypto.randomUUID(),
        },
      ),
    ).rejects.toThrow("한도");
    expect((await readState(db)).works.length).toBe(before.works.length);
    expect((await readState(db)).requests.length).toBe(before.requests.length);
  } finally {
    await db.delete();
  }
});
it("keeps typed instructions when a new conversation starts with an attachment", async () => {
  const db = new HubDB("draft-file-" + crypto.randomUUID());
  try {
    await initializeV3(db, null, "missing-" + crypto.randomUUID());
    const agent = (await readState(db)).agents.find(a => !a.intake)!;
    const result = await beginConversation(db, { agentId: agent.id, text: "먼저 이 파일을 검토해 주세요", file: new File(["example"], "example.txt", { type: "text/plain" }) }, { actorId: "staff", role: "staff", tabId: "tab", commandId: crypto.randomUUID() });
    const state = await readState(db);
    expect(state.messages.filter(m => m.threadId === state.works.find(w => w.id === result.workId)?.activeThreadId).map(m => m.content)).toContain("먼저 이 파일을 검토해 주세요");
    expect(state.artifacts.some(f => f.workId === result.workId && f.name === "example.txt")).toBe(true);
  } finally { await db.delete(); }
});
