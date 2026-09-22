import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { cancelTabRequests, recoverExpired } from "./app/requestService";
import { liveQuery } from "dexie";
import type { Action, HubState } from "./types";
import { hubDB, readState } from "./db/schema";
import { initializeDatabase, LEGACY_KEY } from "./db/migrateV1";
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
      () => void recoverExpired(hubDB).catch(() => {}),
      10000,
    );
    initializeDatabase(hubDB, localStorage.getItem(LEGACY_KEY))
      .then(async () => {
        await recoverExpired(hubDB);
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
  }, []);
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
