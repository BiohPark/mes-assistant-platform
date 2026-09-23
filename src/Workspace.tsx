import { suggestSrTitle } from "./app/titleService";
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
import { uid, now, canSeeWork, canSeeThread, visibleMessages } from "./domain";
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
import { TagEditor } from "./TagEditor";
import { MaterialLibrary, SelectedInputs } from "./MaterialLibrary";
import { WorkStatusMenu } from "./HubHome";
import { selectedMaterials, workTags, activityOrder } from "./hub";
import { assessChecklist, cancelChecklistAssessment } from "./app/checklistAssessment";
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
  const [assessing, setAssessing] = useState(false);
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
        (!r.kind || r.kind === "chat") &&
        (staff || (r.role === "requester" && r.actorId === s.session.userId)),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);
  const busy =
    starting ||
    currentRequest?.status === "pending" ||
    currentRequest?.status === "streaming";
  const latestAssessment = (s.checklistAssessments ?? [])
    .filter(a => a.workId === w.id)
    .sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  const commandContext = {
    actorId: s.session.userId,
    role: s.session.role,
    tabId,
    commandId: uid(),
    epoch,
  };
  async function send(retryOf?: string, transportOverride?: "inline") {
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
        transportOverride,
      );
      setText("");
      void runRequest(hubDB, prepared, apiKeys[prepared.profile.id] || "");
    } catch (e) {
      notify(e instanceof Error ? e.message : "전송 실패");
    } finally {
      setStarting(false);
    }
  }
  async function saveOutput(
    content: string,
    sourceMessageIds: string[] = [],
    kind: "input" | "output" = "output",
  ) {
    const name = window.prompt("산출물 이름", "검토 결과.md");
    if (!name) return;
    const older = s.artifacts
      .filter((f) => f.workId === w!.id && f.name === name)
      .sort((a, b) => b.version - a.version)[0];
    if (
      !(await dispatch({
        type: "artifact.add",
        kind,
        artifact: {
          id: uid(),
          workId: w!.id,
          name,
          mime: "text/markdown",
          sourceMessageIds,
          originThreadId: t.id,
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
    const picked = messages.filter((m) => selected.includes(m.id));
    await saveOutput(
      picked
        .map((m) => "[출처: " + m.actor + " · " + m.at + "]\n" + m.content)
        .join("\n\n"),
      picked.map((m) => m.id),
      picked.every((m) => m.role === "assistant") ? "output" : "input",
    );
    setSelected([]);
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
          {a.intake &&
            !s.requests.some((r) => r.workId === w.id && r.number) && (
              <button
                className="primary"
                onClick={async () => {
                  const r = s.requests.find((r) => r.workId === w.id),
                    id = r?.id ?? uid();
                  if (
                    await dispatch(
                      r
                        ? { type: "sr.submit", srId: id }
                        : { type: "sr.register", workId: w.id, id },
                    )
                  ) {
                    notify("SR 접수가 완료되었습니다.");
                    void suggestSrTitle(
                      hubDB,
                      id,
                      apiKeys[a.profileId] || "",
                      commandContext,
                    );
                  }
                }}
              >
                SR 접수
              </button>
            )}
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
              <WorkStatusMenu work={w} />
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
          <h3>통합 자료함</h3>
          <div className="row wrap">
            {(staff
              ? (["input", "output"] as const)
              : (["input"] as const)
            ).map((kind) => (
              <label className="btn" key={kind}>
                {kind === "input" ? "입력 업로드" : "산출물 업로드"}
                <input
                  type="file"
                  hidden
                  multiple
                  aria-label={
                    kind === "input" ? "입력 파일 업로드" : "산출물 파일 업로드"
                  }
                  disabled={w.status === "done"}
                  onChange={(e) => {
                    void upload(e.target.files, kind);
                    e.target.value = "";
                  }}
                />
              </label>
            ))}
          </div>
          <p className="small muted">
            텍스트 원문은 선택 후 전송됩니다. PDF·Office·이미지 분석은 별도
            어댑터가 필요합니다.
          </p>
          <MaterialLibrary workId={w.id} onPreview={setPreview} />
        </aside>
        <main className="chat-panel">
          <div className="chat-toolbar">
            <select
              aria-label="최근 대화"
              value={w.id}
              onChange={(e) => (location.hash = "#/work/" + e.target.value)}
            >
              {s.works
                .filter(
                  (x) =>
                    x.agentId === a.id && canSeeWork(s, x.id) && !x.archived,
                )
                .sort(activityOrder)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                  </option>
                ))}
            </select>
            {staff && (
              <a className="btn" href={"#/agent/" + a.id}>
                + 새 대화
              </a>
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
          <TagEditor workId={w.id} />
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
                        <button onClick={() => saveOutput(m.content, [m.id])}>
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
                    {busy && currentRequest.phase && (
                      <span>· { { uploading: "파일 업로드 중", processing: "파일 처리 대기", chat: "대화 응답 대기" }[currentRequest.phase] } </span>
                    )}
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
                    {currentRequest.status === "failed" && currentRequest.transport === "openwebui" && w.status !== "done" && <>
                      {(currentRequest.fileIds ?? []).filter(id => (s.taskInputs ?? []).some(i => i.workId === w.id && i.artifactId === id)).map(id => {
                        const file = s.artifacts.find(f => f.id === id);
                        return <button key={id} onClick={() => void dispatch({ type: "input.set", workId: w.id, artifactId: id, selected: false })}>
                          {file?.name ?? id} 제외
                        </button>;
                      })}
                      {(currentRequest.fileIds ?? []).every(id => s.artifacts.find(f => f.id === id)?.content !== undefined) &&
                        <button onClick={() => void send(currentRequest.id, "inline")}>선택 텍스트로 재시도</button>}
                    </>}
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
                  {selected.length}개 메시지를 Markdown 자료로 저장
                </button>
              )}
              <div className="composer">
                <SelectedInputs workId={w.id} onPreview={setPreview} />
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
                      <button
                        onClick={() =>
                          document
                            .getElementById("materials")
                            ?.scrollIntoView({ behavior: "smooth" })
                        }
                      >
                        <Plus size={14} /> 관련 자료 선택
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
                          selectedMaterials(s, w.id)
                            .map(
                              (f) =>
                                f.name +
                                " v" +
                                f.version +
                                "\n" +
                                (f.content ?? "[다운로드하여 첨부]"),
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
              <button disabled={assessing || latestAssessment?.status === "pending" || !w.checks.length || w.status === "done"}
                onClick={async () => {
                  setAssessing(true);
                  try {
                    const a = s.agents.find(a => a.id === w.agentId)!;
                    await assessChecklist(hubDB, w.id, commandContext, apiKeys[a.profileId] || "");
                    notify("AI 달성도 점검 결과를 기록했습니다.");
                  } catch (e) { notify(e instanceof Error ? e.message : "점검 실패"); }
                  finally { setAssessing(false); }
                }}>
                AI 달성도 점검
              </button>
              {latestAssessment?.status === "pending" && <div role="status">점검 중… <button onClick={() => void cancelChecklistAssessment(hubDB, latestAssessment.id, commandContext).catch(e => notify(String(e)))}>점검 중지</button></div>}
              {latestAssessment && latestAssessment.status !== "pending" && <div className="assessment-result">
                <strong>AI 평가 {latestAssessment.score.achieved}/{latestAssessment.score.total}</strong>
                <span> · 현재 체크 {w.checks.filter(c => c.done).length}/{w.checks.length}</span>
                <p className="small muted">판단 불가 {latestAssessment.score.unknown} · {latestAssessment.model} · {new Date(latestAssessment.at).toLocaleString()}</p>
                {latestAssessment.status === "conflict" && <p>점검 중 체크리스트가 변경되었습니다. 결과를 확인한 뒤 재점검하세요.</p>}
                {latestAssessment.error && <p>{latestAssessment.error}</p>}
                {latestAssessment.results.map(result => <p key={result.id} className="small">
                  {w.checks.find(c => c.id === result.id)?.label ?? result.id}: { { achieved: "달성", unmet: "미달성", unknown: "판단 불가" }[result.verdict] } · {result.reason}
                  {result.references.length > 0 && <span> · 근거 {result.references.join(", ")}</span>}
                </p>)}
              </div>}
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
              <h3>같은 태그의 업무</h3>
              {s.works
                .filter(
                  (x) =>
                    x.id !== w.id &&
                    workTags(s, x.id).some((tag) =>
                      workTags(s, w.id).some((t) => t.id === tag.id),
                    ),
                )
                .map((x) => (
                  <p key={x.id}>
                    <a href={"#/work/" + x.id}>{x.title}</a>
                  </p>
                ))}
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
          {preview.originThreadId && canSeeThread(s, preview.originThreadId) && (
            <p>
              원본 대화:{" "}
              <a href={"#/work/" + preview.workId}>
                {s.works.find((x) => x.id === preview.workId)?.title}
              </a>
            </p>
          )}
          {preview.sourceMessageIds?.map((id) => {
            const m = preview.originThreadId
              ? visibleMessages(s, preview.originThreadId).find(x => x.id === id)
              : s.session.role === "requester" ? undefined : s.messages.find(x => x.id === id);
            if (!m) return null;
            return (
              <blockquote key={id}>
                <small>{m ? actor(m.actor) + " · " + m.at : id}</small>
                <p className="prewrap">{m?.content}</p>
              </blockquote>
            );
          })}
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
