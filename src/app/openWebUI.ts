import type { ArtifactVersion, ConnectionProfile } from "../types";

type ChatBody = { model: string; messages: { role: string; content: string; name?: string }[]; stream: boolean };
type Phase = "uploading" | "processing" | "chat";
const remoteIds = new Map<string, string>();
export function clearRemoteFileCache() { remoteIds.clear(); }
const join = (base: string, path: string) => base.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
async function fingerprint(text: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("");
}
function ensure(response: Response, label: string) {
  if (!response.ok) throw Error(`${label} 실패 (${response.status}). 주소·인증·CORS 설정을 확인하세요.`);
}
export async function sendOpenWebUI(args: {
  profile: ConnectionProfile;
  body: ChatBody;
  files: ArtifactVersion[];
  key: string;
  signal: AbortSignal;
  scope?: string;
  fetcher?: typeof fetch;
  loadBlob?: (id: string) => Promise<Blob | undefined>;
  onPhase?: (phase: Phase) => Promise<void> | void;
}) {
  const { profile, body, files, key, signal } = args;
  const fetcher = args.fetcher ?? fetch;
  const headers: Record<string, string> = key ? { Authorization: "Bearer " + key } : {};
  const base = profile.baseUrl;
  const uploadPath = profile.filesPath || "/api/v1/files/";
  const statusPath = profile.fileStatusPath || "/api/v1/files/{id}/process/status";
  const scope = await fingerprint([args.scope, profile.id, base, uploadPath, statusPath, key].join("|"));
  const ids: { type: "file"; id: string }[] = [];
  for (const artifact of files) {
    if (signal.aborted) throw Error("요청이 중지되었습니다.");
    const cacheKey = scope + ":" + artifact.id;
    let remoteId = remoteIds.get(cacheKey);
    if (!remoteId) {
      await args.onPhase?.("uploading");
      const blob = artifact.blobId
        ? await args.loadBlob?.(artifact.blobId)
        : new Blob([artifact.content ?? ""], { type: artifact.mime });
      if (!blob) throw Error(`원본 파일이 없습니다: ${artifact.name}`);
      const form = new FormData();
      form.append("file", blob, artifact.name);
      const response = await fetcher(join(base, uploadPath), { method: "POST", headers, body: form, signal });
      ensure(response, "파일 업로드");
      const data = await response.json();
      if (typeof data.id !== "string" || !data.id) throw Error("파일 업로드 응답에 ID가 없습니다.");
      remoteId = data.id as string;
      const uploadedId = remoteId;
      await args.onPhase?.("processing");
      const deadline = Date.now() + 300000;
      for (;;) {
        if (signal.aborted) throw Error("요청이 중지되었습니다.");
        const status = await fetcher(join(base, statusPath.replace("{id}", encodeURIComponent(uploadedId))), { headers, signal });
        ensure(status, "파일 처리 상태 조회");
        const state = (await status.json()).status;
        if (state === "completed") break;
        if (state === "failed") throw Error(`파일 처리 실패: ${artifact.name}`);
        if (Date.now() >= deadline) throw Error(`파일 처리 시간 초과: ${artifact.name}`);
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 2000);
          const abort = () => { clearTimeout(timer); reject(Error("요청이 중지되었습니다.")); };
          signal.addEventListener("abort", abort, { once: true });
        });
      }
      remoteIds.set(cacheKey, uploadedId);
    }
    ids.push({ type: "file", id: remoteId! });
  }
  await args.onPhase?.("chat");
  const response = await fetcher(join(base, profile.chatPath), {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, files: ids }), signal,
  });
  ensure(response, "대화 API");
  const data = await response.json();
  if (typeof data.choices?.[0]?.message?.content !== "string") throw Error("텍스트 응답 형식을 확인하세요.");
  return { content: data.choices[0].message.content as string, model: (data.model || body.model) as string, source: "api" as const, remoteIds: ids };
}
