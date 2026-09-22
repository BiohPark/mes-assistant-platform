# MES Agent Hub 개선 반영 계획

> **For agentic workers:** 실행 시 `superpowers:executing-plans`를 사용해 아래 작업을 순서대로 수행한다. 작업 상태는 체크박스로 기록한다. 현재 문서는 검토용 계획이며 제품 코드는 변경하지 않는다.

**Goal:** 현재 데모의 선택적 컨텍스트 인계와 요청자 공개 범위를 보존하면서, 데이터 손실과 전송 기록 문제를 해결하고 platform2의 유용한 UX를 도입한다.

**Architecture:** 독립 업무·ContextBundle·ArtifactVersion·Handoff·SharedResult 모델을 유지한다. 저장과 요청 처리를 UI에서 분리하고, 엔티티별 IndexedDB 트랜잭션 및 요청 시작 시점의 불변 스냅샷을 기준으로 동작한다. 이후 대화·자료·리포트 화면을 확장한다.

**Tech Stack:** 기존 React·TypeScript·Vite·Vitest 유지. 저장 계층 작업에서 Dexie, dexie-react-hooks, fake-indexeddb를 도입한다. UI 테스트에 Testing Library/jsdom, 대화 렌더링에 react-markdown/remark-gfm을 필요한 단계에서만 추가한다. 차트·전체 UI 라이브러리·라우터 교체는 선행 조건으로 두지 않는다.

**Spec:** 사용자 승인 MES Agent Hub 설계 + [저장소 비교 분석](../../comparison-platform2.md). 아래 ‘제품 정책’은 이번 개선을 위한 제안 기본값이며 기존 구현 완료를 의미하지 않는다.

## 1. 적용 전략

| 접근 | 장점 | 비용/위험 | 선택 |
|---|---|---|---|
| 현재 코드에 개별 기능만 추가 | 화면 변화가 빠름 | 저장 충돌·전송 기록 문제를 계속 안고 감 | 단기 수정에만 사용 |
| 현재 모델 유지 + 저장/요청 계층부터 교체 | 요구사항을 보존하면서 기반 문제 해결 | 데이터 이관과 비동기 UI 전환 필요 | **권장** |
| platform2를 기반으로 다시 작성 | 풍부한 기능을 빠르게 확보 | 공개 범위·스냅샷·인계 이력을 다시 설계해야 함 | 채택하지 않음 |

1차에서 데모의 신뢰성을 확보하고, 2차에서 사용성을 개선하고, 3차에서 분석·자동화 범위를 넓힌다. 화면 전체를 한 번에 다시 만들지 않는다.

## 2. Global Constraints

- 작업 대상은 `agent-hub-demo/`, 브랜치는 `codex/mes-agent-hub-demo`. 상위의 기존 데모와 platform2는 수정하지 않는다.
- 프론트엔드 데모 유지. 백엔드·SSO·실제 다중 PC 협업은 이번 범위에 넣지 않는다.
- 기존 assistant의 skill·knowledge·질문 순서를 플랫폼에서 변경하지 않는다.
- API 키는 메모리에만 저장한다. DB·백업·로그·전송 스냅샷에 인증 헤더를 기록하지 않는다.
- 요청자에게는 본인 접수 대화와 명시적으로 공유된 결과만 표시한다. SR 태그는 열람 권한이 아니다.
- 원본 변경·보관·연결 해제로 기존 인계 내용과 기록이 바뀌지 않는다.
- 대화별 모델 → 에이전트 기본 모델 → 연결 프로필 기본 모델 순서를 유지한다.
- 실제 API 오류를 샘플 응답으로 대체하지 않는다. 샘플/API 출처와 실제 응답 모델을 기록한다.
- PDF·Office·이미지 원문 분석 어댑터는 이번에도 제외한다. 보관·미리보기 가능한 형식·다운로드 범위를 명시한다.
- 사내 API 실접속 검증은 주소와 접근 조건이 제공될 때 수행하며, 모의 API 테스트와 구분한다.

## 3. 제안 제품 정책

### 3.1 완료 업무

