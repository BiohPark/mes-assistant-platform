import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { HubDB, readState } from "../db/schema";
import { initializeDatabase } from "../db/migrateV1";
import {
  startRequest,
  finishRequest,
  cancelRequest,
  recoverExpired,
} from "./requestService";
const dbs: HubDB[] = [];
const actor = {
  actorId: "staff",
  role: "staff" as const,
  tabId: "tab",
  commandId: "cmd",
};
async function fresh() {
  const d = new HubDB("req-" + crypto.randomUUID());
  dbs.push(d);
  await initializeDatabase(d, null);
  return d;
}
afterEach(async () => {
  for (const d of dbs) await d.delete();
  dbs.length = 0;
});
it("persists a user turn before transport and fences concurrent and late replies", async () => {
  const d = await fresh();
  const tid = (await readState(d)).works.find(
    (w) => w.id === "urs-work",
  )!.activeThreadId;
  const r = await startRequest(d, tid, "질문", actor);
  const { executeCommand } = await import("../db/commands");
  expect(
    (
      await executeCommand(
        d,
        {
          type: "work.status",
          workId: r.record.workId,
          status: "done",
          reason: "검토",
        },
        actor,
      )
    ).ok,
  ).toBe(false);
  expect(
    (await readState(d)).messages.some((m) => m.requestId === r.record.id),
  ).toBe(true);
  await expect(startRequest(d, tid, "duplicate", actor)).rejects.toThrow();
  await cancelRequest(d, r.record.id, actor);
  expect(
    await finishRequest(d, r.record.id, r.record.leaseToken, {
      content: "late",
      model: "m",
      source: "demo",
    }),
  ).toBe(false);
  const next = await startRequest(d, tid, "retry", actor);
  await finishRequest(d, next.record.id, next.record.leaseToken, {
    content: "ok",
    model: "actual",
    source: "demo",
  });
  expect(
    (await d.table("requestRecords").get(next.record.id)).actualModel,
  ).toBe("actual");
});
it("keeps request provenance when active context changes, and recovers expired leases without replay", async () => {
  const d = await fresh(),
    s = await readState(d),
    tid = s.works.find((w) => w.id === "urs-work")!.activeThreadId;
  const r = await startRequest(d, tid, "질문", actor);
  await d.table("threads").update(tid, { activeBundleIds: [] });
  expect(
    await finishRequest(d, r.record.id, r.record.leaseToken, {
      content: "ok",
      model: "m",
      source: "demo",
    }),
  ).toBe(true);
  const q = await startRequest(d, tid, "again", actor);
  await recoverExpired(d, Date.now() + 31000);
  expect((await d.table("requestRecords").get(q.record.id)).status).toBe(
    "interrupted",
  );
});
it("rejects oversized requests before storing a turn", async () => {
  const d = await fresh(),
    s = await readState(d),
    w = s.works.find((w) => w.id === "urs-work")!,
    a = s.agents.find((a) => a.id === w.agentId)!;
  await d.table("profiles").update(a.profileId, { maxRequestBytes: 64 });
  const count = await d.table("messages").count();
  await expect(
    startRequest(d, w.activeThreadId, "large".repeat(100), actor),
  ).rejects.toThrow(/한도/);
  expect(await d.table("messages").count()).toBe(count);
});

it("rejects internal snapshot reads by requesters and preserves append order after reload", async () => {
  const d = await fresh();
  const w = (await readState(d)).works.find((w) => w.id === "urs-work")!;
  const r = await startRequest(d, w.activeThreadId, "first", actor);
  const { requestSnapshot } = await import("./requestService");
  await expect(
    requestSnapshot(d, r.record, {
      ...actor,
      actorId: "requester",
      role: "requester",
    }),
  ).rejects.toThrow();
  await finishRequest(d, r.record.id, r.record.leaseToken, {
    content: "first reply",
    model: "m",
    source: "demo",
  });
  const q = await startRequest(d, w.activeThreadId, "second", actor);
  await finishRequest(d, q.record.id, q.record.leaseToken, {
    content: "second reply",
    model: "m",
    source: "demo",
  });
  const ids = [r.record.id, q.record.id];
  expect(
    (await readState(d)).messages
      .filter((m) => ids.includes(m.requestId ?? ""))
      .map((m) => m.content),
  ).toEqual(["first", "first reply", "second", "second reply"]);
});

it("role switch cancels owned requests; snapshots share chunks and exclude detached context on subsequent calls", async () => {
  const d = await fresh(),
    w = (await readState(d)).works.find((w) => w.id === "urs-work")!;
  await d.table("bundles").put({
    id: "ctx",
    name: "ctx",
    sourceWorkId: w.id,
    createdBy: "staff",
    createdAt: new Date().toISOString(),
    excerpts: [],
    artifactIds: [],
    summary: "PRIVATE_CONTEXT_MARKER",
    note: "",
  });
  await d
    .table("threads")
    .update(w.activeThreadId, { activeBundleIds: ["ctx"] });
  const a = await startRequest(d, w.activeThreadId, "question", actor);
  const { requestSnapshot, cancelTabRequests } =
    await import("./requestService");
  await d.table("threads").update(w.activeThreadId, { activeBundleIds: [] });
  expect(JSON.stringify(await requestSnapshot(d, a.record, actor))).toContain(
    "PRIVATE_CONTEXT_MARKER",
  );
  await cancelTabRequests(d, actor);
  expect((await d.table("requestRecords").get(a.record.id)).status).toBe(
    "cancelled",
  );
  const b = await startRequest(d, w.activeThreadId, "question", actor);
  expect(JSON.stringify(b.body)).not.toContain("PRIVATE_CONTEXT_MARKER");
  expect(b.record.snapshot.messages.at(-1)?.contentId).toBe(
    a.record.snapshot.messages.at(-1)?.contentId,
  );
});
