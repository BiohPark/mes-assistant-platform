import "fake-indexeddb/auto";
import { seed } from "../seed";
import { it, expect, vi } from "vitest";
import { HubDB, readState } from "../db/schema";
import { initializeV3 } from "../db/migrateV3";
import { executeCommand } from "../db/commands";
import { suggestSrTitle } from "./titleService";
const ctx = () => ({
  actorId: "requester",
  role: "requester" as const,
  tabId: "a",
  commandId: crypto.randomUUID(),
});
it("isolates auxiliary title requests and preserves manual edits against delayed API replies", async () => {
  const db = new HubDB("title-" + crypto.randomUUID());
  try {
    await initializeV3(db, JSON.stringify(seed()), "absent-" + crypto.randomUUID());
    const before = await readState(db);
    const a = before.agents.find((a) => a.id === "urs")!;
    await db
      .table("profiles")
      .update(a.profileId, { mode: "api", baseUrl: "https://mock.invalid" });
    let finish!: (r: Response) => void;
    let payload: any;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init) => {
        payload = JSON.parse(init.body);
        return new Promise<Response>((resolve) => (finish = resolve));
      }),
    );
    const pending = suggestSrTitle(db, "sr-example", "", ctx());
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(payload.messages[0].role).toBe("system");
    expect(payload.messages).toHaveLength(2);
    await executeCommand(
      db,
      {
        type: "sr.title",
        srId: "sr-example",
        title: "직접 수정",
        source: "manual",
      },
      ctx(),
    );
    finish(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "늦은 제목" } }] }),
        { status: 200 },
      ),
    );
    await pending;
    expect(
      (await readState(db)).requests.find((r) => r.id === "sr-example")?.title,
    ).toBe("직접 수정");
    expect(await db.table("messages").count()).toBe(before.messages.length);
  } finally {
    vi.unstubAllGlobals();
    await db.delete();
  }
});
it("keeps the fallback title on auxiliary API failure without adding conversation messages", async () => {
  const db = new HubDB("title-" + crypto.randomUUID());
  try {
    await initializeV3(db, JSON.stringify(seed()), "absent-" + crypto.randomUUID());
    const before = await readState(db);
    const a = before.agents.find((a) => a.id === "urs")!;
    await db
      .table("profiles")
      .update(a.profileId, { mode: "api", baseUrl: "https://mock.invalid" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 })),
    );
    await suggestSrTitle(db, "sr-example", "", ctx());
    const after = await readState(db);
    expect(after.requests[0].title).toBe(before.requests[0].title);
    expect(after.messages).toEqual(before.messages);
    expect(
      after.activities.some((a) => a.action.includes("제목 생성 실패")),
    ).toBe(true);
  } finally {
    vi.unstubAllGlobals();
    await db.delete();
  }
});
