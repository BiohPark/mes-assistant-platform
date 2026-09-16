import type { Work, AppState, Stage, AuditEvent } from "./types";
export const uid = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // RFC4122 v4
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
export const now = () => new Date().toISOString();
export const USERS = [
  "박비오",
  "노기현",
  "이희준",
  "김해윤",
  "김남우",
] as const;
export function transitionWork(
  work: Work,
  stageId: string,
  action: "next" | "skip" | "back" | "reopen",
  targetId: string,
  selectedFiles: string[],
  reason: string,
): Work {
  const result = structuredClone(work);
  const from = result.stages.findIndex((s) => s.id === stageId),
    to = result.stages.findIndex((s) => s.id === targetId);
  if (from < 0) throw new Error("단계를 찾을 수 없습니다.");
  const source = result.stages[from];
  if (action !== "next" && !reason.trim())
    throw new Error("변경 사유를 입력해 주세요.");
  if (selectedFiles.some((id) => !source.outputs.includes(id)))
    throw new Error("현재 단계의 산출물만 전달할 수 있습니다.");
  if(action==='reopen'){
    if(!['done','skipped'].includes(source.status)||targetId!==source.id)throw new Error('완료 또는 건너뛴 현재 단계만 다시 열 수 있습니다.');
    result.stages.forEach((s,i)=>{if((i>from&&['done','skipped','active','review'].includes(s.status))||(i!==from&&s.status==='active'))s.status='review';});
    source.status='active';source.checklist.forEach(c=>c.done=false);return result;
  }
  if (action === "back") {
    if (source.status === "pending")
      throw new Error(
        "대기 중인 단계에서는 되돌릴 수 없습니다. 진행한 단계를 선택해 주세요.",
      );
    if (to < 0 || to >= from) throw new Error("이전 단계를 선택해 주세요.");
    result.stages.forEach((s, i) => {
      if (
        (i > to &&
          ["done", "active", "skipped", "review"].includes(s.status)) ||
        (i !== to && s.status === "active")
      )
        s.status = "review";
    });
    result.stages[to].status = "active";
    result.stages[to].checklist.forEach((c) => (c.done = false));
  } else {
    if (!["active", "review"].includes(source.status))
      throw new Error("진행 중이거나 재검토 중인 단계에서 전환해 주세요.");
    if (action === "next" && source.checklist.some((c) => !c.done))
      throw new Error("체크리스트를 모두 확인해 주세요.");
    if (result.stages.slice(0,from).some(s=>!['done','skipped'].includes(s.status)))
      throw new Error('이전 단계에 미완료 또는 재검토 항목이 남아 있습니다. 먼저 확인해 주세요.');
    if(result.stages.some(s=>s.id!==source.id&&s.status==='active'))
      throw new Error('다른 단계가 진행 중입니다. 현재 진행 단계를 먼저 처리하거나 사유를 남겨 되돌려 주세요.');
    if (from < result.stages.length - 1 && to !== from + 1)
      throw new Error("바로 다음 단계를 선택해 주세요.");
    if (from === result.stages.length - 1 && targetId)
      throw new Error("마지막 단계입니다.");
    if(to>=0 && ['done','skipped'].includes(result.stages[to].status))
      throw new Error('다음 단계가 이미 완료되었거나 건너뛴 상태입니다. 순서를 조정하거나 사유를 남겨 해당 단계를 되돌려 주세요.');
    if (
      from === result.stages.length - 1 &&
      result.stages
        .slice(0, from)
        .some((s) => !["done", "skipped"].includes(s.status))
    )
      throw new Error(
        "이전 단계에 미완료 또는 재검토 항목이 남아 있습니다. 먼저 확인해 주세요.",
      );
    source.status = action === "next" ? "done" : "skipped";
    if (to >= 0) {
      result.stages[to].status = "active";
      result.stages[to].inputs = [
        ...new Set([...result.stages[to].inputs, ...selectedFiles]),
      ];
    }
  }
  return result;
}
export function getProgress(work: Work): number {
  return work.stages.length
    ? Math.round(
        (work.stages.filter(
          (s) => s.status === "done" || s.status === "skipped",
        ).length /
          work.stages.length) *
          100,
      )
    : 0;
}
export function mergeStageStructure(work: Work, proposed: Stage[]): Stage[] {
  if (!proposed.length) throw new Error("최소 1개의 단계가 필요합니다.");
  for (const existing of work.stages) {
    if (
      !proposed.some((s) => s.id === existing.id) &&
      (existing.status !== "pending" ||
        existing.messages.length ||
        existing.notes.length ||
        existing.inputs.length ||
        existing.outputs.length ||
        existing.checklist.some((c) => c.done))
    )
      throw new Error(
        "작업 기록이 있는 단계는 삭제할 수 없습니다. 최신 상태를 확인해 주세요.",
      );
  }
  const merged = proposed.map((p) => {
    const current = work.stages.find((s) => s.id === p.id);
    return current
      ? {
          ...current,
          name: p.name,
          short: p.short,
          mode: p.mode,
          assistant: p.assistant,
          moduleId: p.moduleId,
          defaultModel: p.defaultModel,
        }
      : structuredClone(p);
  });
  if (!merged.some((s) => s.status === "active")) {
    const next =
      merged.find((s) => s.status === "review") ||
      merged.find((s) => s.status === "pending");
    if (next) next.status = "active";
  }
  return merged;
}
export const currentStage = (w: Work) =>
  w.stages.find((s) => s.status === "active") ||
  w.stages.find((s) => s.status === "review") ||
  w.stages.find((s) => s.status === "pending") ||
  w.stages.at(-1)!;
