import { it, expect, vi } from "vitest";
import {
  requestState,
  requests,
  resetChatRequests,
  subscribe,
} from "./chatRequests";
it("aborts and discards pending work when sample data is reset", () => {
  const c = new AbortController(),
    changed = vi.fn(),
    unsubscribe = subscribe(changed);
  requestState("seed/task/main", { controller: c });
  resetChatRequests();
  expect(c.signal.aborted).toBe(true);
  expect(requests.size).toBe(0);
  expect(changed).toHaveBeenCalledTimes(2);
  unsubscribe();
});
