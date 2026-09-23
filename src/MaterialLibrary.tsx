import { useState } from "react";
import { useHub } from "./store";
import {
  discoverMaterials,
  selectedMaterials,
  workTags,
  orderedAgents,
} from "./hub";
import { downloadArtifact } from "./files";
import type { ArtifactVersion } from "./types";
export function SelectedInputs({
  workId,
  onPreview,
}: {
  workId: string;
  onPreview: (f: ArtifactVersion) => void;
}) {
  const { state: s, dispatch } = useHub();
  const files = selectedMaterials(s, workId),
    locked = s.works.find((w) => w.id === workId)?.status === "done";
  return (
    <div className="selected-inputs">
      <span className="small muted">다음 요청에 사용 · {files.length}개</span>
      {files.map((f) => (
        <span key={f.id} className="chip">
          <button onClick={() => onPreview(f)}>
            {s.taskInputs?.some(
              (i) => i.workId === workId && i.artifactId === f.id && i.main,
            )
              ? "★ "
              : ""}
            {f.name} · v{f.version}
          </button>
          <button
            disabled={locked}
            aria-label={f.name + " 입력 해제"}
            onClick={() =>
              void dispatch({
                type: "input.set",
                workId,
                artifactId: f.id,
                selected: false,
              })
            }
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
export function MaterialLibrary({
  workId,
  onPreview,
}: {
  workId: string;
  onPreview: (f: ArtifactVersion) => void;
}) {
  const { state: s, dispatch, notify } = useHub();
  const [query, setQuery] = useState(""),
    [agent, setAgent] = useState(""),
    [role, setRole] = useState(""),
    [tag, setTag] = useState(""),
    [memo, setMemo] = useState("");
  const currentTags = workTags(s, workId),
    selected = selectedMaterials(s, workId),
    locked = s.works.find((w) => w.id === workId)?.status === "done";
  const discovered = discoverMaterials(s, workId),
    files = [
      ...new Map([...discovered, ...selected].map((f) => [f.id, f])).values(),
    ];
  const matched = (f: ArtifactVersion) =>
    workTags(s, f.workId).filter((t) => currentTags.some((x) => x.id === t.id));
  const fileRole = (f: ArtifactVersion) =>
    f.workId !== workId && selected.some((x) => x.id === f.id)
      ? "input"
      : (f.role ?? "input");
  const filtered = files.filter(
    (f) =>
      f.name.toLowerCase().includes(query.toLowerCase()) &&
      (!agent || s.works.find((w) => w.id === f.workId)?.agentId === agent) &&
      (!role || fileRole(f) === role) &&
      (!tag || matched(f).some((t) => t.id === tag)),
  );
  function row(f: ArtifactVersion) {
    const selection = s.taskInputs?.find(
        (i) => i.workId === workId && i.artifactId === f.id,
      ),
      origin = s.works.find((w) => w.id === f.workId);
    return (
      <div
        className={"material-item " + (selection ? "selected" : "")}
        key={f.id}
      >
        <button className="file-title" onClick={() => onPreview(f)}>
          {f.name} · v{f.version}
        </button>
        <small>
          {f.role === "output" ? "원본 Output" : "원본 Input"} ·{" "}
          {s.users.find((u) => u.id === f.createdBy)?.name || f.createdBy} ·{" "}
          {new Date(f.createdAt).toLocaleDateString()}
        </small>
        <small>
          출처: {origin?.title}
          {f.legacyWorkId ? " · 이전 업무 자료" : ""}
        </small>
        <small>
          {matched(f)
            .map((t) => "#" + t.label)
            .join(" ")}
          {!discovered.some((x) => x.id === f.id) &&
            " · 연결 해제 후 유지한 입력"}
        </small>
        <div className="material-actions">
          <label>
            <input
              type="checkbox"
              aria-label={f.name + " v" + f.version + " 이번 대화에 사용"}
              disabled={locked}
              checked={!!selection}
              onChange={(e) =>
                void dispatch({
                  type: "input.set",
                  workId,
                  artifactId: f.id,
                  selected: e.target.checked,
                })
              }
            />
            이번 대화에 사용
          </label>
          {selection && (
            <button
              disabled={locked}
              className={selection.main ? "starred" : ""}
              aria-label={f.name + " v" + f.version + " 주 입력"}
              aria-pressed={selection.main}
              onClick={() =>
                void dispatch({
                  type: "input.set",
                  workId,
                  artifactId: f.id,
                  selected: true,
                  main: !selection.main,
                })
              }
            >
              {selection.main ? "★" : "☆"}
            </button>
          )}
          <button
            aria-label={f.name + " 다운로드"}
            onClick={() =>
              void downloadArtifact(f).catch((e) => notify(String(e)))
            }
          >
            ↓
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="materials-panel" id="materials">
      <div className="materials-toolbar">
        <input
          aria-label="자료 파일명 검색"
          placeholder="자료 파일명 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="자료 출처 에이전트"
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
        >
          <option value="">모든 출처 에이전트</option>
          {orderedAgents(s)
            .filter((a) =>
              files.some(
                (f) => s.works.find((w) => w.id === f.workId)?.agentId === a.id,
              ),
            )
            .map((a) => (
              <option value={a.id} key={a.id}>
                {a.name}
              </option>
            ))}
        </select>
        <div className="row">
          <select
            aria-label="자료 역할"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="">Input / Output</option>
            <option value="output">Output</option>
            <option value="input">Input</option>
          </select>
          <select
            aria-label="자료 일치 태그"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          >
            <option value="">모든 일치 태그</option>
            {currentTags.map((t) => (
              <option value={t.id} key={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="small muted">
        {filtered.length}개 버전 · 체크한 자료만 AI에 전달됩니다.
      </p>
      {orderedAgents(s).map((a) => {
        const own = filtered.filter(
          (f) => s.works.find((w) => w.id === f.workId)?.agentId === a.id,
        );
        if (!own.length) return null;
        return (
          <section key={a.id} className="material-group">
            <h3>{a.name}</h3>
            {(["output", "input"] as const).map((kind) => {
              const grouped = new Map<string, ArtifactVersion[]>();
              for (const f of own.filter((f) => fileRole(f) === kind)) {
                const key = f.workId + "::" + f.name;
                grouped.set(key, [...(grouped.get(key) ?? []), f]);
              }
              return (
                grouped.size > 0 && (
                  <div key={kind}>
                    <span className="badge">
                      {kind === "output" ? "Output" : "Input"}
                    </span>
                    {[...grouped.entries()].map(([key, versions]) => {
                      versions.sort((a, b) => b.version - a.version);
                      const newer = versions.some((f) =>
                        selected.some(
                          (x) =>
                            x.workId === f.workId &&
                            x.name === f.name &&
                            x.version < f.version,
                        ),
                      );
                      return (
                        <div key={key}>
                          {newer && (
                            <small className="muted">
                              새 버전이 있습니다 · 자동 교체하지 않음
                            </small>
                          )}
                          {row(versions[0])}
                          {versions.length > 1 && (
                            <details>
                              <summary>
                                이전 버전 {versions.length - 1}개
                              </summary>
                              {versions.slice(1).map(row)}
                            </details>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              );
            })}
          </section>
        );
      })}
      {!filtered.length && (
        <p className="empty">
          자료를 업로드하거나 같은 태그로 관련 업무를 연결하세요.
        </p>
      )}
      {s.session.role !== "requester" && (
        <details>
          <summary>요약·전달 메모를 자료로 저장</summary>
          <textarea
            aria-label="자료 요약 메모"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
          <button
            disabled={locked || !memo.trim()}
            onClick={async () => {
              const name = prompt("자료 이름", "요약 및 전달 메모.md");
              if (!name) return;
              if (
                await dispatch({
                  type: "artifact.add",
                  kind: "input",
                  artifact: {
                    id: crypto.randomUUID(),
                    workId,
                    name,
                    mime: "text/markdown",
                    size: new Blob([memo]).size,
                    version: 1,
                    content: memo,
                    createdBy: s.session.userId,
                    createdAt: new Date().toISOString(),
                  },
                })
              )
                setMemo("");
            }}
          >
            Markdown 자료 저장
          </button>
        </details>
      )}
    </div>
  );
}
