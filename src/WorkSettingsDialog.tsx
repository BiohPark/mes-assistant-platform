import { useState } from "react";
import type { WorkItem } from "./types";
import { useHub } from "./store";
import { Modal } from "./ui";
export function WorkSettingsDialog({
  work,
  onClose,
}: {
  work: WorkItem;
  onClose: () => void;
}) {
  const { state, dispatch } = useHub();
  const [draft, setDraft] = useState(() => structuredClone(work));
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const current = state.works.find((w) => w.id === work.id)!;
  const done = current.status === "done";
  return (
    <Modal title="업무 설정" onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          setSaving(true);
          const ok = await dispatch({
            type: "work.edit",
            workId: work.id,
            expectedRevision: draft.revision ?? 0,
            archived: draft.archived,
            ...(done
              ? {}
              : {
                  title: draft.title,
                  description: draft.description,
                  owner: draft.owner,
                  externalUrl: draft.externalUrl,
                  manual: draft.manual,
                }),
          });
          setSaving(false);
          if (ok) onClose();
          else setConflict(true);
        }}
      >
        {done && (
          <p>
            완료 업무는 보관 설정만 변경할 수 있습니다. 다른 설정은 재개 후
            변경하세요.
          </p>
        )}
        <label className="field">
          업무명
          <input
            required
            disabled={done}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <label className="field">
          설명
          <textarea
            disabled={done}
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
        </label>
        <label className="field">
          담당자
          <select
            disabled={done}
            value={draft.owner}
            onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
          >
            {state.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          외부 업무 URL
          <input
            type="url"
            disabled={done}
            value={draft.externalUrl}
            onChange={(e) =>
              setDraft({ ...draft, externalUrl: e.target.value })
            }
          />
        </label>
        {/^https?:\/\//.test(current.externalUrl) && (
          <a href={current.externalUrl} target="_blank" rel="noreferrer">
            외부 업무 열기 ↗
          </a>
        )}
        <label className="check-row">
          <input
            type="checkbox"
            disabled={done}
            checked={draft.manual}
            onChange={(e) => setDraft({ ...draft, manual: e.target.checked })}
          />
          수동 진행
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={draft.archived}
            onChange={(e) => setDraft({ ...draft, archived: e.target.checked })}
          />
          업무 보관 (기록은 유지)
        </label>
        {conflict && (
          <p>
            저장하지 못했습니다. 초안은 유지됩니다.{" "}
            <button
              type="button"
              onClick={() => {
                if (confirm("현재 초안을 버리고 최신 설정을 불러올까요?")) {
                  setDraft(structuredClone(current));
                  setConflict(false);
                }
              }}
            >
              최신 설정 불러오기
            </button>
          </p>
        )}
        <button className="primary" disabled={saving}>
          {saving ? "저장 중…" : "업무 설정 저장"}
        </button>
      </form>
    </Modal>
  );
}
