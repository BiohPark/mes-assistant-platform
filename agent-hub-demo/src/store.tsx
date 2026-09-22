import {
  createContext,
  useContext,
  useState,
  useRef,
  type ReactNode,
} from "react";
import type { Action, HubState } from "./types";
import { reduce } from "./domain";
import { seed } from "./seed";
const KEY = "mes-agent-hub-metadata-v1";
type Store = {
  state: HubState;
  dispatch: (a: Action) => boolean;
  notify: (s: string) => void;
  apiKeys: Record<string, string>;
  setApiKey: (id: string, key: string) => void;
};
const Context = createContext<Store>(null!);
export function HubProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HubState>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.version === 1 && Array.isArray(s.agents)) return s;
      }
    } catch {}
    return seed();
  });
  const ref = useRef(state);
  const [toast, setToast] = useState("");
  const [apiKeys, setKeys] = useState<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = (s: string) => {
    setToast(s);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 4500);
  };
  const dispatch = (action: Action) => {
    try {
      const next = reduce(ref.current, action);
      localStorage.setItem(KEY, JSON.stringify(next));
      ref.current = next;
      setState(next);
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : "처리하지 못했습니다.");
      return false;
    }
  };
  return (
    <Context.Provider
      value={{
        state,
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
