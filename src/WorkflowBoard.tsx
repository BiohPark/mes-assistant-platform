import { ArrowUpRight, Check, Pencil, Sparkles } from "lucide-react";
import type { Work } from "./types";
import { useStore, navigate } from "./store";
import { boardBucket, moduleKey } from "./workflow";
import { currentStage, getProgress, workStatus } from "./domain";
import { Avatar, Badge, formatDate } from "./ui";

export function WorkflowBoard({
  works,
  selected,
  onSelect,
}: {
  works: Work[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { state } = useStore();
  const ids = new Set(state.works.flatMap((w) => w.stages.map(moduleKey)));
  const columns = [
    ...(state.modules || [])
      .filter((m) => ids.has(m.id))
      .map((m) => ({ id: m.id, name: m.name, short: m.short })),
    { id: "completed", name: "업무 완료", short: "DONE" },
  ];
  return (
    <div className="workflow-board" aria-label="Task별 워크플로우 보드">
      {columns.map((col) => {
        const items = works.filter((w) => boardBucket(w) === col.id);
        return (
          <section
            className={`workflow-column ${selected === col.id ? "selected" : ""}`}
            key={col.id}
          >
            <button
              className="workflow-column-head"
              aria-pressed={selected === col.id}
              onClick={() => onSelect(selected === col.id ? "" : col.id)}
            >
              <span className="module-symbol">
                {col.id === "completed" ? <Check size={17} /> : col.short}
              </span>
              <strong>{col.name}</strong>
              <span className="column-count">{items.length}</span>
            </button>
            <div className="workflow-column-body">
              {items.map((w) => {
                const task = currentStage(w);
                return (
                  <article
                    className={`workflow-work ${w.stages.every((s) => s.mode === "manual") ? "manual-work" : ""}`}
                    key={w.id}
                  >
                    <div className="workflow-work-meta">
                      <span>{w.id}</span>
                      <Badge
                        tone={
                          workStatus(w) === "검토 필요" ? "amber" : "neutral"
                        }
                      >
                        {workStatus(w)}
                      </Badge>
                    </div>
                    <button
                      className="workflow-work-title"
                      onClick={() => navigate("/work/" + w.id)}
                    >
                      {w.title}
                      <ArrowUpRight size={15} />
                    </button>
                    <p className="workflow-template">{w.template}</p>
                    <div
                      className="work-task-path"
                      aria-label={`${w.title} Task 구성`}
                    >
                      {w.stages.map((s) => (
                        <button
                          key={s.id}
                          title={`${s.name} · ${s.mode === "manual" ? "수동" : "Assistant"}`}
                          className={`${s.status} ${s.mode}`}
                          onClick={() => navigate(`/work/${w.id}/${s.id}`)}
                        >
                          {s.status === "done" ? (
                            <Check size={10} />
                          ) : s.mode === "manual" ? (
                            <Pencil size={10} />
                          ) : null}
                          {s.short}
                        </button>
                      ))}
                    </div>
                    <div className="workflow-current">
                      {task.mode === "manual" ? (
                        <Pencil size={13} />
                      ) : (
                        <Sparkles size={13} />
                      )}{" "}
                      {task.mode === "manual"
                        ? "담당자 수동 진행"
                        : task.assistant}
                    </div>
                    <div className="workflow-progress">
                      <i style={{ width: getProgress(w) + "%" }} />
                    </div>
                    <div className="kanban-bottom">
                      <Avatar name={w.owner} small />
                      <span>{w.owner}</span>
                      <small>{formatDate(w.due)}</small>
                      <b>{getProgress(w)}%</b>
                    </div>
                  </article>
                );
              })}
              {!items.length && (
                <div className="workflow-empty">
                  해당 단계의 업무가 없습니다
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
