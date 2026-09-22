import Dexie from "dexie";
import { transact, HubDB, readState } from "../db/schema";
import type { RequestRecord, ConnectionProfile } from "../types";
import type { CommandContext } from "../domain/commands";
import { buildRequest } from "../api";
import { canSeeThread } from "../domain";
export type PreparedBody = ReturnType<typeof buildRequest>;
type Prepared = {
  record: RequestRecord;
  body: PreparedBody;
  profile: ConnectionProfile;
};
const controllers = new Map<string, AbortController>();
const active = (r: RequestRecord) =>
  r.status === "pending" || r.status === "streaming";
async function chunk(db: HubDB, content: string) {
  const hash = await Dexie.waitFor(
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)),
  );
  const id =
    "sha256:" +
    Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
  if (!(await db.table("blobs").get(id)))
    await db
      .table("blobs")
      .add({ id, blob: new Blob([content], { type: "text/plain" }) });
  return id;
}
export async function recoverExpired(db: HubDB, time = Date.now()) {
  await transact<void>(
    db,
    "rw",
    ["requestRecords"],
    async (): Promise<void> => {
      for (const r of await db.table<RequestRecord>("requestRecords").toArray())
        if (active(r) && r.leaseUntil <= time)
          await db.table<RequestRecord, string>("requestRecords").update(r.id, {
            status: "interrupted",
            finishedAt: new Date().toISOString(),
            error: "실행 탭과의 연결이 끊겼습니다. 자동 재전송하지 않았습니다.",
          });
    },
  );
}
export async function startRequest(
  db: HubDB,
  threadId: string,
  prompt: string,
  ctx: CommandContext,
  retryOf?: string,
): Promise<Prepared> {
  return transact<Prepared>(db, "rw", db.tables, async () => {
    const ready = await db.table("meta").get("ready");
    if (ctx.epoch && ctx.epoch !== ready.epoch)
      throw Error("복원된 데이터입니다. 새로고침하세요.");
    const s = await readState(db, { userId: ctx.actorId, role: ctx.role });
    if (!canSeeThread(s, threadId)) throw Error("대화 권한이 없습니다.");
    const t = s.threads.find((t) => t.id === threadId)!,
      w = s.works.find((w) => w.id === t.workId)!,
      a = s.agents.find((a) => a.id === w.agentId)!,
      profile = s.profiles.find((p) => p.id === a.profileId)!;
    if (w.status === "done")
      throw Error("완료 업무는 사유를 남겨 재개한 후 대화하세요.");
    if (w.manual || a.connectionMode === "external")
      throw Error("내부 AI 대화를 사용할 수 없는 업무입니다.");
    if (!prompt.trim()) throw Error("메시지를 입력하세요.");
    for (const r of s.requestRecords ?? [])
      if (r.threadId === threadId && active(r)) {
        if (r.leaseUntil > Date.now())
          throw Error("이 대화에서 이미 요청이 진행 중입니다.");
        await db.table<RequestRecord, string>("requestRecords").update(r.id, {
          status: "interrupted",
          finishedAt: new Date().toISOString(),
        });
      }
    if (retryOf) {
      const prev = s.requestRecords?.find((r) => r.id === retryOf);
      if (
        !prev ||
        prev.threadId !== threadId ||
        !["failed", "cancelled", "interrupted"].includes(prev.status)
      )
        throw Error("재시도할 요청을 확인하세요.");
    }
    // Only the live selections are assembled; old request snapshots never enter history.
    const body = buildRequest(s, threadId, prompt);
    if (
      new TextEncoder().encode(JSON.stringify(body)).byteLength >
      (profile.maxRequestBytes ?? 262144)
    )
      throw Error(
        "요청 크기 한도 초과: 자료를 줄이거나 요약하고 새 대화를 시작하세요.",
      );
    const id = crypto.randomUUID(),
      at = new Date().toISOString();
    const fileIds = (t.selectedInputIds ?? w.inputIds).filter(
      (id) =>
        w.inputIds.includes(id) &&
        (ctx.role !== "requester" ||
          s.artifacts.find((f) => f.id === id)?.createdBy === ctx.actorId),
    );
    const snapshot: RequestRecord["snapshot"] = {
      model: body.model,
      stream: false,
      messages: [],
    };
    for (const m of body.messages)
      snapshot.messages.push({
        role: m.role,
        contentId: await chunk(db, m.content),
        ...(m.name ? { name: m.name } : {}),
      });
    const record: RequestRecord = {
      id,
      threadId,
      workId: w.id,
      actorId: ctx.actorId,
      role: ctx.role,
      tabId: ctx.tabId,
      status: "pending",
      createdAt: at,
      requestedModel: body.model,
      source: profile.mode,
      contextIds: ctx.role === "requester" ? [] : [...t.activeBundleIds],
      fileIds,
      userMessageId: crypto.randomUUID(),
      snapshot,
      leaseToken: crypto.randomUUID(),
      leaseUntil: Date.now() + 30000,
      retryOf,
    };
    await db.table("messages").add({
      id: record.userMessageId,
      sequence: await db.table("messages").count(),
      threadId,
      role: "user",
      actor: ctx.actorId,
      content: prompt,
      at,
      kind: "request",
      source: "human",
      contextIds: record.contextIds,
      fileIds,
      requestId: id,
      ...(ctx.role === "requester" ? { visibleToRequester: ctx.actorId } : {}),
    });
    await db.table<RequestRecord, string>("requestRecords").add(record);
    await db.table("activities").add({
      id: crypto.randomUUID(),
      workId: w.id,
      actor: ctx.actorId,
      at,
      action: "AI 요청 시작",
      detail: body.model,
    });
    await db.table("works").update(w.id, { updatedAt: at });
    return { record, body, profile };
  });
}
export async function finishRequest(
  db: HubDB,
  id: string,
  token: string,
  result: { content: string; model: string; source: "demo" | "api" },
): Promise<boolean> {
  return transact<boolean>(db, "rw", db.tables, async () => {
    const r = await db.table<RequestRecord>("requestRecords").get(id);
    if (
      !r ||
      !active(r) ||
      r.leaseToken !== token ||
      r.leaseUntil <= Date.now()
    )
      return false;
    const w = await db.table("works").get(r.workId);
    const at = new Date().toISOString();
    await db.table("messages").add({
      id: crypto.randomUUID(),
      sequence: await db.table("messages").count(),
      threadId: r.threadId,
      role: "assistant",
      actor: w.agentId,
      content: result.content,
      at,
      kind: "reply",
      source: result.source,
      model: result.model,
      contextIds: r.contextIds,
      fileIds: r.fileIds,
      requestId: id,
      ...(r.role === "requester" ? { visibleToRequester: r.actorId } : {}),
    });
    await db.table<RequestRecord, string>("requestRecords").update(id, {
      status: "succeeded",
      finishedAt: at,
      actualModel: result.model,
      leaseUntil: 0,
    });
    await db.table("activities").add({
      id: crypto.randomUUID(),
      workId: w.id,
      actor: r.actorId,
      at,
      action: "AI 응답 완료",
      detail: result.model,
    });
    await db.table("works").update(w.id, { updatedAt: at });
    return true;
  });
}
export async function cancelRequest(
  db: HubDB,
  id: string,
  ctx: CommandContext,
) {
  await transact<void>(
    db,
    "rw",
    ["requestRecords"],
    async (): Promise<void> => {
      const r = await db.table<RequestRecord>("requestRecords").get(id);
      if (!r || !active(r)) return;
      if (r.actorId !== ctx.actorId && ctx.role !== "admin")
        throw Error("본인의 요청만 중지할 수 있습니다.");
      await db.table<RequestRecord, string>("requestRecords").update(id, {
        status: "cancelled",
        finishedAt: new Date().toISOString(),
        leaseUntil: 0,
      });
    },
  );
  controllers.get(id)?.abort();
}
export async function cancelTabRequests(db: HubDB, ctx: CommandContext) {
  for (const r of await db.table<RequestRecord>("requestRecords").toArray())
    if (active(r) && r.tabId === ctx.tabId) await cancelRequest(db, r.id, ctx);
}
export async function requestSnapshot(
  db: HubDB,
  r: RequestRecord,
  ctx: CommandContext,
) {
  const s = await readState(db, { userId: ctx.actorId, role: ctx.role });
  const stored = s.requestRecords?.find((x) => x.id === r.id);
  if (
    !stored ||
    !canSeeThread(s, stored.threadId) ||
    (ctx.role === "requester" &&
      (stored.role !== "requester" || stored.actorId !== ctx.actorId))
  )
    throw Error("이 요청 기록을 열람할 수 없습니다.");
  r = stored;
  const messages = [];
  for (const m of r.snapshot.messages) {
    const row = await db.table("blobs").get(m.contentId);
    if (!row) throw Error("요청 원문이 없습니다.");
    messages.push({
      role: m.role,
      content: await row.blob.text(),
      ...(m.name ? { name: m.name } : {}),
    });
  }
  return { model: r.snapshot.model, messages, stream: false };
}
export async function runRequest(db: HubDB, prepared: Prepared, key: string) {
  const { record: r, profile, body } = prepared;
  const controller = new AbortController();
  controllers.set(r.id, controller);
  const heartbeat = setInterval(() => {
    void transact<void>(
      db,
      "rw",
      ["requestRecords"],
      async (): Promise<void> => {
        const current = await db
          .table<RequestRecord>("requestRecords")
          .get(r.id);
        if (
          current &&
          active(current) &&
          current.leaseToken === r.leaseToken &&
          current.leaseUntil > Date.now()
        )
          await db
            .table<RequestRecord, string>("requestRecords")
            .update(r.id, { leaseUntil: Date.now() + 30000 });
        else controller.abort();
      },
    ).catch(() => controller.abort());
  }, 10000);
  try {
    let result: { content: string; model: string; source: "demo" | "api" };
    if (profile.mode === "demo") {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 500);
        controller.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(Error("중지됨"));
          },
          { once: true },
        );
      });
      result = {
        content:
          "[샘플 응답]\n요청을 확인했습니다. 선택 자료를 바탕으로 검토 범위와 완료 기준을 정리하세요.\n\n" +
          body.messages.at(-1)!.content,
        model: body.model,
        source: "demo",
      };
    } else {
      const response = await fetch(
        profile.baseUrl.replace(/\/$/, "") +
          "/" +
          profile.chatPath.replace(/^\//, ""),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(key ? { Authorization: "Bearer " + key } : {}),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(60000),
          ]),
        },
      );
      if (!response.ok)
        throw Error(
          "API 응답 오류 (" +
            response.status +
            "). 주소·인증·CORS 설정을 확인하세요.",
        );
      const data = await response.json();
      if (typeof data.choices?.[0]?.message?.content !== "string")
        throw Error("텍스트 응답 형식을 확인하세요.");
      result = {
        content: data.choices[0].message.content,
        model: data.model || body.model,
        source: "api",
      };
    }
    if (await finishRequest(db, r.id, r.leaseToken, result)) return result;
  } catch (e) {
    await transact<void>(
      db,
      "rw",
      ["requestRecords"],
      async (): Promise<void> => {
        const current = await db
          .table<RequestRecord>("requestRecords")
          .get(r.id);
        if (current && active(current) && current.leaseToken === r.leaseToken)
          await db.table<RequestRecord, string>("requestRecords").update(r.id, {
            status: "failed",
            error: e instanceof Error ? e.message : "API 연결 실패",
            finishedAt: new Date().toISOString(),
            leaseUntil: 0,
          });
      },
    );
  } finally {
    clearInterval(heartbeat);
    controllers.delete(r.id);
  }
}
