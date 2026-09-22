import { expect, it } from "vitest";
import { applyCommand } from "./commands";
import { seed } from "../seed";
it("uses the explicit actor instead of a persisted session and returns changes", () => {
  const s = seed();
  const result = applyCommand(
    s,
    { type: "work.note", workId: "urs-work", text: "owner" },
    { actorId: "admin", role: "admin", tabId: "tab", commandId: "c" },
  );
  expect(result.works[0].notes[0].actor).toBe("admin");
  expect(s.works[0].notes).toHaveLength(0);
});
it("rejects a requester command even if the stored projection is staff", () => {
  expect(() =>
    applyCommand(
      seed(),
      { type: "work.note", workId: "urs-work", text: "private" },
      { actorId: "requester", role: "requester", tabId: "t", commandId: "c" },
    ),
  ).toThrow();
});
