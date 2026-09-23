import type { HubState, Action, Tag, ArtifactVersion } from "./types";
import { demoCatalog, catalogUsers } from "./demoCatalog";
export const tagLabel = (label: string) =>
  label
    .normalize("NFKC")
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
export const normalizeTag = (label: string) => tagLabel(label).toLowerCase();
export function attachTag(
  s: HubState,
  workId: string,
  label: string,
  kind: Tag["kind"],
) {
  const key = normalizeTag(label);
  if (!key || key.length > 100) throw Error("태그는 1–100자로 입력하세요.");
  s.tags ??= [];
  s.taskTags ??= [];
  let tag = s.tags.find((t) => t.kind === kind && t.key === key);
  if (!tag) {
    const colors = [
      "#8caeb4",
      "#a9a0be",
      "#b8a887",
      "#8fac9d",
      "#b997a2",
      "#92a4bb",
    ];
    let hash = 0;
    for (const c of key) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    tag = {
      id: crypto.randomUUID(),
      kind,
      key,
      label: tagLabel(label),
      color: kind === "sr" ? colors[hash % colors.length] : "#8b9492",
    };
    s.tags.push(tag);
  }
  if (!s.taskTags.some((t) => t.workId === workId && t.tagId === tag!.id))
    s.taskTags.push({
      id: crypto.randomUUID(),
      workId,
      tagId: tag.id,
      at: new Date().toISOString(),
      order:
        Math.max(
          -1,
          ...s.taskTags
            .filter((t) => t.workId === workId)
            .map((t) => t.order ?? 0),
        ) + 1,
    });
  return tag;
}
export const workTags = (s: HubState, workId: string) =>
  (s.taskTags ?? [])
    .filter((t) => t.workId === workId)
    .sort(
      (a, b) =>
        (a.order ?? 0) - (b.order ?? 0) ||
        a.at.localeCompare(b.at) ||
        a.id.localeCompare(b.id),
    )
    .flatMap((t) => s.tags?.find((x) => x.id === t.tagId) ?? []);
export function canReadMaterial(s: HubState, f: ArtifactVersion) {
  if (s.session.role !== "requester") return true;
  return s.requests.some(
    (r) =>
      r.requester === s.session.userId &&
      ((r.workId === f.workId && f.createdBy === s.session.userId) ||
        r.results.some((x) => x.artifactIds.includes(f.id))),
  );
}
export function discoverMaterials(s: HubState, workId: string) {
  const tags = new Set(workTags(s, workId).map((t) => t.id));
  const origins = new Set([
    workId,
    ...(s.taskTags ?? []).filter((t) => tags.has(t.tagId)).map((t) => t.workId),
  ]);
  // Only original ownership defines discovery. Input references never widen it.
  return s.artifacts.filter(
    (f) => origins.has(f.workId) && canReadMaterial(s, f),
  );
}
export const selectedMaterials = (s: HubState, workId: string) =>
  (s.taskInputs ?? [])
    .filter((x) => x.workId === workId)
    .flatMap(
      (x) =>
        s.artifacts.find(
          (f) => f.id === x.artifactId && canReadMaterial(s, f),
        ) ?? [],
    );
export function orderedAgents(s: HubState) {
  const ids = s.catalogOrders?.[0]?.agentIds ?? [];
  return [...s.agents].sort((a, b) => {
    const ai = ids.indexOf(a.id),
      bi = ids.indexOf(b.id);
    return (
      (ai < 0 ? 1e9 : ai) - (bi < 0 ? 1e9 : bi) || a.id.localeCompare(b.id)
    );
  });
}
export const activityOrder = (
  a: HubState["works"][number],
  b: HubState["works"][number],
) =>
  b.updatedAt.localeCompare(a.updatedAt) ||
  b.createdAt.localeCompare(a.createdAt) ||
  a.id.localeCompare(b.id);
