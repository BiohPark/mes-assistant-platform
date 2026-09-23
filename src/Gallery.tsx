import { useState } from "react";
import {
  ArrowUpRight,
  Search,
  ArrowRight,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { useHub } from "./store";
import { Avatar, Modal } from "./ui";
import type { Agent } from "./types";
import "./catalog.css";
import { canSeeWork } from "./domain";

export const agentStatusLabels = {
  open: "오픈",
  working: "작업중",
  testing: "테스트",
  unconfigured: "미설정",
  retired: "폐기",
};
export function Gallery() {
  const { state } = useHub();
  const [query, setQuery] = useState("");
  const [lv1, setLv1] = useState("");
  const [lv2, setLv2] = useState("");
  const [status, setStatus] = useState("available");
  const [detail, setDetail] = useState<Agent>();
  const agents = state.agents.filter(
    (a) =>
      (status === "available"
        ? a.status !== "retired"
        : status === "all" || a.status === status) &&
      (!lv1 || a.lv1 === lv1) &&
      (!lv2 || a.lv2 === lv2) &&
      [
        a.name,
        a.summary,
        state.users.find((u) => u.id === a.owner)?.name || a.owner,
        a.lv1,
        a.lv2,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="page">
      <div className="catalog-intro">
        <span className="eyebrow">MES AGENT HUB</span>
        <h1>어떤 업무를 시작할까요?</h1>
        <p className="muted">
          필요한 에이전트를 선택하고, 이전 작업의 맥락을 이어가세요.
        </p>
        <div className="catalog-intro-note">
          <Sparkles size={16} /> 독립적인 업무, 연결되는 컨텍스트
        </div>
      </div>
      <div className="toolbar catalog-toolbar">
        <label className="catalog-search">
          <Search size={18} />
          <input
            aria-label="에이전트 검색"
            placeholder="에이전트 이름, 설명, 담당자 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="업무 Lv1"
          value={lv1}
          onChange={(e) => {
            setLv1(e.target.value);
            setLv2("");
          }}
        >
          <option value="">업무 Lv1 · 전체</option>
          {[...new Set(state.agents.map((a) => a.lv1))].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          aria-label="업무 Lv2"
          value={lv2}
          onChange={(e) => setLv2(e.target.value)}
        >
          <option value="">업무 Lv2 · 전체</option>
          {[
            ...new Set(
              state.agents
                .filter((a) => !lv1 || a.lv1 === lv1)
                .map((a) => a.lv2),
            ),
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          aria-label="에이전트 상태"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="available">사용 가능한 에이전트</option>
          <option value="all">모든 상태</option>
          {Object.entries(agentStatusLabels).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="catalog-section-head">
        <h2>
          에이전트 둘러보기 <span className="muted">{agents.length}</span>
        </h2>
        <span className="muted">업무 Lv1·Lv2는 탐색을 위한 분류입니다</span>
      </div>
      <div className="agent-grid">
        {agents.map((a) => {
          const count = state.works.filter(
            (w) =>
              canSeeWork(state, w.id) &&
              w.agentId === a.id &&
              !w.archived &&
              w.status !== "done",
          ).length;
          return (
            <article className="agent-card" key={a.id}>
              <button
                className="agent-card-main"
                onClick={() => (location.hash = "#/agent/" + a.id)}
              >
                <div className="agent-card-top">
                  <Avatar agent={a} size={52} />
                  <span className={"badge agent-status-" + a.status}>
                    {agentStatusLabels[a.status]}
                  </span>
                </div>
                <div className="agent-classification">
                  {a.lv1} <span>/</span> {a.lv2}
                </div>
                <h3>{a.name}</h3>
                <p className="agent-summary">{a.summary}</p>
                <div className="row agent-owner">
                  <span>
                    {state.users.find((u) => u.id === a.owner)?.name || a.owner}
                  </span>
                  {a.intake && <span className="badge">SR 접수</span>}
                </div>
                <div className="agent-card-foot">
                  <span>
                    진행 중 업무 <strong>{count}</strong>
                  </span>
                  <ArrowRight size={18} />
                </div>
              </button>
              <div className="agent-card-actions">
                <button onClick={() => setDetail(a)}>
                  <BookOpen size={14} /> 설명 보기
                </button>
                {a.link1 && (
                  <a href={a.link1} target="_blank" rel="noreferrer">
                    <ArrowUpRight size={14} /> 외부 assistant
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!agents.length && (
        <div className="empty">
          조건에 맞는 에이전트가 없습니다. 검색어나 필터를 변경해 주세요.
        </div>
      )}
      {detail && (
        <Modal title={detail.name} onClose={() => setDetail(undefined)}>
          <div className="stack">
            <p>{detail.summary}</p>
            <h3>사용 예시</h3>
            {detail.examples.map((x, i) => (
              <div className="card" key={i}>
                {x}
              </div>
            ))}
            {detail.link2 && (
              <a
                className="btn"
                href={detail.link2}
                target="_blank"
                rel="noreferrer"
              >
                설명서 열기 <ArrowUpRight size={15} />
              </a>
            )}
            <button
              className="btn primary"
              onClick={() => {
                location.hash = "#/agent/" + detail.id;
                setDetail(undefined);
              }}
            >
              업무 살펴보기
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
