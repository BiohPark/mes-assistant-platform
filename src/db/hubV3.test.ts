import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { HubDB, readState } from "./schema";
import { initializeDatabase } from "./migrateV1";
import { initializeV3 } from "./migrateV3";
import { executeCommand } from "./commands";
import { createBackup, restoreBackup } from "./backup";
const context = () => ({
  actorId: "admin",
  role: "admin" as const,
  tabId: "a",
  commandId: crypto.randomUUID(),
});
it("atomically copies legacy storage, deduplicates concurrent tags and roundtrips all new entities", async () => {
  const old = new HubDB("old-" + crypto.randomUUID()),
    db = new HubDB("new-" + crypto.randomUUID());
  try {
    await initializeDatabase(old, null);
    await initializeV3(db, null, old.name);
    const commands = [" #MES ", "mes"].map((label) =>
      executeCommand(
        db,
        { type: "tag.attach", workId: "urs-work", kind: "keyword", label },
        context(),
      ),
    );
    expect((await Promise.all(commands)).every((r) => r.ok)).toBe(true);
    let s = await readState(db);
    expect(s.tags!.filter((t) => t.key === "mes")).toHaveLength(1);
    expect((await readState(old)).tags).toHaveLength(0);
    const order = s.catalogOrders![0];
    expect(
      (
        await executeCommand(
          db,
          {
            type: "catalog.order",
            agentIds: [...order.agentIds].reverse(),
            expectedRevision: order.revision,
          },
          context(),
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await executeCommand(
          db,
          {
            type: "catalog.order",
            agentIds: order.agentIds,
            expectedRevision: order.revision,
          },
          context(),
        )
      ).ok,
    ).toBe(false);
    const backup = await createBackup(db);
    await restoreBackup(db, backup);
    s = await readState(db);
    expect(s.hubVersion).toBe(3);
    expect(s.tags!.some((t) => t.key === "mes")).toBe(true);
    expect(s.catalogOrders![0].agentIds).toEqual([...order.agentIds].reverse());
  } finally {
    await old.delete();
    await db.delete();
  }
});
it("leaves original data and destination untouched when an original blob is missing", async () => {
  const old = new HubDB("old-" + crypto.randomUUID()),
    db = new HubDB("new-" + crypto.randomUUID());
  try {
    await initializeDatabase(old, null);
    await old.table("agents").update("urs", { imageId: "missing" });
    await expect(initializeV3(db, null, old.name)).rejects.toThrow("누락");
    expect(await db.table("meta").get("ready")).toBeUndefined();
    expect(await db.table("works").count()).toBe(0);
    expect((await old.table("agents").get("urs")).imageId).toBe("missing");
  } finally {
    await old.delete();
    await db.delete();
  }
});