- 완료 시 체크리스트·입력/산출물 버전·담당자·완료 시각을 CompletionSnapshot으로 고정한다.
- 완료 이후 체크리스트, 기존 자료 구성, 업무 본문, 신규 AI 호출은 사유 있는 재개 후 가능하다.
- 완료 상태에서도 기존 자료 조회/다운로드, 결과 공유, 다른 업무로 인계, 보관/해제는 가능하다.
- 후속 메모는 추가만 가능하고 ‘완료 후 메모’로 구분한다. 완료 스냅샷을 변경하지 않는다.
- 진행 중 AI 요청이 있으면 먼저 요청을 완료하거나 취소한 후 업무 완료를 수행한다.
- 기존 완료 업무는 이관 시점 스냅샷임을 표시한다. 과거 완료 시각을 추측해서 만들지 않는다.

### 3.2 파일과 AI 입력

- 업로드는 자료 보관이다. 새 파일은 기본적으로 자동 전송하지 않으며, 업로드 직후 ‘이번 대화의 입력에 추가’ 동작을 제공한다.
- Conversation.selectedInputIds로 대화별 입력 파일 버전을 관리한다. 기존 업무의 입력 파일은 이관 시 선택 상태를 보존하되 요청자 범위에 맞춰 제한한다.
- 현재 선택된 컨텍스트와 입력 파일을 전송 전 미리보기에서 함께 확인한다. 체크 해제는 자료 삭제가 아니다.
- 파일 원문은 조용히 잘라 보내지 않는다. 1차 기술 기본값으로 직렬화된 요청 본문 256KiB 한도를 적용하고 프로필에서 조정 가능하게 한다. 이는 모델의 실제 토큰 한도와 같지 않음을 명시한다.
- 한도 초과 시 전송하지 않고 자료 축소·요약·새 대화를 안내한다. 모델별 토크나이저 연결은 후속 확장이다.

### 3.3 요청과 같은 브라우저 탭 협업

- AI 호출 직전에 사용자 메시지, 요청 기록, 불변 입력 스냅샷을 저장한다. 저장에 실패하면 API를 호출하지 않는다.
- 상태는 `pending → streaming → succeeded / failed / cancelled / interrupted`로 관리한다. 비스트리밍 응답은 pending에서 succeeded로 바로 갈 수 있다.
- 활성 컨텍스트 변경은 다음 요청에 적용된다. 이미 보낸 요청의 스냅샷과 기록을 거절하거나 수정하지 않는다.
- 업무 화면을 이동해도 같은 앱 탭 안의 요청은 계속 진행한다. 요청 처리는 화면 컴포넌트가 아닌 앱 서비스에서 소유한다.
- 사용자/역할을 바꾸면 해당 탭이 보유한 실행 중 요청을 취소한다. 결과는 요청 시작 시점의 작성자·공개 범위에 귀속된다.
- 같은 대화에서 AI 호출은 한 번에 하나만 허용한다. 팀 의견은 대기 중에도 추가할 수 있다.
- 요청 잠금은 IndexedDB 트랜잭션으로 획득한다. lease는 30초, heartbeat는 10초를 제안 기본값으로 둔다. lease 만료는 중단된 요청으로 표시하고 자동 재전송하지 않는다.
- 완료/취소 처리에는 requestId와 lease token을 검사해 오래된 탭의 늦은 응답이 새 요청을 덮어쓰지 못하게 한다.

### 3.4 리포트

- 기간 기준은 Asia/Seoul의 달력 일/주이며, 주 시작은 월요일이다. UI에서 날짜 범위를 직접 확인할 수 있다.
- 완료 건수는 완료 이벤트, 인계 건수는 인계 이벤트, 참여 활동은 해당 작성자의 활동 시각으로 집계한다.
- ‘완료 처리 횟수’와 ‘완료 처리한 고유 업무 수’를 구분한다. 재개 후 다시 완료한 업무를 혼동하지 않는다.
- 완료 당시 담당자/에이전트 정보를 이벤트에 남긴다. 현재 담당자 변경으로 과거 실적이 재배정되지 않는다.
- 기존 기록에서 정확한 시각·담당자를 알 수 없는 값은 미상으로 표시하고 추이에서 제외한 수를 알린다.

