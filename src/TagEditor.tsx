import { useState } from "react";
import { useHub } from "./store";
import { normalizeTag, workTags } from "./hub";
export function TagEditor({ workId }: { workId: string }) {
  const { state: s, dispatch } = useHub();
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState<"keyword" | "sr">("keyword");
  const tags = workTags(s, workId),
    locked = s.works.find((w) => w.id === workId)?.status === "done";
  const matches = (s.tags ?? []).filter(
    (t) =>
      t.kind === kind &&
      t.key.includes(normalizeTag(query)) &&
      !tags.some((x) => x.id === t.id),
  );
  const attach = async (label: string) => {
    if (await dispatch({ type: "tag.attach", workId, label, kind }))
      setQuery("");
  };
  return (
    <div className="tag-editor">
      <div className="row wrap">
        {tags.map((t) => (
          <span className="chip" key={t.id} style={{ borderColor: t.color }}>
            <span style={{ color: t.color }}>●</span>
            {t.kind === "sr" ? "SR · " : "#"}
            {t.label}
            {s.session.role !== "requester" && (
              <button
                disabled={locked}
                aria-label={t.label + " 태그 해제"}
                onClick={() =>
                  void dispatch({ type: "tag.detach", workId, tagId: t.id })
                }
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {s.session.role !== "requester" && (
        <details>
          <summary>+ 태그 · 기존 SR 연결</summary>
          <div className="row">
            <select
              aria-label="태그 유형"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="keyword">키워드</option>
              <option value="sr">SR 번호</option>
            </select>
            <input
              aria-label="태그 입력"
              disabled={locked}
              placeholder={
                kind === "sr"
                  ? "기존 SR 검색 또는 번호 등록"
                  : "#MES · CCA · 프로젝트 키워드"
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim()) {
                  e.preventDefault();
                  void attach(query);
                }
              }}
            />
          </div>
          <div className="tag-suggestions">
            {matches.slice(0, 12).map((t) => (
              <button
                disabled={locked}
                key={t.id}
                onClick={() => void attach(t.label)}
              >
                기존 연결 · {t.label}
              </button>
            ))}
            {query.trim() &&
              !s.tags?.some(
                (t) => t.kind === kind && t.key === normalizeTag(query),
              ) && (
                <button disabled={locked} onClick={() => void attach(query)}>
                  {kind === "sr" ? "SR 번호로 등록" : "새 키워드 생성"} ·{" "}
                  {query}
                </button>
              )}
          </div>
          <small>
            태그는 자료 탐색용입니다. SR 번호 등록은 신규 접수가 아니며 자료를
            자동 전송하거나 공개하지 않습니다.
          </small>
        </details>
      )}
    </div>
  );
}
