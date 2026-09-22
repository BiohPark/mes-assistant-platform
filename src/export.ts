import type { HubState, ArtifactVersion } from "./types";
import { getBlob, saveDownload } from "./files";

export type ExportFile = {
  artifactId: string;
  name: string;
  mime: string;
  byteLength: number;
  encoding: "base64";
  base64: string;
};
type BlobReader = (id: string) => Promise<Blob | undefined>;

async function encodeFile(
  artifact: ArtifactVersion,
  readBlob: BlobReader,
): Promise<ExportFile> {
  const blob = artifact.blobId
    ? await readBlob(artifact.blobId)
    : artifact.content !== undefined
      ? new Blob([artifact.content], { type: artifact.mime })
      : undefined;
  if (!blob)
    throw new Error(
      `원본 파일을 찾을 수 없어 내보내기를 중단했습니다: ${artifact.name} (v${artifact.version})`,
    );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return {
    artifactId: artifact.id,
    name: artifact.name,
    mime: artifact.mime,
    byteLength: bytes.byteLength,
    encoding: "base64",
    base64: btoa(binary),
  };
}

/** Captures a portable, immutable snapshot including original binary file bytes. */
export async function buildWorkExport(
  state: HubState,
  workId: string,
  readBlob: BlobReader = getBlob,
) {
  if (state.session.role === "requester")
    throw new Error(
      "전체 업무 결과 내보내기는 업무 담당자만 이용할 수 있습니다.",
    );
  const s = structuredClone(state);
  const work = s.works.find((w) => w.id === workId);
  if (!work) throw new Error("내보낼 업무를 찾을 수 없습니다.");
  const threads = s.threads.filter((t) => t.workId === workId);
  const threadIds = new Set(threads.map((t) => t.id));
  const messages = s.messages.filter((m) => threadIds.has(m.threadId));
  const handoffs = s.handoffs.filter(
    (h) => h.sourceWorkId === workId || h.targetWorkId === workId,
  );
  const bundleIds = new Set([
    ...threads.flatMap((t) => t.activeBundleIds),
    ...messages.flatMap((m) => m.contextIds),
    ...handoffs.map((h) => h.bundleId),
    ...s.bundles.filter((b) => b.sourceWorkId === workId).map((b) => b.id),
  ]);
  const bundles = s.bundles.filter((b) => bundleIds.has(b.id));
  for (const id of bundleIds)
    if (!bundles.some((b) => b.id === id))
      throw new Error(`컨텍스트 원본이 없어 내보내기를 중단했습니다: ${id}`);
  const sharedResults = s.requests.flatMap((r) =>
    r.results
      .filter((result) => result.sourceWorkId === workId)
      .map((result) => ({
        srId: r.id,
        srNumber: r.number,
        requester: r.requester,
        ...result,
      })),
  );
  const artifactIds = new Set([
    ...work.inputIds,
    ...work.outputIds,
    ...messages.flatMap((m) => m.fileIds),
    ...bundles.flatMap((b) => b.artifactIds),
    ...sharedResults.flatMap((r) => r.artifactIds),
    ...s.artifacts.filter((a) => a.workId === workId).map((a) => a.id),
  ]);
  // Retain previous file versions, even after removal from the current material tray.
  for (const id of artifactIds) {
    const artifact = s.artifacts.find((a) => a.id === id);
    if (!artifact)
      throw new Error(`파일 버전 정보가 없어 내보내기를 중단했습니다: ${id}`);
    if (artifact.previousId) artifactIds.add(artifact.previousId);
  }
  const artifacts = s.artifacts.filter((a) => artifactIds.has(a.id));
  const files: ExportFile[] = [];
  for (const artifact of artifacts)
    files.push(await encodeFile(artifact, readBlob));
  const requestRecords = [];
  for (const record of s.requestRecords ?? []) {
    if (record.workId !== workId) continue;
    const snapshotMessages = [];
    for (const m of record.snapshot.messages) {
      const b = await readBlob(m.contentId);
      if (!b) throw Error("요청 원문이 없어 내보내기를 중단했습니다.");
      snapshotMessages.push({
        role: m.role,
        content: await b.text(),
        ...(m.name ? { name: m.name } : {}),
      });
    }
    const { leaseToken, leaseUntil, tabId, ...publicRecord } = record;
    requestRecords.push({
      ...publicRecord,
      requestBody: {
        model: record.snapshot.model,
        messages: snapshotMessages,
        stream: false,
      },
    });
  }
  const completions = (s.completions ?? []).filter((c) => c.workId === workId);
  const activities = s.activities.filter((a) => a.workId === workId);
  const relatedWorkIds = new Set([
    workId,
    ...handoffs.flatMap((h) => [h.sourceWorkId, h.targetWorkId]),
    ...bundles.map((b) => b.sourceWorkId),
    ...bundles.flatMap((b) =>
      b.excerpts
        .map((e) => s.threads.find((t) => t.id === e.threadId)?.workId)
        .filter((id): id is string => !!id),
    ),
  ]);
  const workReferences = s.works
    .filter((w) => relatedWorkIds.has(w.id))
    .map((w) => ({
      id: w.id,
      title: w.title,
      agentId: w.agentId,
      owner: w.owner,
      createdAt: w.createdAt,
      archived: w.archived,
    }));
  const personIds = new Set([
    work.createdBy,
    work.owner,
    ...messages.map((m) => m.actor),
    ...artifacts.map((a) => a.createdBy),
    ...bundles.flatMap((b) => [b.createdBy, ...b.excerpts.map((e) => e.actor)]),
    ...handoffs.map((h) => h.actor),
    ...activities.map((a) => a.actor),
    ...sharedResults.flatMap((r) => [r.actor, r.requester]),
  ]);
  const agentIds = new Set(workReferences.map((w) => w.agentId));
  return {
    format: "mes-agent-hub-work-package" as const,
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: s.session.userId,
    work,
    threads,
    messages,
    artifacts,
    files,
    bundles,
    handoffs,
    activities,
    sharedResults,
    requestRecords,
    completions,
    workReferences,
    people: s.users.filter((u) => personIds.has(u.id)),
    agents: s.agents
      .filter((a) => agentIds.has(a.id))
      .map((a) => ({
        id: a.id,
        name: a.name,
        lv1: a.lv1,
        lv2: a.lv2,
        owner: a.owner,
        status: a.status,
      })),
    readme:
      "files[].base64 contains the original bytes for artifacts identified by artifactId. Decode base64 and save with the supplied name. Historical requestSnapshot fields and immutable context bundles retain their original contents. This package is for review and improvement; application restore/import is not implemented.",
  };
}

export async function downloadWorkExport(state: HubState, workId: string) {
  const result = await buildWorkExport(state, workId);
  const name =
    result.work.title
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .slice(0, 100) || "업무";
  saveDownload(
    new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
    `${name}-결과묶음.json`,
  );
  return result;
}