## 4. 목표 코드 경계

모든 경로는 `agent-hub-demo/` 기준이다. 변경하는 기능과 관련된 부분부터 순차적으로 분리한다.

| 파일/모듈 | 책임 |
|---|---|
| `src/domain/commands.ts`, `src/domain/policies.ts` | UI와 시스템 assistant가 함께 사용하는 검증·도메인 명령 |
| `src/db/schema.ts`, `src/db/commands.ts` | 테이블 정의·최신 데이터 기반 트랜잭션·중복 명령 방지 |
| `src/db/migrateV1.ts`, `src/db/backup.ts` | 기존 데이터 이관·백업·복원·검증 |
| `src/app/session.ts`, `src/app/requestService.ts` | 탭별 세션·요청 실행 생명주기 |
| `src/llm/provider.ts`, `src/llm/requestBuilder.ts`, `src/llm/sse.ts` | API 연결·선택 데이터 조립·스트림 파싱 |
| `src/features/chat/ChatPanel.tsx`, `src/features/chat/RequestStatus.tsx` | 대화와 요청 상태/중지/재시도 |
| `src/features/artifacts/ArtifactPanel.tsx`, `src/features/artifacts/InputPicker.tsx` | 자료 보관과 전송 선택 |
| `src/features/contexts/ContextLibrary.tsx` | 저장된 컨텍스트 검색·출처·재사용 |
| `src/features/work/WorkSettingsDialog.tsx`, `src/features/work/CompletionDialog.tsx` | 업무 편집 저장과 완료/재개 |
| `src/features/sr/RequestsPage.tsx`, `src/features/sr/ShareDialog.tsx` | 요청자 전용 조회와 결과 공유 |
| `src/features/reports/ReportsPage.tsx`, `src/domain/reporting.ts` | 표시와 순수 지표 계산 분리 |
| `src/features/system-assistant/proposals.ts` | 허용된 제안 형식·검토·일회성 적용 |

기존 `types.ts`는 공유 타입의 진입점으로 유지한다. 기존 `domain.ts`는 순차 이전 중 호환 진입점으로 사용하고, 명령을 두 곳에서 중복 구현하지 않는다.

## 5. 공통 인터페이스

- `executeCommand(command: HubCommand, context: CommandContext): Promise<CommandResult>`
  - context는 actorId, role, tabId, commandId를 포함한다.
  - 성공은 변경 엔티티 ID를 반환한다. 실패는 validation/conflict/storage/forbidden 코드와 화면용 설명을 반환한다.
  - commandId는 DB에 기록해 동일 명령의 재적용을 막는다. UI는 저장 성공 전 성공 토스트나 화면 이동을 하지 않는다.
- `startRequest(input: StartRequestInput, context: CommandContext): Promise<{ requestId: string }>`
  - input은 threadId, 작성 텍스트, 화면에서 확인한 선택 파일/컨텍스트 ID를 포함한다.
  - 최신 버전과 접근 범위를 검증한 뒤 요청 기록과 lease를 저장하고 API를 호출한다.
- `cancelRequest(requestId: string, context: CommandContext): Promise<void>`
  - 네트워크 중단과 DB 취소 처리를 수행한다. terminal 상태는 다시 변경하지 않는다.
- `ChatProvider.listModels(profile, signal)`, `ChatProvider.stream(request, signal)`
  - 스트림 이벤트는 textDelta / actualModel / completed / error로 제한한다. 샘플 provider도 같은 계약을 따른다.
- `buildReport(events: ActivityEvent[], query: ReportQuery): ReportResult`
  - query는 시작일, 종료일, granularity(day/week), 참여자, 에이전트, timezone(Asia/Seoul)을 포함한다.

스냅샷은 화면 메시지를 매번 재복사하는 대신 불변 메시지 ID·파일 버전·묶음 버전과 직렬화 형식 버전을 참조한다. 실제 요청에 쓰인 텍스트 조각은 content-addressed Blob으로 보존하고 공유한다. 재구성 후 원본 요청 본문과 일치하는지 테스트한다. 인증 값은 저장하지 않는다.

