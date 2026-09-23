import { transact, HubDB, entityNames, readState } from "./schema";
import { validateState } from "./validate";
import type { HubState, RequestRecord } from "../types";
import { convertToV3 } from "../hub";
export type Backup = {
  format: "mes-agent-hub";
  version: 2 | 3;
  createdAt: string;
  data: Omit<HubState, "session">;
  blobs: { id: string; mime: string; base64: string; sha256: string }[];
};
const running = (r: RequestRecord) =>
  ["pending", "streaming"].includes(r.status) && r.leaseUntil > Date.now();
export async function createBackup(db: HubDB): Promise<Backup> {
  const captured = await transact<{
    state: HubState;
    blobs: { id: string; blob: Blob }[];
  }>(db, "r", db.tables, async () => {
    const state = await readState(db);
    if (state.requestRecords?.some(running))
      throw Error("진행 중 요청을 완료하거나 중지한 후 백업하세요.");
    if (state.checklistAssessments?.some(a => a.status === "pending"))
      throw Error("진행 중 AI 달성도 점검을 완료하거나 중지한 후 백업하세요.");
    return { state, blobs: await db.table("blobs").toArray() };
  });
  const { session: _, ...data } = captured.state;
  data.requestRecords = data.requestRecords?.map((r) => ({
    ...r,
    tabId: "",
    leaseToken: "",
    leaseUntil: 0,
  }));
  data.checklistAssessments = data.checklistAssessments?.map(a => ({ ...a, tabId: "", leaseUntil: 0 }));
  const blobs = [];
  for (const row of captured.blobs) {
    let binary = "";
    const bytes = new Uint8Array(await row.blob.arrayBuffer());
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    blobs.push({
      id: row.id,
      mime: row.blob.type,
      base64: btoa(binary),
      sha256: await digest(row.blob),
    });
  }
  return {
    format: "mes-agent-hub",
    version: data.hubVersion === 3 ? 3 : 2,
    createdAt: new Date().toISOString(),
    data,
    blobs,
  };
}
export async function validateBackup(value: unknown): Promise<{
  state: HubState;
  blobs: { id: string; blob: Blob }[];
}> {
  if (!value || typeof value !== "object")
    throw Error("올바른 백업 파일이 아닙니다.");
  if (
    new TextEncoder().encode(JSON.stringify(value)).byteLength >
    100 * 1024 * 1024
  )
    throw Error("백업은 100MB 이하여야 합니다.");
  const b = value as Backup;
  if (
    b.format !== "mes-agent-hub" ||
    ![2, 3].includes(b.version) ||
    !Array.isArray(b.blobs) ||
    !b.data
  )
    throw Error("백업 형식 또는 버전이 맞지 않습니다.");
  function forbidden(v: unknown) {
    if (!v || typeof v !== "object") return;
    for (const [key, child] of Object.entries(v)) {
      if (
        /^(apiKey|apiKeys|authorization|headers|session|__proto__|constructor|prototype)$/i.test(
          key,
        )
      )
        throw Error("허용되지 않는 백업 필드: " + key);
      forbidden(child);
    }
  }
  forbidden(b.data);
  const state = {
    ...structuredClone(b.data),
    session: { userId: "staff", role: "staff" },
  };
  validateState(state);
  const ids = new Set<string>();
  const blobs = b.blobs.map((row) => {
    if (
      !row ||
      typeof row.id !== "string" ||
      !row.id ||
      ids.has(row.id) ||
      typeof row.base64 !== "string" ||
      typeof row.mime !== "string"
    )
      throw Error("중복 또는 잘못된 파일 데이터");
    ids.add(row.id);
    let binary: string;
    try {
      binary = atob(row.base64);
      if (btoa(binary) !== row.base64) throw Error("잘못된 base64 인코딩");
    } catch {
      throw Error("손상된 파일 데이터");
    }
    return {
      id: row.id,
      blob: new Blob([Uint8Array.from(binary, (c) => c.charCodeAt(0))], {
        type: row.mime,
      }),
    };
  });
  for (let i = 0; i < blobs.length; i++) {
    const hash = await digest(blobs[i].blob);
    if (
      b.blobs[i].sha256 !== hash ||
      (blobs[i].id.startsWith("sha256:") && blobs[i].id !== "sha256:" + hash)
    )
      throw Error("파일 해시가 일치하지 않습니다: " + blobs[i].id);
  }
  for (const f of state.artifacts) {
    if (f.blobId) {
      const blob = blobs.find((b) => b.id === f.blobId)?.blob;
      if (!blob) throw Error("파일 누락");
      if (blob.size !== f.size) throw Error("파일 크기 불일치: " + f.name);
      if (f.content !== undefined && (await blob.text()) !== f.content)
        throw Error("파일 원문과 텍스트가 다릅니다: " + f.name);
    }
  }
  const needed = [
    ...state.agents.flatMap((a) => (a.imageId ? [a.imageId] : [])),
    ...state.artifacts.flatMap((f) => (f.blobId ? [f.blobId] : [])),
    ...(state.requestRecords ?? []).flatMap((r) =>
      r.snapshot.messages.map((m) => m.contentId),
    ),
  ];
  if (needed.some((id) => !ids.has(id)))
    throw Error("백업에 원본 파일 또는 요청 원문이 누락되었습니다.");
  for (const r of state.requestRecords ?? []) {
    if (["pending", "streaming"].includes(r.status)) {
      r.status = "interrupted";
      r.error =
        "백업에서 복원된 미완료 요청입니다. 자동 재전송하지 않았습니다.";
      r.finishedAt = new Date().toISOString();
    }
    r.tabId = "";
    r.leaseToken = "";
    r.leaseUntil = 0;
  }
  state.messages.forEach((m, i) => (m.sequence = i));
  return { state, blobs };
}
export async function restoreBackup(db: HubDB, value: unknown) {
  const { state, blobs } = await validateBackup(value);
  await transact<void>(db, "rw", db.tables, async (): Promise<void> => {
    if (
      (await db.table<RequestRecord>("requestRecords").toArray()).some(running)
    )
      throw Error("진행 중 요청을 완료하거나 중지한 후 복원하세요.");
    if ((await db.table("checklistAssessments").toArray()).some(a => a.status === "pending"))
      throw Error("진행 중 AI 달성도 점검을 완료하거나 중지한 후 복원하세요.");
    for (const table of db.tables) await table.clear();
    const restored =
      db.name === "mes-agent-hub-v3" ? convertToV3(state) : state;
    for (const name of entityNames)
      await db.table<{ id: string }>(name).bulkPut(restored[name] ?? []);
    await db.table("blobs").bulkPut(blobs);
    await db.table("meta").put({
      id: "ready",
      version: restored.hubVersion === 3 ? 3 : 2,
      epoch: crypto.randomUUID(),
      at: new Date().toISOString(),
      restored: true,
    });
  });
}

async function digest(blob: Blob) {
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
