import Dexie from "dexie";
import { HubDB, entityNames, transact } from "./schema";
import { emptyDemoSeed } from "../demoCatalog";
import { convertToV3 } from "../hub";
import { validateState } from "./validate";
import { readLegacyBlob } from "./migrateV1";
import type { HubState } from "../types";

export async function initializeV3(
  db: HubDB,
  raw: string | null,
  sourceName = "mes-agent-hub-v2",
) {
  if ((await db.table("meta").get("ready"))?.version === 3) return;
  let source: HubState = raw ? JSON.parse(raw) : emptyDemoSeed();
  let blobs: { id: string; blob: Blob }[] = [];
  let migrated = !!raw;
  if (await Dexie.exists(sourceName)) {
    const old = new Dexie(sourceName);
    try {
      await old.open();
      const captured = await old.transaction("r", old.tables, async () => {
        if (!(await old.table("meta").get("ready")))
          throw Error("이전 저장소가 준비되지 않았습니다.");
        const pairs = await Promise.all(
          entityNames
            .filter((n) => old.tables.some((t) => t.name === n))
            .map(async (n) => [n, await old.table(n).toArray()]),
        );
        return {
          state: {
            version: 1,
            session: { userId: "staff", role: "staff" },
            ...Object.fromEntries(pairs),
          } as HubState,
          blobs: await old.table("blobs").toArray(),
        };
      });
      source = captured.state;
      blobs = captured.blobs;
      migrated = true;
    } finally {
      old.close();
    }
  } else if (raw) {
    const ids = new Set([
      ...source.agents.flatMap((a) => (a.imageId ? [a.imageId] : [])),
      ...source.artifacts.flatMap((f) => (f.blobId ? [f.blobId] : [])),
    ]);
    for (const id of ids) {
      const blob = await readLegacyBlob(id);
      if (!blob) throw Error("원본 파일 누락: " + id);
      blobs.push({ id, blob });
    }
  }
  validateState(source);
  const next = convertToV3(source);
  next.messages.forEach((m, i) => (m.sequence ??= i));
  for (const r of next.requestRecords ?? [])
    if (["pending", "streaming"].includes(r.status)) {
      r.status = "interrupted";
      r.error =
        "저장소 전환으로 중단된 요청입니다. 자동 재전송하지 않았습니다.";
      r.leaseUntil = 0;
    }
  const required = [
    ...next.agents.flatMap((a) => (a.imageId ? [a.imageId] : [])),
    ...next.artifacts.flatMap((f) => (f.blobId ? [f.blobId] : [])),
    ...(next.requestRecords ?? []).flatMap((r) =>
      r.snapshot.messages.map((m) => m.contentId),
    ),
  ];
  if (required.some((id) => !blobs.some((b) => b.id === id)))
    throw Error(
      "원본 파일이 누락되어 전환을 중단했습니다. 기존 저장소는 보존됩니다.",
    );
  validateState(next);
  await transact(db, "rw", db.tables, async () => {
    if ((await db.table("meta").get("ready"))?.version === 3) return;
    for (const name of entityNames)
      await db.table(name).bulkPut(next[name] ?? []);
    await db.table("blobs").bulkPut(blobs);
    await db
      .table("meta")
      .put({
        id: "ready",
        version: 3,
        epoch: crypto.randomUUID(),
        at: new Date().toISOString(),
        migrated,
        sourceName,
      });
  });
}