export const workStatus = (w: Work) =>
  getProgress(w) === 100
    ? "완료"
    : w.stages.some((s) => s.status === "review")
      ? "검토 필요"
      : w.stages.some((s) => s.status === "active")
        ? "진행 중"
        : "대기";
export const event = (
  s: AppState,
  workId: string,
  stageId: string,
  action: string,
  detail: string,
): AuditEvent => ({
  id: uid(),
  workId,
  stageId,
  actor: s.profile,
  action,
  detail,
  timestamp: now(),
});
export const newStage = (
  name: string,
  short: string,
  mode: Stage["mode"] = "assistant",
  assistant = short + " Assistant",
): Stage => ({
  id: uid(),
  name,
  short,
  mode,
  assistant,
  status: "pending",
  inputs: [],
  outputs: [],
  checklist: [
    { id: uid(), label: "입력 자료와 작업 범위 확인", done: false },
    { id: uid(), label: "산출물 작성 및 내용 검토", done: false },
    { id: uid(), label: "다음 단계 전달 자료 확인", done: false },
  ],
  messages: [],
  notes: [],
});
export function addWork(
  s: AppState,
  title: string,
  templateId: string,
  owner: string,
  due: string,
  externalId: string,
): AppState {
  const template =
    s.templates.find((t) => t.id === templateId) || s.templates[0];
  const stages = template.stages.map((t) => ({
    ...newStage(t.name, t.short, t.mode, t.assistant),
    moduleId: t.moduleId,
    defaultModel: t.defaultModel,
    ...(t.checklist
      ? {
          checklist: t.checklist.map((c) => ({
            id: uid(),
            label: c.label,
            done: false,
          })),
        }
      : {}),
  }));
  stages[0].status = "active";
  const work: Work = {
    id:
      "MES-" +
      String(
        Math.max(
          0,
          ...s.works.map((w) => Number(w.id.replace("MES-", "")) || 0),
        ) + 1,
      ).padStart(3, "0"),
    title,
    description: "새 업무의 요구사항과 자료를 첫 단계에서 정리해 주세요.",
    system: "Syncade ET",
    owner,
    priority: "보통",
    due,
    externalId,
    template: template.name,
    stages,
    createdAt: now(),
  };
  return {
    ...s,
    works: [work, ...s.works],
    events: [event(s, work.id, stages[0].id, "업무 생성", title), ...s.events],
  };
}
