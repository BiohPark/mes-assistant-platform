import { useState } from "react";
import { Plus, Save, Download, Trash2, Upload, Settings2 } from "lucide-react";
import { useHub } from "./store";
import { Avatar, Modal } from "./ui";
import { putBlob, downloadBlob, getBlob } from "./files";
import type { Agent, ConnectionProfile } from "./types";
import { agentStatusLabels } from "./Gallery";
import "./catalog.css";
export function AgentAdmin() {
  const { state, dispatch, notify, apiKeys, setApiKey } = useHub();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Agent>();
  const [profile, setProfile] = useState<ConnectionProfile>();
  const [uploading, setUploading] = useState(false);
  if (state.session.role !== "admin")
    return (
      <div className="page empty">
        관리자 역할에서 에이전트와 연결 설정을 관리할 수 있습니다.
      </div>
    );
  const fresh = (): Agent => ({
    id: crypto.randomUUID(),
    name: "",
    lv1: "MES",
    lv2: "",
    summary: "",
    link1: "",
    link2: "",
    owner: state.session.userId,
    status: "open",
    examples: [],
    intake: false,
    connectionMode: "api",
    profileId: state.profiles[0]?.id || "",
    defaultModel: "",
    checklist: [],
    color: "#27614f",
  });
  function update<K extends keyof Agent>(key: K, value: Agent[K]) {
    setDraft((a) => (a ? { ...a, [key]: value } : a));
  }
  function pupdate<K extends keyof ConnectionProfile>(
    key: K,
    value: ConnectionProfile[K],
  ) {
    setProfile((a) => (a ? { ...a, [key]: value } : a));
  }
  async function upload(file?: File) {
    if (!file || !draft) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      notify("PNG, JPEG, WebP 이미지를 선택해 주세요");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify("이미지는 최대 5MB까지 가능합니다");
      return;
    }
    setUploading(true);
    try {
      const id = await putBlob(file);
      update("imageId", id);
    } catch {
      notify("이미지 저장에 실패했습니다. 저장 공간을 확인해 주세요");
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">AGENT OPERATIONS</span>
          <h1>에이전트 관리</h1>
          <p className="muted">
            에이전트의 소개, 접수 역할과 AI 연결을 한 곳에서 관리합니다.
          </p>
        </div>
        <button className="btn primary" onClick={() => setDraft(fresh())}>
          <Plus size={17} /> 에이전트 추가
        </button>
      </div>
      <div className="admin-layout">
        <section>
          <div className="toolbar">
            <input
              aria-label="관리 에이전트 검색"
              placeholder="에이전트 또는 담당자 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="admin-agent-list">
            {state.agents
              .filter((a) =>
                [
                  a.name,
                  state.users.find((u) => u.id === a.owner)?.name || a.owner,
                  a.lv1,
                  a.lv2,
                ]
                  .join(" ")
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((a) => (
                <button
                  className="card admin-agent-row"
                  key={a.id}
                  onClick={() => setDraft({ ...a })}
                >
                  <Avatar agent={a} size={42} />
                  <div>
                    <strong>{a.name}</strong>
                    <div className="muted">
                      {a.lv1} / {a.lv2} ·{" "}
                      {state.users.find((u) => u.id === a.owner)?.name ||
                        a.owner}
                    </div>
                  </div>
                  <span className="badge">{agentStatusLabels[a.status]}</span>
                  {a.intake && <span className="badge">SR 접수</span>}
                </button>
              ))}
          </div>
        </section>
        <aside className="card stack">
          <div className="row">
            <Settings2 size={19} />
            <h2>공통 AI 연결</h2>
          </div>
          <p className="muted">
            여러 에이전트가 같은 연결 프로필을 재사용할 수 있습니다.
          </p>
          {state.profiles.map((p) => (
            <button
              className="profile-row"
              key={p.id}
              onClick={() => setProfile({ ...p })}
            >
              <strong>{p.name}</strong>
              <span className="badge">
                {p.mode === "demo" ? "샘플" : "실제 API"}
              </span>
              <small className="muted">
                {p.defaultModel || "기본 모델 미설정"}
              </small>
            </button>
          ))}
          <button
            className="btn"
            onClick={() =>
              setProfile({
                id: crypto.randomUUID(),
                name: "새 연결",
                mode: "demo",
                baseUrl: "",
                chatPath: "/chat/completions",
                modelsPath: "/models",
                models: [],
                defaultModel: "",
                sendNames: false,
              })
            }
          >
            <Plus size={16} /> 연결 프로필 추가
          </button>
          <p className="muted">
            모델 우선순위
            <br />
            대화방 지정 → 에이전트 기본값 → 연결 프로필 기본값
          </p>
        </aside>
      </div>
      {draft && (
        <Modal
          title={
            state.agents.some((a) => a.id === draft.id)
              ? "에이전트 편집"
              : "에이전트 등록"
          }
          onClose={() => setDraft(undefined)}
          wide
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (
                dispatch({
                  type: "agent.save",
                  agent: {
                    ...draft,
                    examples: draft.examples
                      .map((x) => x.trim())
                      .filter(Boolean),
                    checklist: draft.checklist
                      .map((x) => x.trim())
                      .filter(Boolean),
                  },
                })
              ) {
                notify("에이전트 설정을 저장했습니다");
                setDraft(undefined);
              }
            }}
          >
            <div className="row image-editor">
              <Avatar agent={draft} size={80} />
              <div className="stack">
                <label className="btn">
                  <Upload size={15} />
                  {uploading ? "저장 중…" : "이미지 업로드 / 교체"}
                  <input
                    type="file"
                    hidden
                    accept="image/png,image/jpeg,image/webp"
                    disabled={uploading}
                    onChange={(e) => {
                      void upload(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <span className="muted">
                  PNG, JPEG, WebP · 최대 5MB · 미등록 시 이니셜
                </span>
                <div className="row">
                  {draft.imageId && (
                    <>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={async () => {
                          try {
                            const blob = await getBlob(draft.imageId!);
                            if (!blob) throw Error("missing");
                            const ext =
                              blob.type === "image/jpeg"
                                ? "jpg"
                                : blob.type === "image/webp"
                                  ? "webp"
                                  : "png";
                            await downloadBlob(
                              draft.imageId!,
                              draft.name + "." + ext,
                            );
                          } catch {
                            notify("이미지를 다운로드할 수 없습니다");
                          }
                        }}
                      >
                        <Download size={14} /> 다운로드
                      </button>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => update("imageId", undefined)}
                      >
                        <Trash2 size={14} /> 제거
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="form-grid">
              <label className="field">
                AssistantName
                <input
                  required
                  value={draft.name}
                  onChange={(e) => update("name", e.target.value)}
                />
              </label>
              <label className="field">
                담당자
                <select
                  value={draft.owner}
                  onChange={(e) => update("owner", e.target.value)}
                >
                  {state.users.map((u) => (
                    <option value={u.id} key={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                업무 Lv1
                <input
                  required
                  value={draft.lv1}
                  onChange={(e) => update("lv1", e.target.value)}
                />
              </label>
              <label className="field">
                업무 Lv2
                <input
                  required
                  value={draft.lv2}
                  onChange={(e) => update("lv2", e.target.value)}
                />
              </label>
              <label className="field">
                상태
                <select
                  value={draft.status}
                  onChange={(e) =>
                    update("status", e.target.value as Agent["status"])
                  }
                >
                  {Object.entries(agentStatusLabels).map(([k, v]) => (
                    <option value={k} key={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                카드 강조색
                <input
                  type="color"
                  value={draft.color}
                  onChange={(e) => update("color", e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              요약
              <textarea
                required
                value={draft.summary}
                onChange={(e) => update("summary", e.target.value)}
              />
            </label>
            <div className="form-grid">
              <label className="field">
                링크1 · 외부 assistant
                <input
                  type="url"
                  value={draft.link1}
                  onChange={(e) => update("link1", e.target.value)}
                  placeholder="https://openwebui.internal/..."
                />
              </label>
              <label className="field">
                링크2 · 설명서
                <input
                  type="url"
                  value={draft.link2}
                  onChange={(e) => update("link2", e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              사용 예시 · 한 줄에 하나
              <textarea
                value={draft.examples.join("\n")}
                onChange={(e) => update("examples", e.target.value.split("\n"))}
              />
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={draft.intake}
                onChange={(e) => update("intake", e.target.checked)}
              />{" "}
              SR 접수용 URS assistant로 지정
            </label>
            <p className="muted">
              접수 에이전트는 한 개입니다. 다른 에이전트를 지정하면 기존 지정이
              해제됩니다.
            </p>
            <div className="form-grid">
              <label className="field">
                연결 방식
                <select
                  value={draft.connectionMode}
                  onChange={(e) =>
                    update(
                      "connectionMode",
                      e.target.value as Agent["connectionMode"],
                    )
                  }
                >
                  <option value="api">내부 API</option>
                  <option value="external">외부 링크</option>
                  <option value="hybrid">둘 다</option>
                </select>
              </label>
              <label className="field">
                연결 프로필
                <select
                  value={draft.profileId}
                  onChange={(e) => update("profileId", e.target.value)}
                >
                  <option value="">선택 안 함</option>
                  {state.profiles.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                기본 모델 / OpenWebUI assistant ID
                <input
                  list="agent-model-options"
                  value={draft.defaultModel}
                  onChange={(e) => update("defaultModel", e.target.value)}
                  placeholder="비워두면 프로필 기본 모델"
                />
                <datalist id="agent-model-options">
                  {state.profiles
                    .find((p) => p.id === draft.profileId)
                    ?.models.map((m) => (
                      <option value={m} key={m} />
                    ))}
                </datalist>
              </label>
            </div>
            <label className="field">
              기본 체크리스트 · 한 줄에 하나
              <textarea
                value={draft.checklist.join("\n")}
                onChange={(e) =>
                  update("checklist", e.target.value.split("\n"))
                }
              />
            </label>
            <button className="btn primary" disabled={uploading}>
              <Save size={16} /> 에이전트 저장
            </button>
          </form>
        </Modal>
      )}
      {profile && (
        <Modal title="AI 연결 프로필" onClose={() => setProfile(undefined)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (
                dispatch({
                  type: "profile.save",
                  profile: {
                    ...profile,
                    models: profile.models.map((x) => x.trim()).filter(Boolean),
                  },
                })
              ) {
                notify("연결 프로필을 저장했습니다");
                setProfile(undefined);
              }
            }}
          >
            <label className="field">
              프로필 이름
              <input
                required
                value={profile.name}
                onChange={(e) => pupdate("name", e.target.value)}
              />
            </label>
            <label className="field">
              실행 모드
              <select
                value={profile.mode}
                onChange={(e) =>
                  pupdate("mode", e.target.value as "demo" | "api")
                }
              >
                <option value="demo">샘플 모드 · 로컬 데모 응답</option>
                <option value="api">실제 API · 사내 모델 호출</option>
              </select>
            </label>
            <label className="field">
              API 기본 URL
              <input
                type="url"
                required={profile.mode === "api"}
                value={profile.baseUrl}
                onChange={(e) => pupdate("baseUrl", e.target.value)}
                placeholder="https://llm.internal/v1"
              />
            </label>
            <div className="form-grid">
              <label className="field">
                Chat completion 경로
                <input
                  value={profile.chatPath}
                  onChange={(e) => pupdate("chatPath", e.target.value)}
                />
              </label>
              <label className="field">
                모델 목록 경로
                <input
                  value={profile.modelsPath}
                  onChange={(e) => pupdate("modelsPath", e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              API 키 · 메모리에만 유지
              <input
                type="password"
                autoComplete="off"
                value={apiKeys[profile.id] || ""}
                onChange={(e) => setApiKey(profile.id, e.target.value)}
                placeholder="새로고침 시 초기화"
              />
            </label>
            <label className="field">
              사용 가능한 모델 · 한 줄에 하나
              <textarea
                value={profile.models.join("\n")}
                onChange={(e) => pupdate("models", e.target.value.split("\n"))}
              />
            </label>
            <label className="field">
              프로필 기본 모델
              <input
                value={profile.defaultModel}
                onChange={(e) => pupdate("defaultModel", e.target.value)}
              />
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={profile.sendNames}
                onChange={(e) => pupdate("sendNames", e.target.checked)}
              />{" "}
              메시지 name 필드 전송 (API 지원 시)
            </label>
            <p className="muted">
              실제 API 오류는 그대로 표시됩니다. 브라우저 직접 호출을 허용하는
              API 연결이 필요합니다. PDF·Office·이미지 분석에는 별도 어댑터가
              필요합니다.
            </p>
            <button className="btn primary">
              <Save size={16} /> 연결 저장
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
