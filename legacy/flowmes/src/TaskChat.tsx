import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowRight,
  FilePlus2,
  Paperclip,
  Plus,
  Users,
  Square,
} from "lucide-react";
import { useStore } from "./store";
import { Avatar, AssistantMark, FileCard, formatTime } from "./ui";
import { event, now, uid, USERS } from "./domain";
import {
  DEFAULT_CONNECTION,
  mainThreadId,
  resolveModel,
  threadsFor,
} from "./workflow";
import { buildMessages, requestCompletion } from "./llm";
import { getFile } from "./storage";
import type { Message, Stage, Work } from "./types";

import { requests, subscribe, requestState } from "./chatRequests";

export function TaskChat({ work, stage }: { work: Work; stage: Stage }) {
  const { state, update, notify, upload, apiKey } = useStore();
  const threads = threadsFor(stage);
  const [threadId, setThreadId] = useState(
      stage.activeThreadId || mainThreadId(stage),
    ),
    [draft, setDraft] = useState(""),
    [speaker, setSpeaker] = useState(state.profile),
    [kind, setKind] = useState<"prompt" | "discussion">("prompt"),
    [includeText, setIncludeText] = useState(false),
    [threadName, setThreadName] = useState(""),
    [creating, setCreating] = useState(false);
  const selected = threads.find((t) => t.id === threadId) || threads[0];
  const key = `${work.id}/${stage.id}/${selected.id}`;
  const pending = useSyncExternalStore(subscribe, () => requests.get(key));
  const busy = !!pending?.controller;
  const messages = stage.messages.filter(
    (m) => (m.threadId || mainThreadId(stage)) === selected.id,
  );
  const config = state.connection || DEFAULT_CONNECTION,
    model = resolveModel(state, stage, selected);
  const bottom = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null);
  const inputs = state.artifacts.filter((a) => stage.inputs.includes(a.id));
  const readable = inputs.filter(
    (a) => a.mime.startsWith("text/") || /\.(md|txt|csv|json)$/i.test(a.name),
  );
  const unsupported = inputs.filter((a) => !readable.includes(a));
  useEffect(() => {
    const el = bottom.current?.parentElement;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy, selected.id]);
  function modify(recipe: (s: Stage) => Stage) {
    update((s) => ({
      ...s,
      works: s.works.map((w) =>
        w.id === work.id
          ? {
              ...w,
              stages: w.stages.map((t) => (t.id === stage.id ? recipe(t) : t)),
            }
          : w,
      ),
    }));
  }
  async function send() {
    if (!draft.trim() || requests.get(key)?.controller) return;
    const controller = new AbortController();
    requestState(key, { controller });
    const text = draft.trim(),
      actor = speaker,
      thread = selected.id,
      requestModel = model,
      connection = { ...config };
    const timeout = setTimeout(() => controller.abort(), 60000);
    let submitted = false;
    try {
      let attachmentText = "";
      if (includeText && kind === "prompt") {
        for (const a of readable) {
          if (a.size > 200000)
            throw new Error(
              `${a.name}: 텍스트 본문 전송은 파일당 200KB까지 가능합니다.`,
            );
          attachmentText += `\n--- ${a.name} ---\n${await (await getFile(a)).text()}\n`;
          if (attachmentText.length > 300000)
            throw new Error(
              "한 요청의 첨부 텍스트가 300,000자를 초과했습니다. 입력 자료를 줄여 주세요.",
            );
        }
      }
      if (controller.signal.aborted) throw new Error("요청을 취소했습니다.");
      const user: Message = {
        id: uid(),
        role: "user",
        content: text,
        actor,
        at: now(),
        threadId: thread,
        kind,
        files:
          kind === "prompt" && includeText ? readable.map((a) => a.id) : [],
        ...(attachmentText ? { attachmentText } : {}),
      };
      update((s) => ({
        ...s,
        works: s.works.map((w) =>
          w.id === work.id
            ? {
                ...w,
                stages: w.stages.map((t) =>
                  t.id === stage.id
                    ? {
                        ...t,
                        threads: threadsFor(t),
                        messages: [...t.messages, user],
                      }
                    : t,
                ),
              }
            : w,
        ),
        events: [
          {
            ...event(
              s,
              work.id,
              stage.id,
              kind === "discussion" ? "팀 의견" : "Assistant 요청",
              `${selected.title} · ${kind === "prompt" ? requestModel + " · " : ""}${text.slice(0, 80)}`,
            ),
            actor,
          },
          ...s.events,
        ],
      }));
      setDraft("");
      submitted = true;
      if (kind === "discussion") {
        requestState(key, {});
        return;
      }
      let response: string;
      if (connection.mode === "api")
        response = await requestCompletion(
          connection,
          apiKey,
          requestModel,
          buildMessages(
            [
              ...stage.messages.map((m) => ({
                ...m,
                threadId: m.threadId || mainThreadId(stage),
              })),
              user,
            ],
            thread,
            connection.sendNames,
          ),
          controller.signal,
        );
      else {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, 650);
          controller.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(t);
              reject(new Error("요청을 취소했습니다."));
            },
            { once: true },
          );
        });
        response = `${actor}님의 요청을 검토 항목으로 정리했습니다.\n\n요청 사항\n${text}\n\n1. 변경 범위와 관련 요구사항 ID 확인\n2. 정상 처리와 예외 조건 구분\n3. 기대 결과 및 검증 근거 정리\n\n현재 대화의 참여자 의견을 구분하여 검토하고, 합의가 필요한 항목은 담당자가 확인해 주세요.\n\n[샘플 응답] 실제 모델 호출이나 첨부 자료 분석 결과가 아닙니다.`;
      }
      if (controller.signal.aborted) throw new Error("요청을 취소했습니다.");
      modify((t) => ({
        ...t,
        messages: [
          ...t.messages,
          {
            id: uid(),
            role: "assistant",
            content: response,
            actor: stage.assistant,
            at: now(),
            threadId: thread,
            model: requestModel,
            source: connection.mode,
          },
        ],
      }));
      requestState(key, {});
    } catch (e) {
      if (requests.get(key)?.controller !== controller) return;
      requestState(key, {
        error:
          (e as Error).message +
          (submitted
            ? " 입력 메시지는 대화에 남아 있습니다. 새 요청으로 다시 호출할 수 있습니다."
            : ""),
      });
    } finally {
      clearTimeout(timeout);
    }
  }
  function saveOutput(m: Message) {
    const id = uid(),
      name = `${stage.short}_검토초안_${stage.outputs.length + 1}.md`,
      content = `# ${stage.name} · 검토 초안\n\n> ${m.source === "api" ? "API 응답" : "데모 샘플"} · 모델 ${m.model || "기존 샘플"} · 담당자 검토 필요\n\n${m.content}`;
    update((s) => ({
      ...s,
      artifacts: [
        {
          id,
          name,
          mime: "text/markdown",
          size: new Blob([content]).size,
          version: "0.1",
          workId: work.id,
          stageId: stage.id,
          createdBy: s.profile,
          createdAt: now(),
          content,
        },
        ...s.artifacts,
      ],
      works: s.works.map((w) =>
        w.id === work.id
          ? {
              ...w,
              stages: w.stages.map((t) =>
                t.id === stage.id ? { ...t, outputs: [...t.outputs, id] } : t,
              ),
            }
          : w,
      ),
      events: [event(s, work.id, stage.id, "산출물 추가", name), ...s.events],
    }));
    notify("응답을 산출물 초안으로 저장했습니다.");
  }
  return (
    <>
      <div className="thread-toolbar">
        <label>
          대화방
          <select
            aria-label="대화방 선택"
            value={selected.id}
            onChange={(e) => {
              setThreadId(e.target.value);
              modify((s) => ({ ...s, activeThreadId: e.target.value }));
              setDraft("");
            }}
          >
            {threads.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <button
          className="icon-button"
          title="새 대화방"
          aria-label="새 대화방"
          onClick={() => setCreating(!creating)}
        >
          <Plus size={17} />
        </button>
        <label>
          대화 모델
          <select
            aria-label="대화 모델"
            disabled={busy}
            value={selected.model || ""}
            onChange={(e) =>
              modify((t) => ({
                ...t,
                threads: threadsFor(t).map((th) =>
                  th.id === selected.id ? { ...th, model: e.target.value } : th,
                ),
              }))
            }
          >
            <option value="">Task 기본값 · {resolveModel(state, stage)}</option>
            {[
              ...new Set([
                ...config.models,
                ...(selected.model ? [selected.model] : []),
              ]),
            ].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      {creating && (
        <form
          className="thread-create"
          onSubmit={(e) => {
            e.preventDefault();
            if (!threadName.trim()) return;
            const t = { id: uid(), title: threadName.trim(), createdAt: now() };
            modify((s) => ({
              ...s,
              threads: [...threadsFor(s), t],
              activeThreadId: t.id,
            }));
            setThreadId(t.id);
            setThreadName("");
            setDraft("");
            setCreating(false);
          }}
        >
          <input
            aria-label="새 대화방 이름"
            value={threadName}
            onChange={(e) => setThreadName(e.target.value)}
            placeholder="예: QA 검토 회의"
            autoFocus
          />
          <button className="button">대화방 만들기</button>
        </form>
      )}
      <div className="shared-chat-banner">
        <Users size={14} />
        <span>작성자별 대화 기록 · 이 브라우저에서 참여자 전환 체험</span>
        <span className="sample-tag">
          {config.mode === "api" ? "API" : "DEMO"}
        </span>
      </div>
      <div className="chat-messages">
        {!messages.length && (
          <div className="chat-welcome">
            <AssistantMark />
            <h3>{selected.title}, 함께 시작해 볼까요?</h3>
            <p>
              팀 의견을 남기거나 assistant에게 요청하세요.
              <br />
              다른 대화방의 메시지는 이 대화에 전송되지 않습니다.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div className={`message ${m.role}`} key={m.id}>
            {m.role === "assistant" ? (
              <AssistantMark small />
            ) : (
              <Avatar name={m.actor} small />
            )}
            <div className="message-body">
              <div className="message-meta">
                <strong>{m.actor}</strong>
                <span className="sample-tag">
                  {m.role === "assistant"
                    ? m.source === "api"
                      ? "API"
                      : "DEMO"
                    : m.kind === "discussion"
                      ? "팀 의견"
                      : "요청"}
                </span>
                <time>{formatTime(m.at)}</time>
              </div>
              {m.model && <div className="message-model">{m.model}</div>}
              <div className="message-text">{m.content}</div>
              {m.files?.map((id) => {
                const a = state.artifacts.find((a) => a.id === id);
                return a ? <FileCard key={id} artifact={a} compact /> : null;
              })}
              {m.role === "assistant" && (
                <button className="save-response" onClick={() => saveOutput(m)}>
                  <FilePlus2 size={13} />
                  산출물로 저장
                </button>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="typing">
            <AssistantMark small />
            <span />
            <span />
            <span />
            <small>
              {config.mode === "api"
                ? "API 응답을 기다리고 있습니다"
                : "샘플 응답을 준비하고 있습니다"}
            </small>
          </div>
        )}
        {pending?.error && (
          <p className="form-error chat-error" role="alert">
            {pending.error}
          </p>
        )}
        <div ref={bottom} />
      </div>
      <div className="composer-area">
        <div className="conversation-controls">
          <label>
            작성자 (데모)
            <select
              aria-label="대화 작성자"
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
            >
              {[...new Set([state.profile, ...USERS])].map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
          <div className="conversation-mode">
            <button
              className={kind === "prompt" ? "active" : ""}
              onClick={() => setKind("prompt")}
            >
              Assistant 요청
            </button>
            <button
              className={kind === "discussion" ? "active" : ""}
              onClick={() => setKind("discussion")}
            >
              팀 의견만 남기기
            </button>
          </div>
        </div>
        <div className="chat-composer">
          <textarea
            aria-label="assistant 메시지"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              kind === "discussion"
                ? "동료에게 남길 의견을 입력하세요…"
                : `${stage.assistant}에게 요청하세요…`
            }
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="composer-controls">
            <div>
              <button
                className="icon-button"
                aria-label="대화에 파일 첨부"
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip size={17} />
              </button>
              <span>{inputs.length}개 입력 자료</span>
            </div>
            {busy ? (
              <button
                className="button"
                onClick={() => pending?.controller?.abort()}
              >
                <Square size={12} />
                응답 중지
              </button>
            ) : (
              <button
                className="send-button"
                aria-label="메시지 보내기"
                disabled={!draft.trim()}
                onClick={() => void send()}
              >
                <ArrowRight size={18} />
              </button>
            )}
          </div>
        </div>
        {kind === "prompt" && (
          <label className="check-option file-context-option">
            <input
              type="checkbox"
              checked={includeText}
              onChange={(e) => setIncludeText(e.target.checked)}
            />
            입력 텍스트 {readable.length}개 본문을 함께 전달{" "}
            {unsupported.length > 0 && (
              <span>
                · PDF/Office/이미지 등 {unsupported.length}개는 전송 제외
              </span>
            )}
          </label>
        )}
        <div className="composer-caption">
          {kind === "discussion"
            ? "팀 의견은 다음 assistant 요청 때 대화 맥락에 포함됩니다."
            : config.mode === "demo"
              ? "샘플 응답 모드 · 실제 파일 분석 없음"
              : `API · ${model} · 선택한 텍스트와 이 대화 기록 전송`}
        </div>
        <input
          ref={fileInput}
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
    </>
  );
}
