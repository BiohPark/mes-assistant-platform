import { useState } from "react";
import { GripVertical, LayoutGrid, Columns3, Search } from "lucide-react";
import { useHub } from "./store";
import { Avatar, Modal, statusLabels } from "./ui";
import { orderedAgents, workTags, activityOrder } from "./hub";
import { agentStatusLabels } from "./Gallery";
import { AgentAdmin } from "./AgentAdmin";
import type { Agent, WorkItem, WorkStatus } from "./types";
import "./catalog.css";
import "./hub.css";

function Multi({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <details className="multi-filter">
      <summary>
        {label}
        {selected.length ? ` · ${selected.length}` : " · 전체"}
      </summary>
      <div>
        {values.map((v) => (
          <label key={v}>
            <input
              type="checkbox"
              checked={selected.includes(v)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, v]
                    : selected.filter((x) => x !== v),
                )
              }
            />
            {v}
          </label>
        ))}
      </div>
    </details>
  );
}
export function WorkStatusMenu({ work }: { work: WorkItem }) {
  const { dispatch } = useHub();
  return (
    <select
      aria-label={work.title + " 상태"}
      value={work.status}
      onChange={async (e) => {
        const status = e.target.value as WorkStatus;
        const need =
          work.status === "done" ||
          (status === "done" && work.checks.some((c) => !c.done));
        const reason = need
          ? prompt(
              work.status === "done"
                ? "다시 여는 사유"
                : "미완료 체크리스트가 있습니다. 완료 사유",
            )
          : "";
        if (need && !reason?.trim()) return;
        await dispatch({
          type: "work.status",
          workId: work.id,
          status,
          reason: reason ?? "",
        });
      }}
    >
      {Object.entries(statusLabels).map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}
export function HubHome() {
  const { state: s, dispatch, notify } = useHub();
  const preferenceKey = "mes-hub-view-v3-" + s.session.userId;
  const [prefs, setPrefs] = useState<{
    mode: "cards" | "board";
    collapsed: string[];
    hideEmpty: boolean;
  }>(() => {
    try {
      return (
        JSON.parse(localStorage.getItem(preferenceKey) || "null") ?? {
          mode: "cards",
          collapsed: [],
          hideEmpty: false,
        }
      );
    } catch {
      return { mode: "cards", collapsed: [], hideEmpty: false };
    }
  });
  const updatePrefs = (v: Partial<typeof prefs>) => {
    const next = { ...prefs, ...v };
    setPrefs(next);
    localStorage.setItem(preferenceKey, JSON.stringify(next));
  };
  const [query, setQuery] = useState(""),
    [lv1, setLv1] = useState<string[]>([]),
    [lv2, setLv2] = useState<string[]>([]),
    [status, setStatus] = useState("available");
  const [workStatus, setWorkStatus] = useState(""),
    [owner, setOwner] = useState(""),
    [tag, setTag] = useState(""),
    [archived, setArchived] = useState(false);
  const [draft, setDraft] = useState<{ ids: string[]; revision: number }>(),
    [drag, setDrag] = useState(""),
    [editing, setEditing] = useState<string>(),
    [detail, setDetail] = useState<Agent>();
  const ordered = orderedAgents(s),
    all = draft
      ? draft.ids.flatMap((id) => s.agents.find((a) => a.id === id) ?? [])
      : ordered;
  const agents = all.filter(
    (a) =>
      !!draft ||
      ((status === "all" ||
        (status === "available"
          ? a.status !== "retired"
          : a.status === status)) &&
        (!lv1.length || lv1.includes(a.lv1)) &&
        (!lv2.length || lv2.includes(a.lv2)) &&
        (prefs.mode === "board" ||
          [
            a.name,
            a.summary,
            a.lv1,
            a.lv2,
            s.users.find((u) => u.id === a.owner)?.name,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()))),
  );
  const works = s.works
    .filter(
      (w) =>
        w.archived === archived &&
        (!workStatus || w.status === workStatus) &&
        (!owner || w.owner === owner) &&
        (!tag || workTags(s, w.id).some((t) => t.id === tag)) &&
        [
          w.title,
          w.description,
          s.agents.find((a) => a.id === w.agentId)?.name,
          ...workTags(s, w.id).map((t) => t.label),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(activityOrder);
  function move(source: string, target: string) {
    if (!draft || source === target) return;
    const ids = draft.ids.filter((id) => id !== source);
    ids.splice(ids.indexOf(target), 0, source);
    setDraft({ ...draft, ids });
  }
  return (
    <div className="page hub-home">
      <div className="catalog-intro">
        <span className="eyebrow">MES AGENT HUB</span>
        <h1>대화로 시작하고, 자료로 연결하세요.</h1>
        <p className="muted">
          필요한 에이전트와 바로 대화하세요. 각 업무는 독립적으로 진행됩니다.
        </p>
      </div>
      <div className="hub-viewbar">
        <div className="view-toggle">
          <button
            aria-pressed={prefs.mode === "cards"}
            className={prefs.mode === "cards" ? "selected" : ""}
            onClick={() => updatePrefs({ mode: "cards" })}
          >
            <LayoutGrid size={19} />
            에이전트 카드
          </button>
          <button
            aria-pressed={prefs.mode === "board"}
            className={prefs.mode === "board" ? "selected" : ""}
            onClick={() => {
              setDraft(undefined);
              updatePrefs({ mode: "board" });
            }}
          >
            <Columns3 size={19} />
            전체 업무 칸반
          </button>
        </div>
        {s.session.role === "admin" &&
          prefs.mode === "cards" &&
          (draft ? (
            <div className="row">
              <button onClick={() => setDraft(undefined)}>순서 취소</button>
              <button
                className="primary"
                onClick={async () => {
                  if (
                    await dispatch({
                      type: "catalog.order",
                      agentIds: draft.ids,
                      expectedRevision: draft.revision,
                    })
                  ) {
                    setDraft(undefined);
                    notify("공통 순서를 저장했습니다.");
                  }
                }}
              >
                순서 저장
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setQuery("");
                setLv1([]);
                setLv2([]);
                setStatus("all");
                setDraft({
                  ids: ordered.map((a) => a.id),
                  revision: s.catalogOrders?.[0]?.revision ?? 0,
                });
              }}
            >
              SO 편집 모드
            </button>
          ))}
      </div>
      {draft ? (
        <p className="selection-bar">
          전체 목록 편집 · 핸들을 끌어 순서를 변경하거나 카드를 눌러 설정을
          편집하세요. 방향키 버튼으로도 이동할 수 있습니다.
        </p>
      ) : (
        <div className="toolbar catalog-toolbar">
          <label className="catalog-search">
            <Search size={17} />
            <input
              aria-label="전체 검색"
              placeholder="이름·설명·업무 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <Multi
            label="업무 Lv1"
            values={[...new Set(all.map((a) => a.lv1))]}
            selected={lv1}
            onChange={(v) => {
              setLv1(v);
              setLv2(
                lv2.filter((x) =>
                  all.some(
                    (a) => (!v.length || v.includes(a.lv1)) && a.lv2 === x,
                  ),
                ),
              );
            }}
          />
          <Multi
            label="업무 Lv2"
            values={[
              ...new Set(
                all
                  .filter((a) => !lv1.length || lv1.includes(a.lv1))
                  .map((a) => a.lv2),
              ),
            ]}
            selected={lv2}
            onChange={setLv2}
          />
          <select
            aria-label="에이전트 상태"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="available">폐기 제외</option>
            <option value="all">모든 에이전트</option>
            {Object.entries(agentStatusLabels).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}
      {prefs.mode === "cards" ? (
        <>
          <div className="catalog-section-head">
            <h2>
              에이전트 <span className="muted">{agents.length}</span>
            </h2>
            <span className="muted">
              카드를 선택하면 바로 대화할 수 있습니다
            </span>
          </div>
          <div className="agent-grid">
            {agents.map((a, index) => (
              <article
                className="agent-card"
                key={a.id}
                onDragOver={(e) => {
                  if (draft) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  move(drag, a.id);
                }}
              >
                {draft && (
                  <div className="order-handle">
                    <button
                      draggable
                      aria-label={a.name + " 순서 이동"}
                      onDragStart={() => setDrag(a.id)}
                    >
                      <GripVertical size={18} />
                      이동
                    </button>
                    <button
                      disabled={index === 0}
                      aria-label={a.name + " 앞으로"}
                      onClick={() => move(a.id, agents[index - 1].id)}
                    >
                      ←
                    </button>
                    <button
                      disabled={index === agents.length - 1}
                      aria-label={a.name + " 뒤로"}
                      onClick={() => move(agents[index + 1].id, a.id)}
                    >
                      →
                    </button>
                  </div>
                )}
                <button
                  className="agent-card-main"
                  onClick={() =>
                    draft
                      ? setEditing(a.id)
                      : (location.hash = "#/agent/" + a.id)
                  }
                >
                  <div className="agent-card-top">
                    <Avatar agent={a} size={52} />
                    <span className={"badge agent-status-" + a.status}>
                      {agentStatusLabels[a.status]}
                    </span>
                  </div>
                  <div className="agent-classification">
                    {a.lv1} / {a.lv2}
                  </div>
                  <h3>{a.name}</h3>
                  <p className="agent-summary">{a.summary}</p>
                  <div className="row agent-owner">
                    <span>
                      {s.users.find((u) => u.id === a.owner)?.name || "미설정"}
                    </span>
                    {a.intake && <span className="badge">SR 접수</span>}
                  </div>
                  <div className="agent-card-foot">
                    <span>
                      진행 중 업무{" "}
                      <strong>
                        {
                          s.works.filter(
                            (w) =>
                              w.agentId === a.id &&
                              !w.archived &&
                              w.status !== "done",
                          ).length
                        }
                      </strong>
                    </span>
                    <span>대화 시작 ↗</span>
                  </div>
                </button>
                <div className="agent-card-actions">
                  <button onClick={() => setDetail(a)}>설명 보기</button>
                  {a.link1 && (
                    <a href={a.link1} target="_blank" rel="noreferrer">
                      외부 assistant ↗
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="toolbar board-controls">
            <select
              aria-label="에이전트 열 점프"
              defaultValue=""
              onChange={(e) => {
                updatePrefs({
                  collapsed: prefs.collapsed.filter(
                    (x) => x !== e.target.value,
                  ),
                });
                document
                  .getElementById("column-" + e.target.value)
                  ?.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                    inline: "start",
                  });
              }}
            >
              <option value="">에이전트 열 점프</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              aria-label="업무 상태 필터"
              value={workStatus}
              onChange={(e) => setWorkStatus(e.target.value)}
            >
              <option value="">모든 업무 상태</option>
              {Object.entries(statusLabels).map(([id, label]) => (
                <option value={id} key={id}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="담당자 필터"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            >
              <option value="">모든 담당자</option>
              {s.users.map((u) => (
                <option value={u.id} key={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <select
              aria-label="태그 필터"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            >
              <option value="">모든 태그</option>
              {s.tags?.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.kind === "sr" ? "SR · " : "#"}
                  {t.label}
                </option>
              ))}
            </select>
            <label>
              <input
                type="checkbox"
                checked={prefs.hideEmpty}
                onChange={(e) => updatePrefs({ hideEmpty: e.target.checked })}
              />
              빈 열 숨기기
            </label>
            <label>
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
              />
              보관 업무
            </label>
          </div>
          <div className="agent-kanban">
            {agents
              .filter(
                (a) =>
                  !prefs.hideEmpty || works.some((w) => w.agentId === a.id),
              )
              .map((a) => {
                const collapsed = prefs.collapsed.includes(a.id),
                  items = works.filter((w) => w.agentId === a.id);
                return (
                  <section
                    id={"column-" + a.id}
                    key={a.id}
                    className={"agent-column " + (collapsed ? "collapsed" : "")}
                  >
                    <header>
                      <Avatar agent={a} size={30} />
                      <strong>{a.name}</strong>
                      <span>{items.length}</span>
                      <button
                        aria-label={
                          a.name + (collapsed ? " 열 펼치기" : " 열 접기")
                        }
                        onClick={() =>
                          updatePrefs({
                            collapsed: collapsed
                              ? prefs.collapsed.filter((x) => x !== a.id)
                              : [...prefs.collapsed, a.id],
                          })
                        }
                      >
                        {collapsed ? "＋" : "−"}
                      </button>
                    </header>
                    {!collapsed && (
                      <>
                        <a className="column-new" href={"#/agent/" + a.id}>
                          + 새 대화
                        </a>
                        {items.map((w) => {
                          const tags = workTags(s, w.id),
                            sr = tags.find((t) => t.kind === "sr");
                          return (
                            <article
                              className="conversation-card"
                              key={w.id}
                              style={{
                                borderLeftColor: sr?.color || "#d7dfdc",
                              }}
                            >
                              <a
                                className="conversation-title"
                                href={"#/work/" + w.id}
                              >
                                {w.title}
                              </a>
                              <p>
                                {w.description ||
                                  "대화와 자료를 이어서 확인하세요."}
                              </p>
                              <div className="row wrap">
                                {tags.map((t) => (
                                  <span
                                    className="chip"
                                    key={t.id}
                                    style={{ borderColor: t.color }}
                                  >
                                    {t.kind === "sr" ? "" : "#"}
                                    {t.label}
                                  </span>
                                ))}
                              </div>
                              <div className="conversation-meta">
                                {s.users.find((u) => u.id === w.owner)?.name} ·{" "}
                                {new Date(w.updatedAt).toLocaleDateString()}
                                <br />
                                체크 {w.checks.filter((c) => c.done).length}/
                                {w.checks.length} · 자료{" "}
                                {w.inputIds.length + w.outputIds.length} ·
                                메시지{" "}
                                {
                                  s.messages.filter(
                                    (m) => m.threadId === w.activeThreadId,
                                  ).length
                                }
                              </div>
                              <WorkStatusMenu work={w} />
                            </article>
                          );
                        })}
                        {!items.length && (
                          <p className="empty">아직 대화가 없습니다.</p>
                        )}
                      </>
                    )}
                  </section>
                );
              })}
          </div>
        </>
      )}
      {detail && (
        <Modal title={detail.name} onClose={() => setDetail(undefined)}>
          <p>{detail.summary}</p>
          <h3>사용 예시 · 입력 안내</h3>
          {detail.examples.map((ex) => (
            <p key={ex}>{ex}</p>
          ))}
          <p className="muted">
            자료 예시는 안내이며 필수 제출 조건이 아닙니다.
          </p>
          {detail.link2 && (
            <a href={detail.link2} target="_blank" rel="noreferrer">
              설명서 ↗
            </a>
          )}
          <button
            className="primary"
            onClick={() => (location.hash = "#/agent/" + detail.id)}
          >
            바로 대화
          </button>
        </Modal>
      )}
      {editing && (
        <AgentAdmin
          key={editing}
          initialAgentId={editing}
          embedded
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
