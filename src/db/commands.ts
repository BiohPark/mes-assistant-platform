import {
  applyCommand,
  type HubCommand,
  type CommandContext,
  type CommandResult,
} from "../domain/commands";
import { transact, HubDB, readState, writeChanges } from "./schema";
export type PendingBlob = { id: string; blob: Blob };
export function revisionTarget(
  command: HubCommand,
): { table: string; id: string } | undefined {
  if (command.type === "work.edit")
    return { table: "works", id: command.workId };
  if (command.type === "agent.save")
    return { table: "agents", id: command.agent.id };
  if (command.type === "profile.save")
    return { table: "profiles", id: command.profile.id };
}
export async function executeCommand(
  db: HubDB,
  command: HubCommand,
  context: CommandContext,
  blobs: PendingBlob[] = [],
): Promise<CommandResult> {
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(command)),
    );
    const fingerprint = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    return await transact<CommandResult>(
      db,
      "rw",
      db.tables,
      async (): Promise<CommandResult> => {
        const ready = await db.table("meta").get("ready");
        if (!ready) throw Error("저장소가 준비되지 않았습니다.");
        if (context.epoch && context.epoch !== ready.epoch)
          throw Error(
            "conflict:복원으로 데이터가 변경되었습니다. 화면을 새로고침하세요.",
          );
        const existing = await db.table("receipts").get(context.commandId);
        if (existing) {
          if (
            existing.actorId !== context.actorId ||
            existing.command !== fingerprint
          )
            throw Error("중복 명령 ID가 다른 작업에 사용되었습니다.");
          return existing.result as CommandResult;
        }
        const target = revisionTarget(command);
        if (target && context.expectedRevision !== undefined) {
          const row = await db.table(target.table).get(target.id);
          if ((row?.revision ?? 0) !== context.expectedRevision)
            throw Error(
              "conflict:다른 탭에서 변경되었습니다. 최신 내용을 확인한 후 다시 저장하세요.",
            );
        }
        const before = await readState(db, {
          userId: context.actorId,
          role: context.role,
        });
        const after = applyCommand(before, command, context);
        for (const b of blobs) {
          if (await db.table("blobs").get(b.id))
            throw Error("기존 원문 Blob은 덮어쓸 수 없습니다.");
          await db.table("blobs").add(b);
        }
        const referenced =
          command.type === "agent.save"
            ? command.agent.imageId
            : command.type === "artifact.add"
              ? command.artifact.blobId
              : undefined;
        if (referenced && !(await db.table("blobs").get(referenced)))
          throw Error("원본 파일을 찾을 수 없습니다. 다시 업로드하세요.");
        const result: CommandResult = {
          ok: true,
          changedIds: await writeChanges(db, before, after),
        };
        await db.table("receipts").add({
          id: context.commandId,
          actorId: context.actorId,
          command: fingerprint,
          result,
        });
        return result;
      },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      code: message.startsWith("conflict:")
        ? "conflict"
        : e instanceof DOMException
          ? "storage"
          : "validation",
      message: message.replace(/^conflict:/, ""),
    };
  }
}
