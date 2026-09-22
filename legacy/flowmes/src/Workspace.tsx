import { TaskChat } from "./TaskChat";
import { resolveModel } from "./workflow";
import { useState, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  Download,
  ExternalLink,
  FilePlus2,
  FileText,
  FolderInput,
  GitBranch,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  SkipForward,
  Sparkles,
  StickyNote,
  Upload,
  X,
} from "lucide-react";
import { useStore, navigate } from "./store";
import {
  currentStage,
  getProgress,
  event,
  now,
  uid,
  transitionWork,
} from "./domain";
import {
  Avatar,
  Badge,
  CheckRow,
  Empty,
  FileCard,
  Modal,
  AssistantMark,
  formatDate,
  formatTime,
  statusLabel,
  statusTone,
} from "./ui";
import type { Stage, Work } from "./types";
import { StageEditor } from "./Pages";
export function Workspace({
  workId,
  stageId,
  onSettings,
}: {
  workId: string;
  stageId?: string;
  onSettings: () => void;
}) {
  const { state, notify } = useStore();
  const [edit, setEdit] = useState(false);
  const work = state.works.find((w) => w.id === workId);
  if (!work)
    return (
      <Empty
        title="업무를 찾을 수 없습니다"
        description="업무 목록에서 다시 선택해 주세요."
      >
        <button className="button" onClick={() => navigate("/tasks")}>
          업무 목록
        </button>
      </Empty>
    );
  const stage = work.stages.find((s) => s.id === stageId) || currentStage(work);
  async function copyLink() {
    const url =
      location.origin + location.pathname + "#/work/" + workId + "/" + stage.id;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        notify("현재 단계로 바로 연결되는 링크를 복사했습니다.");
        return;
      }
    } catch {}
    try {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      notify("현재 단계로 바로 연결되는 링크를 복사했습니다.");
    } catch {
      notify("주소 표시줄의 링크를 복사해 주세요.");
    }
  }
  function external() {
    if (!state.externalUrl || !work?.externalId) {
      onSettings();
      notify("외부 업무시스템 URL 템플릿과 업무 ID를 설정해 주세요.");
      return;
    }
    try {
      const url = new URL(
        state.externalUrl.replace("{id}", encodeURIComponent(work.externalId)),
      );
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
      window.open(url.href, "_blank", "noopener,noreferrer");
    } catch {
      notify("외부 시스템 URL을 확인해 주세요.");
    }
  }
  return (
    <>
      <div className="work-heading">
        <button className="back-button" onClick={() => navigate("/tasks")}>
          <ArrowLeft size={15} />
          전체 업무
        </button>
        <div className="work-heading-row">
          <div>
            <div className="work-meta">
              <span>{work.id}</span>
              <span>·</span>
              <span>{work.system}</span>
              <Badge tone={getProgress(work) === 100 ? "neutral" : "green"}>
                {getProgress(work) === 100 ? "업무 완료" : "진행 중"}
              </Badge>
            </div>
            <h1>{work.title}</h1>
          </div>
          <div className="heading-actions">
            <button className="button" onClick={copyLink}>
              <Link2 size={15} />
              링크 복사
            </button>
            <button className="button" onClick={external}>
              <ExternalLink size={15} />
              {work.externalId || "외부 업무 연결"}
            </button>
          </div>
        </div>
        <div className="work-detail-meta">
          <Avatar name={work.owner} small />
          <span>{work.owner}</span>
          <span className="dot-separator">·</span>
          <span>목표일 {formatDate(work.due)}</span>
          <span className="dot-separator">·</span>
          <span>{work.template}</span>
          <button onClick={() => setEdit(true)}>
            <Settings2 size={14} />
            워크플로우 편집
          </button>
        </div>
      </div>
      <div className="workflow-strip">
        <div className="flow-label">
          <span>
            <GitBranch size={15} />
            WORKFLOW
          </span>
          <span>
            {
              work.stages.filter(
                (s) => s.status === "done" || s.status === "skipped",
              ).length
            }{" "}
            / {work.stages.length} 단계 완료 <b>{getProgress(work)}%</b>
          </span>
        </div>
        <div className="stage-steps">
          {work.stages.map((s, i) => (
            <div className="step-wrap" key={s.id}>
              <button
                className={`stage-step ${s.status} ${s.mode} ${s.id === stage.id ? "selected" : ""}`}
                onClick={() => navigate("/work/" + work.id + "/" + s.id)}
              >
                <span className="step-number">
                  {s.status === "done" ? (
                    <Check size={14} />
                  ) : s.status === "skipped" ? (
                    <SkipForward size={13} />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="step-description">
                  <strong>{s.name}</strong>
                  <small>
                    {s.mode === "manual" ? "수동 작업" : s.short + " Assistant"}
                  </small>
                </span>
                {s.id === stage.id && <span className="step-live" />}
              </button>
              {i < work.stages.length - 1 && (
                <ChevronRight className="step-arrow" size={16} />
              )}
            </div>
          ))}
        </div>
      </div>
      <StageSpace key={stage.id} work={work} stage={stage} />
      {edit && <StageEditor workId={work.id} onClose={() => setEdit(false)} />}
    </>
  );
}
function StageSpace({ work, stage }: { work: Work; stage: Stage }) {
  const { state, update, upload, notify } = useStore();
  const [tab, setTab] = useState("conversation"),
    [transition, setTransition] = useState<"next" | "skip" | "back" | "reopen" | null>(
      null,
    ),
    [manage, setManage] = useState(false),
    [selectFiles, setSelectFiles] = useState(false),
    [newCheck, setNewCheck] = useState(""),
    [addingCheck, setAddingCheck] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null),
    uploadOutput = useRef<HTMLInputElement>(null);
  const stageUpdate = (
    change: (st: Stage) => Stage,
    action: string,
    detail: string,
  ) =>
    update((s) => {
      const latest = s.works
        .find((w) => w.id === work.id)
        ?.stages.find((st) => st.id === stage.id);
      if (
        !latest ||
        (action.startsWith("체크리스트") &&
          (latest.status === "done" || latest.status === "skipped"))
      )
        return s;
      return {
        ...s,
        works: s.works.map((w) =>
          w.id === work.id
            ? {
                ...w,
                stages: w.stages.map((st) =>
                  st.id === stage.id ? change(st) : st,
                ),
              }
            : w,
        ),
        events: [event(s, work.id, stage.id, action, detail), ...s.events],
      };
    });
  const files = (ids: string[]) =>
    state.artifacts.filter((a) => ids.includes(a.id));
  const checks = stage.checklist.filter((c) => c.done).length;
  const history = state.events.filter(
    (e) => e.workId === work.id && e.stageId === stage.id,
  );
  return (
    <div className="stage-space">
      <aside className="materials-panel">
        <div className="panel-heading">
          <h3>
            <FolderInput size={17} />
            작업 자료
          </h3>
          <span>{stage.inputs.length + stage.outputs.length}</span>
        </div>
        <div className="material-section">
          <div className="subheading">
            <h4>
              입력 자료 <span>{stage.inputs.length}</span>
            </h4>
            <button
              className="icon-button"
              aria-label="입력 자료 추가"
              onClick={() => setSelectFiles(true)}
            >
              <Plus size={16} />
            </button>
          </div>
          <p className="panel-hint">이 단계의 assistant에 제공할 자료</p>
          {files(stage.inputs).map((a) => (
            <FileCard
              key={a.id}
              artifact={a}
              compact
              onRemove={() =>
                stageUpdate(
                  (st) => ({
                    ...st,
                    inputs: st.inputs.filter((id) => id !== a.id),
                  }),
                  "입력 연결 해제",
                  a.name,
                )
              }
            />
          ))}
          {!stage.inputs.length && (
            <p className="small-empty">연결된 입력 자료가 없습니다.</p>
          )}
          <button
            className="upload-zone"
            onClick={() => uploadInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void upload(e.dataTransfer.files, work.id, stage.id, "inputs");
            }}
          >
            <Upload size={17} />
            <span>
              파일을 끌어놓거나 <b>업로드</b>
            </span>
            <small>문서, 이미지 등 · 파일당 25MB</small>
          </button>
          <input
            ref={uploadInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files)
                void upload(e.target.files, work.id, stage.id, "inputs");
              e.target.value = "";
            }}
          />
        </div>
        <div className="material-section">
          <div className="subheading">
            <h4>
              산출물 <span>{stage.outputs.length}</span>
            </h4>
            <button
              className="icon-button"
              aria-label="산출물 업로드"
              onClick={() => uploadOutput.current?.click()}
            >
              <Plus size={16} />
            </button>
          </div>
          <p className="panel-hint">검토 후 다음 단계로 전달할 결과</p>
          {files(stage.outputs).map((a) => (
            <FileCard key={a.id} artifact={a} compact />
          ))}
          {!stage.outputs.length && (
            <div className="output-empty">
              <FileText size={24} />
              <p>완성된 자료를 여기에 모아주세요.</p>
            </div>
          )}
          <button
            className="button full subtle"
            onClick={() => uploadOutput.current?.click()}
          >
            <FilePlus2 size={15} />
            산출물 추가
          </button>
          <input
            ref={uploadOutput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files)
                void upload(e.target.files, work.id, stage.id, "outputs");
              e.target.value = "";
            }}
          />
        </div>
        <div className="material-tip">
          <Link2 size={17} />
          <div>
            <strong>맥락이 이어지는 자료</strong>
            <p>
              원본과 버전이 유지된 채로
              <br />
              다음 단계의 입력에 연결됩니다.
            </p>
          </div>
        </div>
      </aside>
      <section
        className={`conversation-panel ${stage.mode === "manual" ? "manual-panel" : ""}`}
      >
        <div className="conversation-heading">
          <div>
            {stage.mode === "assistant" ? (
              <AssistantMark small />
            ) : (
              <span className="manual-mark">
                <Pencil size={16} />
              </span>
            )}
            <div>
              <h3>
                {stage.mode === "assistant"
                  ? stage.assistant
                  : stage.name + " · 수동 작업"}
              </h3>
              <small>
                {stage.mode === "assistant"
                  ? "Task 기본 · " +
                    resolveModel(state, stage) +
                    (state.connection?.mode === "api"
                      ? " · 사내 API"
                      : " · 샘플 응답")
                  : "담당자가 직접 진행하고 근거를 남기는 단계"}
              </small>
            </div>
          </div>
          <Badge tone={statusTone[stage.status]}>
            {statusLabel[stage.status]}
          </Badge>
        </div>
        <div className="conversation-tabs">
          <button
            className={tab === "conversation" ? "active" : ""}
            onClick={() => setTab("conversation")}
          >
            {stage.mode === "assistant" ? (
              <MessageSquare size={15} />
            ) : (
              <Pencil size={15} />
            )}{" "}
            {stage.mode === "assistant" ? "대화" : "작업 메모"}
            {stage.mode === "assistant" && <span>{stage.messages.length}</span>}
          </button>
          <button
            className={tab === "notes" ? "active" : ""}
            onClick={() => setTab("notes")}
          >
            <StickyNote size={15} />
            메모<span>{stage.notes.length}</span>
          </button>
          <button
            className={tab === "history" ? "active" : ""}
            onClick={() => setTab("history")}
          >
            <Clock3 size={15} />
            활동 이력
          </button>
        </div>
        {tab === "history" ? (
          <div className="stage-history">
            {history.length ? (
              history.map((e) => (
                <div className="timeline-item" key={e.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{e.action}</strong>
                    <p>{e.detail}</p>
                    <small>
                      {e.actor} · {formatDate(e.timestamp)}{" "}
                      {formatTime(e.timestamp)}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <Empty
                title="아직 활동 이력이 없습니다"
                description="대화, 자료 추가, 체크리스트와 단계 변경이 이곳에 기록됩니다."
              />
            )}
          </div>
        ) : tab === "notes" || stage.mode === "manual" ? (
          <Notes stage={stage} work={work} />
        ) : (
          <TaskChat key={stage.id} work={work} stage={stage} />
        )}
      </section>
      <aside className="checklist-panel">
        <div className="panel-heading">
          <h3>
            <ClipboardList size={17} />
            단계 체크리스트
          </h3>
          <span>
            {checks}/{stage.checklist.length}
          </span>
        </div>
        <div className="checklist-content">
          <p className="panel-hint">다음 단계로 넘어가기 전 확인해 주세요.</p>
          <div className="check-progress">
            <div
              style={{
                width: `${stage.checklist.length ? (checks / stage.checklist.length) * 100 : 0}%`,
              }}
            />
          </div>
          {stage.checklist.map((c) => (
            <CheckRow
              key={c.id}
              label={c.label}
              checked={c.done}
              disabled={stage.status === "done" || stage.status === "skipped"}
              onChange={() =>
                stageUpdate(
                  (st) => ({
                    ...st,
                    checklist: st.checklist.map((ch) =>
                      ch.id === c.id ? { ...ch, done: !ch.done } : ch,
                    ),
                  }),
                  c.done ? "체크리스트 해제" : "체크리스트 완료",
                  c.label,
                )
              }
            />
          ))}
          {addingCheck &&
          stage.status !== "done" &&
          stage.status !== "skipped" ? (
            <form
              className="inline-add"
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  !newCheck.trim() ||
                  stage.status === "done" ||
                  stage.status === "skipped"
                )
                  return;
                stageUpdate(
                  (st) => ({
                    ...st,
                    checklist: [
                      ...st.checklist,
                      { id: uid(), label: newCheck.trim(), done: false },
                    ],
                  }),
                  "체크리스트 추가",
                  newCheck.trim(),
                );
                setNewCheck("");
                setAddingCheck(false);
              }}
            >
              <input
                aria-label="체크리스트 항목"
                value={newCheck}
                onChange={(e) => setNewCheck(e.target.value)}
                placeholder="확인할 항목"
                autoFocus
              />
              <button className="icon-button" aria-label="체크리스트 저장">
                <Check size={15} />
              </button>
            </form>
          ) : (
            <button
              className="add-check"
              disabled={stage.status === "done" || stage.status === "skipped"}
              title="완료 단계는 되돌린 후 체크리스트를 수정할 수 있습니다"
              onClick={() => setAddingCheck(true)}
            >
              <Plus size={14} />
              항목 추가
            </button>
          )}
          <div className="check-info">
            <ShieldCheck size={16} />
            <p>
              단계 완료 여부는 담당자가
              <br />
              체크리스트를 기반으로 판단합니다.
            </p>
          </div>
        </div>
        <div className="stage-summary">
          <div className="subheading">
            <h4>작업 정보</h4>
          </div>
          <dl>
            <div>
              <dt>담당자</dt>
              <dd>
                <Avatar name={work.owner} small />
                {work.owner}
              </dd>
            </div>
            <div>
              <dt>진행 방식</dt>
              <dd>{stage.mode === "manual" ? "수동" : "Assistant"}</dd>
            </div>
            <div>
              <dt>Task ID</dt>
              <dd className="mono">{stage.id.slice(0, 12)}</dd>
            </div>
            <div>
              <dt>메시지</dt>
              <dd>{stage.messages.length}개</dd>
            </div>
          </dl>
        </div>
        <div className="stage-next">
          <p>
            {checks === stage.checklist.length
              ? "모든 확인 항목을 완료했습니다."
              : `완료까지 ${stage.checklist.length - checks}개 항목이 남았어요.`}
          </p>
          <button
            className="button primary full"
            disabled={!["active", "review"].includes(stage.status)}
            onClick={() => setTransition("next")}
          >
            {work.stages.at(-1)?.id === stage.id
              ? "업무 완료하기"
              : "다음 단계로"}
            <ArrowRight size={16} />
          </button>
          <div className="manage-wrapper">
            <button className="manage-stage" onClick={() => setManage(!manage)}>
              단계 관리
              <ChevronDown size={14} />
            </button>
            {manage && (
              <div className="manage-menu">
                <button disabled={!["done","skipped"].includes(stage.status)} onClick={()=>{setManage(false);setTransition("reopen");}}><RotateCcw size={15}/>이 단계 다시 열기</button>
                <button
                  disabled={
                    work.stages[0].id === stage.id || stage.status === "pending"
                  }
                  onClick={() => {
                    setManage(false);
                    setTransition("back");
                  }}
                >
                  <RotateCcw size={15} />
                  이전 단계로 되돌리기
                </button>
                <button
                  disabled={!["active", "review"].includes(stage.status)}
                  onClick={() => {
                    setManage(false);
                    setTransition("skip");
                  }}
                >
                  <SkipForward size={15} />
                  현재 단계 건너뛰기
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
      {selectFiles && (
        <SelectFiles
          work={work}
          stage={stage}
          onClose={() => setSelectFiles(false)}
        />
      )}{" "}
      {transition && (
        <TransitionDialog
          work={work}
          stage={stage}
          action={transition}
          onClose={() => setTransition(null)}
        />
      )}
    </div>
  );
}
function Notes({ work, stage }: { work: Work; stage: Stage }) {
  const { state, update, notify } = useStore();
  const [text, setText] = useState("");
  return (
    <div className="notes-panel">
      {stage.mode === "manual" && (
        <div className="manual-notice">
          <Pencil size={20} />
          <div>
            <h3>담당자가 직접 진행하는 단계입니다</h3>
            <p>
              외부에서 수행한 작업 내용과 검증 근거를 남겨주세요. 파일은 왼쪽
              산출물 영역에 추가할 수 있습니다.
            </p>
          </div>
        </div>
      )}
      <form
        className="note-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          update((s) => ({
            ...s,
            works: s.works.map((w) =>
              w.id === work.id
                ? {
                    ...w,
                    stages: w.stages.map((st) =>
                      st.id === stage.id
                        ? {
                            ...st,
                            notes: [
                              {
                                id: uid(),
                                text: text.trim(),
                                actor: s.profile,
                                at: now(),
                              },
                              ...st.notes,
                            ],
                          }
                        : st,
                    ),
                  }
                : w,
            ),
            events: [
              event(
                s,
                work.id,
                stage.id,
                "메모 추가",
                text.trim().slice(0, 90),
              ),
              ...s.events,
            ],
          }));
          setText("");
          notify("메모를 저장했습니다.");
        }}
      >
        <textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="결정 사항, 작업 내용, 다음 담당자에게 전달할 메모를 남겨주세요."
          aria-label="단계 메모"
        />
        <button className="button primary" disabled={!text.trim()}>
          <Plus size={15} />
          메모 남기기
        </button>
      </form>
      {stage.notes.map((n) => (
        <article className="note-card" key={n.id}>
          <div>
            <Avatar name={n.actor} small />
            <strong>{n.actor}</strong>
            <time>
              {formatDate(n.at)} {formatTime(n.at)}
            </time>
          </div>
          <p>{n.text}</p>
        </article>
      ))}
      {stage.notes.length === 0 && (
        <div className="small-empty">아직 남겨진 메모가 없습니다.</div>
      )}
    </div>
  );
}
function SelectFiles({
  work,
  stage,
  onClose,
}: {
  work: Work;
  stage: Stage;
  onClose: () => void;
}) {
  const { state, update, notify } = useStore();
  const [selected, setSelected] = useState<string[]>([]),
    [q, setQ] = useState("");
  const available = state.artifacts.filter(
    (a) =>
      !stage.inputs.includes(a.id) &&
      !stage.outputs.includes(a.id) &&
      a.name.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <Modal
      title="입력 자료 연결"
      subtitle="이전 단계의 산출물이나 보관함의 자료를 선택하세요. 원본은 유지됩니다."
      onClose={onClose}
    >
      <input
        className="full-input"
        placeholder="파일명 검색"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="file-selection">
        {available.map((a) => (
          <label key={a.id} className="select-file">
            <input
              type="checkbox"
              checked={selected.includes(a.id)}
              onChange={() =>
                setSelected((v) =>
                  v.includes(a.id)
                    ? v.filter((id) => id !== a.id)
                    : [...v, a.id],
                )
              }
            />
            <FileText size={19} />
            <span>
              <strong>{a.name}</strong>
              <small>
                {a.workId} · v{a.version} · {a.createdBy}
              </small>
            </span>
          </label>
        ))}
        {available.length === 0 && (
          <p className="small-empty">
            연결할 수 있는 자료가 없습니다. 파일 업로드를 이용해 주세요.
          </p>
        )}
      </div>
      <div className="modal-footer">
        <button className="button" onClick={onClose}>
          취소
        </button>
        <button
          className="button primary"
          disabled={!selected.length}
          onClick={() => {
            update((s) => ({
              ...s,
              works: s.works.map((w) =>
                w.id === work.id
                  ? {
                      ...w,
                      stages: w.stages.map((st) =>
                        st.id === stage.id
                          ? {
                              ...st,
                              inputs: [...new Set([...st.inputs, ...selected])],
                            }
                          : st,
                      ),
                    }
                  : w,
              ),
              events: [
                event(
                  s,
                  work.id,
                  stage.id,
                  "입력 자료 연결",
                  `${selected.length}개 자료 연결`,
                ),
                ...s.events,
              ],
            }));
            notify(`${selected.length}개 자료를 연결했습니다.`);
            onClose();
          }}
        >
          <Link2 size={15} />
          {selected.length}개 자료 연결
        </button>
      </div>
    </Modal>
  );
}
function TransitionDialog({
  work,
  stage,
  action,
  onClose,
}: {
  work: Work;
  stage: Stage;
  action: "next" | "skip" | "back" | "reopen";
  onClose: () => void;
}) {
  const { state, update, notify } = useStore();
  const index = work.stages.findIndex((s) => s.id === stage.id);
  const [target, setTarget] = useState(
      action === "reopen" ? stage.id : action === "back"
        ? work.stages[index - 1]?.id || ""
        : work.stages[index + 1]?.id || "",
    ),
    [reason, setReason] = useState(""),
    [selected, setSelected] = useState([...stage.outputs]),
    [error, setError] = useState("");
  const title =
    action === "reopen" ? "이 단계 다시 열기" : action === "next"
      ? target
        ? "다음 단계로 전달"
        : "업무 완료하기"
      : action === "back"
        ? "이전 단계로 되돌리기"
        : "현재 단계 건너뛰기";
  return (
    <Modal
      title={title}
      subtitle={
        action === "next"
          ? "체크리스트를 확인하고 전달할 산출물을 선택하세요."
          : "변경 사유는 활동 이력에 남으며 기존 대화와 파일은 보존됩니다."
      }
      onClose={onClose}
    >
      <div className="transition-flow">
        <span>{stage.name}</span>
        <ArrowRight size={18} />
        {action === "back" ? (
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {work.stages.slice(0, index).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <strong>
            {work.stages.find((s) => s.id === target)?.name || "업무 완료"}
          </strong>
        )}
      </div>
      {action === "next" && stage.checklist.some((c) => !c.done) && (
        <div className="warning-box">
          미완료 체크리스트 {stage.checklist.filter((c) => !c.done).length}개가
          있습니다. 작업 공간에서 모두 확인해 주세요.
        </div>
      )}
      {(action === "next" || action === "skip") && target && (
        <>
          <h4 className="field-title">다음 단계에 전달할 산출물</h4>
          <div className="file-selection">
            {stage.outputs.map((id) => {
              const a = state.artifacts.find((a) => a.id === id);
              return (
                a && (
                  <CheckRow
                    key={id}
                    checked={selected.includes(id)}
                    label={a.name}
                    onChange={() =>
                      setSelected((v) =>
                        v.includes(id) ? v.filter((i) => i !== id) : [...v, id],
                      )
                    }
                  />
                )
              );
            })}
            {!stage.outputs.length && (
              <p className="small-empty">
                현재 산출물이 없습니다. 파일 전달 없이 이동합니다.
              </p>
            )}
          </div>
        </>
      )}
      {action !== "next" && (
        <label className="form-label">
          변경 사유 <span>*</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예: 비즈니스오너의 요청으로 요구사항 범위 재검토"
          />
        </label>
      )}
      {(action === "back" || action === "reopen") && (
        <div className="info-box">
          되돌아가는 단계의 체크를 초기화하고, 이미 진행한 후속 단계는 재검토로
          표시합니다.
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-footer">
        <button className="button" onClick={onClose}>
          취소
        </button>
        <button
          className="button primary"
          onClick={() => {
            try {
              const next = transitionWork(
                work,
                stage.id,
                action,
                target,
                selected,
                reason,
              );
              const actionLabel =
                action === "reopen" ? "단계 재검토 · 다시 열기" : action === "back"
                  ? "단계 되돌리기"
                  : action === "skip"
                    ? "단계 건너뛰기"
                    : target
                      ? "단계 완료 · 자료 인계"
                      : "업무 완료";
              update((s) => ({
                ...s,
                works: s.works.map((w) => (w.id === work.id ? next : w)),
                events: [
                  event(
                    s,
                    work.id,
                    stage.id,
                    actionLabel,
                    `${stage.name} → ${next.stages.find((st) => st.id === target)?.name || "완료"} · ${(action === "back" || action === "reopen") ? "" : selected.length + "개 자료"}${reason ? " · 사유: " + reason : ""}`,
                  ),
                  ...s.events,
                ],
              }));
              onClose();
              if (target) navigate("/work/" + work.id + "/" + target);
              notify(actionLabel + "를 기록했습니다.");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {action === "next" ? "확인하고 완료" : title}
          <ArrowRight size={15} />
        </button>
      </div>
    </Modal>
  );
}