## 6. 실행 작업

### 1차 — 데이터와 요청 처리 안정화

#### Task 1. 기준선 확보와 명령/조회 경계 분리

**Files:** `src/domain.ts`, `src/store.tsx`, `src/types.ts`, 새 `src/domain/commands.ts`, `src/domain/policies.ts`, `src/domain/policies.test.ts`.

- [ ] 기존 20개 테스트와 빌드를 다시 확인하고 현재 구현을 별도 기준선 커밋으로 보존한다. 사용자 변경이 있으면 포함 범위를 확인한다.
- [ ] 인계 불변성·명시적 공유·모델 우선순위·폐기 대상 제한 회귀 테스트를 유지한다.
- [ ] actor를 저장 데이터의 session에서 분리하여 CommandContext로 받도록 정리한다. 역할별 조회 selector를 공통으로 사용한다.
- [ ] UI의 boolean dispatch 의존 지점을 목록화하고 비동기 CommandResult를 처리하는 경계로 전환한다. 실패 시 다이얼로그/초안을 보존한다.
- [ ] 관련 테스트와 빌드를 통과한 변경을 독립 커밋한다.

**완료 기준:** 화면 기능은 유지되며 저장 방식 교체가 UI 전체 재작성으로 번지지 않는다.

#### Task 2. IndexedDB 저장·데이터 이관·탭 갱신

**Files:** 새 `src/db/schema.ts`, `src/db/commands.ts`, `src/db/migrateV1.ts`, `src/app/session.ts`, `src/db/commands.test.ts`, `src/db/migrateV1.test.ts`; 수정 `src/store.tsx`, `src/files.ts`, `package.json`.

- [ ] fake-indexeddb로 두 독립 클라이언트의 메모 추가·동일 레코드 충돌 테스트를 먼저 작성한다.
- [ ] Dexie 테이블에 에이전트/프로필/업무/대화/메시지/파일버전/Blob/묶음/인계/SR/이벤트/알림/요청/완료스냅샷/명령영수증을 저장한다.
- [ ] append는 모두 보존하고, 편집은 revision 비교로 충돌을 알린다. 오래된 전체 상태를 DB에 덮어쓰지 않는다.
- [ ] Blob과 메타데이터를 같은 DB 트랜잭션에 저장한다. 구독에는 엔티티 단위 liveQuery를 사용한다.
- [ ] 새 DB `mes-agent-hub-v2`로 기존 localStorage/Blob DB 데이터를 복사한다. ID와 출처를 보존하고 검증 후 완료 마커를 기록한다.
- [ ] 이관 중 탭이 여러 개 열려도 하나의 완료 마커만 확정한다. 실패/용량 부족/누락 Blob은 기존 원본을 남기고 복구 안내한다. 자동으로 빈 시드로 덮어쓰지 않는다.
- [ ] 기존 저장소는 읽기 전용 원본으로 남긴다. v2가 만들어진 후 중복 가져오기를 하지 않는다. 구버전 앱을 동시에 쓰지 않도록 버전 안내한다.
- [ ] 탭 사용자/현재 화면 설정은 sessionStorage로 분리한다. 키는 메모리 유지.
- [ ] 이관 반복, 누락 자료, 중간 실패, 충돌 회귀 테스트 및 두 탭 UI 시연 후 커밋한다.

**완료 기준:** 두 탭 변경이 모두 보존되고 기존 업무·이미지·자료·인계가 복원된다. 이관 전 원본도 남는다.

#### Task 3. 요청 기록·잠금·실패/취소 처리

**Files:** 새 `src/app/requestService.ts`, `src/llm/requestBuilder.ts`, `src/llm/provider.ts`, `src/app/requestService.test.ts`; 수정 `src/api.ts`, `src/Workspace.tsx`, `src/types.ts`.

