// Requests outlive the view but must never outlive a workspace reset.
export type RequestState = { controller?: AbortController; error?: string };
export const requests = new Map<string, RequestState>();
const listeners = new Set<() => void>();
export const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export function requestState(key: string, value: RequestState) {
  requests.set(key, value);
  listeners.forEach((fn) => fn());
}
export function resetChatRequests() {
  requests.forEach((r) => r.controller?.abort());
  requests.clear();
  listeners.forEach((fn) => fn());
}
