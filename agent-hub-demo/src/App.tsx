import { useEffect, useState } from "react";
import {
  Boxes,
  LayoutGrid,
  ClipboardList,
  Settings2,
  ChartNoAxesCombined,
  Bell,
  Plus,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { useHub } from "./store";
import { Gallery } from "./Gallery";
import { AgentAdmin } from "./AgentAdmin";
import { WorkBoard } from "./WorkBoard";
import { Workspace } from "./Workspace";
import { Modal } from "./ui";
import { uid } from "./domain";
import { downloadArtifact, saveDownload } from "./files";
import { callAssistant } from "./api";
function Requests({ intake = false }: { intake?: boolean }) {
  const { state: s, dispatch, notify } = useHub();
  const [title, setTitle] = useState("");
  const [active, setActive] = useState(location.hash.split("/")[2] || "");
  useEffect(() => {
    const change = () => setActive(location.hash.split("/")[2] || "");
    addEventListener("hashchange", change);
    return () => removeEventListener("hashchange", change);
  }, []);
  const requests = s.requests.filter(
    (r) => s.session.role !== "requester" || r.requester === s.session.userId,
  );
  const r = requests.find((r) => r.id === active);
  const a = s.agents.find((a) => a.intake);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">SERVICE REQUESTS</div>
          <h1>{intake ? "SR 접수" : "내 요청"}</h1>
          <p className="muted">
            요청을 정리하고, 공유된 결과를 한곳에서 확인하세요.
          </p>
        </div>
        <span className="badge">접수 assistant · {a?.name || "미지정"}</span>
      </div>
      {intake && (
        <div className="intake-start card">
          <Sparkles />
          <div>
            <h2>필요한 업무를 편하게 설명해 주세요.</h2>
            <p className="muted">
              대화를 시작하고 원하는 시점에 접수할 수 있습니다.
            </p>
            <div className="row">
              <input
                aria-label="요청 제목"
                placeholder="예: 설비 상태 전환 조건 개선"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <button
                className="primary"
                disabled={!title.trim() || !a}
                onClick={() => {
                  const id = uid();
                  if (dispatch({ type: "sr.start", title, id })) {
                    setActive(id);
                    setTitle("");
                  }
                }}
              >
                접수 대화 시작 <ArrowUpRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="request-layout">
        <aside className="request-list">
          {requests.length === 0 && (
            <p className="empty">아직 요청이 없습니다.</p>
          )}
          {requests.map((r) => (
            <button
              key={r.id}
              className={"request-card " + (active === r.id ? "selected" : "")}
              onClick={() => setActive(r.id)}
            >
              <span className="badge">
                {
                  {
                    draft: "작성 중",
                    received: "접수 완료",
                    responded: "답변 공유",
                    closed: "종료",
                  }[r.status]
                }
              </span>
              <h3>{r.title}</h3>
              <small>
                {r.number || "미접수 초안"} ·{" "}
                {new Date(r.createdAt).toLocaleDateString()}
              </small>
            </button>
          ))}
        </aside>
        <section className="request-detail">
          {r ? (
            <>
              <div className="row between">
                <h2>
                  {r.number || "작성 중 대화"} · {r.title}
                </h2>
                {r.status === "draft" && (
                  <button
                    className="primary"
                    onClick={() => {
                      if (dispatch({ type: "sr.submit", srId: r.id }))
                        notify("SR 접수가 완료되었습니다.");
                    }}
                  >
                    지금 SR 접수
                  </button>
                )}
              </div>
              <p className="muted small">
                접수 상태는 연결된 업무 상태와 독립적으로 관리됩니다.
              </p>
              {s.session.role !== "requester" && r.number && (
                <label className="field">
                  접수 상태
                  <select
                    value={r.status}
                    onChange={(e) =>
                      dispatch({
                        type: "sr.status",
                        srId: r.id,
                        status: e.target.value as
                          "received" | "responded" | "closed",
                      })
                    }
                  >
                    <option value="received">접수 완료</option>
                    <option value="responded">답변 공유</option>
                    <option value="closed">종료</option>
                  </select>
                </label>
              )}
              <Workspace key={r.workId} workId={r.workId} intake />
              <h2>공유받은 결과</h2>
              {!r.results.length && (
                <p className="empty">
                  담당자가 명시적으로 공유한 결과가 여기에 표시됩니다.
                </p>
              )}
              {r.results.map((result) => (
                <article className="card" key={result.id}>
                  <small>
                    {s.users.find((u) => u.id === result.actor)?.name} ·{" "}
                    {new Date(result.at).toLocaleString()}
                  </small>
                  <p className="prewrap">{result.text}</p>
                  {result.artifactIds.map((id) => {
                    const f = s.artifacts.find((f) => f.id === id);
                    return (
                      f && (
                        <button
                          key={id}
                          onClick={() =>
                            downloadArtifact(f).catch((e) => notify(e.message))
                          }
                        >
                          {f.name} · v{f.version} ↓
                        </button>
                      )
                    );
                  })}
                </article>
              ))}
            </>
          ) : (
            <div className="empty">
              요청을 선택하면 접수 대화와 공유된 결과를 볼 수 있습니다.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
function Reports() {
  const { state: s } = useHub();
  const [period, setPeriod] = useState("all");
  const [owner, setOwner] = useState("");
  const [agent, setAgent] = useState("");
  const cutoff =
    period === "day"
      ? Date.now() - 86400000
      : period === "week"
        ? Date.now() - 604800000
        : 0;
  const works = s.works.filter(
    (w) =>
      (!owner ||
        w.owner === owner ||
        s.activities.some((a) => a.workId === w.id && a.actor === owner)) &&
      (!agent || w.agentId === agent) &&
      Date.parse(w.updatedAt) >= cutoff,
  );
  const ids = new Set(works.map((w) => w.id));
  const metrics = [
    ["업무", works.length],
    ["완료", works.filter((w) => w.status === "done").length],
    [
      "미완료 체크",
      works.reduce((n, w) => n + w.checks.filter((c) => !c.done).length, 0),
    ],
    ["컨텍스트 인계", s.handoffs.filter((h) => ids.has(h.sourceWorkId)).length],
  ];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">INSIGHTS</div>
          <h1>업무 리포트</h1>
          <p className="muted">
            협업 기록을 돌아보고 assistant 개선 자료를 모으세요.
          </p>
        </div>
        <button
          onClick={() =>
            saveDownload(
              new Blob(
                [
                  JSON.stringify(
                    {
                      filters: { period, owner, agent },
                      works,
                      activities: s.activities.filter((a) => ids.has(a.workId)),
                      handoffs: s.handoffs.filter((h) =>
                        ids.has(h.sourceWorkId),
                      ),
                      metrics,
                    },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              ),
              "agent-hub-report.json",
            )
          }
        >
          리포트 내보내기 ↓
        </button>
      </div>
      <div className="toolbar">
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="all">전체 기간</option>
          <option value="day">최근 1일</option>
          <option value="week">최근 7일</option>
        </select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">모든 참여자</option>
          {s.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select value={agent} onChange={(e) => setAgent(e.target.value)}>
          <option value="">모든 에이전트</option>
          {s.agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="metrics">
        {metrics.map(([label, count]) => (
          <div className="card" key={label}>
            <span className="muted">{label}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </div>
      <div className="card">
        <h2>검토할 신호</h2>
        <p className="muted">
          아래 수치는 관찰 지표입니다. 업무 비효율의 원인을 자동으로 확정하지
          않습니다.
        </p>
        {works.map((w) => (
          <div className="report-row" key={w.id}>
            <a href={"#/work/" + w.id}>{w.title}</a>
            <span>
              {w.checks.filter((c) => c.done).length}/{w.checks.length} 완료
            </span>
            <span>
              인계 {s.handoffs.filter((h) => h.sourceWorkId === w.id).length}회
            </span>
            <span>
              재검토{" "}
              {
                s.activities.filter(
                  (a) =>
                    a.workId === w.id &&
                    /재개|reopen|다시/.test(a.action + " " + a.detail),
                ).length
              }
              회
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
export function App() {
  const { state: s, dispatch, notify, apiKeys } = useHub();
  const [hash, setHash] = useState(location.hash || "#/");
  const [notifications, setNotifications] = useState(false);
  const [helper, setHelper] = useState(false);
  const [helperText, setHelperText] = useState("");
  const [helperResult, setHelperResult] = useState("");
  const [helperAgent, setHelperAgent] = useState("");
  const [helperBusy, setHelperBusy] = useState(false);
  useEffect(() => {
    const change = () => setHash(location.hash || "#/");
    addEventListener("hashchange", change);
    return () => removeEventListener("hashchange", change);
  }, []);
  const parts = hash.split("?")[0].replace(/^#\//, "").split("/");
  const section = parts[0];
  const requester = s.session.role === "requester";
  const nav = requester
    ? [
        ["intake", "SR 접수", Plus],
        ["requests", "내 요청", ClipboardList],
      ]
    : [
        ["", "에이전트", LayoutGrid],
        ["intake", "SR 접수", Plus],
        ["requests", "요청 관리", ClipboardList],
        ["reports", "리포트", ChartNoAxesCombined],
        ...(s.session.role === "admin"
          ? [["admin", "에이전트 관리", Settings2]]
          : []),
      ];
  const unread = s.notifications.filter(
    (n) => n.userId === s.session.userId && !n.read,
  ).length;
  useEffect(() => {
    if (section === "work") {
      const thread = new URLSearchParams(hash.split("?")[1] || "").get(
        "thread",
      );
      if (
        thread &&
        s.threads.some((t) => t.id === thread && t.workId === parts[1]) &&
        s.works.find((w) => w.id === parts[1])?.activeThreadId !== thread
      )
        dispatch({ type: "thread.select", workId: parts[1], threadId: thread });
    }
  }, [hash]);
  return (
    <>
      <header className="app-header">
        <a className="brand" href="#/">
          <span className="brand-mark">
            <Boxes size={23} />
          </span>
          <span>
            MES <b>Agent Hub</b>
            <small>CONNECTED CONTEXT, INDEPENDENT WORK.</small>
          </span>
        </a>
        <div className="header-actions">
          <span className="demo-label">FRONTEND DEMO</span>
          <select
            aria-label="사용자 역할 전환"
            value={s.session.role}
            onChange={(e) => {
              const role = e.target.value as "admin" | "staff" | "requester";
              dispatch({ type: "session", role, userId: role });
              location.hash = role === "requester" ? "#/requests" : "#/";
            }}
          >
            <option value="staff">업무 담당자</option>
            <option value="requester">요청자</option>
            <option value="admin">관리자</option>
          </select>
          <button
            className="icon-btn"
            aria-label="알림함"
            onClick={() => setNotifications(true)}
          >
            <Bell size={19} />
            {unread > 0 && <span className="notification-count">{unread}</span>}
          </button>
          <span className="user-circle">
            {s.users.find((u) => u.id === s.session.userId)?.name.slice(0, 1)}
          </span>
        </div>
      </header>
      <div className="app-layout">
        <nav className="sidebar">
          <div className="eyebrow">WORKSPACE</div>
          {nav.map(([path, label, Icon]) => {
            const I = Icon as typeof Boxes;
            return (
              <a
                key={String(path)}
                className={section === path ? "active" : ""}
                href={"#/" + path}
              >
                <I size={18} />
                {String(label)}
              </a>
            );
          })}
          <div className="sidebar-foot">
            <span className="online-dot" /> 로컬 데모 환경
            <p>
              역할 전환은 화면 시연입니다.
              <br />
              실제 인증·PC 간 동기화는 제공하지 않습니다.
            </p>
          </div>
        </nav>
        <div className="app-content" key={s.session.userId + s.session.role}>
          {requester && !["intake", "requests", "work"].includes(section) ? (
            <Requests />
          ) : section === "agent" ? (
            <WorkBoard agentId={parts[1]} />
          ) : section === "work" ? (
            <Workspace key={parts[1]} workId={parts[1]} />
          ) : section === "admin" ? (
            <AgentAdmin />
          ) : section === "intake" ? (
            <Requests intake />
          ) : section === "requests" ? (
            <Requests />
          ) : section === "reports" ? (
            <Reports />
          ) : (
            <Gallery />
          )}
        </div>
      </div>
      {!requester && (
        <button className="helper-fab" onClick={() => setHelper(true)}>
          <Sparkles size={17} /> 시스템 assistant
        </button>
      )}
      {notifications && (
        <Modal title="알림함" onClose={() => setNotifications(false)}>
          {s.notifications
            .filter((n) => n.userId === s.session.userId)
            .slice()
            .reverse()
            .map((n) => (
              <button
                className={"notification " + (!n.read ? "unread" : "")}
                key={n.id}
                onClick={() => {
                  dispatch({ type: "notification.read", id: n.id });
                  location.hash = n.link;
                  setNotifications(false);
                }}
              >
                <b>{n.title}</b>
                <p>{n.body}</p>
                <small>{new Date(n.at).toLocaleString()}</small>
              </button>
            ))}
          {!s.notifications.some((n) => n.userId === s.session.userId) && (
            <p className="empty">새로운 알림이 없습니다.</p>
          )}
        </Modal>
      )}
      {helper && (
        <Modal
          title="시스템 assistant · 업무 초안"
          onClose={() => setHelper(false)}
        >
          <p className="muted">
            담당 에이전트의 연결 설정으로 업무 초안을 정리합니다. 검토 후
            생성하세요.
          </p>
          <select
            value={helperAgent}
            onChange={(e) => setHelperAgent(e.target.value)}
          >
            <option value="">에이전트 선택</option>
            {s.agents
              .filter(
                (a) =>
                  a.status !== "retired" && a.connectionMode !== "external",
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
          <textarea
            value={helperText}
            onChange={(e) => setHelperText(e.target.value)}
            placeholder="어떤 업무를 만들까요?"
          />
          <button
            disabled={!helperAgent || !helperText.trim() || helperBusy}
            onClick={async () => {
              setHelperBusy(true);
              try {
                const a = s.agents.find((a) => a.id === helperAgent)!;
                const wid = uid(),
                  tid = uid();
                const temp = {
                  ...s,
                  works: [
                    ...s.works,
                    { id: wid, agentId: a.id, inputIds: [] } as any,
                  ],
                  threads: [
                    ...s.threads,
                    {
                      id: tid,
                      workId: wid,
                      model: "",
                      activeBundleIds: [],
                    } as any,
                  ],
                };
                const response = await callAssistant(
                  temp,
                  tid,
                  "다음 업무의 목적과 확인할 사항을 간결하게 정리하세요: " +
                    helperText,
                  apiKeys[a.profileId] || "",
                );
                setHelperResult(response.content);
              } catch (e) {
                notify(String(e));
              } finally {
                setHelperBusy(false);
              }
            }}
          >
            {helperBusy ? "정리 중…" : "초안 정리"}
          </button>
          <textarea
            aria-label="검토할 업무 초안"
            value={helperResult}
            onChange={(e) => setHelperResult(e.target.value)}
            placeholder="초안을 직접 작성해도 됩니다."
          />
          <button
            className="primary"
            disabled={!helperAgent || !helperText.trim()}
            onClick={() => {
              const id = uid();
              if (
                dispatch({
                  type: "work.create",
                  agentId: helperAgent,
                  title: helperText.slice(0, 100),
                  owner: s.session.userId,
                  id,
                })
              ) {
                if (helperResult)
                  dispatch({
                    type: "work.note",
                    workId: id,
                    text: helperResult,
                  });
                setHelper(false);
                location.hash = "#/work/" + id;
              }
            }}
          >
            검토한 업무 생성
          </button>
        </Modal>
      )}
    </>
  );
}