- [ ] 응답 대기 중 컨텍스트 제거, 화면 이동, 역할 변경, 동시 시작, 만료 후 늦은 응답 테스트를 실패 상태부터 작성한다.
- [ ] RequestRecord에 작성자·공개 범위·모델 설정·선택 버전·시각·상태·lease token을 저장한다.
- [ ] 전송 시작 트랜잭션에서 사용자 메시지와 요청을 먼저 저장하고 lease를 획득한다. 네트워크 호출은 DB 트랜잭션 밖에서 수행한다.
- [ ] 완료는 requestId를 기준으로 응답/상태/활동을 원자적으로 저장한다. 활성 컨텍스트가 바뀌어도 과거 기록을 수용한다.
- [ ] 실패/중단/취소 기록과 사용자 재시도를 제공한다. 재시도는 새 requestId와 이전 요청 참조를 만든다. 자동 중복 전송은 하지 않는다.
- [ ] 요청 본문 크기 한도, 불변 버전 참조와 텍스트 조각 공유 저장을 적용한다. 같은 Blob 중복 저장/요청 재구성 일치를 검증한다.
- [ ] 앱 재시작으로 중단된 요청은 interrupted로 남긴다. 서버 작업의 취소나 exactly-once 실행을 보장한다고 표시하지 않는다.
- [ ] 요청 처리 회귀 테스트·모의 느린 API 시연·빌드 후 커밋한다.

**완료 기준:** 전송 기록과 선택 상태가 분리되고 요청 결과가 현재 세션에 잘못 공개되지 않는다.

#### Task 4. 완료 정책과 백업·복원

**Files:** 새 `src/features/work/CompletionDialog.tsx`, `src/db/backup.ts`, `src/db/backup.test.ts`, `src/domain/completion.test.ts`; 수정 `src/domain/policies.ts`, `src/WorkBoard.tsx`, `src/Workspace.tsx`, `src/export.ts`, `src/AgentAdmin.tsx`.

- [ ] 완료 자료 수정 차단, 후속 메모 허용, 재개 사유, 실행 중 요청 존재 시 완료 차단 테스트를 작성한다.
- [ ] CompletionSnapshot과 구조화된 완료/재개 이벤트를 구현한다. 여러 번 완료해도 스냅샷을 덮어쓰지 않는다.
- [ ] 관리자 데이터 관리에서 전체 백업과 가져오기 미리보기를 제공한다. 스키마·ID중복·참조·Blob해시·인코딩·용량·버전을 검증한다.
- [ ] 유효하지 않은 백업은 현재 데이터를 건드리지 않는다. 정상 복원은 원자적 전체 교체로 처리하며 실행 중 요청이 있으면 먼저 중단하도록 안내한다.
- [ ] session/API키/활성 lease는 백업 대상에서 제외한다. 복원된 pending 요청은 interrupted로 전환한다.
- [ ] 원본 파일을 포함한 왕복 복원·오류 롤백·키 미포함 테스트와 빌드 후 커밋한다.

**1차 데모 체크포인트:** 두 탭 협업 → 요청 중 컨텍스트 제거 → 오류/취소 → 재개 → 완료 → 백업 복원을 연속 시연할 수 있다.

### 2차 — 대화와 자료 UX

#### Task 5. 입력 선택·연결 진단·스트리밍

**Files:** 새 `src/features/chat/ChatPanel.tsx`, `src/features/chat/RequestStatus.tsx`, `src/features/artifacts/InputPicker.tsx`, `src/features/artifacts/ArtifactPanel.tsx`, `src/llm/sse.ts`, `src/llm/sse.test.ts`, `src/features/chat/ChatPanel.test.tsx`; 수정 `src/Workspace.tsx`, `src/AgentAdmin.tsx`, `src/ui.tsx`.

