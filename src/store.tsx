import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { createSeed } from "./seed";
import { normalizeState } from "./workflow";
import { resetChatRequests } from "./chatRequests";
import { event, now, uid } from "./domain";
import { saveFile } from "./storage";
import type { AppState, Update, Artifact } from "./types";
const KEY = "flowmes-demo-v2";
const Context = createContext<{
  state: AppState;
  apiKey: string;
  setApiKey: (value: string) => void;
  update: Update;
  notify: (text: string) => void;
  resetData: () => void;
  upload: (
    files: FileList | File[],
    workId: string,
    stageId: string,
    kind: "inputs" | "outputs",
  ) => Promise<string[]>;
  toast: string;
  storageError: string;
}>(null!);
function initial() {
  try {
    const value = localStorage.getItem(KEY);
    if (value) {
      const parsed = JSON.parse(value);
      if (
        Array.isArray(parsed.works) &&
        parsed.works.length > 0 &&
        Array.isArray(parsed.artifacts) &&
        Array.isArray(parsed.events) &&
        parsed.templates?.length &&
        typeof parsed.profile === "string" &&
        parsed.profile.trim()
      )
        return normalizeState(parsed as AppState);
    }
  } catch {
    /* Default sample is available if storage is unavailable. */
  }
  return normalizeState(createSeed());
}
export function Provider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKey] = useState("");
  const [state, setState] = useState<AppState>(initial),
    [toast, setToast] = useState(""),
    [storageError, setStorageError] = useState("");
  const update: Update = useCallback((recipe) => setState(recipe), []);
  const notify = useCallback((text: string) => setToast(text), []);
  const resetData = useCallback(() => {
    resetChatRequests();
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem("flowmes-demo-v1");
    } catch {}
    setState(normalizeState(createSeed()));
    setApiKey("");
    notify("샘플 데이터로 초기화되었습니다.");
  }, [notify]);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      setStorageError("");
    } catch {
      setStorageError(
        "브라우저 저장 공간이 부족하거나 저장이 차단되었습니다. 현재 변경은 새로고침하면 사라질 수 있습니다.",
      );
    }
  }, [state]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4200);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const upload = async (
    files: FileList | File[],
    workId: string,
    stageId: string,
    kind: "inputs" | "outputs",
  ) => {
    const result: Artifact[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 25 * 1024 * 1024) {
        notify(`${file.name}: 데모에서는 파일당 25MB까지 지원합니다.`);
        continue;
      }
      try {
        const id = uid();
        await saveFile(id, file);
        result.push({
          id,
          name: file.name,
          mime: file.type || "application/octet-stream",
          size: file.size,
          version: "1.0",
          workId,
          stageId,
          createdBy: state.profile,
          createdAt: now(),
          stored: true,
        });
      } catch {
        notify(
          `${file.name} 저장에 실패했습니다. 브라우저 저장 공간을 확인해 주세요.`,
        );
      }
    }
    if (result.length) {
      update((s) => ({
        ...s,
        artifacts: [...result, ...s.artifacts],
        works: s.works.map((w) =>
          w.id === workId
            ? {
                ...w,
                stages: w.stages.map((st) =>
                  st.id === stageId
                    ? {
                        ...st,
                        [kind]: [...st[kind], ...result.map((a) => a.id)],
                      }
                    : st,
                ),
              }
            : w,
        ),
        events: [
          event(
            s,
            workId,
            stageId,
            "자료 업로드",
            result.map((a) => a.name).join(", "),
          ),
          ...s.events,
        ],
      }));
      notify(`${result.length}개 파일을 추가했습니다.`);
    }
    return result.map((a) => a.id);
  };
  return (
    <Context.Provider
      value={{
        state,
        apiKey,
        setApiKey,
        update,
        notify,
        resetData,
        upload,
        toast,
        storageError,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useStore = () => useContext(Context);
export const navigate = (path: string) => {
  window.location.hash = path;
};
export function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || "/");
  useEffect(() => {
    const fn = () => setRoute(location.hash.slice(1) || "/");
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  return route;
}
