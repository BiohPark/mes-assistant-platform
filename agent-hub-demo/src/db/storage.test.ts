import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { HubDB, readState } from "./schema";
import { initializeDatabase } from "./migrateV1";
import { executeCommand } from "./commands";
import { seed } from "../seed";
const dbs: HubDB[] = [];
const fresh = () => {
  const d = new HubDB("test-" + crypto.randomUUID());
  dbs.push(d);
  return d;
};
const ctx = (commandId = crypto.randomUUID()) => ({
  actorId: "staff",
  role: "staff" as const,
  tabId: "tab",
  commandId,
});
afterEach(async () => {
  for (const d of dbs) await d.delete();
  dbs.length = 0;
});
it("preserves simultaneous appends from two connections and deduplicates command IDs", async () => {
  const d = fresh();
  await initializeDatabase(d, null, async () => undefined);
  const other = new HubDB(d.name);
  const action = { type: "work.note" as const, workId: "urs-work", text: "A" };
  const c = ctx();
  await Promise.all([
    executeCommand(d, action, c),
    executeCommand(other, { ...action, text: "B" }, ctx()),
  ]);
  await executeCommand(d, action, c);
  expect(
    (await readState(d)).works
      .find((w) => w.id === "urs-work")
      ?.notes.map((n) => n.text)
      .sort(),
  ).toEqual(["A", "B"]);
  other.close();
});
it("rejects stale edits instead of replacing newer content", async () => {
  const d = fresh();
  await initializeDatabase(d, null, async () => undefined);
  const c = { ...ctx(), expectedRevision: 0 };
  expect(
    (
      await executeCommand(
        d,
        { type: "work.edit", workId: "urs-work", title: "New" },
        c,
      )
    ).ok,
  ).toBe(true);
  const r = await executeCommand(
    d,
    { type: "work.edit", workId: "urs-work", title: "Stale" },
    { ...c, commandId: crypto.randomUUID() },
  );
  expect(r.ok).toBe(false);
  expect((await readState(d)).works[0].title).not.toBe("Stale");
});
it("migrates once preserving blobs and refuses incomplete legacy data without seeding over it", async () => {
  const d = fresh();
  const legacy = seed();
  legacy.agents[0].imageId = "image";
  await expect(
    initializeDatabase(d, JSON.stringify(legacy), async () => undefined),
  ).rejects.toThrow();
  expect(await d.table("works").count()).toBe(0);
  const blob = new Blob(["image bytes"], { type: "image/png" });
  await initializeDatabase(d, JSON.stringify(legacy), async () => blob);
  expect((await d.table("blobs").get("image")).blob.size).toBe(blob.size);
  await initializeDatabase(d, "broken", async () => undefined);
  expect(await d.table("works").count()).toBe(8);
});
it("does not partially insert blob metadata when command validation fails", async () => {
  const d = fresh();
  await initializeDatabase(d, null, async () => undefined);
  const r = await executeCommand(
    d,
    {
      type: "artifact.add",
      kind: "input",
      artifact: {
        id: "f",
        workId: "missing",
        name: "f",
        mime: "text/plain",
        size: 1,
        version: 1,
        createdBy: "staff",
        createdAt: new Date().toISOString(),
        blobId: "newblob",
      },
    },
    ctx(),
    [{ id: "newblob", blob: new Blob(["x"]) }],
  );
  expect(r.ok).toBe(false);
  expect(await d.table("blobs").get("newblob")).toBeUndefined();
});

it("rolls back a staged blob when metadata storage fails", async () => {
  const d = fresh();
  await initializeDatabase(d, null);
  d.table("artifacts").hook("creating", () => {
    throw new DOMException("full", "QuotaExceededError");
  });
  const r = await executeCommand(
    d,
    {
      type: "artifact.add",
      kind: "input",
      artifact: {
        id: "quota",
        workId: "urs-work",
        name: "quota.txt",
        mime: "text/plain",
        size: 1,
        version: 1,
        createdBy: "staff",
        createdAt: new Date().toISOString(),
        blobId: "quota-blob",
      },
    },
    ctx(),
    [{ id: "quota-blob", blob: new Blob(["x"]) }],
  );
  expect(r.ok).toBe(false);
  expect(await d.table("blobs").get("quota-blob")).toBeUndefined();
  expect(
    (await readState(d)).works.find((w) => w.id === "urs-work")!.inputIds,
  ).not.toContain("quota");
});