- [ ] 전송 선택 해제 후에도 파일이 남는지, 선택 자료만 본문에 포함되는지 테스트한다.
- [ ] 모델 목록 경로를 실제 사용하고 연결 상태·모델 목록 조회·명시적인 테스트 메시지 호출 결과를 구분해 표시한다. 외부 링크형에는 불필요한 API 동작을 숨긴다.
- [ ] provider에 비스트리밍/스트리밍 모드를 제공한다. SSE의 분할 UTF-8·복수 이벤트·오류·종료 신호·중간 중단을 테스트한다.
- [ ] 수신 중 부분 텍스트, 중지, 실패 상세, 재시도, 실제 모델 표시를 구현한다. 비스트리밍 fallback은 명시적인 프로필 설정으로만 선택한다.
- [ ] Markdown 표/목록/코드와 안전한 링크를 렌더링한다. 원시 HTML은 비활성화한다.
- [ ] 작성자/입력 중 상태를 표시하고 팀 의견과 AI 요청을 유지한다. 다중 PC 협업으로 오인하지 않게 표시한다.
- [ ] 접근 가능한 버튼/상태 알림과 모바일 입력 UX를 확인하고 커밋한다.

#### Task 6. 컨텍스트 보관함과 업무 편집 UX

**Files:** 새 `src/features/contexts/ContextLibrary.tsx`, `src/features/work/WorkSettingsDialog.tsx`, `src/features/sr/ShareDialog.tsx`, `src/features/contexts/ContextLibrary.test.tsx`; 수정 `src/ContextPicker.tsx`, `src/Workspace.tsx`, `src/App.tsx`.

- [ ] 원본/파일명/묶음명/에이전트/SR로 검색하는 보관함을 추가한다. 원문 버전·전달처·해제 상태를 표시한다.
- [ ] 보관·폐기·연결 해제된 원본의 받은 묶음을 재사용할 수 있는지 테스트한다. 동일 묶음의 중복 활성 추가는 막고 새 버전 인계는 허용한다.
- [ ] 보관함에서도 요청자 projection을 적용한다. 받은 파일의 공유는 명시적인 선택을 거쳐야 한다.
- [ ] 기존 ContextPicker를 공통 선택/미리보기로 재사용한다. 클릭 즉시 AI 호출하지 않는다.
- [ ] window.prompt를 공통 입력 다이얼로그로 교체한다. 업무 설정은 초안 편집→저장/취소로 처리해 글자마다 활동이 쌓이지 않게 한다.
- [ ] Workspace는 화면 배치 역할로 축소하고 패널/공유 UI를 분리한다. 이동·뒤로가기·작은 화면을 검증하고 커밋한다.

**2차 데모 체크포인트:** 자료 업로드 → 전송 대상 선택 → 스트리밍/중지 → 응답 저장 → 보관함에서 재사용 → 인계 해제 후 재연결.

### 3차 — 리포트와 보조 자동화

#### Task 7. 이벤트 기반 리포트·완료 피드백

**Files:** 새 `src/domain/reporting.ts`, `src/domain/reporting.test.ts`, `src/features/reports/ReportsPage.tsx`, `src/features/work/FeedbackPanel.tsx`; 수정 `src/App.tsx`, `src/export.ts`.

- [ ] 한국시간 자정/월요일 경계, 재개 후 재완료, 담당자 변경, 미상 과거시각 테스트를 작성한다.
- [ ] 완료 이벤트에 completedAt/담당자/agent/revision을 기록하고 기간별 집계를 구현한다. 과거 텍스트 로그는 해석 가능한 항목만 변환하고 불확실성 표시를 남긴다.
- [ ] 일/주 완료 추이, 리드타임, 참여 활동, 인계 반복, 재개, 체크리스트 미완료를 표시한다. 상태 체류시간은 이벤트가 충분한 업무만 계산한다.
- [ ] 완료 피드백을 별도로 추가하고 assistant 개선 자료에 원본 업무·컨텍스트·피드백 출처를 연결한다. 자동 품질/비효율 판정은 하지 않는다.
- [ ] UI와 내보낸 리포트에 동일 계산 함수를 사용하고 날짜 필터 일치를 검증한다. 리포트 화면은 지연 로딩 후 커밋한다.

#### Task 8. 시스템 assistant 제안 실행 확장

