import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { seed } from "./seed";
import { reduce } from "./domain";
import { buildRequest } from "./api";
import {
  normalizeTag,
  discoverMaterials,
  selectedMaterials,
  convertToV3,
  orderedAgents,
} from "./hub";
import { buildWorkExport } from "./export";

it("canonicalizes typed tags without changing hyphens or zeroes", () => {
  expect(normalizeTag("  ##ＭＥＳ  ")).toBe("mes");
  expect(normalizeTag(" #SR-001  A ")).toBe("sr-001 a");
});
it("reuses canonical tags and keeps SR an explicit type", () => {
  let s = convertToV3(seed());
  for (const label of ["#MES", " mes ", "ＭＥＳ"])
    s = reduce(s, {
      type: "tag.attach",
      workId: "urs-work",
      label,
      kind: "keyword",
    });
  expect(s.tags!.filter((t) => t.key === "mes")).toHaveLength(1);
  s = reduce(s, {
    type: "tag.attach",
    workId: "urs-work",
    label: "MES",
    kind: "sr",
  });
  expect(s.tags!.filter((t) => t.key === "mes")).toHaveLength(2);
});
it("discovers direct original materials once and prevents A-B-C expansion", () => {
  let s = convertToV3(seed());
  s.taskTags = [];
  s.taskInputs = [];
  s = reduce(s, {
    type: "work.create",
    agentId: "fds",
    title: "C",
    owner: "staff",
    id: "C",
  });
  for (const [workId, label] of [
    ["urs-work", "AB"],
    ["fds-work", "AB"],
    ["fds-work", "BC"],
    ["C", "BC"],
  ])
    s = reduce(s, { type: "tag.attach", workId, label, kind: "keyword" });
  s = reduce(s, {
    type: "artifact.add",
    kind: "output",
    artifact: {
      id: "secret-c",
      workId: "C",
      name: "C.txt",
      mime: "text/plain",
      content: "SECRET_C",
      size: 8,
      version: 1,
      createdBy: "staff",
      createdAt: new Date().toISOString(),
    },
  });
  s = reduce(s, {
    type: "input.set",
    workId: "fds-work",
    artifactId: "secret-c",
    selected: true,
  });
  expect(
    discoverMaterials(s, "urs-work").some((f) => f.id === "secret-c"),
  ).toBe(false);
  expect(
    discoverMaterials(s, "fds-work").filter((f) => f.id === "secret-c"),
  ).toHaveLength(1);
  expect(
    buildRequest(s, "fds-work-thread", "hi")
      .messages.map((m) => m.content)
      .join(""),
  ).toContain("SECRET_C");
  const tag = s.tags!.find((t) => t.key === "bc")!;
  s = reduce(s, { type: "tag.detach", workId: "fds-work", tagId: tag.id });
  expect(
    selectedMaterials(s, "fds-work").some((f) => f.id === "secret-c"),
  ).toBe(true);
  s = reduce(s, {
    type: "input.set",
    workId: "fds-work",
    artifactId: "secret-c",
    selected: false,
  });
  expect(
    buildRequest(s, "fds-work-thread", "hi")
      .messages.map((m) => m.content)
      .join(""),
  ).not.toContain("SECRET_C");
});
it("splits old conversations, preserves original state and selected versions", () => {
  const original = reduce(seed(), {
    type: "thread.create",
    workId: "urs-work",
    title: "second",
    id: "second",
  });
  const s = convertToV3(original);
  expect(
    s.works.every(
      (w) => s.threads.filter((t) => t.workId === w.id).length === 1,
    ),
  ).toBe(true);
  expect(original.threads.filter((t) => t.workId === "urs-work")).toHaveLength(
    2,
  );
  expect(
    s.artifacts.find((f) => f.id === "requirements-v1")?.legacyWorkId,
  ).toBe("urs-work");
  expect(orderedAgents(s).filter(a=>a.id.startsWith("demo-"))).toHaveLength(3);
});
it("protects manually edited SR titles from a delayed suggestion", () => {
  let s = convertToV3(seed());
  s.session = { userId: "requester", role: "requester" };
  s = reduce(s, {
    type: "sr.title",
    srId: "sr-example",
    title: "My title",
    source: "manual",
  });
  s = reduce(s, {
    type: "sr.title",
    srId: "sr-example",
    title: "Late AI title",
    source: "ai",
  });
  expect(s.requests.find((r) => r.id === "sr-example")?.title).toBe("My title");
});
it("exports selected cross-task files and freezes their main-input flag at completion", async () => {
  let s = convertToV3(seed());
  s = reduce(s, {
    type: "tag.attach",
    workId: "urs-work",
    kind: "keyword",
    label: "shared",
  });
  s = reduce(s, {
    type: "tag.attach",
    workId: "fds-work",
    kind: "keyword",
    label: "shared",
  });
  s = reduce(s, {
    type: "input.set",
    workId: "fds-work",
    artifactId: "requirements-v1",
    selected: true,
    main: true,
  });
  const result = await buildWorkExport(s, "fds-work");
  expect(result.files.some((f) => f.artifactId === "requirements-v1")).toBe(
    true,
  );
  s = reduce(s, {
    type: "work.status",
    workId: "fds-work",
    status: "done",
    reason: "reviewed",
  });
  expect(
    s
      .completions!.at(-1)
      ?.inputs?.some((i) => i.artifactId === "requirements-v1" && i.main),
  ).toBe(true);
});
it("never makes internal materials public merely through an SR tag", () => {
  let s = convertToV3(seed());
  s = reduce(s, {
    type: "tag.attach",
    workId: "fds-work",
    kind: "sr",
    label: "SR-2026-0001",
  });
  s.session = { userId: "requester", role: "requester" };
  expect(discoverMaterials(s, "urs-work").some((f) => f.id === "fds-v1")).toBe(
    false,
  );
});
