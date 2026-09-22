import { useState } from "react";
import { hubDB } from "./db/schema";
import { createBackup, restoreBackup, validateBackup } from "./db/backup";
import { saveDownload } from "./files";
import { useHub } from "./store";
export function BackupPanel() {
  const { notify } = useHub();
  const [candidate, setCandidate] = useState<unknown>();
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <details className="panel">
      <summary>전체 데이터 백업·복원</summary>
      <p>
        이 브라우저의 업무·대화·인계·이미지·첨부를 저장합니다. API 키와 사용자
        세션은 포함하지 않습니다.
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const b = await createBackup(hubDB);
            saveDownload(
              new Blob([JSON.stringify(b)], { type: "application/json" }),
              "mes-agent-hub-backup-" +
                new Date().toISOString().slice(0, 10) +
                ".json",
            );
            notify("전체 백업을 저장했습니다.");
          } catch (e) {
            notify(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        전체 백업 다운로드
      </button>
      <label className="btn">
        백업 파일 검사
        <input
          aria-label="백업 파일 검사"
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            setCandidate(undefined);
            setSummary("");
            if (!f) return;
            try {
              if (f.size > 100 * 1024 * 1024)
                throw Error("데모에서는 100MB 이하 백업만 복원할 수 있습니다.");
              const value = JSON.parse(await f.text());
              const { state, blobs } = await validateBackup(value);
              setCandidate(value);
              setSummary(
                "업무 " +
                  state.works.length +
                  "개 · 대화 " +
                  state.threads.length +
                  "개 · 원문 " +
                  blobs.length +
                  "개",
              );
            } catch (e) {
              notify(String(e));
            } finally {
              e.target.value = "";
            }
          }}
        />
      </label>
      {candidate !== undefined && (
        <div>
          <p>{summary}</p>
          <p>
            복원하면 현재 데이터 전체를 교체합니다. 필요한 경우 먼저 백업하세요.
            다른 탭도 새로고침해야 합니다.
          </p>
          <button
            disabled={busy}
            onClick={async () => {
              if (!confirm(summary + "\n현재 데이터를 이 백업으로 교체할까요?"))
                return;
              setBusy(true);
              try {
                await restoreBackup(hubDB, candidate);
                location.reload();
              } catch (e) {
                notify(String(e));
                setBusy(false);
              }
            }}
          >
            검사한 백업으로 교체
          </button>
          <button onClick={() => setCandidate(undefined)}>취소</button>
        </div>
      )}
    </details>
  );
}
