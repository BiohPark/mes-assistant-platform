import type { Action, HubState, Role } from "../types";
import { reduce } from "../domain";
export type HubCommand = Exclude<Action, { type: "session" }>;
export type CommandContext = {
  actorId: string;
  role: Role;
  tabId: string;
  commandId: string;
  expectedRevision?: number;
  epoch?: string;
};
export type CommandResult =
  | { ok: true; changedIds: string[] }
  | {
      ok: false;
      code: "validation" | "conflict" | "storage" | "forbidden";
      message: string;
    };
export function applyCommand(
  state: HubState,
  command: HubCommand,
  context: CommandContext,
): HubState {
  if (!state.users.some((u) => u.id === context.actorId))
    throw Error("사용자를 찾을 수 없습니다.");
  return reduce(
    { ...state, session: { userId: context.actorId, role: context.role } },
    command,
  );
}
