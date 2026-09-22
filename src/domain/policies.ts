export {
  canSeeWork,
  canSeeThread,
  visibleMessages,
  visibleWorks,
} from "../domain";
import type { HubState } from "../types";
export function assertEditable(state: HubState, workId: string) {
  if (state.works.find((w) => w.id === workId)?.status === "done")
    throw Error("완료 업무입니다. 사유를 남기고 다시 연 후 수정하세요.");
}
