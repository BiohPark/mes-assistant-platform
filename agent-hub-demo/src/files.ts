const DB = "mes-agent-hub-files-v1";
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("blobs");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function putBlob(blob: Blob): Promise<string> {
  const id = crypto.randomUUID();
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction("blobs", "readwrite");
    t.objectStore("blobs").put(blob, id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  d.close();
  return id;
}
export async function getBlob(id: string): Promise<Blob | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction("blobs").objectStore("blobs").get(id);
    r.onsuccess = () => {
      d.close();
      resolve(r.result);
    };
    r.onerror = () => {
      d.close();
      reject(r.error);
    };
  });
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
