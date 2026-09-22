import { useState } from "react";
import { Blocks, Plus, Pencil } from "lucide-react";
import { useStore } from "./store";
import { Modal, Badge } from "./ui";
import { uid } from "./domain";
import type { TaskModule } from "./types";

export function TaskModules() {
  const { state, update, notify } = useStore();
  const [editing, setEditing] = useState<TaskModule | null>(null),
    [error, setError] = useState("");
  function open(m?: TaskModule) {
    setError("");
    setEditing(
      m
        ? structuredClone(m)
        : {
            id: uid(),
            name: "",
            short: "",
            description: "",
            mode: "assistant",
            assistant: "",
            checklist: [
              "입력 자료와 작업 범위 확인",
              "산출물 작성 및 내용 검토",
            ],
          },
    );
  }
  return (
    <section className="module-catalog">
      <div className="section-heading">
        <div>
          <h2>
            <Blocks size={20} /> Task 모듈 라이브러리{" "}
            <span>{state.modules?.length || 0}</span>
          </h2>
          <p>
            하나의 실질 업무를 모듈로 정의하고, 여러 워크플로우에 조합하세요.
          </p>
        </div>
        <button className="button" onClick={() => open()}>
          <Plus size={16} />새 Task 모듈
        </button>
      </div>
      <div className="module-catalog-grid">
        {state.modules?.map((m) => (
          <button
            className={`module-catalog-card ${m.mode}`}
            key={m.id}
            onClick={() => open(m)}
          >
            <span className="module-symbol">{m.short}</span>
            <div>
              <strong>{m.name}</strong>
              <small>
                {m.mode === "manual" ? "수동 작업" : m.assistant} · 체크리스트{" "}
                {m.checklist.length}개
              </small>
              <small>모델: {m.defaultModel || "시스템 기본값"}</small>
            </div>
            <Pencil size={14} />
          </button>
        ))}
      </div>
      {editing && (
        <Modal
          title="Task 모듈 설정"
          subtitle="이름이 바뀌어도 모듈 식별자와 업무의 연결은 유지됩니다."
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                !editing.name.trim() ||
                !editing.short.trim() ||
                (editing.mode === "assistant" && !editing.assistant.trim()) ||
                !editing.checklist.some((c) => c.trim())
              ) {
                setError(
                  "이름, 약어, assistant 및 한 개 이상의 달성 기준을 입력해 주세요.",
                );
                return;
              }
              const m = {
                ...editing,
                name: editing.name.trim(),
                short: editing.short.trim(),
                checklist: editing.checklist
                  .map((c) => c.trim())
                  .filter(Boolean),
              };
              update((s) => ({
                ...s,
                modules: s.modules?.some((x) => x.id === m.id)
                  ? s.modules.map((x) => (x.id === m.id ? m : x))
                  : [...(s.modules || []), m],
              }));
              notify("Task 모듈을 저장했습니다.");
              setEditing(null);
            }}
          >
            <div className="form-grid">
              <label className="form-label">
                Task 이름
                <input
                  required
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </label>
              <label className="form-label">
                약어
                <input
                  required
                  value={editing.short}
                  onChange={(e) =>
                    setEditing({ ...editing, short: e.target.value })
                  }
                />
              </label>
              <label className="form-label">
                진행 방식
                <select
                  value={editing.mode}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      mode: e.target.value as TaskModule["mode"],
                    })
                  }
                >
                  <option value="assistant">Assistant</option>
                  <option value="manual">수동 작업</option>
                </select>
              </label>
              <label className="form-label">
                연결 assistant
                <input
                  disabled={editing.mode === "manual"}
                  value={editing.assistant}
                  onChange={(e) =>
                    setEditing({ ...editing, assistant: e.target.value })
                  }
                />
              </label>
            </div>
            <label className="form-label">
              설명
              <input
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </label>
            <label className="form-label">
              Task 기본 모델
              <select
                disabled={editing.mode === "manual"}
                value={editing.defaultModel || ""}
                onChange={(e) =>
                  setEditing({ ...editing, defaultModel: e.target.value })
                }
              >
                <option value="">시스템 기본값 사용</option>
                {[
                  ...new Set([
                    ...(state.connection?.models || []),
                    ...(editing.defaultModel ? [editing.defaultModel] : []),
                  ]),
                ].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="form-label">
              달성 체크리스트 · 한 줄에 하나
              <textarea
                rows={5}
                value={editing.checklist.join("\n")}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    checklist: e.target.value.split("\n"),
                  })
                }
              />
            </label>
            <div className="connection-note">
              <Badge tone="neutral">적용 범위</Badge> 이름·진행 방식·체크리스트
              변경은 새로 추가하는 Task에 적용됩니다. 기본 모델 변경은 별도
              모델을 지정하지 않은 기존 Task의 다음 호출에도 적용됩니다.
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-footer">
              <button
                type="button"
                className="button"
                onClick={() => setEditing(null)}
              >
                취소
              </button>
              <button className="button primary">모듈 저장</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
