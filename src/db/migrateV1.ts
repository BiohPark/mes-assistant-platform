import { transact } from "./schema";
import { seed } from "../seed";
import { entityNames, HubDB } from "./schema";
import { validateState } from "./validate";
import type { HubState } from "../types";
export const LEGACY_KEY = "mes-agent-hub-metadata-v1";
export async function readLegacyBlob(id: string): Promise<Blob | undefined> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("mes-agent-hub-files-v1", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("blobs");
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const d = r.result;
      const q = d.transaction("blobs").objectStore("blobs").get(id);
      q.onsuccess = () => {
        d.close();
        resolve(q.result);
      };
      q.onerror = () => {
        d.close();
        reject(q.error);
      };
    };
  });
}
export async function initializeDatabase(
  db: HubDB,
  raw: string | null,
  readBlob = readLegacyBlob,
) {
  if (await db.table("meta").get("ready")) return;
  let state: HubState;
  try {
    state = raw ? JSON.parse(raw) : seed();
    validateState(state);
  } catch (e) {
    throw Error(
      `기존 데이터를 읽을 수 없습니다. 원본을 보존했습니다. ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  state = structuredClone(state);
  state.messages.forEach((m, i) => (m.sequence = i));
  state.requestRecords ??= [];
  state.completions ??= [];
  const ids = new Set([
    ...state.agents.flatMap((a) => (a.imageId ? [a.imageId] : [])),
    ...state.artifacts.flatMap((a) => (a.blobId ? [a.blobId] : [])),
  ]);
  const blobs: { id: string; blob: Blob }[] = [];
  for (const id of ids) {
    const blob = await readBlob(id);
    if (!blob)
      throw Error(`원본 파일 누락: ${id}. 기존 저장소는 변경하지 않았습니다.`);
    blobs.push({ id, blob });
  }
  for (const t of state.threads)
    t.selectedInputIds ??= [
      ...(state.works.find((w) => w.id === t.workId)?.inputIds ?? []),
    ];
  for (const w of state.works)
    if (
      w.status === "done" &&
      !state.completions.some((c) => c.workId === w.id)
    )
      state.completions.push({
        id: crypto.randomUUID(),
        workId: w.id,
        at: new Date().toISOString(),
        actor: w.owner,
        reason: "기존 완료 업무 이관",
        legacy: true,
        work: structuredClone(w),
      });
  await transact<void>(db, "rw", db.tables, async (): Promise<void> => {
    if (await db.table("meta").get("ready")) return;
    for (const name of entityNames)
      await db.table<{ id: string }>(name).bulkPut(state[name] ?? []);
    await db.table("blobs").bulkPut(blobs);
    await db.table("meta").put({
      id: "ready",
      version: 2,
      epoch: crypto.randomUUID(),
      at: new Date().toISOString(),
      migrated: !!raw,
    });
  });
}
