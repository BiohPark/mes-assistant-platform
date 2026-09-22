import type {
  AppState,
  ChatThread,
  Connection,
  Stage,
  TaskModule,
  Work,
} from "./types";
import { currentStage, getProgress, newStage, uid } from "./domain";

export const DEFAULT_CONNECTION: Connection = {
  mode: "demo",
  baseUrl: "",
  chatPath: "/chat/completions",
  modelsPath: "/models",
  models: ["glm-5.2"],
  defaultModel: "glm-5.2",
  sendNames: false,
};
export const moduleKey = (s: Pick<Stage, "short" | "moduleId">) =>
  s.moduleId || `module-${s.short.trim().toLowerCase()}`;
export const mainThreadId = (s: Stage) => s.threads?.[0]?.id || `${s.id}-main`;
export const threadsFor = (s: Stage): ChatThread[] =>
  s.threads?.length
    ? s.threads
    : [
        {
          id: mainThreadId(s),
          title: "기본 대화",
          createdAt: s.messages[0]?.at || "",
        },
      ];
export const boardBucket = (w: Work) =>
  getProgress(w) === 100 ? "completed" : moduleKey(currentStage(w));
export const matchesModule = (
  w: Work,
  id: string,
  scope: "current" | "includes",
) =>
  !id ||
  (scope === "current" || id === "completed"
    ? boardBucket(w) === id
    : w.stages.some((s) => moduleKey(s) === id));
export function resolveModel(s: AppState, task: Stage, thread?: ChatThread) {
  return (
    thread?.model ||
    task.defaultModel ||
    s.modules?.find((m) => m.id === moduleKey(task))?.defaultModel ||
    s.connection?.defaultModel ||
    DEFAULT_CONNECTION.defaultModel
  );
}
export function instantiateModule(m: TaskModule): Stage {
  return {
    ...newStage(m.name, m.short, m.mode, m.assistant),
    moduleId: m.id,
    checklist: m.checklist.map((label) => ({ id: uid(), label, done: false })),
  };
}
export function normalizeState(input: AppState): AppState {
  const s = structuredClone(input);
  s.connection = { ...DEFAULT_CONNECTION, ...s.connection };
  s.modules ??= [];
  const definitions = [
    ...s.templates.flatMap((t) => t.stages),
    ...s.works.flatMap((w) => w.stages),
  ];
  for (const task of definitions) {
    task.moduleId = moduleKey(task);
    if (!s.modules.some((m) => m.id === task.moduleId))
      s.modules.push({
        id: task.moduleId,
        name: task.name,
        short: task.short,
        description: `${task.name}에 사용하는 재사용 Task 모듈`,
        mode: task.mode,
        assistant: task.assistant,
        checklist: task.checklist?.map((c) => c.label) || [
          "입력 자료와 작업 범위 확인",
          "산출물 작성 및 내용 검토",
          "다음 단계 전달 자료 확인",
        ],
      });
  }
  for (const w of s.works)
    for (const t of w.stages) {
      t.threads = threadsFor(t);
      t.messages = t.messages.map((m) => ({
        ...m,
        threadId: m.threadId || mainThreadId(t),
      }));
    }
  return s;
}