export function reduceHub(original: HubState, a: Action): HubState | undefined {
  if (
    ![
      "tag.attach",
      "tag.detach",
      "input.set",
      "catalog.order",
      "sr.title",
    ].includes(a.type)
  )
    return;
  const s = structuredClone(original),
    at = new Date().toISOString();
  if (a.type === "catalog.order") {
    if (s.session.role !== "admin")
      throw Error("System Owner 권한이 필요합니다.");
    const old = s.catalogOrders?.[0];
    if ((old?.revision ?? 0) !== a.expectedRevision)
      throw Error(
        "conflict:공통 순서가 변경되었습니다. 초안을 유지했습니다. 최신 순서를 확인하세요.",
      );
    if (
      new Set(a.agentIds).size !== s.agents.length ||
      a.agentIds.length !== s.agents.length ||
      a.agentIds.some((id) => !s.agents.some((x) => x.id === id))
    )
      throw Error("전체 목록에서 순서를 편집하세요.");
    s.catalogOrders = [
      {
        id: "shared",
        agentIds: a.agentIds,
        revision: (old?.revision ?? 0) + 1,
      },
    ];
    return s;
  }
  if (a.type === "sr.title") {
    const r = s.requests.find((r) => r.id === a.srId);
    if (!r || (s.session.role !== "admin" && s.session.userId !== r.requester))
      throw Error("요청자 또는 System Owner만 제목을 변경할 수 있습니다.");
    if (a.source === "ai" && r.titleSource === "manual") return s;
    if (!a.title.trim()) throw Error("제목을 입력하세요.");
    r.title = a.title.trim().slice(0, 150);
    r.titleSource = a.source;
    const w = s.works.find((w) => w.id === r.workId)!;
    if (
      w.status !== "done" &&
      (w.titleSource !== "manual" || a.source === "manual")
    ) {
      w.title = r.title;
      w.titleSource = a.source;
    }
    return s;
  }
  if (!("workId" in a)) return;
  const w = s.works.find((w) => w.id === a.workId);
  if (
    !w ||
    (s.session.role === "requester" &&
      !s.requests.some(
        (r) => r.requester === s.session.userId && r.workId === w.id,
      ))
  )
    throw Error("업무 권한이 없습니다.");
  if (w.status === "done")
    throw Error("완료 업무는 사유를 남겨 재개한 후 변경하세요.");
  if (a.type === "input.set") {
    s.taskInputs ??= [];
    const old = s.taskInputs.find(
      (i) => i.workId === w.id && i.artifactId === a.artifactId,
    );
    if (
      a.selected &&
      !old &&
      !discoverMaterials(s, w.id).some((f) => f.id === a.artifactId)
    )
      throw Error("이 자료를 선택할 수 없습니다.");
    if (
      a.selected &&
      !s.artifacts.some((f) => f.id === a.artifactId && canReadMaterial(s, f))
    )
      throw Error("자료 권한이 없습니다.");
    s.taskInputs = s.taskInputs.filter(
      (i) => !(i.workId === w.id && i.artifactId === a.artifactId),
    );
    if (a.selected)
      s.taskInputs.push({
        id: old?.id ?? crypto.randomUUID(),
        workId: w.id,
        artifactId: a.artifactId,
        main: a.main ?? old?.main ?? false,
        at: old?.at ?? at,
      });
    s.threads.find((t) => t.workId === w.id)!.selectedInputIds = s.taskInputs
      .filter((i) => i.workId === w.id)
      .map((i) => i.artifactId);
  } else {
    if (s.session.role === "requester")
      throw Error("태그 편집은 업무 담당자가 수행합니다.");
    if (a.type === "tag.attach") {
      const tag = attachTag(s, w.id, a.label, a.kind);
      const r =
        a.kind === "sr"
          ? s.requests.find(
              (r) => r.number && normalizeTag(r.number) === tag.key,
            )
          : undefined;
      const t = s.threads.find((t) => t.workId === w.id)!;
      if (r && !t.srIds.includes(r.id)) t.srIds.push(r.id);
    } else if (a.type === "tag.detach") {
      s.taskTags = (s.taskTags ?? []).filter(
        (t) => !(t.workId === w.id && t.tagId === a.tagId),
      );
      const tag = s.tags?.find((t) => t.id === a.tagId),
        t = s.threads.find((t) => t.workId === w.id)!;
      t.srIds = t.srIds.filter((id) => {
        const r = s.requests.find((r) => r.id === id);
        return !r?.number || normalizeTag(r.number) !== tag?.key;
      });
    }
  }
  w.updatedAt = at;
  s.activities.push({
    id: crypto.randomUUID(),
    workId: w.id,
    actor: s.session.userId,
    at,
    action: a.type === "input.set" ? "자료 선택 변경" : "태그 변경",
    detail: a.type,
  });
  return s;
}
export function convertToV3(original: HubState): HubState {
  if (original.hubVersion === 3) return structuredClone(original);
  const s = structuredClone(original);
  s.hubVersion = 3;
  s.tags = [];
  s.taskTags = [];
  s.taskInputs = [];
  const originalWorks = structuredClone(s.works);
  for (const w of originalWorks) {
    const threads = s.threads.filter((t) => t.workId === w.id),
      primary = threads.find((t) => t.id === w.activeThreadId) ?? threads[0];
    for (const t of threads) {
      const id = t === primary ? w.id : `${w.id}--${t.id}`;
      const converted = {
        ...structuredClone(w),
        id,
        legacyWorkId: w.id,
        activeThreadId: t.id,
        title: threads.length > 1 ? `${w.title} · ${t.title}` : w.title,
      };
      t.workId = id;
      const selected = new Set(t.selectedInputIds ?? w.inputIds);
      for (const bid of t.activeBundleIds) {
        const b = s.bundles.find((b) => b.id === bid);
        if (!b) continue;
        b.artifactIds.forEach((fid) => selected.add(fid));
        const content = [
          ...b.excerpts.map((e) => `[${e.actor} · ${e.at}]\n${e.content}`),
          b.summary,
          b.note,
        ]
          .filter(Boolean)
          .join("\n\n");
        if (content) {
          const fid = `migrated-${t.id}-${bid}`;
          s.artifacts.push({
            id: fid,
            workId: id,
            name: b.name + ".md",
            mime: "text/markdown",
            size: new Blob([content]).size,
            version: 1,
            content,
            role: "input",
            createdBy: b.createdBy,
            createdAt: b.createdAt,
            legacyWorkId: b.sourceWorkId,
            sourceMessageIds: b.excerpts.map((e) => e.messageId),
          });
          converted.inputIds.push(fid);
          selected.add(fid);
        }
      }
      if (id === w.id)
        Object.assign(s.works.find((x) => x.id === id)!, converted);
      else s.works.push(converted);
      t.activeBundleIds = [];
      t.selectedInputIds = [...selected];
      for (const artifactId of selected)
        s.taskInputs.push({
          id: crypto.randomUUID(),
          workId: id,
          artifactId,
          main: false,
          at: t.createdAt,
        });
      for (const r of s.requests.filter((r) => r.threadId === t.id))
        r.workId = id;
      for (const r of s.requestRecords ?? [])
        if (r.threadId === t.id) r.workId = id;
      for (const srId of t.srIds) {
        const r = s.requests.find((r) => r.id === srId);
        if (r?.number) r.tagId = attachTag(s, id, r.number, "sr").id;
      }
    }
  }
  for (const f of s.artifacts)
    if (originalWorks.some((w) => w.id === f.workId)) {
      f.legacyWorkId = f.workId;
      f.role = originalWorks.find(w => w.id === f.workId)?.outputIds.includes(f.id)
        ? "output" : "input";
    }
  for (const a of s.agents)
    if (["urs", "fds", "test", "gmp", "deploy", "legacy"].includes(a.id))
      a.lv1 = "이전 데모";
  for (const u of catalogUsers)
    if (!s.users.some((x) => x.id === u.id)) s.users.push(u);
  const catalog = demoCatalog(s.profiles[0]?.id ?? ""),
    intake = s.agents.find((a) => a.intake),
    useCatalog = !intake || intake.id === "urs";
  if (useCatalog) s.agents.forEach((a) => (a.intake = false));
  for (const a of catalog)
    if (!s.agents.some((x) => x.id === a.id))
      s.agents.push({ ...a, intake: useCatalog && a.intake });
  s.catalogOrders = [
    {
      id: "shared",
      revision: 0,
      agentIds: [
        ...catalog.map((a) => a.id),
        ...s.agents.filter((a) => !catalog.some(c => c.id === a.id)).map((a) => a.id),
      ],
    },
  ];
  return s;
}
