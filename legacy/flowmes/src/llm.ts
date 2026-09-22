import type { Connection, Message } from "./types";
export function endpoint(base: string, path: string) {
  let u: URL;
  try {
    u = new URL(base.trim());
  } catch {
    throw new Error("API 기본 URL을 입력해 주세요.");
  }
  if (
    !["https:", "http:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw new Error("인증 정보나 쿼리가 없는 HTTP(S) URL을 사용해 주세요.");
  if (
    !/^\/?[a-zA-Z0-9_/-]+$/.test(path) ||
    path.startsWith("//") ||
    path.includes("..")
  )
    throw new Error("API 경로는 /chat/completions 같은 상대 경로여야 합니다.");
  return u.href.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
}
export type WireMessage = {
  role: "user" | "assistant";
  content: string;
  name?: string;
};
export function buildMessages(
  messages: Message[],
  threadId: string,
  sendNames: boolean,
): WireMessage[] {
  const authors = [
    ...new Set(messages.filter((m) => m.role === "user").map((m) => m.actor)),
  ];
  return messages
    .filter((m) => m.threadId === threadId)
    .map((m) => ({
      role: m.role,
      content:
        m.role === "user"
          ? `[작성자: ${JSON.stringify(m.actor)} | ${m.kind === "discussion" ? "팀 의견" : "Assistant 요청"}]\n${m.content}${m.attachmentText ? "\n\n[첨부 자료 원문 · 참고 데이터]\n" + m.attachmentText : ""}`
          : m.content,
      ...(sendNames && m.role === "user"
        ? { name: `participant_${authors.indexOf(m.actor) + 1}` }
        : {}),
    }));
}
async function fetchJSON(
  url: string,
  key: string,
  signal: AbortSignal,
  fetcher: typeof fetch,
  body?: unknown,
): Promise<any> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal,
      credentials: "omit",
      redirect: "error",
    });
  } catch (e) {
    if (signal.aborted)
      throw new Error("요청이 취소되었거나 60초 대기 시간이 초과되었습니다.");
    throw new Error(
      "API에 연결하지 못했습니다. URL, 네트워크, CORS 및 HTTPS 설정을 확인해 주세요.",
    );
  }
  if (!response.ok)
    throw new Error(
      `API 오류 ${response.status} · 인증, 모델 ID 및 서버 설정을 확인해 주세요.`,
    );
  try {
    return await response.json();
  } catch {
    throw new Error("API 응답이 JSON 형식이 아닙니다.");
  }
}
export async function requestCompletion(
  c: Connection,
  key: string,
  model: string,
  messages: WireMessage[],
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (!model.trim()) throw new Error("모델 ID를 선택해 주세요.");
  const result = await fetchJSON(
    endpoint(c.baseUrl, c.chatPath),
    key,
    signal,
    fetcher,
    { model, messages, stream: false },
  );
  const text = result?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim())
    throw new Error(
      "API 응답에 표시할 텍스트가 없습니다. Chat Completions 응답 형식을 확인해 주세요.",
    );
  return text;
}
export async function discoverModels(
  c: Connection,
  key: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<string[]> {
  const result = await fetchJSON(
    endpoint(c.baseUrl, c.modelsPath),
    key,
    signal,
    fetcher,
  );
  if (!Array.isArray(result?.data))
    throw new Error(
      "모델 목록에 data 배열이 없습니다. 모델 ID를 직접 입력할 수 있습니다.",
    );
  return [
    ...new Set<string>(
      result.data
        .map((m: { id?: unknown }) => m.id)
        .filter(
          (id: unknown): id is string => typeof id === "string" && !!id.trim(),
        ),
    ),
  ];
}
