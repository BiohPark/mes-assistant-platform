import type { Action, HubState, WorkItem, ContextBundle } from "./types";
import { reduceHub, attachTag, selectedMaterials, workTags } from "./hub";
export const uid = (): string => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const canSeeWork = (s: HubState, id: string) =>
  s.works.some((w) => w.id === id) &&
  (s.session.role !== "requester" ||
    s.requests.some(
      (r) => r.workId === id && r.requester === s.session.userId,
    ));
export const canSeeThread = (s: HubState, id: string) => {
  const t = s.threads.find((t) => t.id === id);
  return (
    !!t &&
    canSeeWork(s, t.workId) &&
    (s.session.role !== "requester" ||
      s.requests.some(
        (r) => r.threadId === id && r.requester === s.session.userId,
      ))
  );
};
export const visibleWorks = (s: HubState) =>
  s.works.filter((w) => canSeeWork(s, w.id));
export const visibleMessages = (s: HubState, threadId: string) =>
  canSeeThread(s, threadId)
    ? s.messages.filter(
        (m) =>
          m.threadId === threadId &&
          (s.session.role !== "requester" ||
            (m.kind !== "discussion" &&
              (m.role === "user"
                ? m.actor === s.session.userId
                : m.visibleToRequester === s.session.userId))),
      )
    : [];
