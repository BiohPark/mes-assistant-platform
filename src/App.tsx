import { Component, useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  ExternalLink,
  FileStack,
  GitBranch,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  List,
  ListTodo,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { Provider, useStore, useRoute, navigate } from "./store";
import { addWork, currentStage, getProgress, workStatus, USERS } from "./domain";
import {
  Avatar,
  Badge,
  Modal,
  SectionTitle,
  formatDate,
  Empty,
  AssistantMark,
} from "./ui";
import { Workspace } from "./Workspace";
import { Library, Reports, Templates, ActivityPage } from "./Pages";
import { downloadBlob, csv } from "./storage";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  override state: { hasError: boolean; error: Error | null } = {
    hasError: false,
    error: null,
  };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 640, margin: "60px auto", background: "#fff", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
          <h2 style={{ color: "#d32f2f", marginTop: 0 }}>화면을 불러오는 중 오류가 발생했습니다.</h2>
          <p style={{ color: "#555", lineHeight: 1.6 }}>{this.state.error?.message || "알 수 없는 오류가 발생했습니다."}</p>
          <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
            <button
              style={{ padding: "10px 18px", cursor: "pointer", background: "#176b56", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600 }}
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
            >
              데이터 초기화 후 다시 시작
            </button>
            <button
              style={{ padding: "10px 18px", cursor: "pointer", background: "#f0f4f2", color: "#283d38", border: "1px solid #d0dbd5", borderRadius: 8, fontWeight: 500 }}
              onClick={() => window.location.reload()}
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <Provider>
        <Shell />
      </Provider>
    </ErrorBoundary>
  );
}
function Shell() {
  const { state, update, notify, toast, storageError } = useStore();
  const route = useRoute();
  const pageRoute = route.split("/").slice(0, 3).join("/");
  useEffect(() => window.scrollTo(0, 0), [pageRoute]);
  const [create, setCreate] = useState(false),
    [settings, setSettings] = useState(false),
    [agent, setAgent] = useState(false),
    [help, setHelp] = useState(false),
    [mobileNav, setMobileNav] = useState(false);
  const workId = route.startsWith("/work/")
    ? decodeURIComponent(route.split("/")[2])
    : "";
  const nav = [
    { path: "/", label: "워크스페이스", icon: LayoutDashboard },
    {
      path: "/tasks",
      label: "전체 업무",
      icon: ListTodo,
      count: state.works.length,
    },
    { path: "/templates", label: "워크플로우", icon: Workflow },
    { path: "/files", label: "산출물 보관함", icon: FileStack },
    { path: "/reports", label: "인사이트 · 리포트", icon: Activity },
  ];
  const label = workId
    ? "업무 작업 공간"
    : nav.find((n) => n.path === route)?.label || "활동 이력";
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <a className="brand" href="#/" aria-label="FlowMES 홈">
          <span className="brand-symbol">
            <GitBranch size={25} />
          </span>
          <span>
            flow<span className="brand-light">mes</span>
            <small>ASSISTANT WORKSPACE</small>
          </span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-logo">M</span>
          <div>
            <strong>MES Group</strong>
            <small>Samsung Biologics</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {nav.map((n) => (
            <a
              key={n.path}
              href={"#" + n.path}
              onClick={() => setMobileNav(false)}
              className={`nav-item ${route === n.path || (workId && n.path === "/tasks") ? "active" : ""}`}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.count !== undefined && <em>{n.count}</em>}
            </a>
          ))}
        </nav>
        <div className="nav-caption secondary-caption">ORGANIZATION</div>
        <a
          href="#/activity"
          className={`nav-item ${route === "/activity" ? "active" : ""}`}
        >
          <Clock3 size={18} />
          <span>활동 이력</span>
        </a>
        <button className="nav-item" onClick={() => setSettings(true)}>
          <Settings2 size={18} />
          <span>워크스페이스 설정</span>
        </button>
        <div className="sidebar-bottom">
          <div className="assistant-invite">
            <span className="mini-spark">
              <Sparkles size={17} />
            </span>
            <h4>흐름을 만드는 가장 쉬운 방법</h4>
            <p>
              필요한 업무를 설명하면
              <br />
              assistant가 시작을 도와드려요.
            </p>
            <button onClick={() => setAgent(true)}>
              시스템 assistant <ArrowUpRight size={15} />
            </button>
          </div>
          <button className="help-link" onClick={() => setHelp(true)}>
            <CircleHelp size={16} />
            사용 가이드
            <ArrowUpRight size={14} />
          </button>
          <div className="profile">
            <Avatar name={state.profile} />
            <div>
              <strong>{state.profile}</strong>
              <small>MES 개발 담당자</small>
            </div>
            <button
              className="icon-button"
              aria-label="사용자 설정"
              onClick={() => setSettings(true)}
            >
              <Settings2 size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="메뉴"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={19} />
            </button>
            <span>MES Group</span>
            <ChevronRight size={14} />
            <strong>{label}</strong>
            {workId && (
              <>
                <ChevronRight size={14} />
                <span>{workId}</span>
              </>
            )}
          </div>
          <div className="topbar-right">
            <span className="environment">
              <span />
              Sandbox <span className="demo-label">DEMO</span>
            </span>
            <div className="top-divider" />
            <button
              className="icon-button notification"
              aria-label="활동 알림 확인"
              onClick={() => navigate("/activity")}
            >
              <Bell size={19} />
              <i />
            </button>
            <Avatar name={state.profile} small />
          </div>
        </header>
        {storageError && (
          <div className="storage-error" role="alert">
            {storageError}
          </div>
        )}
        <main className={workId ? "workspace-main" : "page-main"}>
          {workId ? (
            <Workspace
              key={workId}
              workId={workId}
              stageId={route.split("/")[3]}
              onSettings={() => setSettings(true)}
            />
          ) : route === "/templates" ? (
            <Templates onCreate={() => setCreate(true)} />
          ) : route === "/files" ? (
            <Library />
          ) : route === "/reports" ? (
            <Reports />
          ) : route === "/activity" ? (
            <ActivityPage />
          ) : (
            <Dashboard
              compact={route === "/tasks"}
              onCreate={() => setCreate(true)}
            />
          )}
        </main>
        <footer className="app-footer">
          <span>
            <ShieldCheck size={13} /> MES Assistant Workspace
          </span>
          <span>프론트엔드 데모 · 샘플 데이터 · 브라우저에 저장</span>
          <button onClick={() => setHelp(true)}>
            피드백 & 가이드 <ArrowUpRight size={12} />
          </button>
        </footer>
      </div>
      <button className="floating-assistant" onClick={() => setAgent(true)}>
        <Sparkles size={18} />
        <span>무엇을 도와드릴까요?</span>
      </button>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {create && <NewWork onClose={() => setCreate(false)} />}
      {settings && <Settings onClose={() => setSettings(false)} />}
      {agent && <SystemAssistant onClose={() => setAgent(false)} />}
      {help && (
        <Modal
          title="FlowMES 데모 둘러보기"
          subtitle="기존 assistant를 연결하는, 업무 중심의 작업 공간"
          onClose={() => setHelp(false)}
        >
          <div className="guide-list">
            {[
              [
                "01",
                "업무 이어가기",
                "설비 상태 전이 로직 개선 업무에서 FDS 대화와 전달된 URS 자료를 확인하세요.",
              ],
              [
                "02",
                "단계 마무리",
                "체크리스트를 확인하고 다음 단계로 버튼에서 전달할 산출물을 선택하세요.",
              ],
              [
                "03",
                "자유로운 진행",
                "개발 단계는 수동 메모와 증빙을 남깁니다. 단계 관리에서 사유를 기록하고 되돌리거나 건너뛸 수 있습니다.",
              ],
              [
                "04",
                "나만의 흐름",
                "워크플로우에서 템플릿을 편집하거나 시스템 assistant에 새로운 업무를 설명하세요.",
              ],
            ].map(([n, t, d]) => (
              <div key={n}>
                <span>{n}</span>
                <section>
                  <h4>{t}</h4>
                  <p>{d}</p>
                </section>
              </div>
            ))}
          </div>
          <div className="info-box">
            대화는 샘플 응답입니다. 파일은 이 브라우저에 저장되며, 실제 사내
            LLM·GMP 승인·자동 배포는 연결되어 있지 않습니다.
          </div>
        </Modal>
      )}
    </div>
  );
}
function Dashboard({
  compact,
  onCreate,
}: {
  compact: boolean;
  onCreate: () => void;
}) {
  const { state } = useStore();
  const [query, setQuery] = useState(""),
    [tab, setTab] = useState("전체 업무"),
    [filter, setFilter] = useState("전체 단계"),
    [view, setView] = useState<"list" | "board">("list"),
    [filters, setFilters] = useState(false),
    [owner, setOwner] = useState("전체 담당자");
  const done = state.works.filter((w) => workStatus(w) === "완료").length,
    review = state.works.filter((w) => workStatus(w) === "검토 필요").length;
  const works = state.works.filter(
    (w) =>
      (!query ||
        `${w.title} ${w.id} ${w.externalId}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (tab === "전체 업무" ||
        (tab === "내 업무" && w.owner === state.profile) ||
        tab === workStatus(w)) &&
      (filter === "전체 단계" || currentStage(w).short === filter) &&
      (owner === "전체 담당자" || w.owner === owner),
  );
  const resume =
    state.works.find(
      (w) => w.owner === state.profile && getProgress(w) < 100,
    ) || state.works[0];
  const open = (id: string) => navigate("/work/" + id);
  function exportList() {
    downloadBlob(
      "MES_업무목록.csv",
      new Blob(
        [
          csv([
            ["업무 ID", "업무명", "현재 단계", "상태", "담당자", "목표일"],
            ...works.map((w) => [
              w.id,
              w.title,
              currentStage(w).name,
              workStatus(w),
              w.owner,
              w.due,
            ]),
          ]),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
    );
  }
  return (
    <>
      <SectionTitle
        eyebrow={compact ? "YOUR WORK, CONNECTED" : "A BETTER WAY TO WORK"}
        title={
          compact
            ? "전체 업무"
            : `${state.profile}님, 오늘도 좋은 흐름을 만들어 보세요.`
        }
        description={
          compact
            ? "업무의 시작부터 완료까지, 모든 단계와 자료가 한곳에 연결됩니다."
            : "진행 중인 업무를 확인하고, assistant와 함께 다음 단계로 나아가세요."
        }
      >
        <span className="date-label">
          {new Date().toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "short",
          })}
        </span>
        <button className="button primary" onClick={onCreate}>
          <Plus size={17} />새 업무
        </button>
      </SectionTitle>
      {!compact && (
        <>
          <div className="stats-grid">
            {[
              {
                title: "전체 업무",
                value: state.works.length,
                icon: Layers,
                caption: "모든 워크플로우",
                type: "all",
                tab: "전체 업무",
              },
              {
                title: "진행 중",
                value: state.works.length - done - review,
                icon: Workflow,
                caption: "assistant와 함께 진행 중",
                type: "running",
                tab: "진행 중",
              },
              {
                title: "검토 필요",
                value: review,
                icon: Clock3,
                caption: "다음 단계를 위한 확인",
                type: "review",
                tab: "검토 필요",
              },
              {
                title: "완료된 업무",
                value: done,
                icon: CheckCircle2,
                caption: "전체 업무 기준",
                type: "done",
                tab: "완료",
              },
            ].map((c) => (
              <button
                key={c.title}
                className={`stat-card ${c.type}`}
                onClick={() => setTab(c.tab)}
              >
                <div>
                  <span className="stat-label">{c.title}</span>
                  <c.icon size={18} />
                </div>
                <strong>
                  {c.value}
                  <small>건</small>
                </strong>
                <p>
                  {c.type === "done" && <span className="tiny-up">↗</span>}
                  {c.caption}
                  <ArrowUpRight size={14} />
                </p>
              </button>
            ))}
          </div>
          <div className="focus-grid">
            {resume && (
              <div className="resume-card">
                <div className="resume-content">
                  <div className="eyebrow">
                    <span className="live-dot" />
                    CONTINUE YOUR FLOW
                  </div>
                  <h2>{resume.title}</h2>
                  <p>
                    <span>{resume.id}</span>
                    <span className="dot-separator">·</span>
                    {currentStage(resume).name} 단계에서 이어서 진행하세요.
                  </p>
                  <div className="resume-bottom">
                    <div className="avatar-stack">
                      <Avatar name={resume.owner} small />
                      <span className="bot-mini">
                        <Sparkles size={13} />
                      </span>
                    </div>
                    <span>
                      {currentStage(resume).mode === "manual"
                        ? "수동 작업 진행 중"
                        : currentStage(resume).assistant + "와 작업 중"}
                    </span>
                    <button onClick={() => open(resume.id)}>
                      이어서 작업하기 <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
                <div className="flow-illustration" aria-hidden="true">
                  <div className="illustration-grid" />
                  <div className="illus-node completed">
                    <Check size={16} />
                    <span>URS</span>
                  </div>
                  <div className="illus-line one" />
                  <div className="illus-node selected">
                    <Sparkles size={18} />
                    <span>FDS</span>
                    <i />
                  </div>
                  <div className="illus-line two" />
                  <div className="illus-node pending">
                    <span className="code-glyph">&lt;/&gt;</span>
                    <span>DEV</span>
                  </div>
                  <div className="illus-caption">Ideas into progress.</div>
                </div>
              </div>
            )}
            <div className="insight-card">
              <div className="insight-title">
                <span>
                  <Sparkles size={16} />
                  WORKSPACE INSIGHT
                </span>
                <ArrowUpRight size={17} />
              </div>
              <h3>
                작업의 맥락까지,
                <br />
                다음 단계로 이어집니다.
              </h3>
              <p>
                대화와 산출물을 다시 찾을 필요 없이
                <br />
                선택한 자료로 다음 업무를 시작하세요.
              </p>
              <button onClick={() => navigate("/reports")}>
                워크스페이스 인사이트 보기 <ArrowRight size={14} />
              </button>
              <div className="insight-decoration" />
            </div>
          </div>
        </>
      )}
      <section className="task-section">
        <div className="section-heading">
          <div>
            <h2>
              {compact ? "업무 목록" : "우리 팀의 업무"}{" "}
              <span>{state.works.length}</span>
            </h2>
            <p>각 업무의 흐름과 진행 상황을 한눈에 확인하세요.</p>
          </div>
          <div className="section-actions">
            <button className="button subtle" onClick={exportList}>
              <Download size={15} />
              목록 내보내기
            </button>
            <div className="view-switch">
              <button
                aria-label="목록 보기"
                className={view === "list" ? "selected" : ""}
                onClick={() => setView("list")}
              >
                <List size={17} />
              </button>
              <button
                aria-label="보드 보기"
                className={view === "board" ? "selected" : ""}
                onClick={() => setView("board")}
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>
        </div>
        <div className="table-toolbar">
          <div className="tabs">
            {["전체 업무", "내 업무", "진행 중", "검토 필요", "완료"].map(
              (t) => (
                <button
                  key={t}
                  className={tab === t ? "active" : ""}
                  onClick={() => setTab(t)}
                >
                  {t}
                  {t === "내 업무" && (
                    <span>
                      {
                        state.works.filter((w) => w.owner === state.profile)
                          .length
                      }
                    </span>
                  )}
                  {t === "검토 필요" && review > 0 && <i />}
                </button>
              ),
            )}
          </div>
          <div className="table-controls">
            <div className="search-field">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="업무명, ID 검색"
                aria-label="업무 검색"
              />
              {query && (
                <button aria-label="검색 지우기" onClick={() => setQuery("")}>
                  <X size={13} />
                </button>
              )}
            </div>
            <button
              className={`button filter-button ${filters ? "pressed" : ""}`}
              onClick={() => setFilters(!filters)}
            >
              <SlidersHorizontal size={15} />
              필터
              {filter !== "전체 단계" || owner !== "전체 담당자" ? (
                <span className="filter-dot" />
              ) : null}
            </button>
          </div>
        </div>
        {filters && (
          <div className="filter-row">
            <label>
              현재 단계
              <select
                aria-label="현재 단계 필터"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                {[
                  "전체 단계",
                  ...new Set(
                    state.works.flatMap((w) => w.stages.map((s) => s.short)),
                  ),
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              담당자
              <select
                aria-label="담당자 필터"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              >
                {[
                  "전체 담당자",
                  ...new Set(state.works.map((w) => w.owner)),
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <button
              className="text-link"
              onClick={() => {
                setFilter("전체 단계");
                setOwner("전체 담당자");
                setQuery("");
              }}
            >
              필터 초기화
            </button>
          </div>
        )}
        {works.length === 0 ? (
          <Empty
            title="조건에 맞는 업무가 없습니다"
            description="검색어나 필터를 바꿔 다시 확인해 주세요."
          />
        ) : view === "list" ? (
          <div className="table-scroll">
            <table className="work-table">
              <thead>
                <tr>
                  <th className="work-name-th">업무명</th>
                  <th>현재 단계</th>
                  <th>진행률</th>
                  <th>상태</th>
                  <th>담당자</th>
                  <th>
                    목표일 <ArrowDown size={12} />
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {works.map((w) => (
                  <tr key={w.id} onClick={() => open(w.id)}>
                    <td>
                      <button
                        className="work-title"
                        onClick={(e) => {
                          e.stopPropagation();
                          open(w.id);
                        }}
                      >
                        {w.title}
                        {w.priority === "높음" && (
                          <span
                            className="priority-dot"
                            title="높은 우선순위"
                          />
                        )}
                      </button>
                      <div className="work-subtitle">
                        {w.id}
                        <span>·</span>
                        {w.system}
                        <span className="template-mini">{w.template}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`stage-pill ${currentStage(w).mode === "manual" ? "manual" : ""}`}
                      >
                        {currentStage(w).mode === "manual" ? (
                          <span className="code-glyph">&lt;/&gt;</span>
                        ) : (
                          <Sparkles size={12} />
                        )}{" "}
                        {currentStage(w).short}
                      </span>
                    </td>
                    <td>
                      <div className="progress-cell">
                        <div className="segmented-progress">
                          {w.stages.map((s) => (
                            <span key={s.id} className={s.status} />
                          ))}
                        </div>
                        <span>{getProgress(w)}%</span>
                      </div>
                    </td>
                    <td>
                      <Badge
                        tone={
                          workStatus(w) === "검토 필요"
                            ? "amber"
                            : workStatus(w) === "완료"
                              ? "neutral"
                              : "green"
                        }
                      >
                        {workStatus(w)}
                      </Badge>
                    </td>
                    <td>
                      <span className="table-owner">
                        <Avatar name={w.owner} small />
                        {w.owner}
                      </span>
                    </td>
                    <td className="due-cell">
                      {formatDate(w.due)}
                      {w.priority === "높음" && getProgress(w) < 100 && (
                        <small className="priority-text">우선</small>
                      )}
                    </td>
                    <td>
                      <button
                        className="icon-button row-open"
                        aria-label={`${w.title} 열기`}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="kanban">
            {["진행 중", "검토 필요", "완료", "대기"].map((status) => (
              <div className="kanban-column" key={status}>
                <h4>
                  <span
                    className={`column-dot ${status === "검토 필요" ? "amber" : ""}`}
                  />
                  {status}
                  <span>
                    {works.filter((w) => workStatus(w) === status).length}
                  </span>
                </h4>
                {works
                  .filter((w) => workStatus(w) === status)
                  .map((w) => (
                    <button
                      className="kanban-card"
                      key={w.id}
                      onClick={() => open(w.id)}
                    >
                      <small>{w.id}</small>
                      <h3>{w.title}</h3>
                      <span className="stage-pill">
                        {currentStage(w).short}
                      </span>
                      <div className="kanban-bottom">
                        <Avatar name={w.owner} small />
                        <span>{formatDate(w.due)}</span>
                        <span>{getProgress(w)}%</span>
                      </div>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        )}
        <div className="table-bottom">
          <span>총 {works.length}개 업무</span>
          <span>
            <span className="manual-legend" />
            회색 단계는 수동으로 진행하는 업무입니다
          </span>
          <span className="pagination">
            <button disabled aria-label="이전 페이지">
              <ChevronRight className="rotate" size={15} />
            </button>
            <b>1</b>
            <button disabled aria-label="다음 페이지">
              <ChevronRight size={15} />
            </button>
          </span>
        </div>
      </section>
      {!compact && (
        <div className="bottom-note">
          <span>
            <GitBranch size={15} />
            좋은 업무 흐름은, 연결된 맥락에서 시작됩니다.
          </span>
          <button onClick={() => navigate("/activity")}>
            최근 활동 확인 <ArrowRight size={14} />
          </button>
        </div>
      )}
    </>
  );
}
function NewWork({ onClose }: { onClose: () => void }) {
  const { state, update, notify } = useStore();
  const [title, setTitle] = useState(""),
    [template, setTemplate] = useState(state.templates[0].id),
    [owner, setOwner] = useState(state.profile),
    [due, setDue] = useState("2026-09-30"),
    [external, setExternal] = useState("");
  return (
    <Modal
      title="새로운 업무 시작하기"
      subtitle="목적에 맞는 워크플로우로 시작하고, 진행하면서 자유롭게 조정하세요."
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim() || !owner.trim()) return;
          const next = addWork(
            state,
            title.trim(),
            template,
            owner.trim(),
            due,
            external.trim(),
          );
          update(() => next);
          onClose();
          navigate("/work/" + next.works[0].id);
          notify("업무를 생성했습니다. 첫 단계를 시작해 보세요.");
        }}
      >
        <label className="form-label">
          업무명 <span>*</span>
          <input
            autoFocus
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 설비 사용 전 점검 로직 개선"
          />
        </label>
        <label className="form-label">
          워크플로우 템플릿
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          >
            {state.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="template-preview">
          {state.templates
            .find((t) => t.id === template)
            ?.stages.map((s, i) => (
              <span key={i} className={s.mode === "manual" ? "manual" : ""}>
                {s.short}
                {i <
                  state.templates.find((t) => t.id === template)!.stages
                    .length -
                    1 && <ChevronRight size={12} />}
              </span>
            ))}
        </div>
        <div className="form-grid">
          <label className="form-label">
            담당자
            <select
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            >
              {USERS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
              {!USERS.includes(owner as any) && (
                <option value={owner}>{owner}</option>
              )}
            </select>
          </label>
          <label className="form-label">
            목표일
            <input
              type="date"
              required
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
        </div>
        <label className="form-label">
          외부 업무 ID <small>선택</small>
          <input
            value={external}
            onChange={(e) => setExternal(e.target.value)}
            placeholder="CR-2026-0000"
          />
        </label>
        <div className="info-box">
          <GitBranch size={17} />
          대화·산출물·이력은 각 단계에 자동으로 연결됩니다.
        </div>
        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            취소
          </button>
          <button className="button primary" type="submit">
            <Plus size={16} />
            업무 만들기
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Settings({ onClose }: { onClose: () => void }) {
  const { state, update, notify, resetData } = useStore();
  const [name, setName] = useState(state.profile),
    [url, setUrl] = useState(state.externalUrl),
    [error, setError] = useState("");
  return (
    <Modal
      title="워크스페이스 설정"
      subtitle="이 브라우저의 데모 사용자와 업무 연결을 설정합니다."
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          try {
            if (
              url &&
              !["http:", "https:"].includes(
                new URL(url.replace("{id}", "example")).protocol,
              )
            )
              throw new Error();
          } catch {
            setError("http 또는 https로 시작하는 유효한 URL을 입력해 주세요.");
            return;
          }
          update((s) => ({
            ...s,
            profile: name.trim(),
            externalUrl: url.trim(),
          }));
          notify("설정을 저장했습니다.");
          onClose();
        }}
      >
        <label className="form-label">
          표시 이름 (담당자 전환)
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", margin: "8px 0" }}>
            {USERS.map((u) => (
              <button
                key={u}
                type="button"
                className={`button ${name === u ? "primary" : ""}`}
                onClick={() => setName(u)}
                style={{ padding: "4px 10px", fontSize: "12px", height: "auto" }}
              >
                {u}
              </button>
            ))}
          </div>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="form-label">
          외부 업무시스템 URL 템플릿
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-internal-system/tasks/{id}"
          />
          <small>{"{id}"} 위치에 각 업무의 외부 ID가 들어갑니다.</small>
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="settings-section">
          <span className="eyebrow">ASSISTANT CONNECTION</span>
          <h3>OpenWebUI · GLM-5.2</h3>
          <Badge tone="neutral">샘플 응답 모드</Badge>
          <p>
            기존 assistant의 대화 인터페이스를 유지하는 어댑터 구조입니다. 실제
            연결 시 사내 인증, 파일 업로드, 세션 매핑을 서버에서 구성합니다.
          </p>
          <p>데모에는 API 키나 사내 연결 정보를 입력하지 않습니다.</p>
        </div>
        <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>초기 데이터로 되돌리려면:</span>
          <button
            type="button"
            className="button"
            style={{ color: "#d32f2f", borderColor: "#fca5a5" }}
            onClick={() => {
              if (window.confirm("초기 샘플 데이터로 복원하시겠습니까? (현재 변경 내용이 초기화됩니다)")) {
                resetData();
                onClose();
              }
            }}
          >
            샘플 데이터 초기화
          </button>
        </div>
        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            닫기
          </button>
          <button className="button primary">저장하기</button>
        </div>
      </form>
    </Modal>
  );
}
function SystemAssistant({ onClose }: { onClose: () => void }) {
  const { state, update, notify } = useStore();
  const [prompt, setPrompt] = useState(""),
    [proposal, setProposal] = useState<{
      title: string;
      template: string;
    } | null>(null);
  return (
    <Modal
      title="시스템 assistant"
      subtitle="업무의 시작을 함께 설계합니다 · 샘플 제안"
      onClose={onClose}
    >
      <div className="system-assistant-intro">
        <AssistantMark />
        <h3>어떤 업무를 시작하시나요?</h3>
        <p>
          해야 할 일을 설명해 주세요.
          <br />
          워크플로우를 제안하고 업무 생성을 도와드릴게요.
        </p>
      </div>
      <div className="suggestion-chips">
        {[
          "설비 변경 관리 업무를 만들고 싶어요",
          "테스트 검증 업무를 시작할게요",
        ].map((t) => (
          <button key={t} onClick={() => setPrompt(t)}>
            {t}
            <ArrowUpRight size={13} />
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!prompt.trim()) return;
          setProposal({
            title: prompt.replace(/(를 만들고 싶어요|를 시작할게요)$/, ""),
            template: /테스트|검증/.test(prompt)
              ? "validation"
              : /변경/.test(prompt)
                ? "et-change"
                : "et-standard",
          });
        }}
      >
        <div className="agent-input">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="예: 신규 설비의 상태 전이 기능을 개발하려고 해요"
            rows={3}
          />
          <button className="button primary" disabled={!prompt.trim()}>
            <Sparkles size={15} />
            흐름 제안받기
          </button>
        </div>
      </form>
      {proposal && (
        <div className="proposal-card">
          <div className="eyebrow">WORKFLOW PROPOSAL</div>
          <h3>{proposal.title}</h3>
          <p>
            {
              state.templates.find((t) => t.id === proposal.template)
                ?.description
            }
          </p>
          <div className="template-preview">
            {state.templates
              .find((t) => t.id === proposal.template)
              ?.stages.map((s, i) => (
                <span key={i} className={s.mode === "manual" ? "manual" : ""}>
                  {s.short}
                  <ChevronRight size={12} />
                </span>
              ))}
          </div>
          <p className="muted">
            키워드 기반 데모 제안입니다. 생성 후 단계와 담당 방식을 편집할 수
            있습니다.
          </p>
          <button
            className="button primary"
            onClick={() => {
              const next = addWork(
                state,
                proposal.title,
                proposal.template,
                state.profile,
                "2026-09-30",
                "",
              );
              update(() => next);
              onClose();
              navigate("/work/" + next.works[0].id);
              notify("제안한 워크플로우로 업무를 생성했습니다.");
            }}
          >
            이 흐름으로 업무 만들기 <ArrowRight size={16} />
          </button>
        </div>
      )}
    </Modal>
  );
}
