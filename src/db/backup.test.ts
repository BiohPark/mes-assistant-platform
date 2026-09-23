import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { HubDB, readState } from "./schema";
import { initializeDatabase } from "./migrateV1";
import { createBackup, restoreBackup } from "./backup";
it("round trips metadata and blobs, rejects dangling references without replacing data", async () => {
  const a = new HubDB("backup-a-" + crypto.randomUUID()),
    b = new HubDB("backup-b-" + crypto.randomUUID());
  try {
    await initializeDatabase(a, null);
    await initializeDatabase(b, null);
    await a.table("blobs").put({
      id: "picture",
      blob: new Blob(["pixels"], { type: "image/png" }),
    });
    await a.table("agents").update("urs", { imageId: "picture" });
    const backup = await createBackup(a);
    expect(JSON.stringify(backup)).not.toContain('"session"');
    await restoreBackup(b, backup);
    expect((await readState(b)).works.length).toBe(8);
    const corrupt = structuredClone(backup);
    corrupt.data.works[0].agentId = "missing";
    const before = JSON.stringify(await readState(b));
    await expect(restoreBackup(b, corrupt)).rejects.toThrow();
    expect(JSON.stringify(await readState(b))).toBe(before);
  } finally {
    await a.delete();
    await b.delete();
  }
});

it("rejects corrupt file hashes and malformed completion snapshots before replacement", async () => {
  const d = new HubDB("backup-invalid-" + crypto.randomUUID());
  try {
    await initializeDatabase(d, null);
    await d.table("blobs").put({ id: "blob", blob: new Blob(["original"]) });
    const b = await createBackup(d);
    const original = JSON.stringify(await readState(d));
    b.blobs[0].base64 = btoa("tampered");
    await expect(restoreBackup(d, b)).rejects.toThrow();
    const c = await createBackup(d);
    (c.data.completions![0] as any).work = {
      id: c.data.completions![0].workId,
    };
    await expect(restoreBackup(d, c)).rejects.toThrow();
    expect(JSON.stringify(await readState(d))).toBe(original);
  } finally {
    await d.delete();
  }
});

it("blocks live restore and rejects old epochs after atomic restore, restoring unfinished records as interrupted", async () => {
  const d = new HubDB("backup-lease-" + crypto.randomUUID());
  try {
    await initializeDatabase(d, null);
    const { startRequest, finishRequest } = await import(
      "../app/requestService"
    );
    const { executeCommand } = await import("./commands");
    const epoch = (await d.table("meta").get("ready")).epoch;
    const ctx = {
      actorId: "staff",
      role: "staff" as const,
      tabId: "t",
      commandId: "c",
      epoch,
    };
    const snapshot = await createBackup(d);
    const w = (await readState(d)).works.find((w) => w.id === "urs-work")!;
    const r = await startRequest(d, w.activeThreadId, "test", ctx);
    await expect(createBackup(d)).rejects.toThrow(/요청/);
    await expect(restoreBackup(d, snapshot)).rejects.toThrow(/요청/);
    await finishRequest(d, r.record.id, r.record.leaseToken, {
      content: "ok",
      model: "m",
      source: "demo",
    });
    const b = await createBackup(d);
    b.data.requestRecords![0].status = "pending";
    await restoreBackup(d, b);
    expect((await readState(d)).requestRecords![0].status).toBe("interrupted");
    expect(
      (
        await executeCommand(
          d,
          { type: "work.note", workId: w.id, text: "stale" },
          ctx,
        )
      ).ok,
    ).toBe(false);
    await expect(
      startRequest(d, w.activeThreadId, "stale", ctx),
    ).rejects.toThrow(/복원/);
    expect((await d.table("blobs").toArray()).length).toBe(b.blobs.length);
  } finally {
    await d.delete();
  }
});
