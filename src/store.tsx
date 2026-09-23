import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { cancelTabRequests, recoverExpired } from "./app/requestService";
import { cancelTabAssessments, recoverExpiredAssessments } from "./app/checklistAssessment";
import Dexie, { liveQuery } from "dexie";
import { createBackup } from "./db/backup";
import { saveDownload } from "./files";
import type { HubDB } from "./db/schema";
import type { Action, HubState } from "./types";
import { hubDB, readState } from "./db/schema";
import { initializeDatabase, LEGACY_KEY } from "./db/migrateV1";
import { initializeV3 } from "./db/migrateV3";
import { executeCommand, revisionTarget } from "./db/commands";
import { pendingBlobs, releaseBlobs } from "./files";
import { getSession, setSession, tabId } from "./app/session";
type Store = {
  state: HubState;
  epoch: string;
  dispatch: (a: Action) => Promise<boolean>;
  notify: (s: string) => void;
  apiKeys: Record<string, string>;
  setApiKey: (id: string, key: string) => void;
};
const Context = createContext<Store>(null!);
export function HubProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HubState>();
  const [error, setError] = useState("");
  const [migrationGate, setMigrationGate] = useState(false);
  const [migrationReady, setMigrationReady] = useState(false);
  const [toast, setToast] = useState("");
  const [apiKeys, setKeys] = useState<Record<string, string>>({});
  const ref = useRef(state);
  const epoch = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = (text: string) => {
    setToast(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 4500);
  };
  useEffect(() => {
    let live = true;
    let unsubscribe = () => {};
    const recovery = setInterval(
      () => { void recoverExpired(hubDB).catch(() => {}); void recoverExpiredAssessments(hubDB).catch(() => {}); },
      10000,
    );
    (async () => {
      const ready = await hubDB.table("meta").get("ready");
      if (
        !ready &&
        !migrationReady &&
        (await Dexie.exists("mes-agent-hub-v2"))
      ) {
        setMigrationGate(true);
        return false;
      }
      await initializeV3(hubDB, localStorage.getItem(LEGACY_KEY));
      return true;
    })()
      .then(async (ready) => {
        if (!ready) return;
        await recoverExpired(hubDB);
        await recoverExpiredAssessments(hubDB);
        epoch.current = (await hubDB.table("meta").get("ready")).epoch;
        const sub = liveQuery(async () => ({
          state: await readState(hubDB, getSession()),
          epoch: (await hubDB.table("meta").get("ready")).epoch,
        })).subscribe({
          next: (result) => {
            if (live) {
              if (epoch.current !== result.epoch) {
                setError(
                  "백업 복원으로 데이터가 교체되었습니다. 새로고침하세요.",
                );
                return;
              }
              ref.current = result.state;
              setState(result.state);
            }
          },
          error: (e) => setError(String(e)),
        });
        unsubscribe = () => sub.unsubscribe();
        if (!live) unsubscribe();
      })
      .catch((e) => setError(String(e)));
    return () => {
      live = false;
      clearInterval(recovery);
      unsubscribe();
    };
  }, [migrationReady]);
  async function dispatch(action: Action) {
    if (!ref.current) return false;
    if (action.type === "session") {
      const old = getSession();
      await cancelTabRequests(hubDB, {
        actorId: old.userId,
        role: old.role,
        tabId,
        commandId: crypto.randomUUID(),
      });
      await cancelTabAssessments(hubDB, {
        actorId: old.userId, role: old.role, tabId, commandId: crypto.randomUUID(),
      });
      setSession({ userId: action.userId, role: action.role });
      const s = { ...ref.current, session: getSession() };
      ref.current = s;
      setState(s);
      return true;
    }
    const session = getSession();
    const target = revisionTarget(action);
    const row = target
      ? state![target.table as "works" | "agents" | "profiles"].find(
          (r) => r.id === target.id,
        )
      : undefined;
    const blobs = pendingBlobs(action);
    const result = await executeCommand(
      hubDB,
      action,
      {
        actorId: session.userId,
        role: session.role,
        tabId,
        commandId: crypto.randomUUID(),
        epoch: epoch.current,
        expectedRevision:
          action.type === "agent.save"
            ? (action.agent.revision ?? 0)
            : action.type === "profile.save"
              ? (action.profile.revision ?? 0)
              : action.type === "work.edit"
                ? (action.expectedRevision ?? row?.revision ?? 0)
                : (row?.revision ?? 0),
      },
      blobs,
    );
    if (!result.ok) {
      notify(result.message);
      return false;
    }
    releaseBlobs(blobs.map((b) => b.id));
    const next = await readState(hubDB, getSession());
    ref.current = next;
    setState(next);
    return true;
  }
  if (migrationGate && !migrationReady)
    return (
      <main className="page">
        <h1>기존 자료를 새 대화 업무로 전환합니다</h1>
        <p>
          전환 전에 전체 백업을 내려받을 수 있습니다. 기존 v2 저장소는 수정하지
          않으며 새 v3 저장소에 복사합니다.
        </p>
        <p>
          기존 대화마다 업무 하나가 생성됩니다. 공용 자료에는 이전 업무 출처를
          남기고, 과거 인계 기록은 백업에 보존합니다. 이전 버전과 새 버전을
          동시에 편집하지 마세요.
        </p>
        <button
          onClick={async () => {
            const old = new Dexie("mes-agent-hub-v2");
            try {
              await old.open();
              const b = await createBackup(old as unknown as HubDB);
              saveDownload(
                new Blob([JSON.stringify(b)], { type: "application/json" }),
                "mes-agent-hub-v2-before-migration.json",
              );
              notify("원본 백업을 저장했습니다.");
            } catch (e) {
              notify(String(e));
            } finally {
              old.close();
            }
          }}
        >
          전환 전 원본 백업
        </button>
        <button className="primary" onClick={() => setMigrationReady(true)}>
          원본을 보존하고 전환
        </button>
        <p className="muted">
          문제가 생기면 전환 전 버전에서 기존 v2 자료를 다시 열 수 있습니다.
        </p>
      </main>
    );
  if (error)
    return (
      <main className="empty">
        <h2>저장소를 열 수 없습니다</h2>
        <p>{error}</p>
        <p>
          기존 데이터는 보존되어 있습니다. 원본을 확인한 후 다시 시도하세요.
        </p>
        <button onClick={() => location.reload()}>다시 시도</button>
      </main>
    );
  if (!state) return <main className="empty">저장된 업무를 불러오는 중…</main>;
  return (
    <Context.Provider
      value={{
        state,
        epoch: epoch.current,
        dispatch,
        notify,
        apiKeys,
        setApiKey: (id, key) => setKeys((v) => ({ ...v, [id]: key })),
      }}
    >
      {children}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button onClick={() => setToast("")}>×</button>
        </div>
      )}
    </Context.Provider>
  );
}
export const useHub = () => useContext(Context);
