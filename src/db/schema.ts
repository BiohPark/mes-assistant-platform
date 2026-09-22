import Dexie from "dexie";
import type { HubState } from "../types";
export const entityNames = [
  "users",
  "agents",
  "profiles",
  "works",
  "threads",
  "messages",
  "artifacts",
  "bundles",
  "handoffs",
  "requests",
  "activities",
  "notifications",
  "requestRecords",
  "completions",
] as const;
export type EntityName = (typeof entityNames)[number];
export class HubDB extends Dexie {
  constructor(name = "mes-agent-hub-v2") {
    super(name);
    this.version(1).stores({
      users: "id",
      agents: "id,status",
      profiles: "id",
      works: "id,agentId,status",
      threads: "id,workId",
      messages: "id,threadId,requestId",
      artifacts: "id,workId",
      bundles: "id,sourceWorkId",
      handoffs: "id,sourceWorkId,targetWorkId",
      requests: "id,requester",
      activities: "id,workId,at",
      notifications: "id,userId",
      requestRecords: "id,threadId,status,tabId",
      completions: "id,workId",
      blobs: "id",
      meta: "id",
      receipts: "id",
    });
  }
}
export const hubDB = new HubDB();
export async function readState(
  db: HubDB,
  session: HubState["session"] = { userId: "staff", role: "staff" },
): Promise<HubState> {
  return transact<HubState>(db, "r", db.tables, async () => {
    const pairs = await Promise.all(
      entityNames.map(async (name) => [name, await db.table(name).toArray()]),
    );
    const state = {
      version: 1,
      session,
      ...Object.fromEntries(pairs),
    } as HubState;
    state.messages.sort(
      (a, b) =>
        (a.sequence ?? 0) - (b.sequence ?? 0) || a.at.localeCompare(b.at),
    );
    state.requestRecords?.sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    state.activities.sort((a, b) => a.at.localeCompare(b.at));
    state.notifications.sort((a, b) => a.at.localeCompare(b.at));
    return state;
  });
}
export async function writeChanges(
  db: HubDB,
  before: HubState,
  after: HubState,
) {
  const ids: string[] = [];
  for (const name of entityNames) {
    const previous = new Map((before[name] ?? []).map((x) => [x.id, x]));
    let messageSequence = Math.max(
      -1,
      ...before.messages.map((m) => m.sequence ?? -1),
    );
    for (const row of after[name] ?? []) {
      const old = previous.get(row.id);
      if (JSON.stringify(old) !== JSON.stringify(row)) {
        const updated = ["works", "agents", "profiles"].includes(name)
          ? {
              ...row,
              revision: ((old as { revision?: number })?.revision ?? 0) + 1,
            }
          : row;
        await db
          .table(name)
          .put(
            name === "messages" && !old
              ? { ...updated, sequence: ++messageSequence }
              : updated,
          );
        ids.push(row.id);
      }
      previous.delete(row.id);
    }
    if (previous.size) await db.table(name).bulkDelete([...previous.keys()]);
  }
  return ids;
}

// Narrow the callback boundary; Dexie's TXWithTables<this> recursively expands class methods in TS 5.9.
export function transact<T>(
  db: HubDB,
  mode: "r" | "rw",
  tables: (string | import("dexie").Table)[],
  scope: () => Promise<T>,
): Promise<T> {
  const run = db.transaction.bind(db) as unknown as (
    mode: string,
    tables: (string | import("dexie").Table)[],
    scope: () => Promise<T>,
  ) => Promise<T>;
  return run(mode, tables, scope);
}
