import { useState } from "react";
import {
  Plus,
  LayoutGrid,
  List,
  MessageSquare,
  Paperclip,
  CheckSquare,
  ArrowUpRight,
  ArrowLeft,
} from "lucide-react";
import { useHub } from "./store";
import { Avatar, Modal, statusLabels } from "./ui";
import type { WorkItem, WorkStatus } from "./types";
import "./catalog.css";
import { canSeeWork } from "./domain";
const statuses: WorkStatus[] = ["waiting", "active", "review", "done"];
export function WorkBoard({ agentId }: { agentId: string }) {
  const { state, dispatch, notify } = useHub();
  const agent = state.agents.find((a) => a.id === agentId);
  const [view, setView] = useState<"board" | "list">("board");
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const [owner, setOwner] = useState("");
  const [sr, setSr] = useState("");
  const [archive, setArchive] = useState("active");
  const [create, setCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(state.session.userId);
  const [manual, setManual] = useState(false);
  const [change, setChange] = useState<{
    work: WorkItem;
    status: WorkStatus;
  }>();
  const [reason, setReason] = useState("");
  if (!agent) return <div className="empty">에이전트를 찾을 수 없습니다.</div>;
  const works = state.works.filter(
    (w) =>
      canSeeWork(state, w.id) &&
      w.agentId === agentId &&
      (archive === "all" || w.archived === (archive === "archived")) &&
      (!mine || w.owner === state.session.userId) &&
      (!owner || w.owner === owner) &&
      [w.title, w.description]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!sr ||
        state.threads.some(
          (t) =>
            t.workId === w.id &&
            t.srIds.some((id) =>
              state.requests
                .find((r) => r.id === id)
                ?.number?.toLowerCase()
                .includes(sr.toLowerCase()),
            ),
        )),
  );
  function statusChange(work: WorkItem, status: WorkStatus) {
    if (status === work.status) return;
    if (work.status === "done" || status === "done") {
      setChange({ work, status });
      setReason("");
      return;
    }
    dispatch({ type: "work.status", workId: work.id, status, reason: "" });
  }
  function renderWork(w: WorkItem) {
    const threads = state.threads.filter((t) => t.workId === w.id),
      srIds = [...new Set(threads.flatMap((t) => t.srIds))],
      checks = w.checks.filter((c) => c.done).length;
    return (
      <article
        className={"board-work " + (w.manual ? "manual-work" : "")}
        draggable
        key={w.id}
        onDragStart={(e) => e.dataTransfer.setData("text/plain", w.id)}
      >
        <button
          className="work-open"
          onClick={() => (location.hash = "#/work/" + w.id)}
        >
          <div className="row">
            <span className="work-id">{w.id.slice(-8).toUpperCase()}</span>
            {w.manual && <span className="badge">수동 진행</span>}
            {w.archived && <span className="badge">보관됨</span>}
          </div>
          <h3>{w.title}</h3>
          <p className="muted work-desc">
            {w.description || "대화와 자료를 모아 업무를 이어가세요."}
          </p>
          <div className="row work-sr">
            {srIds.map((id) => (
              <span className="badge" key={id}>
                {state.requests.find((r) => r.id === id)?.number ||
                  "접수 작성중"}
              </span>
            ))}
          </div>
          <div className="work-metrics">
            <span>
              <CheckSquare size={14} />
              {checks}/{w.checks.length}
            </span>
            <span>
              <Paperclip size={14} />
              {w.inputIds.length + w.outputIds.length}
            </span>
            <span>
              <MessageSquare size={14} />
              {threads.length}
            </span>
          </div>
          <div className="work-progress">
            <i
              style={{
                width: `${w.checks.length ? (checks / w.checks.length) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="row work-meta">
            <span>
              {state.users.find((u) => u.id === w.owner)?.name || w.owner}
            </span>
            <time>
              {new Date(w.updatedAt).toLocaleDateString("ko-KR", {
                month: "short",
                day: "numeric",
              })}
            </time>
          </div>
          <div className="muted work-links">
            받은 컨텍스트{" "}
            {
              new Set(
                state.handoffs
                  .filter((h) => h.targetWorkId === w.id)
                  .map((h) => h.bundleId),
              ).size
            }{" "}
            · 전달한 업무{" "}
            {
              new Set(
                state.handoffs
                  .filter((h) => h.sourceWorkId === w.id)
                  .map((h) => h.targetWorkId),
              ).size
            }
          </div>
        </button>
        <div className="work-card-actions">
          <select
            aria-label={w.title + " 상태"}
            value={w.status}
            onChange={(e) => statusChange(w, e.target.value as WorkStatus)}
          >
            {statuses.map((s) => (
              <option value={s} key={s}>
                {statusLabels[s]}
              </option>
            ))}
          </select>
          <button
            className="btn ghost"
            onClick={() => (location.hash = "#/work/" + w.id)}
          >
            이어가기 <ArrowUpRight size={14} />
          </button>
        </div>
      </article>
    );
  }
  return (
    <div className="page">
      <button className="btn ghost" onClick={() => (location.hash = "#/")}>
        <ArrowLeft size={16} /> 에이전트 갤러리
      </button>
      <div className="page-head">
        <div className="row">
          <Avatar agent={agent} size={56} />
          <div>
            <span className="eyebrow">
              {agent.lv1} / {agent.lv2}
            </span>
            <h1>{agent.name}</h1>
            <p className="muted">{agent.summary}</p>
          </div>
        </div>
        <button
          className="btn primary"
          disabled={
            agent.status === "retired" || state.session.role === "requester"
          }
          onClick={() => setCreate(true)}
        >
          <Plus size={17} /> 새 업무
        </button>
      </div>
      {agent.status === "retired" && (
        <p className="card">
          폐기된 에이전트입니다. 기존 업무와 기록을 조회할 수 있습니다.
        </p>
      )}
      <div className="toolbar">
        <input
          aria-label="업무 검색"
          placeholder="업무 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="row">
          <input
            type="checkbox"
            checked={mine}
            onChange={(e) => setMine(e.target.checked)}
          />{" "}
          내 업무
        </label>
        <select
          aria-label="담당자 필터"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          <option value="">모든 담당자</option>
          {state.users.map((u) => (
            <option value={u.id} key={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <input
          aria-label="SR 번호 필터"
          placeholder="SR 번호"
          value={sr}
          onChange={(e) => setSr(e.target.value)}
        />
        <select
          aria-label="보관 필터"
          value={archive}
          onChange={(e) => setArchive(e.target.value)}
        >
          <option value="active">진행 업무</option>
          <option value="archived">보관 업무</option>
          <option value="all">보관 포함 전체</option>
        </select>
        <div className="view-toggle">
          <button
            aria-pressed={view === "board"}
            onClick={() => setView("board")}
          >
            <LayoutGrid size={16} /> 보드
          </button>
          <button
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List size={16} /> 목록
          </button>
        </div>
      </div>
      <div className="catalog-section-head">
        <span className="muted">
          {works.length}개 업무 · 상태별로 자유롭게 관리하세요
        </span>
        <span className="muted">카드를 끌어서 상태를 변경할 수 있습니다</span>
      </div>
      {view === "board" ? (
        <div className="work-board">
          {statuses.map((s) => (
            <section
              className={"board-column column-" + s}
              key={s}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const w = works.find(
                  (x) => x.id === e.dataTransfer.getData("text/plain"),
                );
                if (w) statusChange(w, s);
              }}
            >
              <h2>
                <span className="status-dot" />
                {statusLabels[s]}{" "}
                <span className="muted">
                  {works.filter((w) => w.status === s).length}
                </span>
              </h2>
              <div className="stack">
                {works.filter((w) => w.status === s).map(renderWork)}
              </div>
              {!works.some((w) => w.status === s) && (
                <div className="column-empty">이 상태의 업무가 없습니다</div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="work-list">
          {works.map(renderWork)}
          {!works.length && (
            <div className="empty">조건에 맞는 업무가 없습니다.</div>
          )}
        </div>
      )}
      {create && (
        <Modal title="새 업무 만들기" onClose={() => setCreate(false)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const id = crypto.randomUUID();
              if (
                dispatch({
                  type: "work.create",
                  agentId,
                  title,
                  owner: assignee,
                  manual,
                  id,
                })
              ) {
                setCreate(false);
                notify("새 업무를 만들었습니다");
                location.hash = "#/work/" + id;
              }
            }}
          >
            <label className="field">
              업무명
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 신규 설비 요구사항 정리"
              />
            </label>
            <label className="field">
              담당자
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              >
                {state.users.map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={manual}
                onChange={(e) => setManual(e.target.checked)}
              />{" "}
              수동 진행 · 메모, 자료, 체크리스트 중심
            </label>
            <p className="muted">
              {agent.name}의 기본 체크리스트가 적용됩니다.
            </p>
            <button className="btn primary">업무 만들기</button>
          </form>
        </Modal>
      )}
      {change && (
        <Modal
          title={
            change.status === "done" ? "업무 완료 확인" : "완료 업무 다시 열기"
          }
          onClose={() => setChange(undefined)}
        >
          <div className="stack">
            <p>{change.work.title}</p>
            {change.status === "done" && (
              <>
                <p>
                  체크리스트 {change.work.checks.filter((c) => c.done).length}/
                  {change.work.checks.length} 완료
                </p>
                {change.work.checks
                  .filter((c) => !c.done)
                  .map((c) => (
                    <div className="card" key={c.id}>
                      미완료 · {c.label}
                    </div>
                  ))}
              </>
            )}
            <label className="field">
              {change.status === "done"
                ? "미완료 항목이 있다면 완료 사유를 입력하세요"
                : "재개 사유 (필수)"}
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              className="btn primary"
              disabled={
                (change.work.status === "done" ||
                  change.work.checks.some((c) => !c.done)) &&
                !reason.trim()
              }
              onClick={() => {
                if (
                  dispatch({
                    type: "work.status",
                    workId: change.work.id,
                    status: change.status,
                    reason,
                  })
                )
                  setChange(undefined);
              }}
            >
              확인
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
