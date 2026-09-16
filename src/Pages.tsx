import { reportScope, reportStageGroups } from "./reporting";
import { TaskModules } from "./TaskModules";
import { instantiateModule, moduleKey } from "./workflow";
import { useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  FileStack,
  FileText,
  GitBranch,
  Link2,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { useStore, navigate } from "./store";
import {
  Avatar,
  Badge,
  Empty,
  FileCard,
  Modal,
  SectionTitle,
  formatDate,
  formatTime,
  sizeLabel,
} from "./ui";
import {
  uid,
  event,
  now,
  newStage,
  getProgress,
  currentStage,
  workStatus,
  mergeStageStructure,
} from "./domain";
import { csv, downloadBlob } from "./storage";
import type { Stage } from "./types";

export function Templates({ onCreate }: { onCreate: () => void }) {
  const { state, update, notify } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <>
      <SectionTitle
        eyebrow="DESIGN YOUR FLOW"
        title="워크플로우"
        description="업무의 성격에 맞는 흐름을 만들고, assistant와 사람의 역할을 연결하세요."
      >
        <button className="button primary" onClick={() => setEditing("new")}>
          <Plus size={17} />새 워크플로우
        </button>
      </SectionTitle>
      <div className="template-banner">
        <div className="template-banner-icon">
          <GitBranch size={32} />
        </div>
        <div>
          <h2>정해진 순서보다, 우리 업무에 맞는 흐름.</h2>
          <p>
            단계를 추가하고 순서를 바꾸세요. 필요한 곳에 assistant를 연결하고,
            직접 진행할 단계는 수동으로 설정하세요.
          </p>
        </div>
        <span className="pill-outline">SANDBOX WORKFLOW</span>
      </div>
      <div className="section-heading">
        <div>
          <h2>
            워크플로우 템플릿 <span>{state.templates.length}</span>
          </h2>
        </div>
        <span className="muted">
          템플릿 변경은 이후 생성하는 업무에 적용됩니다.
        </span>
      </div>
      <div className="template-grid">
        {state.templates.map((t, i) => (
          <article className="template-card" key={t.id}>
            <div className="template-card-top">
              <span className={`template-icon color-${i % 3}`}>
                <Workflow size={23} />
              </span>
              <Badge tone={i === 0 ? "green" : "neutral"}>
                {i === 0 ? "기본 템플릿" : "사용자 템플릿"}
              </Badge>
            </div>
            <h2>{t.name}</h2>
            <p>{t.description}</p>
            <div className="template-node-list">
              {t.stages.map((s, j) => (
                <div key={j} className={s.mode === "manual" ? "manual" : ""}>
                  <span className="template-node-dot">
                    {s.mode === "assistant" ? (
                      <Sparkles size={13} />
                    ) : (
                      <Pencil size={12} />
                    )}
                  </span>
                  <span>{s.name}</span>
                  <small>{s.mode === "manual" ? "수동" : s.short}</small>
                  {j < t.stages.length - 1 && <i />}
                </div>
              ))}
            </div>
            <div className="template-card-footer">
              <span>
                {t.stages.length}개 단계 ·{" "}
                {t.stages.filter((s) => s.mode === "assistant").length}개
                assistant
              </span>
              <button
                className="icon-button"
                aria-label={`${t.name} 복제`}
                onClick={() => {
                  const id = uid();
                  update((s) => ({
                    ...s,
                    templates: [
                      ...s.templates,
                      { ...structuredClone(t), id, name: t.name + " 복사본" },
                    ],
                  }));
                  notify("템플릿을 복제했습니다.");
                }}
              >
                <Copy size={15} />
              </button>
              <button className="button" onClick={() => setEditing(t.id)}>
                <Settings2 size={14} />
                편집
              </button>
            </div>
          </article>
        ))}
      </div>
      <TaskModules />
      <div className="workflow-guidance">
        <span>
          <Sparkles size={22} />
        </span>
        <div>
          <h3>흐름이 준비되었다면, 첫 업무를 시작해 보세요.</h3>
          <p>
            업무마다 템플릿을 선택하고, 진행 중에도 개별 워크플로우를 조정할 수
            있습니다.
          </p>
        </div>
        <button className="button primary" onClick={onCreate}>
          업무 만들기
          <ArrowRight size={16} />
        </button>
      </div>
      {editing && (
        <StageEditor
          templateId={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

export function StageEditor({
  workId,
  templateId,
  onClose,
}: {
  workId?: string;
  templateId?: string;
  onClose: () => void;
}) {
  const { state, update, notify } = useStore();
  const work = state.works.find((w) => w.id === workId),
    template = state.templates.find((t) => t.id === templateId);
  const [name, setName] = useState(template?.name || "새 워크플로우"),
    [description, setDescription] = useState(
      template?.description || "업무에 맞게 단계를 구성하세요.",
    ),
    [stages, setStages] = useState<Stage[]>(() =>
      work
        ? structuredClone(work.stages)
        : template
          ? template.stages.map((s) => ({
              ...newStage(s.name, s.short, s.mode, s.assistant),
              moduleId: s.moduleId,
              defaultModel: s.defaultModel,
              ...(s.checklist
                ? {
                    checklist: s.checklist.map((c) => ({
                      ...c,
                      id: uid(),
                      done: false,
                    })),
                  }
                : {}),
            }))
          : [newStage("요구사항 분석", "URS"), newStage("검토", "REVIEW")],
    ),
    [error, setError] = useState(""),
    [drag, setDrag] = useState<number | null>(null);
  function modify(i: number, change: Partial<Stage>) {
    setStages((v) => v.map((s, j) => (j === i ? { ...s, ...change } : s)));
  }
  function move(i: number, to: number) {
    if (to < 0 || to >= stages.length) return;
    setStages((v) => {
      const copy = [...v];
      const [s] = copy.splice(i, 1);
      copy.splice(to, 0, s);
      return copy;
    });
  }
  function remove(i: number) {
    const s = stages[i];
    if (stages.length === 1) {
      setError("최소 1개의 단계가 필요합니다.");
      return;
    }
    if (
      work &&
      ("pending" !== s.status ||
        s.inputs.length ||
        s.outputs.length ||
        s.notes.length ||
        s.messages.length ||
        s.checklist.some((c) => c.done))
    ) {
      setError(
        "진행 상태나 작업 기록이 있는 단계는 삭제할 수 없습니다. 건너뛰기 기능을 사용해 주세요.",
      );
      return;
    }
    setStages((v) => v.filter((_, j) => j !== i));
    setError("");
  }
  function save() {
    if (
      !name.trim() ||
      stages.some(
        (s) =>
          !s.name.trim() ||
          !s.short.trim() ||
          (s.mode === "assistant" && !s.assistant.trim()),
      )
    ) {
      setError("워크플로우명, 단계명, 약어와 assistant 이름을 입력해 주세요.");
      return;
    }
    if (work) {
      try {
        mergeStageStructure(work, stages);
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    }
    update((original) => {
      const modules = [...(original.modules || [])];
      for (const task of stages) {
        task.moduleId = moduleKey(task);
        if (!modules.some((m) => m.id === task.moduleId))
          modules.push({
            id: task.moduleId,
            name: task.name,
            short: task.short,
            description: "사용자 정의 Task",
            mode: task.mode,
            assistant: task.assistant,
            checklist: task.checklist.map((c) => c.label),
          });
      }
      const s = { ...original, modules };
      return work
        ? {
            ...s,
            works: s.works.map((w) =>
              w.id === work.id
                ? { ...w, stages: mergeStageStructure(w, stages) }
                : w,
            ),
            events: [
              event(
                s,
                work.id,
                "",
                "워크플로우 편집",
                stages.map((st) => `${st.name}(${st.mode})`).join(" → "),
              ),
              ...s.events,
            ],
          }
        : {
            ...s,
            templates: template
              ? s.templates.map((t) =>
                  t.id === template.id
                    ? { ...t, name: name.trim(), description, stages }
                    : t,
                )
              : [
                  ...s.templates,
                  { id: uid(), name: name.trim(), description, stages },
                ],
          };
    });
    notify("워크플로우를 저장했습니다.");
    onClose();
  }
  return (
    <Modal
      title={
        work
          ? "업무 워크플로우 편집"
          : template
            ? "워크플로우 편집"
            : "새 워크플로우"
      }
      subtitle="드래그하거나 화살표로 순서를 조정하고, 단계별 진행 방식을 선택하세요."
      onClose={onClose}
      wide
    >
      {!work && (
        <div className="form-grid">
          <label className="form-label">
            워크플로우명
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="form-label">
            설명
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </div>
      )}
      <div className="module-compose-toolbar">
        <label>
          모듈에서 Task 추가
          <select
            aria-label="추가할 Task 모듈"
            value=""
            onChange={(e) => {
              const m = state.modules?.find((m) => m.id === e.target.value);
              if (m) setStages((v) => [...v, instantiateModule(m)]);
            }}
          >
            <option value="">모듈 선택…</option>
            {state.modules?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.short} · {m.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button"
          onClick={() =>
            setStages((v) => v.map((s) => ({ ...s, mode: "manual" })))
          }
        >
          모든 Task를 수동으로
        </button>
      </div>
      <div className="editor-legend">
        <span>
          <Sparkles size={14} />
          Assistant 단계
        </span>
        <span>
          <Pencil size={14} />
          수동 단계
        </span>
        <small>진행 중인 업무의 대화와 파일은 유지됩니다.</small>
      </div>
      <div className="stage-editor-list">
        {stages.map((s, i) => (
          <div
            key={s.id}
            className={`editor-stage ${s.mode === "manual" ? "manual" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (drag !== null) move(drag, i);
              setDrag(null);
            }}
          >
            <div className="editor-position">
              <button
                className="drag-handle"
                draggable
                onDragStart={() => setDrag(i)}
                title="단계 순서 드래그"
                aria-label={`${s.name} 순서 드래그`}
              >
                ⠿
              </button>
              <b>{String(i + 1).padStart(2, "0")}</b>
              <div>
                <button
                  className="icon-button"
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                  aria-label={`${s.name} 위로`}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  className="icon-button"
                  disabled={i === stages.length - 1}
                  onClick={() => move(i, i + 1)}
                  aria-label={`${s.name} 아래로`}
                >
                  <ArrowDown size={13} />
                </button>
              </div>
            </div>
            <div className="editor-fields">
              <label>
                단계명
                <input
                  aria-label={`${i + 1}단계 이름`}
                  value={s.name}
                  onChange={(e) => modify(i, { name: e.target.value })}
                />
              </label>
              <label className="short-field">
                약어
                <input
                  aria-label={`${i + 1}단계 약어`}
                  value={s.short}
                  onChange={(e) => modify(i, { short: e.target.value })}
                />
              </label>
              <label>
                진행 방식
                <select
                  aria-label={`${i + 1}단계 진행 방식`}
                  value={s.mode}
                  onChange={(e) =>
                    modify(i, { mode: e.target.value as Stage["mode"] })
                  }
                >
                  <option value="assistant">Assistant</option>
                  <option value="manual">수동 작업</option>
                </select>
              </label>
              <label>
                연결 assistant
                <input
                  aria-label={`${i + 1}단계 assistant`}
                  disabled={s.mode === "manual"}
                  value={s.assistant}
                  placeholder={
                    s.mode === "manual"
                      ? "담당자가 직접 진행"
                      : "Assistant 이름"
                  }
                  onChange={(e) => modify(i, { assistant: e.target.value })}
                />
              </label>
              <label>
                보드 분류 모듈
                <select
                  aria-label={i + 1 + "단계 모듈"}
                  value={s.moduleId || moduleKey(s)}
                  onChange={(e) => modify(i, { moduleId: e.target.value })}
                >
                  {!(state.modules || []).some(
                    (m) => m.id === (s.moduleId || moduleKey(s)),
                  ) && (
                    <option value={s.moduleId || moduleKey(s)}>
                      개별 Task
                    </option>
                  )}
                  {state.modules?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.short} · {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Task 기본 모델
                <select
                  aria-label={i + 1 + "단계 기본 모델"}
                  disabled={s.mode === "manual"}
                  value={s.defaultModel || ""}
                  onChange={(e) => modify(i, { defaultModel: e.target.value })}
                >
                  <option value="">모듈 / 시스템 기본값</option>
                  {[
                    ...new Set([
                      ...(state.connection?.models || []),
                      ...(s.defaultModel ? [s.defaultModel] : []),
                    ]),
                  ].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
            </div>
            <button
              className="icon-button danger-hover"
              aria-label={`${s.name} 단계 삭제`}
              onClick={() => remove(i)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <button
        className="add-stage-button"
        onClick={() =>
          setStages((v) => [
            ...v,
            { ...newStage("새 단계", "TASK"), moduleId: uid() },
          ])
        }
      >
        <Plus size={17} />
        단계 추가
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-footer">
        <span className="muted">
          {stages.length}개 단계 · assistant{" "}
          {stages.filter((s) => s.mode === "assistant").length} · 수동{" "}
          {stages.filter((s) => s.mode === "manual").length}
        </span>
        <button className="button" onClick={onClose}>
          취소
        </button>
        <button className="button primary" onClick={save}>
          <Check size={16} />
          변경사항 저장
        </button>
      </div>
    </Modal>
  );
}
export function Library() {
  const { state, upload, notify } = useStore();
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState("전체 자료"),
    [uploading, setUploading] = useState(false),
    [workId, setWorkId] = useState(state.works[0]?.id || ""),
    [stageId, setStageId] = useState(state.works[0]?.stages[0]?.id || ""),
    [role, setRole] = useState<"inputs" | "outputs">("inputs");
  const input = useRef<HTMLInputElement>(null);
  const files = state.artifacts.filter(
    (a) =>
      a.name.toLowerCase().includes(query.toLowerCase()) &&
      (kind === "전체 자료" ||
        (kind === "이미지" && a.mime.startsWith("image/")) ||
        (kind === "문서" && !a.mime.startsWith("image/"))),
  );
  return (
    <>
      <SectionTitle
        eyebrow="EVERY ARTIFACT, CONNECTED"
        title="산출물 보관함"
        description="업무의 입력부터 최종 산출물까지, 원본과 연결 관계를 한곳에서 확인하세요."
      >
        <button className="button primary" onClick={() => setUploading(true)}>
          <Upload size={16} />
          자료 업로드
        </button>
      </SectionTitle>
      <div className="library-summary">
        <span className="template-icon">
          <FileStack size={25} />
        </span>
        <div>
          <strong>
            {state.artifacts.length}
            <small>개의 자료</small>
          </strong>
          <p>{state.works.length}개 업무에 연결된 지식과 작업 결과</p>
        </div>
        <div className="library-summary-right">
          <Link2 size={17} />
          <span>자료의 원본과 버전은 단계가 바뀌어도 유지됩니다.</span>
        </div>
      </div>
      <section className="task-section">
        <div className="table-toolbar">
          <div className="tabs">
            {["전체 자료", "문서", "이미지"].map((t) => (
              <button
                key={t}
                className={kind === t ? "active" : ""}
                onClick={() => setKind(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="search-field">
            <Search size={16} />
            <input
              aria-label="자료 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="파일명으로 검색"
            />
          </div>
        </div>
        {files.length ? (
          <div className="table-scroll">
            <table className="artifact-table">
              <thead>
                <tr>
                  <th>자료명</th>
                  <th>원본 업무 · 단계</th>
                  <th>연결된 입력</th>
                  <th>작성자</th>
                  <th>등록일</th>
                </tr>
              </thead>
              <tbody>
                {files.map((a) => {
                  const w = state.works.find((w) => w.id === a.workId);
                  const st = w?.stages.find((s) => s.id === a.stageId);
                  const consumers = state.works.flatMap((w) =>
                    w.stages
                      .filter((s) => s.inputs.includes(a.id))
                      .map((s) => ({ work: w, stage: s })),
                  );
                  return (
                    <tr key={a.id}>
                      <td>
                        <FileCard artifact={a} />
                      </td>
                      <td>
                        <button
                          className="artifact-origin"
                          onClick={() =>
                            navigate("/work/" + a.workId + "/" + a.stageId)
                          }
                        >
                          <strong>{a.workId}</strong>
                          <span>
                            {st?.name || "보관 자료"}
                            <ArrowUpRight size={13} />
                          </span>
                        </button>
                      </td>
                      <td>
                        {consumers.length ? (
                          consumers.map((c) => (
                            <button
                              key={c.stage.id}
                              className="linked-stage"
                              onClick={() =>
                                navigate(
                                  "/work/" + c.work.id + "/" + c.stage.id,
                                )
                              }
                            >
                              <Link2 size={11} />
                              {c.stage.short}
                            </button>
                          ))
                        ) : (
                          <span className="muted">아직 연결되지 않음</span>
                        )}
                      </td>
                      <td>
                        <span className="table-owner">
                          <Avatar name={a.createdBy} small />
                          {a.createdBy}
                        </span>
                      </td>
                      <td className="muted">{formatDate(a.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="자료가 없습니다"
            description="파일을 업로드하거나 단계 대화를 산출물로 저장해 보세요."
          />
        )}
      </section>
      {uploading && (
        <Modal
          title="자료 업로드"
          subtitle="모든 자료는 업무의 한 단계에 연결됩니다."
          onClose={() => setUploading(false)}
        >
          <label className="form-label">
            연결할 업무
            <select
              value={workId}
              onChange={(e) => {
                setWorkId(e.target.value);
                setStageId(
                  state.works.find((w) => w.id === e.target.value)!.stages[0]
                    .id,
                );
              }}
            >
              {state.works.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.id} · {w.title}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label className="form-label">
              단계
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
              >
                {state.works
                  .find((w) => w.id === workId)
                  ?.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="form-label">
              자료 구분
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
              >
                <option value="inputs">입력 자료</option>
                <option value="outputs">산출물</option>
              </select>
            </label>
          </div>
          <button
            className="upload-zone large"
            onClick={() => input.current?.click()}
          >
            <Upload size={25} />
            <strong>파일 선택하기</strong>
            <span>문서, 이미지 등 · 파일당 최대 25MB</span>
          </button>
          <input
            type="file"
            multiple
            hidden
            ref={input}
            onChange={async (e) => {
              if (e.target.files) {
                const files = Array.from(e.target.files);
                const ids = await upload(files, workId, stageId, role);
                if (ids.length) setUploading(false);
              }
            }}
          />
        </Modal>
      )}
    </>
  );
}

export function ActivityPage() {
  const { state } = useStore();
  const [query, setQuery] = useState(""),
    [person, setPerson] = useState("전체 담당자");
  const events = state.events.filter(
    (e) =>
      (person === "전체 담당자" || e.actor === person) &&
      `${e.action} ${e.detail} ${e.workId} ${e.actor}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <SectionTitle
        eyebrow="CONTEXT YOU CAN TRACE"
        title="활동 이력"
        description="누가, 어떤 단계에서, 무엇을 변경했는지 업무의 흐름을 따라 확인하세요."
      >
        <Badge tone="neutral">데모 이력</Badge>
      </SectionTitle>
      <section className="task-section">
        <div className="table-toolbar">
          <div className="search-field wide-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="업무, 활동, 담당자 검색"
              aria-label="활동 검색"
            />
          </div>
          <select
            aria-label="활동 담당자"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
          >
            {["전체 담당자", ...new Set(state.events.map((e) => e.actor))].map(
              (p) => (
                <option key={p} value={p}>{p === "전체 담당자" ? "전체 참여자" : p}</option>
              ),
            )}
          </select>
        </div>
        <div className="activity-list">
          {events.map((e) => (
            <div className="activity-row" key={e.id}>
              <span className="activity-icon">
                {e.action.includes("자료") || e.action.includes("산출물") ? (
                  <FileText size={18} />
                ) : e.action.includes("단계") ? (
                  <GitBranch size={18} />
                ) : (
                  <Activity size={18} />
                )}
              </span>
              <div className="activity-content">
                <div>
                  <strong>{e.actor}</strong>
                  <span>{e.action}</span>
                  <time>
                    {formatDate(e.timestamp)} {formatTime(e.timestamp)}
                  </time>
                </div>
                <p>{e.detail}</p>
                <button
                  onClick={() =>
                    navigate(
                      "/work/" + e.workId + (e.stageId ? "/" + e.stageId : ""),
                    )
                  }
                >
                  {e.workId}
                  <ChevronRight size={12} />
                  {state.works
                    .find((w) => w.id === e.workId)
                    ?.stages.find((s) => s.id === e.stageId)?.name || "업무"}
                  <ArrowUpRight size={12} />
                </button>
              </div>
            </div>
          ))}
          {!events.length && (
            <Empty
              title="표시할 활동이 없습니다"
              description="검색 조건을 변경하거나 업무에서 작업을 시작해 주세요."
            />
          )}
        </div>
      </section>
      <p className="page-disclaimer">
        브라우저에 저장된 데모 이력입니다. 실제 운영 시 서버 기준 감사 이력과
        사용자 인증을 별도로 구현합니다.
      </p>
    </>
  );
}

export function Reports() {
  const { state, notify } = useStore();
  const [period, setPeriod] = useState("week"),
    [person, setPerson] = useState("전체 담당자"),
    [flow, setFlow] = useState("전체 워크플로우");
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (period === "day" ? 0 : 6));
  const {events,works}=reportScope(state,start,today,person,flow);
  const completed = works.filter((w) => getProgress(w) === 100),
    rework = events.filter((e) => /되돌|재검토/.test(e.action));
  const days = Array.from({ length: period === "day" ? 1 : 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return {
      label: d.toLocaleDateString("ko-KR", {
        month: "numeric",
        day: "numeric",
      }),
      count: events.filter(
        (e) => new Date(e.timestamp).toDateString() === d.toDateString(),
      ).length,
    };
  });
  const max = Math.max(1, ...days.map((d) => d.count));
  const stageGroups=reportStageGroups(works);
  function report() {
    downloadBlob(
      "FlowMES_업무리포트.csv",
      new Blob(
        [
          csv([
            [
              "집계 시작",
              start.toLocaleDateString("ko-KR"),
              "집계 종료",
              today.toLocaleDateString("ko-KR"),
            ],
            [
              "업무",
              "업무명",
              "담당자",
              "워크플로우",
              "현재 단계",
              "상태",
              "진행률",
            ],
            ...works.map((w) => [
              w.id,
              w.title,
              w.owner,
              w.template,
              currentStage(w).name,
              workStatus(w),
              getProgress(w) + "%",
            ]),
          ]),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    notify("현재 필터의 리포트를 다운로드했습니다.");
  }
  function improvement() {
    downloadBlob(
      "FlowMES_assistant_개선자료.json",
      new Blob(
        [
          JSON.stringify(
            {
              kind: "demo-assistant-improvement-packet",
              period: { from: start.toISOString(), to: today.toISOString() },
              filters: { person, flow },
              works,
              events,
              artifacts: state.artifacts.filter((a) =>
                works.some((w) => w.id === a.workId),
              ),
              note: "사용자 검토용. 업로드 파일은 메타데이터만 포함하며 파일 본문은 보관함에서 별도 다운로드합니다. 자동 skill 업데이트는 수행하지 않습니다.",
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    notify("대화·체크리스트·재작업 이력과 자료 목록을 내보냈습니다.");
  }
  const bottlenecks = works
    .filter((w) => getProgress(w) < 100)
    .map((w) => ({
      work: w,
      stage: currentStage(w),
      unchecked: currentStage(w).checklist.filter((c) => !c.done).length,
    }))
    .sort((a, b) => b.unchecked - a.unchecked);
  return (
    <>
      <SectionTitle
        eyebrow="MAKE EVERY FLOW BETTER"
        title="인사이트 · 리포트"
        description="선택한 참여자의 활동과 관련 업무를 집계합니다. 업무 소유자가 달라도 참여 기록이 있으면 포함됩니다."
      >
        <button className="button" onClick={improvement}>
          <Sparkles size={16} />
          Assistant 개선 자료
        </button>
        <button className="button primary" onClick={report}>
          <Download size={16} />
          리포트 다운로드
        </button>
      </SectionTitle>
      <div className="report-filters">
        <div className="period-toggle">
          <button
            className={period === "day" ? "active" : ""}
            onClick={() => setPeriod("day")}
          >
            일별
          </button>
          <button
            className={period === "week" ? "active" : ""}
            onClick={() => setPeriod("week")}
          >
            주별
          </button>
        </div>
        <span>
          <CalendarDays size={16} />
          {formatDate(start.toISOString())} — {formatDate(today.toISOString())}
        </span>
        <div className="report-filter-right">
          <select
            aria-label="리포트 참여자"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
          >
            {["전체 담당자", ...new Set([...state.works.map((w) => w.owner),...state.events.map(e=>e.actor)])].map(
              (p) => (
                <option key={p}>{p}</option>
              ),
            )}
          </select>
          <select
            aria-label="리포트 워크플로우"
            value={flow}
            onChange={(e) => setFlow(e.target.value)}
          >
            {[
              "전체 워크플로우",
              ...new Set(state.works.map((w) => w.template)),
            ].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="stats-grid report-stats">
        {[
          {
            name: "활동이 있는 업무",
            value: works.length,
            unit: "건",
            icon: Workflow,
          },
          {
            name: "현재 완료된 업무",
            value: completed.length,
            unit: "건",
            icon: Check,
          },
          {
            name: "기록된 작업 활동",
            value: events.length,
            unit: "회",
            icon: Activity,
          },
          {
            name: "되돌리기 · 재검토",
            value: rework.length,
            unit: "회",
            icon: GitBranch,
          },
        ].map((c) => (
          <div className="stat-card" key={c.name}>
            <div>
              <span className="stat-label">{c.name}</span>
              <c.icon size={18} />
            </div>
            <strong>
              {c.value}
              <small>{c.unit}</small>
            </strong>
            <p>선택한 기간 및 조건 기준</p>
          </div>
        ))}
      </div>
      <div className="report-charts">
        <section className="chart-card">
          <div className="section-heading">
            <div>
              <h2>업무 활동 추이</h2>
              <p>대화, 자료 연결, 체크리스트와 단계 변경</p>
            </div>
            <span className="chart-legend">
              <i />
              기록된 활동
            </span>
          </div>
          <div className="bar-chart">
            {days.map((d) => (
              <div className="bar-column" key={d.label}>
                <span>{d.count}</span>
                <div className="bar-track">
                  <div style={{ height: `${(d.count / max) * 100}%` }} />
                </div>
                <small>{d.label}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="chart-card">
          <div className="section-heading">
            <div>
              <h2>단계별 진행 현황</h2>
              <p>선택 조건 내 미완료 업무의 현재 위치</p>
            </div>
          </div>
          <div className="horizontal-bars">
            {stageGroups.map(({id,short,count,manual}) => {
              return (
                <div key={id}>
                  <span>{short}</span>
                  <div>
                    <i
                      className={manual ? "manual" : ""}
                      style={{
                        width: `${(count / Math.max(1, works.filter((w) => getProgress(w) < 100).length)) * 100}%`,
                      }}
                    />
                  </div>
                  <strong>
                    {count}
                    <small>건</small>
                  </strong>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <section className="task-section report-observations">
        <div className="section-heading">
          <div>
            <h2>
              <Sparkles size={18} />
              함께 살펴볼 업무
            </h2>
            <p>
              미완료 체크리스트가 많은 순서입니다. 지연 원인 확정에는 담당자
              확인이 필요합니다.
            </p>
          </div>
          <Badge tone="neutral">규칙 기반 분석</Badge>
        </div>
        {bottlenecks.length ? (
          bottlenecks.slice(0, 5).map(({ work, stage, unchecked }) => (
            <button
              className="observation-row"
              key={work.id}
              onClick={() => navigate("/work/" + work.id + "/" + stage.id)}
            >
              <span className="observation-icon">
                <ClipboardIcon />
              </span>
              <div>
                <strong>{work.title}</strong>
                <p>
                  {stage.name} · 확인할 항목 {unchecked}개 · 담당자 {work.owner}
                </p>
              </div>
              <Badge
                tone={workStatus(work) === "검토 필요" ? "amber" : "green"}
              >
                {workStatus(work)}
              </Badge>
              <ArrowUpRight size={17} />
            </button>
          ))
        ) : (
          <Empty
            title="확인이 필요한 업무가 없습니다"
            description="기간이나 담당자 필터를 변경해 다른 업무를 확인할 수 있습니다."
          />
        )}
      </section>
      <p className="page-disclaimer">
        업무 집계는 기간 내 생성 또는 활동이 있고 담당자·워크플로우 조건에 맞는
        업무 기준입니다. 활동 수는 수행자 기준이며, 이 데이터로 실제
        소요시간이나 생산성 향상을 단정하지 않습니다.
      </p>
    </>
  );
}
function ClipboardIcon() {
  return <FileText size={18} />;
}
