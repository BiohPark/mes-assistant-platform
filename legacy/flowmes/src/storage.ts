import type { Artifact } from "./types";
let dbPromise: Promise<IDBDatabase> | undefined;
function database() {
  return (dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("flowmes-files", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
export async function saveFile(id: string, file: Blob) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function getFile(a: Artifact): Promise<Blob> {
  if (!a.stored) return new Blob([a.content ?? ""], { type: a.mime });
  const db = await database();
  return new Promise((resolve, reject) => {
    const r = db.transaction("files").objectStore("files").get(a.id);
    r.onsuccess = () =>
      r.result
        ? resolve(r.result)
        : reject(new Error("저장된 파일을 찾을 수 없습니다."));
    r.onerror = () => reject(r.error);
  });
}
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
export const downloadArtifact = async (a: Artifact) =>
  downloadBlob(a.name, await getFile(a));
export function csv(rows: (string | number)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((r) =>
        r
          .map((v) => {
            let s = String(v);
            if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
            return '"' + s.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
