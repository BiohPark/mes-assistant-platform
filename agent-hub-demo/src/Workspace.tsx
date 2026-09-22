import { WorkSettingsDialog } from "./WorkSettingsDialog";
import { downloadWorkExport } from "./export";
import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Send,
  Paperclip,
  ArrowUpRight,
  Plus,
  Download,
  MessageSquare,
  CheckCheck,
  Link2,
} from "lucide-react";
import { useHub } from "./store";
import { uid, now, canSeeWork, visibleMessages } from "./domain";
import { Avatar, Modal, statusLabels } from "./ui";
import { putBlob, downloadArtifact, saveDownload, getBlob } from "./files";
import { hubDB } from "./db/schema";
import {
  startRequest,
  runRequest,
  cancelRequest,
  requestSnapshot,
} from "./app/requestService";
import { tabId } from "./app/session";
import { ContextPicker } from "./ContextPicker";
import type { ArtifactVersion, ContextBundle } from "./types";
export function Workspace({
  workId,
  intake = false,
}: {
  workId: string;
  intake?: boolean;
}) {
  const { state: s, dispatch, notify, apiKeys, epoch } = useHub();
  const w = s.works.find((x) => x.id === workId);
  const [text, setText] = useState("");
  const [starting, setStarting] = useState(false);
  const [mode, setMode] = useState<"import" | "handoff" | null>(null);
  const [viewBundle, setBundle] = useState<ContextBundle | null>(null);
  const [preview, setPreview] = useState<ArtifactVersion | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [note, setNote] = useState("");
  const [discussion, setDiscussion] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [srModal, setSrModal] = useState(false);
  const [share, setShare] = useState(false);
  const [shareText, setShareText] = useState("");
  const [shareFiles, setShareFiles] = useState<string[]>([]);
  const [shareSr, setShareSr] = useState("");
  const [srQuery, setSrQuery] = useState("");
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setSelected([]);
    setText("");
  }, [workId, w?.activeThreadId]);
  useEffect(() => {
    let live = true;
    let url = "";
    setPreviewUrl("");
    setPreviewText("");
    if (preview?.blobId && preview.mime.startsWith("image/"))
      getBlob(preview.blobId)
        .then((b) => {
          if (live && b) {
            url = URL.createObjectURL(b);
            setPreviewUrl(url);
          }
        })
        .catch(() => {});
    if (preview) {
      if (preview.content !== undefined) setPreviewText(preview.content);
      else if (
        preview.blobId &&
        /^(text\/|application\/json)/.test(preview.mime)
      )
        getBlob(preview.blobId)
          .then((b) => b?.text())
          .then((t) => {
            if (live) setPreviewText(t ?? "파일을 찾을 수 없습니다.");
          });
    }
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [preview]);
  if (!w || !canSeeWork(s, workId))
    return <div className="empty">이 업무를 열람할 수 없습니다.</div>;
  const a = s.agents.find((x) => x.id === w.agentId)!;
  const threads = s.threads.filter(
    (t) =>
      t.workId === w.id &&
      (s.session.role !== "requester" ||
        s.requests.some(
          (r) => r.requester === s.session.userId && r.threadId === t.id,
        )),
  );
  const t = threads.find((t) => t.id === w.activeThreadId) ?? threads[0];
  if (!t) return <div>대화를 찾을 수 없습니다.</div>;
  const p = s.profiles.find((x) => x.id === a.profileId);
  const staff = s.session.role !== "requester";
  const messages = visibleMessages(s, t.id);
  const bundles = (staff ? t.activeBundleIds : [])
    .map((id) => s.bundles.find((b) => b.id === id))
    .filter((b): b is ContextBundle => !!b);
  const actor = (id: string) => s.users.find((u) => u.id === id)?.name ?? id;
  const artifact = (id: string) => s.artifacts.find((x) => x.id === id);
  const srIds = [...new Set(threads.flatMap((x) => x.srIds))];
  async function upload(files: FileList | null, kind: "input" | "output") {
    if (!files) return;
    for (const f of Array.from(files)) {
      try {
        const blobId = await putBlob(f);
        const isText =
          /^(text\/|application\/json)/.test(f.type) ||
          /\.(txt|md|csv|json|xml|log)$/i.test(f.name);
        const older = s.artifacts
          .filter((x) => x.workId === w!.id && x.name === f.name)
          .sort((x, y) => y.version - x.version)[0];
        await dispatch({
          type: "artifact.add",
          artifact: {
            id: uid(),
            workId: w!.id,
            name: f.name,
            mime: f.type || "application/octet-stream",
            size: f.size,
            version: (older?.version ?? 0) + 1,
            createdBy: s.session.userId,
            createdAt: now(),
            blobId,
            content: isText ? await f.text() : undefined,
            previousId: older?.id,
          },
          kind,
        });
      } catch (e) {
        notify(String(e));
      }
    }
  }
  const currentRequest = (s.requestRecords ?? [])
    .filter(
      (r) =>
        r.threadId === t.id &&
        (staff || (r.role === "requester" && r.actorId === s.session.userId)),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);
  const busy =
    starting ||
    currentRequest?.status === "pending" ||
    currentRequest?.status === "streaming";
  const commandContext = {
    actorId: s.session.userId,
    role: s.session.role,
    tabId,
    commandId: uid(),
    epoch,
  };
  async function send(retryOf?: string) {
    const old = retryOf
      ? s.messages.find((m) => m.id === currentRequest?.userMessageId)?.content
      : undefined;
    const prompt = old ?? text.trim();
    if (!prompt || (busy && !discussion)) return;
    setStarting(true);
    try {
      if (discussion) {
        if (
          await dispatch({
            type: "message.add",
            message: {
              id: uid(),
              threadId: t.id,
              role: "user",
              actor: s.session.userId,
              content: prompt,
              at: now(),
              kind: "discussion",
              source: "human",
              contextIds: [],
              fileIds: [],
            },
          })
        )
          setText("");
        return;
      }
      const prepared = await startRequest(
        hubDB,
        t.id,
        prompt,
        commandContext,
        retryOf,
      );
      setText("");
      void runRequest(hubDB, prepared, apiKeys[prepared.profile.id] || "");
    } catch (e) {
      notify(e instanceof Error ? e.message : "전송 실패");
    } finally {
      setStarting(false);
    }
  }
  async function saveOutput(content: string) {
    const name = window.prompt("산출물 이름", "검토 결과.md");
    if (!name) return;
    const older = s.artifacts
      .filter((f) => f.workId === w!.id && f.name === name)
      .sort((a, b) => b.version - a.version)[0];
    if (
      !(await dispatch({
        type: "artifact.add",
        kind: "output",
        artifact: {
          id: uid(),
          workId: w!.id,
          name,
          mime: "text/markdown",
          size: new Blob([content]).size,
          version: (older?.version ?? 0) + 1,
          previousId: older?.id,
          createdBy: s.session.userId,
          createdAt: now(),
          content,
        },
      }))
    )
      return;
    notify("산출물로 저장했습니다.");
  }
  async function saveSelected() {
    if (!selected.length) return;
    const name = window.prompt("컨텍스트 묶음 이름", w!.title + " 발췌");
    if (!name) return;
    if (
      !(await dispatch({
        type: "bundle.save",
        bundle: {
          id: uid(),
          name,
          sourceWorkId: w!.id,
          createdBy: s.session.userId,
          createdAt: now(),
          excerpts: messages
            .filter((m) => selected.includes(m.id))
            .map((m) => ({
              messageId: m.id,
              threadId: m.threadId,
              actor: m.actor,
              content: m.content,
              at: m.at,
            })),
          artifactIds: [],
          summary: "",
          note: "",
        },
      }))
    )
      return;
    setSelected([]);
    notify("재사용할 컨텍스트를 저장했습니다.");
  }
  const fileRow = (id: string, kind?: "input" | "output") => {
    const f = artifact(id);
    return (
      f && (
        <div className="file-row" key={id}>
          <button className="file-name" onClick={() => setPreview(f)}>
            <Paperclip size={14} />
            <span>
              {f.name}
              <small>
                v{f.version} · {actor(f.createdBy)}
              </small>
            </span>
          </button>
          <button
            aria-label={f.name + " 다운로드"}
            onClick={() => downloadArtifact(f).catch((e) => notify(e.message))}
          >
            <Download size={14} />
          </button>
          {kind && staff && (
            <button
              aria-label={f.name + " 연결 제거"}
              onClick={async () =>
                await dispatch({
                  type: "artifact.unlink",
                  workId: w.id,
                  artifactId: id,
                  kind,
                })
              }
            >
              ×
            </button>
          )}
        </div>
      )
    );
  };
  return (
    <div className="workspace">
      {w.status === "done" && (
        <div className="selection-bar">
          완료된 업무입니다. 자료와 기준을 변경하려면 사유를 남겨 재개하세요.
        </div>
      )}
      <header className="work-head">
        <div className="row">
          <button
            className="icon-btn"
            onClick={() =>
              (location.hash = intake ? "#/requests" : "#/agent/" + a.id)
            }
          >
            <ArrowLeft size={18} />
          </button>
          <Avatar agent={a} />
          <div>
            <div className="eyebrow">{a.name} / 독립 업무</div>
            <h1>{w.title}</h1>
            <span className="muted">
              {actor(w.owner)} · {statusLabels[w.status]}
              {w.archived ? " · 보관됨" : ""}
            </span>
          </div>
        </div>
        <div className="row wrap">
          <button
            onClick={() => {
              navigator.clipboard
                .writeText(
                  location.origin +
                    location.pathname +
                    "#/work/" +
                    w.id +
                    "?thread=" +
                    t.id,
                )
                .then(() => notify("대화 링크를 복사했습니다."))
                .catch(() => notify("링크 복사 권한을 확인하세요."));
            }}
          >
            <Link2 size={14} /> 링크
          </button>
          {staff && (
            <>
              <button onClick={() => setEditing(true)}>업무 설정</button>
              <button onClick={() => setMode("handoff")}>
                <ArrowUpRight size={15} /> 다른 에이전트로 전달
              </button>
              <button
                onClick={() => {
                  setShareSr(srIds[0] ?? "");
                  setShare(true);
                }}
              >
                요청자에게 공유
              </button>
            </>
          )}
          {a.connectionMode !== "api" && a.link1 && (
            <a className="btn" href={a.link1} target="_blank" rel="noreferrer">
              외부 assistant ↗
            </a>
          )}
        </div>
      </header>
      <div className="work-grid">
        <aside className="work-side">
          <div className="section-title">
            자료 보관함 <span>{w.inputIds.length + w.outputIds.length}</span>
          </div>
          {(staff ? (["input", "output"] as const) : (["input"] as const)).map(
            (kind) => (
              <section key={kind}>
                <h3>
                  {kind === "input" ? "입력 자료" : "산출물"}{" "}
                  <label className="upload-icon" title="파일 업로드">
                    <Plus size={15} />
                    <input
                      type="file"
                      multiple
                      onChange={(e) => {
                        upload(e.target.files, kind);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </h3>
                {(kind === "input" ? w.inputIds : w.outputIds)
                  .filter(
                    (id) =>
                      staff || artifact(id)?.createdBy === s.session.userId,
                  )
                  .map((id) => fileRow(id, kind))}
                {!(kind === "input" ? w.inputIds : w.outputIds).length && (
                  <p className="muted small">
                    파일을 추가하거나 결과를 저장하세요.
                  </p>
                )}
              </section>
            ),
          )}
          <p className="small muted">
            텍스트는 API에 원문 전달됩니다. PDF·Office·이미지는 보관 및
            다운로드용이며 분석 어댑터가 필요합니다.
          </p>
          {staff && (
            <section>
              <h3>받은 컨텍스트</h3>
              {s.handoffs
                .filter((h) => h.targetWorkId === w.id)
                .map((h) => (
                  <button
                    className="context-tile"
                    key={h.id}
                    onClick={() =>
                      setBundle(s.bundles.find((b) => b.id === h.bundleId)!)
                    }
                  >
                    {s.bundles.find((b) => b.id === h.bundleId)?.name}
                    <small>
                      {h.active ? "연결 중" : "연결 해제 · 자료 보존"}
                    </small>
                  </button>
                ))}
            </section>
          )}
        </aside>
        <main className="chat-panel">
          <div className="chat-toolbar">
            <select
              aria-label="대화방"
              value={t.id}
              onChange={async (e) =>
                await dispatch({
                  type: "thread.select",
                  workId: w.id,
                  threadId: e.target.value,
                })
              }
            >
              {threads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            {staff && (
              <button
                title="새 대화방"
                onClick={async () => {
                  const title = window.prompt("새 대화방 이름", "새 대화");
                  if (title)
                    await dispatch({
                      type: "thread.create",
                      workId: w.id,
                      title,
                    });
                }}
              >
                <Plus size={16} />
              </button>
            )}
            <span className={"badge " + (p?.mode === "api" ? "live" : "")}>
              {p?.mode === "api" ? "실제 API" : "샘플 모드"}
            </span>
            <input
              className="model-input"
              aria-label="대화 모델"
              placeholder={a.defaultModel || p?.defaultModel || "기본 모델"}
              list="models"
              value={t.model}
              onChange={async (e) =>
                await dispatch({
                  type: "thread.model",
                  threadId: t.id,
                  model: e.target.value,
                })
              }
            />
            <datalist id="models">
              {p?.models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </datalist>
          </div>
          <div className="sr-tags">
            {t.srIds.map((id) => (
              <span className="chip" key={id}>
                {s.requests.find((r) => r.id === id)?.number || id}
                {staff && (
                  <button
                    onClick={async () =>
                      await dispatch({
                        type: "thread.sr",
                        threadId: t.id,
                        srIds: t.srIds.filter((x) => x !== id),
                      })
                    }
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {staff && (
              <button
                className="text-btn"
                onClick={() => {
                  setSrQuery("");
                  setSrModal(true);
                }}
              >
                + SR 연결
              </button>
            )}
          </div>
          {w.manual ? (
            <div className="manual-panel">
              <CheckCheck size={36} />
              <h2>수동으로 진행하는 업무</h2>
              <p>자료, 메모와 체크리스트로 진행 내용을 남겨 주세요.</p>
              <p className="muted">기존 대화와 결과물은 그대로 보존됩니다.</p>
            </div>
          ) : (
            <>
              <div className="messages">
                {!messages.length && (
                  <div className="chat-welcome">
                    <Avatar agent={a} size={64} />
                    <h2>{a.name}와 시작하세요</h2>
                    <p>{a.summary}</p>
                    {a.examples.slice(0, 2).map((ex) => (
                      <button key={ex} onClick={() => setText(ex)}>
                        {ex} ↗
                      </button>
                    ))}
                  </div>
                )}
                {messages.map((m) => (
                  <article
                    key={m.id}
                    className={
                      "message " +
                      m.role +
                      (m.kind === "discussion" ? " discussion" : "")
                    }
                  >
                    <header>
                      <span>
                        {m.role === "assistant" ? a.name : actor(m.actor)}{" "}
                        <small>
                          {m.kind === "discussion"
                            ? "팀 의견 · AI 미전송"
                            : m.model
                              ? `${m.model} · ${m.source === "api" ? "API" : "샘플"}`
                              : "assistant 요청"}
                        </small>
                      </span>
                      <time>
                        {new Date(m.at).toLocaleTimeString("ko-KR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                      {staff && (
                        <input
                          type="checkbox"
                          aria-label="메시지 선택"
                          checked={selected.includes(m.id)}
                          onChange={(e) =>
                            setSelected((v) =>
                              e.target.checked
                                ? [...v, m.id]
                                : v.filter((id) => id !== m.id),
                            )
                          }
                        />
                      )}
                    </header>
                    <div className="message-body">{m.content}</div>
                    <footer>
                      {m.role === "assistant" && staff && (
                        <button onClick={() => saveOutput(m.content)}>
                          산출물로 저장
                        </button>
                      )}
                      {m.contextIds.length > 0 && (
                        <span className="small muted">
                          전송 시 컨텍스트 {m.contextIds.length}개
                        </span>
                      )}
                      {m.requestId && (
                        <button
                          onClick={async () => {
                            try {
                              const record = s.requestRecords?.find(
                                (r) => r.id === m.requestId,
                              );
                              if (!record) throw Error("요청 기록이 없습니다.");
                              saveDownload(
                                new Blob(
                                  [
                                    JSON.stringify(
                                      await requestSnapshot(
                                        hubDB,
                                        record,
                                        commandContext,
                                      ),
                                      null,
                                      2,
                                    ),
                                  ],
                                  { type: "application/json" },
                                ),
                                "request-" + record.id + ".json",
                              );
                            } catch (e) {
                              notify(String(e));
                            }
                          }}
                        >
                          이 메시지의 전송 기록
                        </button>
                      )}
                      {m.requestSnapshot && staff && (
                        <button
                          onClick={() =>
                            saveDownload(
                              new Blob([m.requestSnapshot!], {
                                type: "application/json",
                              }),
                              "request-" + m.id + ".json",
                            )
                          }
                        >
                          전송 기록
                        </button>
                      )}
                    </footer>
                  </article>
                ))}
                {currentRequest && (
                  <div className="muted" role="status">
                    요청:{" "}
                    {
                      {
                        pending: "응답 대기",
                        streaming: "응답 수신",
                        succeeded: "완료",
                        failed: "실패",
                        cancelled: "중지됨",
                        interrupted: "연결 중단",
                      }[currentRequest.status]
                    }{" "}
                    ·{" "}
                    {currentRequest.actualModel ||
                      currentRequest.requestedModel}{" "}
                    · {currentRequest.source === "api" ? "API" : "샘플"}
                    {currentRequest.error && <p>{currentRequest.error}</p>}
                    {busy && currentRequest.actorId === s.session.userId && (
                      <button
                        onClick={() =>
                          void cancelRequest(
                            hubDB,
                            currentRequest.id,
                            commandContext,
                          ).catch((e) => notify(String(e)))
                        }
                      >
                        요청 중지
                      </button>
                    )}
                    {["failed", "cancelled", "interrupted"].includes(
                      currentRequest.status,
                    ) &&
                      w.status !== "done" && (
                        <button onClick={() => void send(currentRequest.id)}>
                          현재 선택 자료로 재시도
                        </button>
                      )}
                    <button
                      onClick={async () => {
                        try {
                          saveDownload(
                            new Blob(
                              [
                                JSON.stringify(
                                  await requestSnapshot(
                                    hubDB,
                                    currentRequest,
                                    commandContext,
                                  ),
                                  null,
                                  2,
                                ),
                              ],
                              { type: "application/json" },
                            ),
                            "request-" + currentRequest.id + ".json",
                          );
                        } catch (e) {
                          notify(String(e));
                        }
                      }}
                    >
                      전송 기록
                    </button>
                  </div>
                )}
              </div>
              {selected.length > 0 && (
                <button className="selection-bar" onClick={saveSelected}>
                  {selected.length}개 메시지를 컨텍스트로 저장
                </button>
              )}
              <div className="composer">
                <details>
                  <summary>
                    이번 대화의 입력 자료 ·{" "}
                    {(t.selectedInputIds ?? w.inputIds).length}개 선택
                  </summary>
                  <p className="small muted">
                    업로드한 자료는 아래에서 선택한 후 전송됩니다. 원문을 자르지
                    않으며 요청 한도는{" "}
                    {Math.round((p?.maxRequestBytes ?? 262144) / 1024)}{" "}
                    KiB입니다.
                  </p>
                  {w.inputIds
                    .filter(
                      (id) =>
                        staff || artifact(id)?.createdBy === s.session.userId,
                    )
                    .map((id) => (
                      <label className="check-row" key={id}>
                        <input
                          type="checkbox"
                          disabled={w.status === "done"}
                          checked={(t.selectedInputIds ?? w.inputIds).includes(
                            id,
                          )}
                          onChange={async (e) => {
                            await dispatch({
                              type: "thread.inputs",
                              threadId: t.id,
                              fileIds: e.target.checked
                                ? [...(t.selectedInputIds ?? w.inputIds), id]
                                : (t.selectedInputIds ?? w.inputIds).filter(
                                    (x) => x !== id,
                                  ),
                            });
                          }}
                        />
                        {artifact(id)?.name} · v{artifact(id)?.version}
                      </label>
                    ))}
                </details>
                {bundles.length > 0 && (
                  <div className="context-chips">
                    {bundles.map((b) => (
                      <span className="chip" key={b.id}>
                        <button onClick={() => setBundle(b)}>
                          {b.name} · 메시지 {b.excerpts.length} · 파일{" "}
                          {b.artifactIds.length}
                        </button>
                        <button
                          aria-label="활성 컨텍스트 제거"
                          onClick={async () =>
                            await dispatch({
                              type: "context.detach",
                              threadId: t.id,
                              bundleId: b.id,
                            })
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <textarea
                  aria-label="대화 입력"
                  placeholder={
                    discussion
                      ? "팀에 의견을 남겨 주세요. AI를 호출하지 않습니다."
                      : "메시지를 입력하세요. 필요한 이전 작업을 가져올 수 있습니다."
                  }
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <div className="row between">
                  <div className="row">
                    {staff && (
                      <button onClick={() => setMode("import")}>
                        <Plus size={14} /> 이전 작업 가져오기
                      </button>
                    )}
                    {staff && (
                      <label className="small row">
                        <input
                          type="checkbox"
                          checked={discussion}
                          onChange={(e) => setDiscussion(e.target.checked)}
                        />
                        팀 의견
                      </label>
                    )}
                  </div>
                  <button
                    className="primary"
                    disabled={
                      !text.trim() ||
                      (busy && !discussion) ||
                      w.status === "done" ||
                      (!discussion && a.connectionMode === "external")
                    }
                    onClick={() => void send()}
                  >
                    <Send size={15} />
                    {discussion ? "의견 남기기" : "assistant 호출"}
                  </button>
                </div>
                {a.connectionMode === "external" && (
                  <button
                    className="text-btn"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(
                          bundles
                            .map(
                              (b) =>
                                b.excerpts.map((e) => e.content).join("\n") +
                                "\n" +
                                b.summary +
                                "\n" +
                                b.note,
                            )
                            .join("\n\n"),
                        )
                        .then(() =>
                          notify(
                            "선택한 컨텍스트를 복사했습니다. 파일은 자료함에서 다운로드하세요.",
                          ),
                        )
                    }
                  >
                    외부 대화용 컨텍스트 복사
                  </button>
                )}
              </div>
            </>
          )}
        </main>
        {staff && (
          <aside className="work-side right">
            <section>
              <h3>
                체크리스트{" "}
                <span>
                  {w.checks.filter((c) => c.done).length}/{w.checks.length}
                </span>
              </h3>
              {w.checks.map((c) => (
                <label className="check-row" key={c.id}>
                  <input
                    type="checkbox"
                    disabled={w.status === "done"}
                    checked={c.done}
                    onChange={async (e) =>
                      await dispatch({
                        type: "work.check",
                        workId: w.id,
                        checkId: c.id,
                        done: e.target.checked,
                      })
                    }
                  />
                  {c.label}
                </label>
              ))}
              <button
                className="text-btn"
                onClick={async () => {
                  const label = window.prompt("달성 기준");
                  if (label)
                    await dispatch({
                      type: "work.check.add",
                      workId: w.id,
                      label,
                    });
                }}
              >
                + 항목 추가
              </button>
            </section>
            <section>
              <h3>업무 메모</h3>
              {w.status === "done" && (
                <p className="small muted">
                  추가 메모는 완료 후 기록으로 남으며 완료 당시 자료는 변경하지
                  않습니다.
                </p>
              )}
              {w.notes.map((n) => (
                <div className="note" key={n.id}>
                  <p>{n.text}</p>
                  <small>
                    {actor(n.actor)} · {new Date(n.at).toLocaleDateString()}
                  </small>
                </div>
              ))}
              <textarea
                aria-label="메모"
                placeholder="결정 사항이나 메모"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                disabled={!note.trim()}
                onClick={async () => {
                  if (
                    await dispatch({
                      type: "work.note",
                      workId: w.id,
                      text: note,
                    })
                  )
                    setNote("");
                }}
              >
                메모 남기기
              </button>
            </section>
            <section>
              <h3>완료 기록</h3>
              {(s.completions ?? [])
                .filter((c) => c.workId === w.id)
                .map((c) => (
                  <details key={c.id}>
                    <summary>
                      {new Date(c.at).toLocaleString()} ·{" "}
                      {c.legacy ? "이관 시점 스냅샷" : "업무 완료"}
                    </summary>
                    <p>
                      {c.reason || "완료 기준 충족"} · {actor(c.actor)}
                    </p>
                    <p>
                      체크리스트 {c.work.checks.filter((x) => x.done).length}/
                      {c.work.checks.length} · 입력 {c.work.inputIds.length} ·
                      산출물 {c.work.outputIds.length}
                    </p>
                    <button
                      onClick={() =>
                        saveDownload(
                          new Blob([JSON.stringify(c, null, 2)], {
                            type: "application/json",
                          }),
                          "completion-" + c.id + ".json",
                        )
                      }
                    >
                      완료 기록 다운로드
                    </button>
                  </details>
                ))}
              <h3>연결된 업무</h3>
              {s.handoffs
                .filter(
                  (h) => h.sourceWorkId === w.id || h.targetWorkId === w.id,
                )
                .map((h) => {
                  const other = s.works.find(
                    (x) =>
                      x.id ===
                      (h.sourceWorkId === w.id
                        ? h.targetWorkId
                        : h.sourceWorkId),
                  );
                  return (
                    <div className="relation" key={h.id}>
                      <a href={"#/work/" + other?.id}>
                        {h.sourceWorkId === w.id
                          ? "↗ 보낸 업무"
                          : "↙ 받은 업무"}{" "}
                        · {other?.title}
                      </a>
                      <small>
                        {actor(h.actor)} · {new Date(h.at).toLocaleDateString()}{" "}
                        · {h.active ? "연결 중" : "해제됨"}
                      </small>
                      {h.active && (
                        <button
                          onClick={async () =>
                            await dispatch({
                              type: "handoff.detach",
                              handoffId: h.id,
                            })
                          }
                        >
                          연결 해제
                        </button>
                      )}
                    </div>
                  );
                })}
            </section>
            <section>
              <h3>활동 이력</h3>
              {s.activities
                .filter((x) => x.workId === w.id)
                .slice()
                .reverse()
                .slice(0, 12)
                .map((x) => (
                  <div className="activity" key={x.id}>
                    <span>{x.action}</span>
                    <small>
                      {actor(x.actor)} · {x.detail}
                    </small>
                  </div>
                ))}
            </section>
            <button
              onClick={() =>
                downloadWorkExport(s, w.id).catch((e) => notify(e.message))
              }
            >
              결과·개선 자료 내보내기
            </button>
          </aside>
        )}
      </div>
      {mode && (
        <ContextPicker
          workId={w.id}
          threadId={t.id}
          mode={mode}
          onClose={() => setMode(null)}
        />
      )}
      {viewBundle && (
        <Modal title={viewBundle.name} onClose={() => setBundle(null)} wide>
          <p className="muted">
            출처: {s.works.find((x) => x.id === viewBundle.sourceWorkId)?.title}{" "}
            · {actor(viewBundle.createdBy)} ·{" "}
            {new Date(viewBundle.createdAt).toLocaleString()}
          </p>
          {viewBundle.excerpts.map((e, i) => (
            <blockquote key={i}>
              <small>{actor(e.actor)}</small>
              <p className="prewrap">{e.content}</p>
            </blockquote>
          ))}
          <h3>편집 요약</h3>
          <p className="prewrap">{viewBundle.summary || "없음"}</p>
          <h3>전달 메모</h3>
          <p>{viewBundle.note || "없음"}</p>
          {viewBundle.artifactIds.map((id) => fileRow(id))}
        </Modal>
      )}
      {preview && (
        <Modal
          title={preview.name + " · v" + preview.version}
          onClose={() => setPreview(null)}
          wide
        >
          <p className="muted">
            {actor(preview.createdBy)} ·{" "}
            {new Date(preview.createdAt).toLocaleString()} ·{" "}
            {preview.size.toLocaleString()} bytes
          </p>
          {previewUrl ? (
            <img
              className="attachment-preview"
              src={previewUrl}
              alt={preview.name}
            />
          ) : previewText ? (
            <pre className="file-preview">{previewText}</pre>
          ) : (
            <p>
              이 형식은 다운로드하여 확인하세요. 원문 파일은 그대로 보관됩니다.
            </p>
          )}
          <button
            onClick={() =>
              downloadArtifact(preview).catch((e) => notify(e.message))
            }
          >
            <Download size={16} /> 다운로드
          </button>
        </Modal>
      )}
      {srModal && (
        <Modal title="SR 접수번호 연결" onClose={() => setSrModal(false)}>
          <p className="muted">
            연결은 태그이며 내부 자료를 요청자에게 공개하지 않습니다.
          </p>
          <input
            placeholder="접수번호 검색"
            value={srQuery}
            onChange={(e) => setSrQuery(e.target.value)}
          />
          {s.requests
            .filter((r) => r.number && (!srQuery || r.number.includes(srQuery)))
            .map((r) => (
              <label className="check-row" key={r.id}>
                <input
                  type="checkbox"
                  checked={t.srIds.includes(r.id)}
                  onChange={async (e) =>
                    await dispatch({
                      type: "thread.sr",
                      threadId: t.id,
                      srIds: e.target.checked
                        ? [...t.srIds, r.id]
                        : t.srIds.filter((x) => x !== r.id),
                    })
                  }
                />
                {r.number} · {r.title}
              </label>
            ))}
        </Modal>
      )}
      {editing && (
        <WorkSettingsDialog work={w} onClose={() => setEditing(false)} />
      )}
      {share && (
        <Modal title="요청자에게 결과 공유" onClose={() => setShare(false)}>
          <p className="muted">
            여기에서 선택한 답변과 파일만 요청자에게 공개됩니다.
          </p>
          <select value={shareSr} onChange={(e) => setShareSr(e.target.value)}>
            <option value="">SR 선택</option>
            {s.requests
              .filter((r) => r.number)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.number} · {r.title}
                </option>
              ))}
          </select>
          <textarea
            placeholder="공유할 답변"
            value={shareText}
            onChange={(e) => setShareText(e.target.value)}
          />
          {[...w.inputIds, ...w.outputIds].map((id) => (
            <label className="check-row" key={id}>
              <input
                type="checkbox"
                checked={shareFiles.includes(id)}
                onChange={(e) =>
                  setShareFiles((v) =>
                    e.target.checked ? [...v, id] : v.filter((x) => x !== id),
                  )
                }
              />
              {artifact(id)?.name}
            </label>
          ))}
          <button
            className="primary"
            disabled={!shareSr || (!shareText.trim() && !shareFiles.length)}
            onClick={async () => {
              if (
                await dispatch({
                  type: "sr.share",
                  srId: shareSr,
                  workId: w.id,
                  text: shareText,
                  artifactIds: shareFiles,
                })
              ) {
                setShare(false);
                notify("선택한 결과를 공유했습니다.");
              }
            }}
          >
            선택한 결과 공유
          </button>
        </Modal>
      )}
    </div>
  );
}
