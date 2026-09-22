import { describe, it, expect } from "vitest";
import { seed } from "./seed";
import { buildWorkExport } from "./export";
import type { ContextBundle } from "./types";

describe("portable work result package", () => {
  it("preserves binary bytes, old versions, detached handoffs and sent context provenance", async () => {
    const s = seed();
    s.session.role = "staff";
    const w = s.works[0];
    const t = s.threads.find((t) => t.workId === w.id)!;
    const original = s.artifacts[0];
    const previous = {
      ...original,
      id: "old-file",
      blobId: "old-blob",
      content: undefined,
      version: 1,
    };
    const binary = {
      ...original,
      id: "binary-file",
      blobId: "binary-blob",
      content: undefined,
      version: 2,
      previousId: previous.id,
      workId: "source-work",
      name: "evidence.pdf",
      mime: "application/pdf",
    };
    s.artifacts.push(previous, binary);
    const bundle: ContextBundle = {
      id: "bundle-export",
      name: "고정 컨텍스트",
      sourceWorkId: "source-work",
      createdBy: "staff",
      createdAt: "2026-09-21T01:00:00Z",
      excerpts: [
        {
          messageId: "source-message",
          threadId: "source-thread",
          actor: "staff",
          content: "원문 발췌",
          at: "2026-09-21T01:00:00Z",
        },
      ],
      artifactIds: [binary.id],
      summary: "검토 요약",
      note: "검증 필요",
    };
    s.bundles.push(bundle);
    s.handoffs.push({
      id: "handoff-export",
      sourceWorkId: "source-work",
      targetWorkId: w.id,
      targetThreadId: t.id,
      bundleId: bundle.id,
      actor: "staff",
      at: bundle.createdAt,
      active: false,
      detachedAt: bundle.createdAt,
    });
    s.messages.push({
      id: "sent-export",
      threadId: t.id,
      role: "user",
      actor: "staff",
      content: "질문",
      at: bundle.createdAt,
      kind: "request",
      source: "human",
      contextIds: [bundle.id],
      fileIds: [],
      requestSnapshot: '{"original":"snapshot"}',
    });
    const bytes = new Uint8Array([0, 255, 128, 10, 65]);
    const result = await buildWorkExport(s, w.id, async (id) =>
      id === "binary-blob" ? new Blob([bytes]) : new Blob(["old bytes"]),
    );
    expect(result.format).toBe("mes-agent-hub-work-package");
    expect(result.handoffs.find((h) => h.id === "handoff-export")?.active).toBe(
      false,
    );
    expect(
      result.bundles.find((b) => b.id === bundle.id)?.excerpts[0].content,
    ).toBe("원문 발췌");
    expect(
      result.messages.find((m) => m.id === "sent-export")?.requestSnapshot,
    ).toContain("snapshot");
    expect(result.files.find((f) => f.artifactId === binary.id)?.base64).toBe(
      btoa(String.fromCharCode(...bytes)),
    );
    expect(result.files.some((f) => f.artifactId === previous.id)).toBe(true);
    expect(result.activities.every((a) => a.workId === w.id)).toBe(true);
  });
  it("fails explicitly when a required original blob is missing", async () => {
    const s = seed();
    s.session.role = "staff";
    s.artifacts.push({
      id: "missing",
      workId: s.works[0].id,
      name: "missing.pdf",
      mime: "application/pdf",
      size: 10,
      version: 1,
      createdBy: "staff",
      createdAt: "2026-09-21",
      blobId: "missing",
    });
    await expect(
      buildWorkExport(s, s.works[0].id, async () => undefined),
    ).rejects.toThrow("missing.pdf");
  });
  it("rejects requester exports of internal work packages", async () => {
    const s = seed();
    s.session.role = "requester";
    await expect(
      buildWorkExport(s, s.works[0].id, async () => undefined),
    ).rejects.toThrow("담당자");
  });
  it("embeds text artifacts with UTF-8 content", async () => {
    const s = seed();
    s.session.role = "staff";
    const w = s.works[0];
    s.artifacts.push({
      id: "text-export",
      workId: w.id,
      name: "검토.md",
      mime: "text/markdown",
      size: 1,
      version: 1,
      createdBy: "staff",
      createdAt: "2026-09-21",
      content: "한글 검토 완료",
    });
    const r = await buildWorkExport(s, w.id, async () => undefined);
    const f = r.files.find((f) => f.artifactId === "text-export")!;
    const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe("한글 검토 완료");
  });
});
