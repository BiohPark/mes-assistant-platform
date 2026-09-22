import { hubDB } from "./db/schema";
import type { Action } from "./types";
const staged = new Map<string, Blob>();
export async function putBlob(blob: Blob): Promise<string> {
  const id = crypto.randomUUID();
  staged.set(id, blob);
  return id;
}
export async function getBlob(id: string): Promise<Blob | undefined> {
  return staged.get(id) ?? (await hubDB.table("blobs").get(id))?.blob;
}
export function pendingBlobs(a: Action) {
  const id =
    a.type === "agent.save"
      ? a.agent.imageId
      : a.type === "artifact.add"
        ? a.artifact.blobId
        : undefined;
  return id && staged.has(id) ? [{ id, blob: staged.get(id)! }] : [];
}
export function releaseBlobs(ids: string[]) {
  ids.forEach((id) => staged.delete(id));
}
export function saveDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadBlob(id: string, name: string) {
  const b = await getBlob(id);
  if (!b) throw Error("저장된 파일을 찾을 수 없습니다.");
  saveDownload(b, name);
}
export async function downloadArtifact(a: import("./types").ArtifactVersion) {
  if (a.blobId) return downloadBlob(a.blobId, a.name);
  saveDownload(new Blob([a.content ?? ""], { type: a.mime }), a.name);
}
