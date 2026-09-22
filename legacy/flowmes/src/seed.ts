import type { AppState, Template, Work, Artifact } from "./types";
import { newStage } from "./domain";
const definitions: Template["stages"] = [
  {
    name: "요구사항 분석",
    short: "URS",
    mode: "assistant",
    assistant: "URS Assistant",
  },
  {
    name: "기능명세 설계",
    short: "FDS",
    mode: "assistant",
    assistant: "FDS Assistant",
  },
  { name: "개발", short: "DEV", mode: "manual", assistant: "" },
  {
    name: "테스트",
    short: "TEST",
    mode: "assistant",
    assistant: "Test Assistant",
  },
  {
    name: "프로토콜 검증",
    short: "GMP",
    mode: "assistant",
    assistant: "GMP Assistant",
  },
  { name: "배포 및 검증", short: "DEPLOY", mode: "manual", assistant: "" },
];
export function createSeed(): AppState {
  const templates: Template[] = [
    {
      id: "et-standard",
      name: "ET 표준 개발",
      description: "요구사항부터 배포 검증까지, Syncade ET 개발의 기본 흐름",
      stages: definitions,
    },
    {
      id: "et-change",
      name: "ET 변경 관리",
      description: "기존 명세를 기반으로 영향 분석과 검증을 집중하는 흐름",
      stages: [
        definitions[0],
        definitions[1],
        definitions[2],
        definitions[4],
        definitions[5],
      ],
    },
    {
      id: "validation",
      name: "검증 프로토콜",
      description: "테스트 설계, 수행 결과 정리, 프로토콜 검증",
      stages: [definitions[3], definitions[4], definitions[5]],
    },
  ];
  const data = [
    [
      "설비 상태 전이 로직 개선",
      "박비오",
      "높음",
      1,
      "2026-09-21",
      "ET 표준 개발",
    ],
    [
      "CIP 세정 이력 추적 기능 추가",
      "노기현",
      "보통",
      3,
      "2026-09-23",
      "ET 표준 개발",
    ],
    [
      "설비 사용 전 점검 체크리스트 개편",
      "이희준",
      "보통",
      0,
      "2026-09-25",
      "ET 변경 관리",
    ],
    [
      "Hold time 초과 알림 기능 개선",
      "김해윤",
      "높음",
      4,
      "2026-09-18",
      "ET 표준 개발",
    ],
    [
      "교정 주기 관리 화면 개선",
      "김남우",
      "보통",
      2,
      "2026-09-28",
      "ET 표준 개발",
    ],
    [
      "설비 마스터 데이터 정합성 검증",
      "박비오",
      "보통",
      6,
      "2026-09-15",
      "ET 표준 개발",
    ],
    [
      "설비 사용 권한 매핑 변경",
      "노기현",
      "보통",
      1,
      "2026-09-30",
      "ET 변경 관리",
    ],
    [
      "배치별 설비 할당 이력 조회",
      "이희준",
      "보통",
      6,
      "2026-09-14",
      "ET 표준 개발",
    ],
  ];
  const works: Work[] = data.map((d, i) => {
    const stages = (
      templates.find((t) => t.name === String(d[5]))?.stages || definitions
    ).map((def, j) => ({
      ...newStage(def.name, def.short, def.mode, def.assistant),
      id: `w${i + 1}-s${j + 1}`,
      status: (j < Number(d[3])
        ? "done"
        : j === Number(d[3])
          ? "active"
          : "pending") as Work["stages"][number]["status"],
    }));
    stages.forEach((s, j) => {
      s.checklist.forEach(
        (c, k) =>
          (c.done = j < Number(d[3]) || (j === Number(d[3]) && k === 0)),
      );
    });
    return {
      id: `MES-0${42 + i}`,
      title: String(d[0]),
      description:
        "Syncade ET의 설비 운영 프로세스를 개선하고 변경 사항의 추적성과 검증 근거를 확보합니다.",
      system: "Syncade ET",
      owner: String(d[1]),
      priority: d[2] as Work["priority"],
      due: String(d[4]),
      externalId: `CR-2026-${String(128 + i).padStart(4, "0")}`,
      template: String(d[5]),
      stages,
      createdAt: `2026-09-${String(7 + i).padStart(2, "0")}T00:00:00.000Z`,
    };
  });
  works[3].stages[3].status = "review";
  const artifacts: Artifact[] = [
    {
      id: "a-urs",
      name: "URS_설비상태전이_v1.2.md",
      mime: "text/markdown",
      size: 2430,
      version: "1.2",
      workId: works[0].id,
      stageId: "w1-s1",
      createdBy: "노기현",
      createdAt: "2026-09-15T02:20:00Z",
      content:
        "# URS · 설비 상태 전이 로직 개선\n\n문서 상태: 데모용 검토 완료\n버전: 1.2\n\n## URS-001 설비 상태 전이\nIdle → In Use → Dirty → Cleaning → Clean → Idle 순서로 상태를 전이한다.\n\n## URS-002 인터록\n세정 유효기간이 초과한 설비는 사용을 제한하고 사유를 표시한다.\n\n## URS-003 변경 이력\n상태 변경 시 사용자, 시각, 이전 상태, 이후 상태와 사유를 기록한다.\n\n## 확인 필요\n예외 승인 권한과 세정 유효기간은 비즈니스오너가 확인한다.\n",
    },
    {
      id: "a-matrix",
      name: "설비_상태전이_매트릭스.csv",
      mime: "text/csv",
      size: 820,
      version: "1.0",
      workId: works[0].id,
      stageId: "w1-s1",
      createdBy: "노기현",
      createdAt: "2026-09-15T02:25:00Z",
      content:
        "현재 상태,다음 상태,조건\nIdle,In Use,유효한 세정 이력\nIn Use,Dirty,사용 완료\nDirty,Cleaning,세정 시작\nCleaning,Clean,세정 완료\nClean,Idle,점검 완료\n",
    },
    {
      id: "a-fds",
      name: "FDS_설비상태전이_v0.1.md",
      mime: "text/markdown",
      size: 1820,
      version: "0.1",
      workId: works[0].id,
      stageId: "w1-s2",
      createdBy: "박비오",
      createdAt: "2026-09-16T00:15:00Z",
      content:
        "# FDS · 설비 상태 전이\n\n상태: 초안 (샘플 문서)\n입력 기준: URS v1.2 / 상태 전이 매트릭스 v1.0\n\n## FDS-001 상태 전이 검증\n전이 요청 시 현재 상태와 허용 전이 매트릭스를 비교한다. 허용되지 않은 전이는 거절한다.\n\n## FDS-002 세정 유효기간\n설비 사용 시작 시 유효기간을 확인한다. 만료 시 사용 불가 안내를 표시한다.\n\n## 추적 관계\nURS-001 → FDS-001\nURS-002 → FDS-002\n\n## 미결정 사항\n예외 승인 권한, 오류 메시지 문구, DB 필드 매핑.\n",
    },
    {
      id: "a-test",
      name: "CIP_테스트시나리오_v0.3.csv",
      mime: "text/csv",
      size: 1840,
      version: "0.3",
      workId: works[1].id,
      stageId: "w2-s4",
      createdBy: "이희준",
      createdAt: "2026-09-15T07:20:00Z",
      content:
        "ID,시나리오,기대 결과,수행 결과\nTC-001,정상 세정 완료,이력 생성,미수행\nTC-002,세정 중단,중단 사유 기록,미수행\nTC-003,이력 조회,설비별 필터,미수행\n",
    },
  ];
  artifacts.forEach((a) => (a.size = new Blob([a.content || ""]).size));
  works[0].stages[0].outputs = ["a-urs", "a-matrix"];
  works[0].stages[1].inputs = ["a-urs", "a-matrix"];
  works[0].stages[1].outputs = ["a-fds"];
  works[1].stages[3].outputs = ["a-test"];
  works[0].stages[1].checklist = [
    { id: "f1", label: "URS 요구사항 및 입력 자료 확인", done: true },
    { id: "f2", label: "상태 전이 로직 및 예외 조건 정의", done: true },
    { id: "f3", label: "요구사항–기능 추적 관계 검토", done: false },
    { id: "f4", label: "FDS 최종본 검토 및 산출물 확정", done: false },
  ];
  works[0].stages[1].messages = [
    {
      id: "m1",
      role: "assistant",
      actor: "FDS Assistant",
      at: "2026-09-16T00:05:00Z",
      content:
        "안녕하세요, 박비오님. 기능명세 설계를 이어서 진행하겠습니다.\n\n이전 URS 단계에서 전달된 2개 자료가 연결되어 있습니다. 설비 상태 전이 로직과 세정 유효기간 인터록을 중심으로 FDS 초안을 작성할 수 있습니다.",
      files: ["a-urs", "a-matrix"],
    },
    {
      id: "m2",
      role: "user",
      actor: "박비오",
      at: "2026-09-16T00:10:00Z",
      content:
        "URS를 기준으로 상태 전이 로직을 정리해 주세요. 세정 유효기간이 초과된 경우의 예외 처리도 포함해 주세요.",
    },
    {
      id: "m3",
      role: "assistant",
      actor: "FDS Assistant",
      at: "2026-09-16T00:15:00Z",
      content:
        "요구사항을 바탕으로 기능명세 초안을 정리했습니다.\n\n01  설비 상태 전이\nIdle → In Use → Dirty → Cleaning → Clean → Idle\n허용된 경로 외 상태 변경 요청은 차단합니다.\n\n02  세정 유효기간 인터록\n사용 시작 시 유효기간을 확인하고, 초과 시 사용 제한 메시지를 표시합니다.\n\n03  변경 이력\n변경 전·후 상태, 요청자, 시각, 사유를 기록합니다.\n\n예외 승인 권한을 어떤 역할에 부여할지 확인해 주시면, 해당 조건을 명세에 반영하겠습니다.",
      files: ["a-fds"],
    },
  ];
  works[0].stages[0].notes = [
    {
      id: "n1",
      text: "비즈니스오너와 요구사항 범위 확인 완료. 세정 유효기간 기준은 현행 SOP를 참조합니다.",
      actor: "노기현",
      at: "2026-09-15T02:30:00Z",
    },
  ];
  return {
    works,
    artifacts,
    templates,
    profile: "박비오",
    externalUrl: "",
    events: [
      {
        id: "e1",
        workId: works[0].id,
        stageId: "w1-s2",
        actor: "박비오",
        action: "산출물 추가",
        detail: "FDS_설비상태전이_v0.1.md · 초안",
        timestamp: "2026-09-16T00:15:00Z",
      },
      {
        id: "e2",
        workId: works[0].id,
        stageId: "w1-s2",
        actor: "박비오",
        action: "체크리스트 완료",
        detail: "상태 전이 로직 및 예외 조건 정의",
        timestamp: "2026-09-16T00:12:00Z",
      },
      {
        id: "e3",
        workId: works[0].id,
        stageId: "w1-s1",
        actor: "노기현",
        action: "단계 완료 · 자료 인계",
        detail: "URS → FDS · 산출물 2개 연결",
        timestamp: "2026-09-15T02:30:00Z",
      },
      {
        id: "e4",
        workId: works[3].id,
        stageId: "w4-s4",
        actor: "김해윤",
        action: "재검토 요청",
        detail: "Hold time 경계값 테스트 보완 필요",
        timestamp: "2026-09-15T01:20:00Z",
      },
      {
        id: "e5",
        workId: works[5].id,
        stageId: "w6-s6",
        actor: "박비오",
        action: "업무 완료",
        detail: "설비 마스터 데이터 정합성 검증",
        timestamp: "2026-09-14T08:00:00Z",
      },
      {
        id: "e6",
        workId: works[7].id,
        stageId: "w8-s6",
        actor: "이희준",
        action: "업무 완료",
        detail: "배치별 설비 할당 이력 조회",
        timestamp: "2026-09-14T07:00:00Z",
      },
    ],
  };
}