export function modelFor(s: HubState, id: string) {
  const t = s.threads.find((t) => t.id === id);
  const w = s.works.find((w) => w.id === t?.workId);
  const a = s.agents.find((a) => a.id === w?.agentId);
  return (
    t?.model ||
    a?.defaultModel ||
    s.profiles.find((p) => p.id === a?.profileId)?.defaultModel ||
    ""
  );
}
export function reduce(original: HubState, a: Action): HubState {
  const hubResult = reduceHub(original, a);
  if (hubResult) return hubResult;
  const s = structuredClone(original),
    actor = s.session.userId,
    at = now();
  const require = (ok: unknown, message = "이 작업을 수행할 수 없습니다.") => {
    if (!ok) throw new Error(message);
  };
  const staff = () =>
    require(s.session.role !== "requester", "담당자 권한이 필요합니다.");
  const work = (id: string) => {
    require(canSeeWork(s, id), "업무를 열람할 수 없습니다.");
    return s.works.find((w) => w.id === id)!;
  };
  const thread = (id: string) => {
    const t = s.threads.find((t) => t.id === id);
    require(t, "대화가 없습니다.");
    require(canSeeThread(s, id), "이 대화를 열람할 수 없습니다.");
    return t!;
  };
  const activity = (id: string, action: string, detail = "") => {
    s.activities.push({ id: uid(), workId: id, actor, at, action, detail });
    const w = s.works.find((w) => w.id === id);
    if (w) w.updatedAt = at;
  };
  const notify = (userId: string, title: string, body: string, link: string) =>
    s.notifications.push({
      id: uid(),
      userId,
      title,
      body,
      link,
      at,
      read: false,
    });
  const makeWork = (
    agentId: string,
    title: string,
    owner: string,
    id = uid(),
    manual = false,
  ) => {
    const agent = s.agents.find((a) => a.id === agentId);
    require(agent &&
      agent.status !==
        "retired", "폐기된 에이전트에는 신규 업무를 만들 수 없습니다.");
    require(title.trim(), "업무명을 입력하세요.");
    require(!s.works.some((w) => w.id === id), "중복 업무 ID");
    const tid = uid();
    const w: WorkItem = {
      id,
      agentId,
      title: title.trim(),
      description: "",
      owner,
      createdBy: actor,
      createdAt: at,
      updatedAt: at,
      status: "waiting",
      archived: false,
      manual,
      externalUrl: "",
      checks: agent!.checklist.map((label) => ({
        id: uid(),
        label,
        done: false,
      })),
      notes: [],
      inputIds: [],
      outputIds: [],
      activeThreadId: tid,
    };
    s.works.push(w);
    s.threads.push({
      id: tid,
      workId: id,
      title: "첫 번째 대화",
      createdAt: at,
      model: "",
      srIds: [],
      activeBundleIds: [],
      selectedInputIds: [],
    });
    activity(id, "업무 생성", title);
    return w;
  };
  const availableBundles = (id: string) => {
    const ids = new Set([
      ...s.handoffs.filter((h) => h.targetWorkId === id).map((h) => h.bundleId),
      ...s.threads
        .filter((t) => t.workId === id)
        .flatMap((t) => t.activeBundleIds),
    ]);
    return s.bundles.filter((b) => b.sourceWorkId === id || ids.has(b.id));
  };
  const allowedFiles = (id: string) => {
    const w = work(id);
    return new Set([
      ...w.inputIds,
      ...w.outputIds,
      ...selectedMaterials(s, id).map((f) => f.id),
      ...availableBundles(id).flatMap((b) => b.artifactIds),
    ]);
  };
  const saveBundle = (b: ContextBundle) => {
    work(b.sourceWorkId);
    const existing = s.bundles.find((x) => x.id === b.id);
    if (existing) {
      require(JSON.stringify(existing) ===
        JSON.stringify(b), "저장된 컨텍스트는 변경할 수 없습니다.");
      return existing;
    }
    require(b.name.trim(), "컨텍스트 이름을 입력하세요.");
    const allowed = allowedFiles(b.sourceWorkId);
    require(b.artifactIds.every(
      (id) => allowed.has(id) && s.artifacts.some((f) => f.id === id),
    ), "전달할 수 없는 자료입니다.");
    for (const e of b.excerpts) {
      const m = s.messages.find((m) => m.id === e.messageId);
      const own =
        m &&
        s.threads.some(
          (t) => t.id === m.threadId && t.workId === b.sourceWorkId,
        ) &&
        m.content === e.content &&
        m.actor === e.actor &&
        m.threadId === e.threadId &&
        m.at === e.at;
      const received = availableBundles(b.sourceWorkId).some((b) =>
        b.excerpts.some(
          (x) =>
            x.messageId === e.messageId &&
            x.threadId === e.threadId &&
            x.content === e.content &&
            x.actor === e.actor &&
            x.at === e.at,
        ),
      );
      require(own || received, "메시지 원문이 일치하지 않습니다.");
    }
    const frozen = structuredClone(b);
    s.bundles.push(frozen);
    activity(b.sourceWorkId, "컨텍스트 저장", b.name);
    return frozen;
  };
  const editableId =
    a.type === "work.edit"
      ? Object.keys(a).every((k) =>
          ["type", "workId", "archived", "expectedRevision"].includes(k),
        )
        ? undefined
        : a.workId
      : [
            "work.check",
            "work.check.add",
            "thread.create",
            "artifact.unlink",
          ].includes(a.type)
        ? "workId" in a
          ? a.workId
          : undefined
        : a.type === "artifact.add"
          ? a.artifact.workId
          : a.type === "message.add"
            ? s.threads.find((t) => t.id === a.message.threadId)?.workId
            : [
                  "thread.model",
                  "thread.inputs",
                  "context.attach",
                  "context.import",
                ].includes(a.type)
              ? "threadId" in a
                ? s.threads.find((t) => t.id === a.threadId)?.workId
                : undefined
              : a.type === "handoff"
                ? a.targetWorkId
                : undefined;
  if (editableId && work(editableId).status === "done")
    throw Error("완료 업무는 사유를 남겨 재개한 후 변경하세요.");
  switch (a.type) {
    case "sr.register": {
      const w = work(a.workId);
      require(s.agents.find((a) => a.id === w.agentId)
        ?.intake, "접수용 에이전트 대화에서 접수하세요.");
      const existing = s.requests.find((r) => r.threadId === w.activeThreadId);
      if (existing) return reduce(s, { type: "sr.submit", srId: existing.id });
      require(!s.requests.some((r) => r.id === a.id), "중복 SR ID");
      s.requests.push({
        id: a.id,
        workId: w.id,
        threadId: w.activeThreadId,
        title: w.title,
        titleSource: w.titleSource ?? "fallback",
        requester: actor,
        status: "draft",
        createdAt: at,
        results: [],
      });
      return reduce(s, { type: "sr.submit", srId: a.id });
    }
    case "context.import":
      return reduce(reduce(s, { type: "bundle.save", bundle: a.bundle }), {
        type: "context.attach",
        threadId: a.threadId,
        bundleId: a.bundle.id,
      });
    case "thread.inputs": {
      const t = thread(a.threadId);
      const w = work(t.workId);
      require(
        a.fileIds.every(
          (id) =>
            w.inputIds.includes(id) &&
            (s.session.role !== "requester" ||
              s.artifacts.find((f) => f.id === id)?.createdBy === actor),
        ),
      );
      t.selectedInputIds = [...new Set(a.fileIds)];
      activity(w.id, "전송 입력 선택");
      break;
    }
    case "session":
      require(s.users.some((u) => u.id === a.userId));
      s.session = { userId: a.userId, role: a.role };
      break;
    case "agent.save": {
      require(s.session.role === "admin", "관리자 권한이 필요합니다.");
      const old = s.agents.find((x) => x.id === a.agent.id);
      require(a.agent.name.trim(), "에이전트 이름을 입력하세요.");
      require(!(
        old?.intake &&
        (!a.agent.intake || a.agent.status === "retired")
      ), "먼저 다른 접수용 에이전트를 지정하세요.");
      require(!(
        a.agent.intake && a.agent.status === "retired"
      ), "폐기 에이전트는 접수를 담당할 수 없습니다.");
      if (a.agent.intake) s.agents.forEach((x) => (x.intake = false));
      s.agents = s.agents.filter((x) => x.id !== a.agent.id);
      s.agents.push(structuredClone(a.agent));
      if (
        s.catalogOrders?.[0] &&
        !s.catalogOrders[0].agentIds.includes(a.agent.id)
      ) {
        s.catalogOrders[0].agentIds.push(a.agent.id);
        s.catalogOrders[0].revision++;
      }
      break;
    }
    case "profile.save":
      require(s.session.role === "admin", "관리자 권한이 필요합니다.");
      require(a.profile.maxRequestBytes === undefined ||
        (Number.isInteger(a.profile.maxRequestBytes) &&
          a.profile.maxRequestBytes >= 1024 &&
          a.profile.maxRequestBytes <=
            16777216), "요청 크기는 1–16384 KiB 범위로 입력하세요.");
      s.profiles = s.profiles.filter((p) => p.id !== a.profile.id);
      s.profiles.push(structuredClone(a.profile));
      break;
    case "work.create":
      staff();
      makeWork(a.agentId, a.title, a.owner, a.id, a.manual).archived =
        a.archived ?? false;
      break;
    case "work.edit": {
      staff();
      const w = work(a.workId);
      for (const key of [
        "title",
        "description",
        "owner",
        "manual",
        "archived",
        "externalUrl",
      ] as const) {
        if (a[key] !== undefined) Object.assign(w, { [key]: a[key] });
      }
      require(w.title.trim(), "업무명을 입력하세요.");
      if (a.title !== undefined) {
        w.titleSource = "manual";
        for (const r of s.requests.filter((r) => r.workId === w.id)) {
          r.title = w.title;
          r.titleSource = "manual";
        }
      }
      activity(w.id, "업무 수정");
      break;
    }
    case "work.status": {
      staff();
      const w = work(a.workId);
      if (w.status === a.status) break;
      if (a.status === "done" && w.checks.some((c) => !c.done))
        require(a.reason.trim(), "미완료 체크리스트가 있습니다. 완료 사유를 입력하세요.");
      const previousStatus = w.status;
      const reopening = w.status === "done";
      if (reopening) require(a.reason.trim(), "다시 여는 사유를 입력하세요.");
      if (a.status === "done") {
        require(!(s.requestRecords ?? []).some(
          (r) =>
            r.workId === w.id && ["pending", "streaming"].includes(r.status),
        ), "진행 중 요청을 완료하거나 취소한 후 업무를 완료하세요.");
        (s.completions ??= []).push({
          id: uid(),
          workId: w.id,
          at,
          actor,
          reason: a.reason,
          legacy: false,
          inputs: structuredClone(
            (s.taskInputs ?? []).filter((i) => i.workId === w.id),
          ),
          tags: structuredClone(workTags(s, w.id)),
          work: { ...structuredClone(w), status: "done" },
        });
      }
      w.status = a.status;
      activity(
        w.id,
        reopening ? "업무 재개" : "상태 변경",
        `${a.status} ${a.reason}`,
      );
      s.activities[s.activities.length - 1].transition = {
        from: previousStatus,
        to: a.status,
        reason: a.reason,
        owner: w.owner,
        agentId: w.agentId,
        completionId:
          a.status === "done" ? s.completions?.at(-1)?.id : undefined,
      };
      break;
    }
    case "work.check": {
      staff();
      const w = work(a.workId);
      const c = w.checks.find((c) => c.id === a.checkId);
      require(c);
      c!.done = a.done;
      activity(w.id, "체크리스트 변경", c!.label);
      break;
    }
    case "work.check.add": {
      staff();
      const w = work(a.workId);
      require(a.label.trim());
      w.checks.push({ id: uid(), label: a.label.trim(), done: false });
      activity(w.id, "체크리스트 추가", a.label);
      break;
    }
    case "work.note": {
      staff();
      const w = work(a.workId);
      require(a.text.trim());
      w.notes.push({ id: uid(), text: a.text, actor, at });
      activity(w.id, w.status === "done" ? "완료 후 메모" : "메모 추가");
      break;
    }
    case "thread.create": {
      staff();
      const w = work(a.workId);
      if (s.hubVersion === 3) {
        makeWork(w.agentId, a.title || "새 대화", actor, a.id);
        break;
      }
      const id = a.id || uid();
      require(!s.threads.some((t) => t.id === id));
      s.threads.push({
        id,
        workId: w.id,
        title: a.title.trim() || "새 대화",
        createdAt: at,
        model: "",
        srIds: [],
        activeBundleIds: [],
        selectedInputIds: [],
      });
      w.activeThreadId = id;
      activity(w.id, "대화 시작", a.title);
      break;
    }
    case "thread.select": {
      const w = work(a.workId);
      require(thread(a.threadId).workId === w.id);
      w.activeThreadId = a.threadId;
      break;
    }
    case "thread.model": {
      const t = thread(a.threadId);
      t.model = a.model;
      activity(t.workId, "모델 설정", a.model || "에이전트 기본값");
      break;
    }
    case "thread.sr": {
      staff();
      const t = thread(a.threadId);
      require(a.srIds.every((id) =>
        s.requests.some((r) => r.id === id && r.number),
      ), "접수된 SR만 연결할 수 있습니다.");
      t.srIds = [...new Set(a.srIds)];
      activity(t.workId, "SR 태그 변경");
      break;
    }
    case "message.add": {
      const t = thread(a.message.threadId);
      require(!s.messages.some((m) => m.id === a.message.id), "중복 메시지");
      require(a.message.content.trim());
      require(a.message.contextIds.every((id) =>
        t.activeBundleIds.includes(id),
      ), "비활성 컨텍스트가 포함되어 있습니다.");
      if (a.message.role === "user")
        require(a.message.actor === actor, "작성자가 현재 사용자와 다릅니다.");
      const msg = structuredClone(a.message);
      if (s.session.role === "requester") {
        require(msg.kind !==
          "discussion", "요청자는 팀 의견을 작성할 수 없습니다.");
        require(!msg.contextIds.length, "내부 컨텍스트를 사용할 수 없습니다.");
        require(msg.fileIds.every((id) =>
          s.artifacts.some(
            (f) =>
              f.id === id && f.workId === t.workId && f.createdBy === actor,
          ),
        ), "본인이 제출한 자료만 사용할 수 있습니다.");
        if (msg.role === "assistant")
          require(msg.visibleToRequester ===
            actor, "요청자 대화의 응답 출처가 일치하지 않습니다.");
        msg.visibleToRequester = actor;
      } else delete msg.visibleToRequester;
      s.messages.push(msg);
      activity(
        t.workId,
        a.message.kind === "discussion" ? "팀 의견" : "대화 메시지",
      );
      break;
    }
    case "artifact.add": {
      const w = work(a.artifact.workId);
      if (s.session.role === "requester") require(a.kind === "input");
      require(!s.artifacts.some(
        (f) => f.id === a.artifact.id,
      ), "이미 저장된 파일 버전입니다.");
      if (a.artifact.previousId)
        require(s.artifacts.some(
          (f) => f.id === a.artifact.previousId && f.workId === w.id,
        ), "이전 버전을 찾을 수 없습니다.");
      s.artifacts.push({
        ...structuredClone(a.artifact),
        role: a.kind,
        originThreadId: a.artifact.originThreadId ?? w.activeThreadId,
      });
      w[a.kind === "input" ? "inputIds" : "outputIds"].push(a.artifact.id);
      activity(w.id, "자료 추가", a.artifact.name);
      break;
    }
    case "artifact.unlink": {
      staff();
      const w = work(a.workId);
      const key = a.kind === "input" ? "inputIds" : "outputIds";
      w[key] = w[key].filter((id) => id !== a.artifactId);
      activity(w.id, "자료 연결 제거");
      break;
    }
    case "bundle.save":
      staff();
      saveBundle(a.bundle);
      break;
    case "context.attach": {
      staff();
      const t = thread(a.threadId);
      const b = s.bundles.find((b) => b.id === a.bundleId);
      require(b);
      work(b!.sourceWorkId);
      if (!t.activeBundleIds.includes(a.bundleId))
        t.activeBundleIds.push(a.bundleId);
      activity(t.workId, "컨텍스트 추가", b!.name);
      break;
    }
    case "context.detach": {
      staff();
      const t = thread(a.threadId);
      t.activeBundleIds = t.activeBundleIds.filter((id) => id !== a.bundleId);
      activity(t.workId, "활성 컨텍스트 제거");
      break;
    }
    case "handoff": {
      staff();
      const b = saveBundle(a.bundle);
      const target = a.targetWorkId
        ? work(a.targetWorkId)
        : makeWork(
            a.targetAgentId || "",
            a.title || b.name,
            a.owner || actor,
            a.newWorkId,
          );
      require(target.id !== b.sourceWorkId, "같은 업무로 인계할 수 없습니다.");
      require(s.agents.find((x) => x.id === target.agentId)?.status !==
        "retired", "폐기 에이전트는 신규 인계를 받을 수 없습니다.");
      require(a.srIds.every((id) =>
        s.requests.some((r) => r.id === id && r.number),
      ), "접수된 SR만 연결할 수 있습니다.");
      const t = thread(target.activeThreadId);
      t.activeBundleIds = [...new Set([...t.activeBundleIds, b.id])];
      t.srIds = [...new Set([...t.srIds, ...a.srIds])];
      s.handoffs.push({
        id: uid(),
        sourceWorkId: b.sourceWorkId,
        targetWorkId: target.id,
        targetThreadId: t.id,
        bundleId: b.id,
        actor,
        at,
        active: true,
      });
      activity(target.id, "컨텍스트 수신", b.name);
      activity(b.sourceWorkId, "컨텍스트 전달", target.title);
      notify(
        target.owner,
        "새 컨텍스트 도착",
        `${b.name} → ${target.title}`,
        `#/work/${target.id}`,
      );
      break;
    }
    case "handoff.detach": {
      staff();
      const h = s.handoffs.find((h) => h.id === a.handoffId);
      require(h);
      work(h!.sourceWorkId);
      work(h!.targetWorkId);
      h!.active = false;
      h!.detachedAt = at;
      const t = thread(h!.targetThreadId);
      t.activeBundleIds = t.activeBundleIds.filter((id) => id !== h!.bundleId);
      activity(h!.targetWorkId, "업무 연결 해제", "인계 자료와 이력은 보존");
      break;
    }
    case "sr.start": {
      const agent = s.agents.find((a) => a.intake && a.status !== "retired");
      require(agent, "접수용 에이전트를 지정하세요.");
      const id = a.id || uid();
      require(!s.requests.some((r) => r.id === id));
      const w = makeWork(
        agent!.id,
        a.title || "새 요청",
        agent!.owner,
        a.workId,
      );
      s.requests.push({
        id,
        title: w.title,
        requester: actor,
        workId: w.id,
        threadId: w.activeThreadId,
        status: "draft",
        createdAt: at,
        results: [],
      });
      break;
    }
    case "sr.submit": {
      const r = s.requests.find((r) => r.id === a.srId);
      require(r);
      require(s.session.role !== "requester" || r!.requester === actor);
      if (r!.number) break;
      const year = new Date().getFullYear();
      const nums = s.requests
        .map((r) => r.number)
        .filter((n) => n?.startsWith(`SR-${year}-`))
        .map((n) => Number(n!.split("-")[2]));
      r!.number = `SR-${year}-${String(Math.max(0, ...nums) + 1).padStart(4, "0")}`;
      r!.submittedAt = at;
      r!.status = "received";
      const t = thread(r!.threadId);
      t.srIds = [...new Set([...t.srIds, r!.id])];
      const w = work(r!.workId);
      if (s.hubVersion === 3)
        r!.tagId = attachTag(s, w.id, r!.number!, "sr").id;
      activity(w.id, "SR 접수", r!.number);
      const owner = s.agents.find((a) => a.id === w.agentId)!.owner;
      for (const u of new Set([r!.requester, owner, "staff"]))
        notify(
          u,
          "SR 접수 완료",
          `${r!.number} · ${r!.title}`,
          `#/requests/${r!.id}`,
        );
      break;
    }
    case "sr.share": {
      staff();
      work(a.workId);
      const r = s.requests.find((r) => r.id === a.srId);
      require(r?.number, "접수된 SR을 선택하세요.");
      require(a.text.trim() ||
        a.artifactIds.length, "공유할 결과를 선택하세요.");
      const files = allowedFiles(a.workId);
      require(a.artifactIds.every((id) =>
        files.has(id),
      ), "공유할 수 없는 자료입니다.");
      r!.results.push({
        id: uid(),
        sourceWorkId: a.workId,
        text: a.text,
        artifactIds: [...a.artifactIds],
        actor,
        at,
      });
      r!.status = "responded";
      notify(
        r!.requester,
        "새 결과가 공유되었습니다",
        r!.title,
        `#/requests/${r!.id}`,
      );
      activity(a.workId, "요청자에게 결과 공유", r!.number);
      break;
    }
    case "sr.status": {
      staff();
      const r = s.requests.find((r) => r.id === a.srId);
      require(r?.number);
      r!.status = a.status;
      activity(r!.workId, "접수 상태 변경", a.status);
      break;
    }
    case "notification.read": {
      const n = s.notifications.find((n) => n.id === a.id);
      require(n && n.userId === actor);
      n!.read = true;
      break;
    }
  }
  return s;
}
