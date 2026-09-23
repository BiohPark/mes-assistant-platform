import { HubDB, readState, transact } from "../db/schema";
import type { ChecklistAssessment, ConnectionProfile } from "../types";
import type { CommandContext } from "../domain/commands";
import { selectedMaterials } from "../hub";
import { visibleMessages } from "../domain";
import { sendOpenWebUI } from "./openWebUI";

const controllers = new Map<string, AbortController>();
const endpoint = (p: ConnectionProfile) => p.baseUrl.replace(/\/$/, "") + "/" + p.chatPath.replace(/^\//, "");
export async function assessChecklist(db: HubDB, workId: string, ctx: CommandContext, key: string): Promise<ChecklistAssessment> {
  if (ctx.role === "requester") throw Error("체크리스트 점검 권한이 없습니다.");
  const { record, profile, body, files } = await transact(db, "rw", db.tables, async () => {
    const ready = await db.table("meta").get("ready");
    if (ctx.epoch && ctx.epoch !== ready?.epoch) throw Error("복원된 데이터입니다. 새로고침하세요.");
    const s = await readState(db, { userId: ctx.actorId, role: ctx.role });
    const w = s.works.find(w => w.id === workId);
    if (!w || w.status === "done") throw Error("진행 중 업무에서만 점검할 수 있습니다.");
    if (!w.checks.length) throw Error("점검할 체크리스트 항목이 없습니다.");
    if (s.checklistAssessments?.some(a => a.workId === workId && a.status === "pending" && a.leaseUntil > Date.now())) throw Error("이미 점검 중입니다.");
    const agent = s.agents.find(a => a.id === w.agentId)!;
    const profile = structuredClone(s.profiles.find(p => p.id === agent.profileId)!);
    const thread = s.threads.find(t => t.id === w.activeThreadId)!;
    const model = thread.model || agent.defaultModel || profile.defaultModel;
    if (profile.mode === "api" && (!model || model === "default")) throw Error("점검에 사용할 실제 API 모델을 설정하세요.");
    const messages = visibleMessages(s, thread.id).filter(m => m.kind !== "discussion");
    const files = selectedMaterials(s, w.id).map(f => structuredClone(f));
    const checks = structuredClone(w.checks);
    const material = files.map(f => ({ id: f.id, name: f.name, version: f.version, content: f.content ?? "[원문은 파일 첨부 참조]" }));
    const body = {
      model,
      messages: [
        { role: "system", content: "사용자가 명시적으로 요청한 체크리스트 점검만 수행하세요. 업무 완료나 수용 판단을 하지 마세요. 결과는 JSON {results:[{id,verdict,reason,references}]} 형식입니다. verdict는 achieved, unmet, unknown 중 하나입니다. 각 항목을 정확히 한 번 포함하고 근거 없는 달성은 unknown으로 답하세요. references에는 제공된 메시지 또는 파일 ID만 쓰세요." },
        { role: "user", content: JSON.stringify({ checks: checks.map(c => ({ id: c.id, label: c.label })), messages: messages.map(m => ({ id: m.id, role: m.role, content: m.content })), files: profile.adapter === "openwebui" ? material.map(({ content: _content, ...rest }) => rest) : material }) },
      ],
      stream: false,
    };
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > (profile.maxRequestBytes ?? 262144)) throw Error("점검 요청 크기 한도 초과: 자료를 줄여 주세요.");
    const record: ChecklistAssessment = {
      id: crypto.randomUUID(), tabId: ctx.tabId, leaseUntil: Date.now() + 420000,
      workId, actorId: ctx.actorId, at: new Date().toISOString(), model,
      status: "pending", snapshot: { checks, messageIds: messages.map(m => m.id), fileIds: files.map(f => f.id), inputFlags: (s.taskInputs ?? []).filter(i => i.workId === w.id).map(i => ({ artifactId: i.artifactId, main: i.main })) },
      results: [], score: { achieved: 0, total: checks.length, unknown: 0 }, applied: false, changes: [],
    };
    await db.table("checklistAssessments").add(record);
    return { record, profile, body, files };
  });
  const controller = new AbortController();
  controllers.set(record.id, controller);
  try {
    if ((await db.table<ChecklistAssessment>("checklistAssessments").get(record.id))?.status !== "pending")
      throw Error("중지된 점검입니다.");
    let content: string;
    let actualModel = record.model;
    if (profile.mode === "demo") {
      content = JSON.stringify({ results: record.snapshot.checks.map(c => ({ id: c.id, verdict: "unknown", reason: "샘플 모드는 실제 달성도를 평가하지 않습니다.", references: [] })) });
    } else if (profile.adapter === "openwebui") {
      const epoch = (await db.table("meta").get("ready"))?.epoch;
      const response = await sendOpenWebUI({ profile, body, files, key, scope: `${epoch}|${ctx.actorId}|${ctx.role}`, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(360000)]), loadBlob: async id => (await db.table("blobs").get(id))?.blob });
      content = response.content;
      actualModel = response.model;
    } else {
      const response = await fetch(endpoint(profile), { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { Authorization: "Bearer " + key } : {}) }, body: JSON.stringify(body), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]) });
      if (!response.ok) throw Error(`점검 API 오류 (${response.status})`);
      const data = await response.json();
      content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw Error("점검 응답 형식 오류");
      actualModel = data.model || record.model;
    }
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.results) || parsed.results.length !== record.snapshot.checks.length) throw Error("점검 항목 수가 맞지 않습니다.");
    const allowed = new Set([...record.snapshot.messageIds, ...record.snapshot.fileIds]);
    const ids = new Set<string>();
    const results: ChecklistAssessment["results"] = parsed.results.map((r: ChecklistAssessment["results"][number]) => {
      if (!r || !record.snapshot.checks.some(c => c.id === r.id) || ids.has(r.id) || !["achieved", "unmet", "unknown"].includes(r.verdict) || typeof r.reason !== "string" || !Array.isArray(r.references) || r.references.some(ref => typeof ref !== "string" || !allowed.has(ref))) throw Error("점검 결과의 항목 또는 근거가 잘못되었습니다.");
      ids.add(r.id);
      return { id: r.id, verdict: r.verdict, reason: r.reason, references: r.references };
    });
    return await transact<ChecklistAssessment>(db, "rw", db.tables, async () => {
      const current = await db.table<ChecklistAssessment>("checklistAssessments").get(record.id);
      if (current?.status !== "pending" || current.leaseUntil <= Date.now()) throw Error("중지된 점검입니다.");
      const work = await db.table("works").get(workId);
      const currentState = await readState(db, { userId: ctx.actorId, role: ctx.role });
      const currentMessages = visibleMessages(currentState, work?.activeThreadId ?? "").filter(m => m.kind !== "discussion").map(m => m.id);
      const currentFiles = selectedMaterials(currentState, workId).map(f => f.id);
      const currentFlags = (currentState.taskInputs ?? []).filter(i => i.workId === workId).map(i => ({ artifactId: i.artifactId, main: i.main }));
      const same = work?.status !== "done" && JSON.stringify(work?.checks) === JSON.stringify(record.snapshot.checks)
        && JSON.stringify(currentMessages) === JSON.stringify(record.snapshot.messageIds)
        && JSON.stringify(currentFiles) === JSON.stringify(record.snapshot.fileIds)
        && JSON.stringify(currentFlags) === JSON.stringify(record.snapshot.inputFlags)
        && (!ctx.epoch || ctx.epoch === (await db.table("meta").get("ready"))?.epoch);
      const changes = record.snapshot.checks.flatMap(c => {
        const verdict = results.find(r => r.id === c.id)!.verdict;
        const after = verdict === "unknown" ? c.done : verdict === "achieved";
        return c.done === after ? [] : [{ id: c.id, before: c.done, after }];
      });
      if (same) {
        await db.table("works").update(workId, { checks: work.checks.map((c: typeof work.checks[number]) => ({ ...c, done: changes.find(x => x.id === c.id)?.after ?? c.done })), revision: (work.revision ?? 0) + 1, updatedAt: new Date().toISOString() });
        await db.table("activities").add({ id: crypto.randomUUID(), workId, actor: ctx.actorId, at: new Date().toISOString(), action: "AI 달성도 점검", detail: `${results.filter(r => r.verdict === "achieved").length}/${results.length}` });
      }
      const finished: ChecklistAssessment = { ...record, model: actualModel, status: same ? "completed" : "conflict", results, score: { achieved: results.filter(r => r.verdict === "achieved").length, total: results.length, unknown: results.filter(r => r.verdict === "unknown").length }, applied: !!same, changes: same ? changes : [], ...(same ? {} : { error: "점검 중 체크리스트 또는 업무 상태가 변경되었습니다. 재점검하세요." }) };
      await db.table("checklistAssessments").put(finished);
      return finished;
    });
  } catch (error) {
    if ((await db.table<ChecklistAssessment>("checklistAssessments").get(record.id))?.status === "pending")
      await db.table("checklistAssessments").update(record.id, { status: controller.signal.aborted ? "cancelled" : "failed", error: error instanceof Error ? error.message : "점검 실패" });
    throw error;
  } finally {
    controllers.delete(record.id);
  }
}
export async function cancelChecklistAssessment(db: HubDB, id: string, ctx: CommandContext) {
  const row = await db.table<ChecklistAssessment>("checklistAssessments").get(id);
  if (!row || row.status !== "pending") return;
  if (ctx.role !== "admin" && row.actorId !== ctx.actorId) throw Error("본인의 점검만 중지할 수 있습니다.");
  controllers.get(id)?.abort();
  await db.table("checklistAssessments").update(id, { status: "cancelled" });
}
export async function cancelTabAssessments(db: HubDB, ctx: CommandContext) {
  for (const row of await db.table<ChecklistAssessment>("checklistAssessments").where("status").equals("pending").toArray())
    if (row.tabId === ctx.tabId) await cancelChecklistAssessment(db, row.id, ctx);
}
export async function recoverExpiredAssessments(db: HubDB, time = Date.now()) {
  for (const row of await db.table<ChecklistAssessment>("checklistAssessments").where("status").equals("pending").toArray())
    if (row.leaseUntil <= time) await db.table("checklistAssessments").update(row.id, { status: "failed", error: "점검 탭과의 연결이 끊겼습니다. 재점검하세요." });
}