**Files:** 새 `src/features/system-assistant/proposals.ts`, `src/features/system-assistant/SystemAssistantPanel.tsx`, `src/features/system-assistant/proposals.test.ts`; 수정 `src/App.tsx`, `src/domain/commands.ts`.

- [ ] 업무 생성·컨텍스트 정리/인계·SR 태그 연결·에이전트 등록의 허용된 제안 schema를 정의한다.
- [ ] 이름 유사검색은 후보를 보여 주는 데만 사용한다. 확정 대상은 ID로 지정하고 모호하면 자동 적용하지 않는다.
- [ ] assistant 응답은 제안 카드로 표시한다. 대상·전달 자료·변경 내용을 검토한 사용자의 ‘적용’으로만 실행한다.
- [ ] 실행은 UI와 동일한 executeCommand를 사용한다. 역할/폐기/완료/공개 범위 검사를 우회하지 않는다.
- [ ] 잘못된 인자, 존재하지 않는 ID, 중복 적용, 오래된 제안, 권한 변경 테스트를 작성한다. 시스템 assistant가 임의 API/코드/도구를 실행하지 못하게 한다.
- [ ] 샘플 및 실제 API tool-call 미지원 모델의 구조화된 제안 실패를 명확히 처리하고 커밋한다.

## 7. Review Focus

1. **두 탭의 동시 수정과 이관 재진입** → Task 2: append 보존, revision 충돌, 이관 완료 마커 일회성.
2. **응답 도중 칩 제거·역할 변경·늦은 응답** → Task 3: 전송 스냅샷과 시작 시점 공개 범위 고정, lease fencing.
3. **용량 부족·Blob 누락·손상 백업** → Task 2/4: 원본 유지, 원자적 저장/복원, 원인 표시.
4. **완료 업무에 후속 작업, 재완료, 과거시각 미상** → Task 4/7: 정책 검사, 스냅샷 보존, 지표 중복/날짜 경계.
5. **비정상 스트림·과대 입력·AI 제안 재적용** → Task 3/5/8: 조용한 절단/중복 호출/무단 명령 실행 없음.

## 8. 최종 검증 및 제공물

- 각 Task는 실패 테스트 확인 → 구현 → 관련 테스트 → 전체 회귀/빌드 → 독립 커밋 순서로 수행한다. 화면 이동/권한/저장 변경에는 UI 회귀 검증을 포함한다.
- 현재의 15개 인수 기준을 유지하고, 두 탭 충돌·요청 중 변경·복원·기간 집계·제안 중복 적용을 추가한다.
- 단위: `npm test`, 타입/배포: `npm run build`. 저장 테스트는 fake-indexeddb, 컴포넌트 테스트는 jsdom으로 구분한다.
- UI: 1440/1024/768/390px, 키보드로 주요 다이얼로그 조작, 두 탭 협업, 새로고침 복원, 실제 다운로드를 확인한다.
- 추가 의존성마다 주 JS gzip 및 화면별 청크 크기를 기록한다. 이전 약 101KB gzip 대비 증가 원인을 설명하고, 리포트/관리/Markdown 등 무거운 부분은 필요 시 분리한다.
- 실제 사내 API 검증을 하지 못한 항목은 별도로 표시한다. 모의 API 성공을 사내 연결 성공으로 보고하지 않는다.
- README, 검증 기록, 데이터 이관/복구 안내를 갱신한다. 최종 결과는 브랜치 내 검토 가능한 커밋과 데모 URL로 제공한다. 배포/원격 push는 실행 단계의 요청 범위에 맞춘다.

## 9. 권장 시작 범위

**먼저 1차(Task 1–4)를 하나의 개선 묶음으로 완료한다.** 이 범위만으로 확인된 데이터 손실·요청 기록·완료 기준 문제와 복원 부재를 해결할 수 있다. 2·3차는 같은 데이터/명령 계약 위에 순차 확장한다.

실행은 공통 타입·저장·요청 계약의 의존성이 높으므로 한 구현 흐름으로 순차 진행하고, 1차 완료 시 독립 검토를 받는 방식을 권장한다. 이번 턴의 산출물은 계획서이며 구현 착수는 포함하지 않는다.
