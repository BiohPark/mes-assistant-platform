import type { HubState } from "../types";
const KEY = "mes-agent-hub-tab-session-v2";
export const tabId = crypto.randomUUID();
export function getSession(): HubState["session"] {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (
      s &&
      ["staff", "admin", "requester"].includes(s.role) &&
      s.userId === s.role
    )
      return s;
  } catch {}
  return { userId: "staff", role: "staff" };
}
export function setSession(s: HubState["session"]) {
  sessionStorage.setItem(KEY, JSON.stringify(s));
}
