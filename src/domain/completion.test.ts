import { expect, it } from "vitest";
import { seed } from "../seed";
import { reduce } from "../domain";
it("freezes completion criteria and rejects substantive edits until reasoned reopen", () => {
  let s = reduce(seed(), {
    type: "work.status",
    workId: "urs-work",
    status: "done",
    reason: "예외 검토 완료",
  });
  const snapshot = structuredClone(s.completions![0]);
  expect(() =>
    reduce(s, { type: "work.check.add", workId: "urs-work", label: "추가" }),
  ).toThrow(/재개/);
  expect(() =>
    reduce(s, { type: "work.edit", workId: "urs-work", title: "변경" }),
  ).toThrow(/재개/);
  s = reduce(s, { type: "work.note", workId: "urs-work", text: "후속 의견" });
  expect(s.completions![0]).toEqual(snapshot);
  expect(s.activities.at(-1)?.action).toBe("완료 후 메모");
  s = reduce(s, {
    type: "work.status",
    workId: "urs-work",
    status: "active",
    reason: "추가 검토",
  });
  s = reduce(s, { type: "work.check.add", workId: "urs-work", label: "추가" });
  expect(s.completions![0]).toEqual(snapshot);
});

it("records structured completion events and preserves earlier completions after reopening", () => {
  let s = reduce(seed(), {
    type: "work.status",
    workId: "urs-work",
    status: "done",
    reason: "reviewed",
  });
  const first = s.completions![0];
  expect(s.activities.at(-1)?.transition?.completionId).toBe(first.id);
  expect(() =>
    reduce(s, {
      type: "work.status",
      workId: "urs-work",
      status: "active",
      reason: "",
    }),
  ).toThrow();
  s = reduce(s, {
    type: "work.status",
    workId: "urs-work",
    status: "active",
    reason: "follow up",
  });
  s = reduce(s, {
    type: "work.status",
    workId: "urs-work",
    status: "done",
    reason: "reviewed again",
  });
  expect(s.completions).toHaveLength(2);
  expect(s.completions![0]).toEqual(first);
});
