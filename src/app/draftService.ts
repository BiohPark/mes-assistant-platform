import { HubDB, readState, writeChanges, transact } from "../db/schema";
import type { CommandContext } from "../domain/commands";
import { reduce, uid } from "../domain";
import { startRequest } from "./requestService";
export async function beginConversation(
  db: HubDB,
  draft: {
    agentId: string;
    text: string;
    model?: string;
    intake?: boolean;
    srId?: string;
    file?: File;
  },
  ctx: CommandContext,
) {
  const file = draft.file;
  const content =
    file &&
    (/^(text\/|application\/json)/.test(file.type) ||
      /\.(txt|md|csv|json|xml|log)$/i.test(file.name))
      ? await file.text()
      : undefined;
  return transact(db, "rw", db.tables, async () => {
    if (ctx.epoch && (await db.table("meta").get("ready"))?.epoch !== ctx.epoch)
      throw Error("복원된 데이터입니다. 새로고침하세요.");
    if (!draft.text.trim() && !file)
      throw Error("대화 내용이나 첨부가 필요합니다.");
    const before = await readState(db, { userId: ctx.actorId, role: ctx.role }),
      workId = uid(),
      srId = draft.intake ? uid() : undefined;
    const title = (draft.text.trim() || file?.name || "새 대화").slice(0, 100);
    let s = reduce(
      before,
      draft.intake
        ? { type: "sr.start", title, id: srId, workId }
        : {
            type: "work.create",
            agentId: draft.agentId,
            title,
            owner: ctx.actorId,
            id: workId,
          },
    );
    if (draft.srId) {
      const sr = s.requests.find((r) => r.id === draft.srId);
      if (!sr?.number) throw Error("접수된 SR을 확인하세요.");
      s = reduce(s, {
        type: "tag.attach",
        workId,
        label: sr.number,
        kind: "sr",
      });
    }
    const w = s.works.find((w) => w.id === workId)!,
      a = s.agents.find((a) => a.id === w.agentId)!;
    if (draft.model)
      s = reduce(s, {
        type: "thread.model",
        threadId: w.activeThreadId,
        model: draft.model,
      });
    if (file) {
      const blobId = uid();
      const artifactId = uid();
      await db.table("blobs").add({ id: blobId, blob: file });
      s = reduce(s, {
        type: "artifact.add",
        kind: "input",
        artifact: {
          id: artifactId,
          workId,
          name: file.name,
          mime: file.type || "application/octet-stream",
          size: file.size,
          version: 1,
          blobId,
          content,
          createdBy: ctx.actorId,
          createdAt: new Date().toISOString(),
        },
      });
      if (draft.text.trim())
        s = reduce(s, {
          type: "message.add",
          message: {
            id: uid(), threadId: w.activeThreadId, role: "user", kind: "request",
            source: "human", actor: ctx.actorId, content: draft.text.trim(),
            at: new Date().toISOString(), contextIds: [], fileIds: [artifactId],
          },
        });
    } else if (a.connectionMode === "external")
      s = reduce(s, {
        type: "message.add",
        message: {
          id: uid(),
          threadId: w.activeThreadId,
          role: "user",
          kind: "request",
          source: "human",
          actor: ctx.actorId,
          content: draft.text,
          at: new Date().toISOString(),
          contextIds: [],
          fileIds: [],
        },
      });
    await writeChanges(db, before, s);
    const prepared =
      !file && a.connectionMode !== "external"
        ? await startRequest(db, w.activeThreadId, draft.text, ctx)
        : undefined;
    return { workId, srId, prepared };
  });
}
