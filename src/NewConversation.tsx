import { useRef, useState } from "react";
import { useHub } from "./store";
import { Avatar } from "./ui";
import { uid, canSeeWork } from "./domain";
import { hubDB, readState } from "./db/schema";
import { startRequest, runRequest } from "./app/requestService";
import { tabId } from "./app/session";
import { putBlob } from "./files";
import { beginConversation } from "./app/draftService";
import { activityOrder } from "./hub";

export function NewConversation({
  agentId,
  intake = false,
  srId,
}: {
  agentId: string;
  intake?: boolean;
  srId?: string;
}) {
  const { state: s, dispatch, notify, apiKeys, epoch } = useHub();
  const [text, setText] = useState(""),
    [model, setModel] = useState(""),
    [busy, setBusy] = useState(false);
  const locked = useRef(false),
    created = useRef<{ workId: string; srId?: string } | undefined>(undefined);
  const a = s.agents.find((a) => a.id === agentId),
    sr = s.requests.find((r) => r.id === srId);
  if (!a) return <div className="empty">에이전트가 없습니다.</div>;
  const p = s.profiles.find((p) => p.id === a.profileId);
  async function persist(file?: File) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      if (!file && !text.trim()) return;
      if (
        !file &&
        p?.mode === "api" &&
        !(model || a!.defaultModel || p.defaultModel).trim()
      )
        throw Error("공통 연결 또는 에이전트에서 실제 API 모델을 설정하세요.");
      const result = await beginConversation(
        hubDB,
        { agentId: a!.id, text, model, intake, srId, file },
        {
          actorId: s.session.userId,
          role: s.session.role,
          tabId,
          commandId: uid(),
          epoch,
        },
      );
      if (result.prepared)
        void runRequest(
          hubDB,
          result.prepared,
          apiKeys[result.prepared.profile.id] || "",
        );
      location.hash = intake
        ? "#/requests/" + result.srId
        : "#/work/" + result.workId;
    } catch (e) {
      notify(String(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="page conversation-entry">
      <aside className="recent-conversations">
        <a href="#/">← 에이전트</a>
        <h3>최근 대화</h3>
        {s.works
          .filter(
            (w) => w.agentId === a.id && !w.archived && canSeeWork(s, w.id),
          )
          .sort(activityOrder)
          .slice(0, 15)
          .map((w) => (
            <a key={w.id} href={"#/work/" + w.id}>
              {w.title}
              <small>{new Date(w.updatedAt).toLocaleDateString()}</small>
            </a>
          ))}
      </aside>
      <main className="draft-chat">
        <div className="chat-welcome">
          <Avatar agent={a} size={70} />
          <span className="eyebrow">
            {intake ? "SERVICE REQUEST" : a.lv1 + " / " + a.lv2}
          </span>
          <h1>{a.name}</h1>
          <p>{a.summary}</p>
          <p className="muted">
            {sr?.number
              ? `${sr.number} · 자료는 대화 시작 후 직접 선택하세요.`
              : "대화를 시작하면 하나의 업무로 저장됩니다."}
          </p>
          {a.examples.map((ex) => (
            <button key={ex} onClick={() => setText(ex)}>
              {ex}
            </button>
          ))}
        </div>
        <div className="composer card">
          <div className="row between">
            <span className="badge">
              {p?.mode === "api" ? "실제 API" : "샘플 모드"}
            </span>
            <input
              aria-label="새 대화 모델"
              placeholder={
                a.defaultModel ||
                p?.defaultModel ||
                "default — 공통 연결 기본값"
              }
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          <textarea
            autoFocus
            aria-label="새 대화 입력"
            placeholder={
              intake
                ? "요청을 편하게 설명하세요. 제목은 나중에 수정할 수 있습니다."
                : "무엇을 도와드릴까요?"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void persist();
              }
            }}
          />
          <div className="row between">
            <label className="btn">
              첨부로 시작
              <input
                aria-label="새 대화 첨부"
                type="file"
                hidden
                disabled={busy || a.status === "retired"}
                onChange={(e) => {
                  void persist(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              className="primary"
              disabled={!text.trim() || busy || a.status === "retired"}
              onClick={() => void persist()}
            >
              {busy
                ? "저장 중…"
                : a.connectionMode === "external"
                  ? "메모로 시작"
                  : "assistant 호출"}
            </button>
          </div>
          {a.status === "retired" && (
            <p>폐기된 에이전트는 기존 기록만 조회할 수 있습니다.</p>
          )}
          {a.link1 && (
            <a href={a.link1} target="_blank" rel="noreferrer">
              외부 assistant 열기 ↗
            </a>
          )}
        </div>
      </main>
    </div>
  );
}
