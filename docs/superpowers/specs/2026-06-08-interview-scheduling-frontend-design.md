# 면접 스케줄링 Frontend 설계 사양

작성일: 2026-06-08
대상 영역:
- `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/**` (신규)
- `frontend/apps/web/app/apply/[recruitmentId]/**` (확장)
- `frontend/apps/web/app/me/applications/[applicationId]/**` (확장)
- `frontend/apps/web/components/interview/**` (신규)
- `frontend/packages/{types,api,hooks,schemas}/src/interview*` (신규/확장)

선행 사양:
- [2026-06-08 면접 스케줄링 시스템 설계 사양](./2026-06-08-interview-scheduling-design.md) — 백엔드 spec
- 백엔드 PR #305 머지 완료 (13 API + 4 엔티티 + 매칭 알고리즘)

본 spec 의 머지 전 **백엔드 PR-IS (보강 1개)** 가 선행되어야 한다.

---

## 1. 배경

면접 스케줄링 백엔드는 13개 REST API 와 자동 배정 알고리즘이 머지 완료된 상태다. 그러나 운영진·지원자가 실제 사용할 화면이 없어 backend 가 dormant 상태다.

본 spec 은 다음을 정의한다:
- 운영진의 면접 관리 워크플로 UI (config → slots → auto-assign → schedule management)
- 지원자의 가능시간 제출·수정·면접 일정 확인 UX
- frontend 가 사용할 API 계약 + 백엔드 보강 사항
- `packages/types|api|hooks|schemas` 의 신규 모듈
- web 공용 UI 컴포넌트 + 라우트-local 컴포넌트의 책임 경계

---

## 2. 목표 / Non-목표

### 2.1 목표

- 운영진 면접 관리 단일 페이지 + Progress Stepper — 5 책임 묶음 (config / slots / auto-assign dry-run / auto-assign 실행 / schedule management)
- 지원자 지원서 제출 폼의 2-Step 확장 — 답변 작성 + 면접 슬롯 선택 (단일 트랜잭션 제출)
- 지원자 마이페이지에 면접 일정 카드 + 가능시간 수정 모달
- web 공용 컴포넌트 (`SlotPickerByDateGroup`, `ManagementSlotCard`, `ApplicantSlotItem`) — 양 흐름에서 시각·동작 일관성
- packages 분리 — `types`, `api`, `hooks`, `schemas` 의 RN 공유 가능한 비즈니스 로직
- backend 보강 (Backend PR-IS) — 본 frontend 의 의존성

### 2.2 Non-목표 (Out of Scope)

| 영역 | 제외 항목 | Future Phase |
|---|---|---|
| 알림 | 면접 일정 push/email 알림 frontend UI | backend 알림 인프라 phase 2 |
| 상태 | `CONFIRMED` 상태 UI 표시 | backend phase 2 |
| 운영진 | 슬롯별 location override | `InterviewSlot.location` backend 추가 후 |
| 운영진 | drag-drop 으로 지원자 이동 | onMove 콜백 + DnD 라이브러리 도입 시 |
| 운영진 | 자동배정 결과 CSV 내보내기 | 분석 phase |
| 운영진 | `InterviewConfig.location` clear (빈 값으로 지우기) | phase 2 — 명시적 clear API + "지우기" 버튼 도입 시 |
| 운영진 | `InterviewConfig.instructions` / `interviewType` 입력 | backend §12 의 Future |
| 운영진 | 일정 관리의 "지원자별 보기" tab | Phase 2 — 운영은 슬롯 중심이 정답이라 활용도 낮음 |
| 운영진 | 자동배정 dry-run 의 정확한 매칭 시뮬레이션 (현재는 산술 추정) | backend M11 응답에 expected* 필드 추가 phase |
| 지원자 | 평가 점수 노출 | `applicationEvaluation` 별도 spec |
| 지원자 | 일정 cancel 능동 요청 | phase 2 (재조정 요청) |
| 지원자 | 캘린더 동기화 (Google/Outlook) | 외부 연동 phase |
| 지원자 | 슬롯 선택의 cross-device 복원 | 운영 데이터 기반 피드백 후 `ApplicationDraft` 확장 |
| UX | URL query 로 stepper 단계 노출 (`?step=...`) | 운영진 피드백 후 결정 |
| 시각 | `SlotCardShell` 공용 base 추출 | 카드 변형 3개 이상 등장 시 |
| 시각 | 지원자 캘린더 그리드 (mockup C) | UX 재평가 phase |
| 인프라 | E2E Playwright 시나리오 | 프로젝트 차원 Playwright 도입 후 |

---

## 3. 라우트 & 페이지 구조

### 3.1 운영진 (신규)

```
frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/
├── page.tsx                                       # Server Component, params 추출 + 인증 가드
└── _pages/
│   └── InterviewManagementPage.tsx                # Client. useState<Step> 단일 라우트
└── _components/
    ├── InterviewProgressStepper.tsx
    ├── InterviewConfigSection.tsx                 # Step 1
    ├── InterviewSlotSection.tsx                   # Step 2
    ├── InterviewAutoAssignSection.tsx             # Step 3
    └── InterviewScheduleManagementSection.tsx     # Step 4
```

기존 `applicants`, `edit`, `stats` sibling 패턴 그대로. 4 책임은 sub-route 분리하지 않고 **단일 페이지 + 서버 상태 기반 자동 단계 결정**.

### 3.2 지원자 — 제출 폼 (확장)

```
frontend/apps/web/app/apply/[recruitmentId]/
├── page.tsx                                       # 기존 — 2-Step UI 로 확장
├── _hooks/
│   ├── useAutosaveDraft.ts                        # 기존 — 답변만 저장 (확장 없음)
│   └── useSelectedSlotIds.ts                      # 신규 — sessionStorage 기반 client-only
└── _components/
    ├── ApplyAnswersStep.tsx                       # Step 1 — 기존 답변 UI 추출
    ├── ApplyInterviewSlotsStep.tsx                # Step 2 — SlotPickerByDateGroup wrapper
    └── ApplyStepHeader.tsx                        # 단계 표시 + 다음/이전 navigation
```

`useInterview=false` 인 일반 모집은 Step 1 만, `useInterview=true` 인 면접 모집만 2-Step. 동일 컴포넌트, 분기는 page.tsx 의 state 로.

### 3.3 지원자 — 마이페이지 (확장)

```
frontend/apps/web/app/me/applications/[applicationId]/
├── page.tsx                                       # 기존
└── _components/
    ├── InterviewScheduleCard.tsx                  # A2 결과 카드 + "수정" 버튼
    └── EditAvailabilityModal.tsx                  # A1 PUT, SlotPickerByDateGroup 호출
```

### 3.4 공용 web UI (신규)

`apps/web/components/interview/` 평면 배치. RN 공유 없는 web 전용. backend api/hooks 와 달리 `packages/` 가 아닌 `apps/web/components/` 위치 (frontend AGENTS.md 의 위치 결정 원칙).

```
frontend/apps/web/components/interview/
├── ManagementSlotCard.tsx                         # 운영진 그리드 item
├── ApplicantSlotItem.tsx                          # 지원자 picker chip
└── SlotPickerByDateGroup.tsx                      # 날짜 그룹 + 시간 chip
```

`SlotCardShell` 공용 base 추출은 보류 — 카드 변형이 2 종 (운영진, 지원자) 으로 시작. 3 종 이상 등장 시 추출 결정 (Out of Scope).

### 3.5 packages (RN 공유)

```
frontend/packages/
├── types/src/interview.ts                         # OpenAPI alias + view model + discriminated union
├── api/
│   ├── src/openapi-types.ts                       # ★ gen:api 자동 생성, source of truth
│   └── src/client.ts                              # DuingApiClient 메서드 추가
├── hooks/src/
│   ├── interview.ts                               # useXxxQuery / useXxxMutation
│   └── interviewQueryKeys.ts                      # query key factory
└── schemas/src/interview.ts                       # Zod 스키마 (form 검증)
```

`packages/*` 에 DOM / RN 전용 API 직접 import 금지 (frontend CLAUDE.md). web/native 전용 코드는 위 디렉토리에 들어가지 않는다.

---

## 4. 운영진 워크플로 — Stepper (server-derived only)

### 4.1 Stepper 구성

```
[1] 면접 설정       [2] 슬롯 관리       [3] 자동 배정       [4] 일정 관리
```

### 4.2 현재 단계 — 서버 상태에서만 계산

**클라이언트 state 저장하지 않는다.** Stepper 의 "현재 단계" 는 매 render 마다 서버 응답에서 derive:

```ts
const currentStep = deriveInterviewStep({ config, slots });
```

```
config 없음                                            → Step 1
config 있음 + slots 없음                                → Step 2 (빈 상태)
config 있음 + slots ≥ 1 + now < availabilityDeadline   → Step 2 (수집 현황)
config 있음 + slots ≥ 1 + now ≥ deadline + 미완료       → Step 3
assignmentCompletedAt != null                           → Step 4
```

### 4.3 왜 client state 를 안 쓰는가

면접 관리 단계는 **모두 서버 상태에서 파생**된다. client state 로 저장하면 운영진 A 가 자동배정 실행했는데 운영진 B 의 화면이 Step 2 에 머무르는 staleness 발생.

특히 운영진은 여러 명일 수 있고, 한 운영진이 다른 단계로 진행하면 다른 운영진의 화면도 즉시 반영되어야 한다 (TanStack Query refetch 시).

### 4.4 페이지 렌더링 패턴

`InterviewManagementPage` 는 4 개 Section 을 **모두 단일 페이지에 렌더링**한다. derived `currentStep` 에 따라:

| Section 상태 | 표현 |
|---|---|
| `currentStep` 이거나 이전 단계 | 평소 그대로 interactive |
| `currentStep` 보다 뒤 단계 | disabled placeholder (회색 처리 + "이전 단계 완료 후 이용 가능" 안내) |

Stepper 의 클릭 = section anchor 로 scroll (browser native scroll). client state 없음.

이 패턴으로:
- 운영진이 이미 진행한 이전 단계 (예: Step 3 진행 중에 Step 2 슬롯 다시 보기) 도 같은 화면에서 검토 가능
- 단계 이동이 React state 가 아니라 server data + scroll 만으로 처리되어 multi-actor 환경에서 staleness 0

### 4.5 각 Section 의 책임

### 4.3 각 Section 의 책임

**InterviewConfigSection** (Step 1)
- `useInterviewConfigQuery` 로 기존 config 조회 → form 초기값 복원
- React Hook Form + `createInterviewConfigSchema` / `updateInterviewConfigSchema`
- 입력 필드:
  - `availabilityDeadline` — DateTimeInput, `@Future` 제약, recruitment 의 startDate~endDate 범위 (HTML5 min/max + Zod refinement)
  - `location` — TextInput, `maxLength={200}`, placeholder "예: 공학관 2201호", hint "비워두면 추후 안내됩니다"
- 신규 모집: `useCreateInterviewConfigMutation` (M1) → 성공 시 Step 2 로 이동
- 기존 config: `useUpdateInterviewConfigMutation` (M2) → 성공 시 invalidate + 같은 step 머무름

**InterviewSlotSection** (Step 2)
- 좌측: 패턴 입력 폼 (시작·간격·개수·capacity) + "+ 미리보기" 버튼 → 메모리상 SlotEntry[] 생성
- 우측: 현재 슬롯 그리드 (`useInterviewSlotsQuery` + `ManagementSlotCard`)
- 미리보기 행은 개별 삭제·시간 미세조정 가능
- "저장" 클릭 → `useCreateInterviewSlotsMutation` (M3, bulk)
- 슬롯 카드의 capacity 수정·삭제 → `useUpdateInterviewSlotMutation` / `useDeleteInterviewSlotMutation` (M5/M6)
- 슬롯 카드는 availabilityCount 표시 — 지원자 모집 진행 상황

**InterviewAutoAssignSection** (Step 3)
- `useMatchingCandidatesQuery` (M11) 로 dry-run 통계 카드 표시 **(5 지표)**:

  | 지표 | 계산 |
  |---|---|
  | 총 후보자 수 | `totalCandidates` |
  | 총 Capacity | `slots.reduce((s, slot) => s + (slot.capacity - slot.alreadyAssignedCount), 0)` |
  | 예상 배정 인원 | `Math.min(candidatesWithAvailability, 총 Capacity)` |
  | 예상 미배정 인원 | `Math.max(0, candidatesWithAvailability - 총 Capacity)` |
  | Availability 미제출 인원 | `candidatesWithoutAvailability` |

  예시 표시:
  ```
  후보자 32명
  총 Capacity 28명
  예상 배정 28명 (추정)
  예상 미배정 4명 (추정)
  Availability 미제출 2명
  ```

  "추정" 라벨 필수 — 실제 매칭 결과는 자동배정 실행 후 확정 (선택 슬롯 분포에 따라 달라짐). Known Limitation §12.2 참조.

- 슬롯별 신청자 수 + 이미 배정된 수도 함께 표시
- "자동 배정 실행" 버튼 — 확인 모달 후 `useAutoAssignMutation` (M7)
- 성공 시: result 통계 (assignedCount/unassignedCount/noAvailabilityCount) 표시 + Step 4 자동 이동
- 실패 시: 토스트로 backend 예외 메시지 표시 (`NO_CANDIDATES`, `NO_SLOTS`, 등)
- "결과 새로고침" 버튼 — 다른 운영진의 동시 변경 가능성 대응 (실시간 polling 미사용)

**InterviewScheduleManagementSection** (Step 4)
- section 상단 banner: `면접 장소: {config.location ?? '추후 안내'}`
- `useInterviewSchedulesQuery` (M8) → 슬롯별 그룹핑된 그리드
- 각 슬롯 = `ManagementSlotCard` (variant: management)
  - capacity / assigned count
  - 배정된 지원자 chip 리스트 (chip 안에 이름·학번 + "이동" / "취소" 메뉴)
- 미배정 지원자 영역: 별도 footer card (또는 우측 panel)
  - 클릭 → 슬롯 선택 모달 → `useAssignInterviewScheduleMutation` (M9)
- "취소" → 확인 모달 → `useCancelInterviewScheduleMutation` (M10)
- 조회용 tab **MVP 는 2 개만**: `전체 일정` / `슬롯별 보기`
- `지원자별 보기` 는 MVP 활용도 낮음 — Future Phase 로 이동 (운영은 슬롯 중심 진행)

---

## 5. 지원자 흐름

### 5.1 제출 폼 — 2-Step UI

```
[Step 1 답변 작성]
  ↓ 기존 useAutosaveDraft (backend draft 저장)
  ↓ "다음" 클릭 (면접 모집만 노출)
[Step 2 면접 가능시간 선택]
  ↓ useSelectedSlotIds (sessionStorage)
  ↓ "제출" 클릭
POST /api/v1/clubs/{cid}/recruitments/{rid}/applications
  body { answers, interviewSlotIds }
  ├ 201 → /me/applications/{appId} navigate + sessionStorage clear
  └ 4xx → toast + 해당 step 머무름
```

**일반 모집 (`useInterview=false`)**: Step 1 의 "제출" 버튼 그대로. Step 2 노출 안 함.

### 5.2 SlotPickerByDateGroup (공용)

- 입력: `slots: ApplicantInterviewSlot[]`, `selectedSlotIds: number[]`, `onChange`, `minSelected=1`, `disabled`
- 출력: 날짜별 collapsible 섹션 + 시간 chip 그리드
- chip 클릭 = 토글. 선택 개수 / 최소 1개 안내 footer
- `disabled=true` 일 때 chip 클릭 차단 + 시각 disabled 상태 + 안내 메시지 ("면접 가능시간 제출 기간이 종료되었습니다")

### 5.3 sessionStorage 정책

```ts
// useSelectedSlotIds.ts
const KEY = (recruitmentId: number) => `apply:${recruitmentId}:slots`;

// 라이프사이클:
// - Step 2 진입 시 useSyncExternalStore 로 hydration
// - chip 클릭 → setItem
// - 제출 성공 → removeItem
// - 다른 모집 진입 → key 가 자동 격리 (clear 불필요)
```

서버 draft 미저장. 디바이스 전환 복원은 Out of Scope.

### 5.4 deadline 사전 인지

- Step 2 진입 시 `useRecruitmentDetailQuery` 의 `interviewAvailabilityDeadline` 확인
- `now >= deadline` 이면 picker `disabled=true` + 안내 메시지
- 제출 시점에 backend 가 다시 검증하므로 frontend 가 깜빡 누락해도 안전 (409 fallback)

### 5.5 InterviewScheduleCard (마이페이지)

`useMyInterviewScheduleQuery` (A2) 응답 분기:

```tsx
// MyInterviewSchedule = discriminated union
if (!data.assigned) {
  return <Card>자동 배정 대기 중</Card>;
}

const { schedule, location } = data;  // assigned=true narrow 후
return (
  <Card>
    <h3>면접 일정</h3>
    <p>{formatRange(schedule.startTime, schedule.endTime)}</p>
    {schedule.status === 'CANCELLED' && <Badge variant="muted">취소됨</Badge>}

    <h4>면접 장소</h4>
    {location ? <p>{location}</p> : <p className="text-muted">장소는 추후 안내됩니다.</p>}

    <Button onClick={openEditModal}>가능시간 수정</Button>
  </Card>
);
```

"가능시간 수정" 버튼 노출 조건: `availabilityDeadline > now && assignmentCompletedAt === null`. 백엔드 검증과 일관성 위해 클라이언트도 같은 검사.

### 5.6 EditAvailabilityModal

진입 흐름:
```
[버튼 클릭]
  ↓ 모달 열림 + useInterviewAvailabilitiesQuery (현재 선택 slotIds 복원)
                + useApplicantInterviewSlotsQuery (전체 슬롯 목록)
[SlotPickerByDateGroup 으로 chip 선택]
  ↓ 클라이언트 state 만 (낙관적 update 안 함)
[저장 클릭]
  ↓ useUpdateInterviewAvailabilitiesMutation (A1 PUT)
  ├ 204 → 모달 닫기 + mySchedule + availabilities invalidate
  ├ 409 AVAILABILITY_PERIOD_CLOSED → toast "수정 기간 종료" + 모달 닫기 + 카드 refetch
  ├ 409 ASSIGNMENT_ALREADY_COMPLETED → toast "이미 자동배정 완료" + 모달 닫기 + 카드 refetch
  └ 400 → 토스트 + 모달 머무름
```

---

## 6. 데이터 계층 — packages

### 6.1 Source of Truth — OpenAPI

API Response 타입은 **`pnpm gen:api` 가 생성하는 OpenAPI 타입이 단일 진실원**.

- `packages/api/src/openapi-types.ts` — gen 결과 (commit 포함)
- `packages/types/src/interview.ts` — alias + supplementary 정의만

```ts
// packages/types/src/interview.ts
import type { components } from '@duing/api/openapi-types';

// Case 1: 1:1 alias
export type InterviewConfig = components['schemas']['InterviewConfigResponse'];
export type ApplicantInterviewSlot = components['schemas']['ApplicantInterviewSlotResponse'];
export type ScheduleListView = components['schemas']['ScheduleListViewResponse'];

// Case 2: discriminated union (OpenAPI 미지원)
type AssignedSchedule = components['schemas']['InterviewScheduleDetail'];
export type MyInterviewSchedule =
  | { assigned: false; schedule: null; location: null }
  | { assigned: true; schedule: AssignedSchedule; location: string | null };
```

`MyInterviewSchedule` 의 union 변환은 `packages/api/src/client.ts` 의 메서드 안에서 narrow.

### 6.2 packages/api — Client 메서드

`DuingApiClient` 클래스에 15 메서드 추가 (운영진 11 + 지원자 4):

```ts
// Manager
createInterviewConfig(rid, body): Promise<{ configId: number }>;       // M1
updateInterviewConfig(rid, body): Promise<void>;                       // M2
getInterviewConfig(rid): Promise<InterviewConfig>;                     // 신규
createInterviewSlots(rid, body): Promise<{ slotIds: number[] }>;       // M3
getInterviewSlots(rid): Promise<SlotListView[]>;                       // M4
updateInterviewSlot(slotId, body): Promise<void>;                      // M5
deleteInterviewSlot(slotId): Promise<void>;                            // M6
autoAssignInterview(rid): Promise<AutoAssignResult>;                   // M7
getInterviewSchedules(rid): Promise<ScheduleListView[]>;               // M8
assignInterviewSchedule(applicationId, body): Promise<void>;           // M9
cancelInterviewSchedule(applicationId): Promise<void>;                 // M10
getMatchingCandidates(rid): Promise<MatchingCandidatesView>;           // M11

// Applicant
updateInterviewAvailabilities(applicationId, body): Promise<void>;     // A1
getMyInterviewSchedule(applicationId): Promise<MyInterviewSchedule>;   // A2, discriminated union 변환
getInterviewAvailabilities(applicationId): Promise<{ slotIds: number[] }>; // 신규 (Backend PR-IS)
getApplicantInterviewSlots(rid): Promise<ApplicantInterviewSlot[]>;    // 신규 (Backend PR-IS)

// Submit 확장 — interviewSlotIds 옵셔널
submitApplication(rid, body): Promise<{ applicationId: number }>;
// body: { answers, interviewSlotIds? }
```

### 6.3 packages/hooks — Query / Mutation + Key Factory

```ts
// interviewQueryKeys.ts
export const interviewQueryKeys = {
  all: ['interview'] as const,
  config: (rid: number) => [...interviewQueryKeys.all, 'config', rid] as const,
  slots: (rid: number) => [...interviewQueryKeys.all, 'slots', rid] as const,
  schedules: (rid: number) => [...interviewQueryKeys.all, 'schedules', rid] as const,
  candidates: (rid: number) => [...interviewQueryKeys.all, 'candidates', rid] as const,
  applicantSlots: (rid: number) => [...interviewQueryKeys.all, 'applicant-slots', rid] as const,
  availabilities: (appId: number) => [...interviewQueryKeys.all, 'availabilities', appId] as const,
  mySchedule: (appId: number) => [...interviewQueryKeys.all, 'my-schedule', appId] as const,
};
```

#### Mutation Invalidation 매트릭스

| Mutation | Invalidate |
|---|---|
| `useCreateInterviewConfigMutation` | `config(rid)` |
| `useUpdateInterviewConfigMutation` | `config(rid)` |
| `useCreateInterviewSlotsMutation` | `slots(rid)`, `candidates(rid)`, `applicantSlots(rid)` |
| `useUpdateInterviewSlotMutation` | `slots(rid)`, `candidates(rid)`, `schedules(rid)`, `applicantSlots(rid)` |
| `useDeleteInterviewSlotMutation` | `slots(rid)`, `candidates(rid)`, `schedules(rid)`, `applicantSlots(rid)` |
| `useAutoAssignMutation` | `config(rid)`, `schedules(rid)`, `candidates(rid)` |
| `useAssignInterviewScheduleMutation` | `schedules(rid)`, `candidates(rid)` |
| `useCancelInterviewScheduleMutation` | `schedules(rid)` |
| `useUpdateInterviewAvailabilitiesMutation` | `mySchedule(appId)`, `availabilities(appId)` |
| 기존 `useSubmitApplicationMutation` (확장) | 기존 application key + (있다면) drafts |

### 6.4 packages/schemas — Zod

```ts
// schemas/src/interview.ts
export const createInterviewConfigSchema = z.object({
  availabilityDeadline: z.string().datetime(),
  location: z.string().trim().max(200).optional(),
});

export const updateInterviewConfigSchema = createInterviewConfigSchema.partial();

export const slotPatternSchema = z.object({
  startTime: z.string().datetime(),
  intervalMinutes: z.number().int().positive().max(240),
  count: z.number().int().min(1).max(50),
  capacity: z.number().int().min(1).max(20),
});

export const updateAvailabilitySchema = z.object({
  slotIds: z.array(z.number().int()).min(1),
});
```

### 6.5 location partial update 정책

- **`null` = 변경 없음**. backend `UpdateInterviewConfigRequest.location` 이 null 이면 service 가 무시
- **빈 문자열 / 공백** = 변경 없음 (MVP 에선 clear 동작 미제공). backend service 가 `trim().isEmpty()` 면 noop
- frontend 도 빈 input 이면 location 필드 자체를 request 에서 omit (불필요한 빈 문자열 전송 방지)
- 운영진이 한 번 입력한 location 을 비우는 동작은 phase 2 (Out of Scope)

---

## 7. 컴포넌트 계약

### 7.1 공용 컴포넌트 (`apps/web/components/interview/`)

```tsx
// SlotPickerByDateGroup.tsx
type SlotPickerByDateGroupProps = {
  slots: ApplicantInterviewSlot[];
  selectedSlotIds: number[];
  onChange: (slotIds: number[]) => void;
  disabled?: boolean;
  minSelected?: number;
};

// ApplicantSlotItem.tsx
type ApplicantSlotItemProps = {
  slot: Pick<ApplicantInterviewSlot, 'slotId' | 'startTime' | 'endTime' | 'capacity'>;
  selected: boolean;
  onToggle: (slotId: number) => void;
  disabled?: boolean;
};

// ManagementSlotCard.tsx
type ManagementSlotView = {
  slotId: number;
  startTime: string;
  endTime: string;
  capacity: number;
  availabilityCount?: number;
  assignments?: Array<{
    scheduleId: number;
    applicationId: number;
    applicantLabel: string;
    status: 'ASSIGNED' | 'CANCELLED';
  }>;
};
type ManagementSlotCardProps = {
  slot: ManagementSlotView;
  onAssign?: (slotId: number) => void;
  onMove?: (applicationId: number, fromSlotId: number) => void;
  onCancel?: (applicationId: number) => void;
};
```

호출 측 (route-local) 에서 API 응답 → `ManagementSlotView` 매핑. 컴포넌트는 API 타입 직접 import 안 함.

### 7.2 라우트-local 컴포넌트

라우트별 `_components/` 에 위치. 도메인 책임 명확.

| 컴포넌트 | 책임 |
|---|---|
| `InterviewProgressStepper` | 현재 step + 활성/비활성 표시 + 클릭 콜백 |
| `InterviewConfigSection` | M1/M2 form + 입력 검증 |
| `InterviewSlotSection` | 패턴 입력 + 미리보기 + M3/M5/M6 + 슬롯 그리드 |
| `InterviewAutoAssignSection` | M11 dry-run 통계 + M7 실행 + 결과 표시 |
| `InterviewScheduleManagementSection` | M8 일정 그리드 + M9/M10 + location banner |
| `ApplyAnswersStep` | 기존 답변 UI 추출 |
| `ApplyInterviewSlotsStep` | SlotPicker wrapper + 마감 안내 |
| `ApplyStepHeader` | 단계 표시 + 다음/이전 navigation |
| `InterviewScheduleCard` | A2 응답 분기 + 수정 진입 |
| `EditAvailabilityModal` | A1 PUT + SlotPicker 재사용 + 409 처리 |

---

## 8. 백엔드 보강 — Backend PR-IS

본 frontend spec 의 선행 PR. 단일 PR, 5 commit.

### 8.1 InterviewConfig.location — MVP 본체

**`location` 은 보강 항목이 아니라 면접 스케줄링 MVP 본체 schema 의 일부**다. 면접 일정 정보 = "언제" + "어디서" 두 필드가 동일한 무게의 필수 정보. 지원자는 일정 없이도 안 되지만, 장소 없이는 면접 자체가 불가능하다.

```
InterviewConfig (MVP 본체)
  availabilityDeadline
  assignmentCompletedAt
  location
```

V45 가 이미 머지된 (PR #305) 이력적 사정으로 V47 별도 마이그레이션 으로 추가하지만, **본 spec 의 모델링 의도상 location 은 V45 와 동등한 본체 필드**다. frontend 에서도 location 은 InterviewScheduleCard 의 필수 노출 정보 (null 일 경우 "장소 추후 안내" fallback 강제).

```sql
-- V47__alter_interview_config_add_location.sql
ALTER TABLE interview_config
    ADD COLUMN location VARCHAR(200);
```

NULL 허용 (활성화 시점에 미정 가능). 기존 row 영향 없음 (모두 NULL).

### 8.2 Commit 단위

```
commit 1: feat(interview): InterviewConfig.location 필드 (MVP 본체) + V47 + create/update DTO
  - InterviewConfig.java 에 location 필드 + create/updateLocation 메서드
  - CreateInterviewConfigRequest + UpdateInterviewConfigRequest 에 @Size(max=200) String location
  - service 의 location null/blank 처리 (null = unchanged, trim().isEmpty() = unchanged)
  - InterviewConfigServiceTest 시나리오 보강 (location null/non-null/blank/200자 경계)

commit 2: feat(interview): 운영진용 GET interview-config endpoint 추가
  - ManagerInterviewConfigApi 에 @GetMapping 추가
  - InterviewConfigResponse(configId, availabilityDeadline, assignmentCompletedAt, location)
  - service 의 권한: clubAuthService.requireManager
  - ManagerInterviewConfigControllerTest 시나리오 (200, 403, 404)

commit 3: feat(interview): A2 + M8 응답에 location 노출
  - MyInterviewScheduleResponse 에 location 추가 (assigned=true 일 때 config 의 location 조회 후 매핑)
  - ScheduleListView 에 location 추가
  - InterviewScheduleQueryTest / InterviewAutoAssignServiceTest 시나리오 보강

commit 4: feat(interview): 지원자용 신규 endpoint 2개
  - GET /api/v1/applications/{applicationId}/interview-availabilities
    → 응답 { slotIds: number[] }, 본인 검증 (NotApplicationOwner)
  - GET /api/v1/recruitments/{recruitmentId}/applicant-interview-slots
    → 응답 { slots: [{slotId, startTime, endTime, capacity}] } (location 미포함)
    → recruitment.effectivelyOpen() 검증
  - 신규 ApplicantInterviewSlotApi + InterviewAvailabilityApi 의 GET 추가
  - 통합 테스트 6 시나리오 (본인/타인/마감 후/모집 종료 등)

commit 5: feat(recruitment): RecruitmentDetailResponse 에 interviewAvailabilityDeadline 추가
  - useInterview=false 또는 InterviewConfig 없으면 null
  - useInterview=true + config 있으면 LocalDateTime 노출
  - RecruitmentDetailQuery 변환 매핑
  - 기존 RecruitmentDetailControllerTest 시나리오 확장
```

테스트: 본 PR 안에서 backend 의 4 계층 테스트 (단위 / JPA / 서비스 통합 / API 통합) 한국어 `@DisplayName` 으로 유지.

---

## 9. PR 분할

```
[Backend PR-IS]                               (선행 필수)
  ↓ 머지
[PR-FE0] packages 골격                         (types + api + hooks + schemas)
  ↓ 머지
  ├──────────────────────────┐
  ↓                           ↓
[PR-FE1] 운영진 Stepper + Config  [PR-FE4] 지원자 2-Step 폼
  ↓
[PR-FE2] 운영진 슬롯 관리
  ↓                           ↓
[PR-FE3] 운영진 자동배정 + 일정   [PR-FE5] 지원자 카드 + 모달
```

| PR | 책임 | base | 추정 |
|---|---|---|---|
| **Backend PR-IS** | §8.2 의 5 commit | develop | 0.5~1d |
| **PR-FE0** | packages/{types,api,hooks,schemas} 신규 + interview 모듈 | develop (PR-IS 머지 후) | 0.5d |
| **PR-FE1** | manage interview 라우트 + Stepper + InterviewConfigSection | PR-FE0 | 1d |
| **PR-FE2** | InterviewSlotSection + 패턴 입력 + ManagementSlotCard | PR-FE1 | 1d |
| **PR-FE3** | AutoAssign + ScheduleManagement sections + location banner | PR-FE2 | 1.5d |
| **PR-FE4** | apply 2-Step + SlotPickerByDateGroup + ApplicantSlotItem + useSelectedSlotIds | PR-FE0 (FE1~3 와 독립) | 1d |
| **PR-FE5** | me/applications/[id] 카드 + EditAvailabilityModal | PR-FE4 | 0.5d |

합계: backend 0.5~1d + frontend 4.5d (single dev) / 3d (병렬 2 dev).

운영진 트랙 (FE1→FE2→FE3) 과 지원자 트랙 (FE4→FE5) 은 PR-FE0 머지 후 병렬.

---

## 10. 테스트 전략

### 10.1 4 계층

**계층 1 — packages 단위**

```
packages/api/test/interview.test.ts
  ✅ "createInterviewSlots 는 정확한 URL + body 로 POST 한다"
  ✅ "submitApplication 은 interviewSlotIds 가 있으면 body 에 포함한다"
  ✅ "submitApplication 은 interviewSlotIds 가 없으면 body 에서 omit 한다"
  ✅ "getMyInterviewSchedule 응답이 assigned=false 면 narrow union 의 { assigned: false } variant"

packages/hooks/test/interview.test.ts (QueryClientProvider + MSW)
  ✅ "useCreateInterviewSlotsMutation 성공 시 slots/candidates/applicantSlots 가 invalidate 된다"
  ✅ "useAutoAssignMutation 성공 시 config/schedules/candidates 가 invalidate 된다"
  ✅ "useUpdateInterviewAvailabilitiesMutation 성공 시 mySchedule/availabilities 가 invalidate 된다"

packages/schemas/test/interview.test.ts
  ✅ "createInterviewConfigSchema 는 200자 초과 location 을 reject 한다"
  ✅ "slotPatternSchema 는 count=0 을 reject 한다"
  ✅ "updateAvailabilitySchema 는 빈 slotIds 를 reject 한다"
```

**계층 2 — 공용 UI 컴포넌트 (`apps/web/components/interview/`)**

```
SlotPickerByDateGroup.test.tsx
  ✅ "선택된 slotIds 가 chip active 상태로 표시된다"
  ✅ "chip 클릭 시 onChange 가 토글된 slotIds 와 함께 호출된다"
  ✅ "disabled=true 면 chip 클릭이 onChange 를 호출하지 않는다"
  ✅ "minSelected=1, 선택 0 이면 검증 메시지가 표시된다"
  ✅ "날짜별 그룹으로 정렬되어 렌더링된다"

ApplicantSlotItem.test.tsx
  ✅ "selected=true 일 때 active className/aria 가 설정된다"
  ✅ "capacity 가 메타로 표시된다"

ManagementSlotCard.test.tsx
  ✅ "assignments 가 있으면 지원자 chip 이 표시된다"
  ✅ "onAssign / onMove / onCancel 콜백이 정확한 인자로 호출된다"
```

**계층 3 — 라우트-local 통합 (페이지)**

```
test/manage/.../interview/InterviewManagementPage.test.tsx
  ✅ "config 가 없으면 Step 1 active, Step 2~4 disabled"
  ✅ "config 있고 slots 0 이면 Step 2 빈 상태로 active"
  ✅ "deadline 경과 + assignmentCompletedAt null 이면 Step 3 active"
  ✅ "assignmentCompletedAt 있으면 Step 4 active, schedule 그리드 표시"
  ✅ "config 생성 후 stepper 가 Step 2 로 자동 이동한다"
  ✅ "패턴 입력 후 '미리보기' 누르면 슬롯 카드 N개 표시"
  ✅ "자동배정 실행 후 슬롯 카드에 지원자가 배정되어 표시된다"
  ✅ "location 입력 후 저장 + 다시 진입 시 form 에 location 이 복원된다"

test/apply/ApplyPage.test.tsx
  ✅ "useInterview=true 면 Step 1 → Step 2 흐름"
  ✅ "useInterview=false 면 Step 1 만 + 곧장 제출"
  ✅ "Step 2 에서 슬롯 0개 선택 시 제출 버튼 disabled"
  ✅ "now >= interviewAvailabilityDeadline 이면 picker disabled + 안내"
  ✅ "제출 성공 시 me/applications/[id] 로 navigate + sessionStorage clear"
  ✅ "409 AVAILABILITY_PERIOD_CLOSED 응답 시 toast + picker disable"
  ✅ "Step 1 → Step 2 → Step 1 이동 후 답변·선택 모두 보존"

test/me/applications/InterviewScheduleCard.test.tsx
  ✅ "assigned=false 일 때 '자동 배정 대기 중' 노출"
  ✅ "assigned=true, status=ASSIGNED 일 때 일정·장소 노출"
  ✅ "assigned=true, location=null 일 때 '장소는 추후 안내됩니다' fallback"
  ✅ "assigned=true, status=CANCELLED 일 때 '취소됨' 배지"
  ✅ "수정 모달 진입 시 useInterviewAvailabilitiesQuery 의 slotIds 가 active 로 복원"
  ✅ "수정 모달 저장 성공 시 모달 닫힘 + 카드 invalidate"
  ✅ "수정 모달 저장 시 409 응답이면 toast + 모달 닫힘 + refetch"
```

**계층 4 — E2E (Playwright, 향후)**

본 PR 시리즈에선 skip. Playwright 도입 후 별도 PR 로 smoke 2 시나리오 (운영진 전체 플로우 / 지원자 전체 플로우).

### 10.2 MSW + TanStack Query 컨벤션

- TanStack Query 내부 mock 금지 (`useQuery` 자체를 mock 하지 않음). MSW 로 HTTP layer mock
- 각 테스트는 `QueryClientProvider` 새 client 로 격리
- Mock data 는 `@duing/types` 의 타입에 맞춰 작성 → backend 변경 시 타입 에러로 즉시 감지

### 10.3 테스트 파일 위치

```
frontend/apps/web/test/
├── manage/clubs/recruitments/interview/   # InterviewManagementPage 통합
├── apply/                                 # ApplyPage 2-Step
└── me/applications/                       # 카드 + 모달

frontend/packages/{api,hooks,schemas}/test/interview.test.ts   # packages 단위

frontend/apps/web/components/interview/__tests__/             # 공용 UI 컴포넌트 단위
```

---

## 11. plan Task 0 — 사전 확인

작업 시작 전 반드시 완료.

### 11.1 Backend PR-IS 머지 확인

- [ ] V47 마이그레이션 적용 (`flyway_schema_history` row 존재)
- [ ] `GET /api/v1/applications/{applicationId}/interview-availabilities` 응답 — `{slotIds: number[]}` + 401/403/404 케이스
- [ ] `GET /api/v1/recruitments/{recruitmentId}/applicant-interview-slots` 응답 — slots 배열 + location 미포함 + 마감 후에도 200 인지 (정책 확인)
- [ ] `GET /api/v1/recruitments/{recruitmentId}/interview-config` 응답 — configId/deadline/assignmentCompletedAt/location 포함
- [ ] `RecruitmentDetailResponse.interviewAvailabilityDeadline` — useInterview=true 시 non-null, false 시 null
- [ ] A2 / M8 응답에 location 노출 확인

### 11.2 gen:api 정합성

- [ ] backend 부팅 후 `pnpm gen:api` 실행
- [ ] `packages/api/src/openapi-types.ts` 갱신 결과를 commit 에 포함 (PR-FE0 의 첫 step)
- [ ] `MyInterviewSchedule` 의 discriminated union 변환을 `client.ts` 안에서 처리

### 11.3 기존 코드 영향

- [ ] `apps/web/app/apply/[recruitmentId]/_hooks/useAutosaveDraft.ts` 구조 확인 — 답변만 저장 (slotIds 미포함)
- [ ] `apps/web/app/apply/[recruitmentId]/page.tsx` 의 기존 흐름 — Step 1/2 분리 시 props 영향
- [ ] `apps/web/app/me/applications/[applicationId]/` 의 기존 페이지 구성 — InterviewScheduleCard 가 들어갈 자연스러운 위치
- [ ] `apps/web/components/` 기존 도메인 폴더 (`duing/`, `report/`) 의 네이밍·구조 — interview 폴더 일관성

### 11.4 위치·라우트 확인

- [ ] `apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/` 의 sibling sub-route (`applicants`, `edit`, `stats`) 의 page.tsx 패턴 확인
- [ ] Server Component vs Client Component 분리 패턴 확인

### 11.5 Backend out-of-scope 의존성

- [ ] application 의 `INTERVIEW_PENDING` 상태 전환 시점 — 운영진의 상태 변경 후 자동인지. InterviewScheduleCard 의 "자동 배정 대기 중" 노출 조건에 영향
- [ ] `RecruitmentDetail` 에 `clubId`, `clubName` 노출 확인 — 마이페이지 카드에 동아리명 표시 가능 여부

---

## 12. Known Limitations (MVP 의도된 한계)

본 MVP 에서 의도적으로 채택한 제약. 운영 데이터 기반 피드백 후 Future Phase 에서 개선.

### 12.1 슬롯 선택은 sessionStorage 에만 저장된다

지원자의 슬롯 선택 (`apply:{recruitmentId}:slots`) 은 sessionStorage 만 사용한다. 다음 케이스에서는 복원되지 않는다:

```
PC 에서 작성 → 브라우저 종료 → 모바일 재접속  → 복원 불가
PC 에서 작성 → 데스크탑 → 모바일  (기기 변경) → 복원 불가
```

답변(`answers`) 은 backend draft 에 저장되므로 정상 복원된다. **슬롯 선택만 device-local**.

Cross-device Draft Sync 는 Future Phase 로 분리 — 운영 데이터에서 "디바이스 전환 시 다시 입력하는 케이스 많다" 라는 시그널을 받으면 `ApplicationDraft` 에 `selectedSlotIds: List<Long>` 컬럼 추가 + DTO 확장으로 처리.

### 12.2 자동배정 dry-run 의 예상 인원은 추정값

§4.5 의 AutoAssign Section 의 통계는 매칭 알고리즘 모의실행이 아니라 단순 산술 추정이다. 실제 배정 결과는 자동배정 실행 후에만 확정. dry-run UI 에 "추정" 라벨 명시.

### 12.3 모집 시작 후 슬롯 신규 생성 금지

§4.5 의 SlotSection 의 패턴 입력 폼은 `recruitment.startDate` 이후에는 disabled 처리된다. backend 가 `RecruitmentAlreadyStarted` 로 차단하기 때문. 정책 자세한 사항은 §13 참조.

### 12.4 운영진의 location clear 미지원

§6.5 의 정책: `null = 변경 없음` / 빈 문자열도 변경 없음. 한 번 입력한 location 을 비우는 동작은 phase 2.

### 12.5 Stepper 의 multi-actor 동시 작업 시 staleness

§4 의 server-derived stepper 로 거의 해소되지만, TanStack Query 의 staleTime 보다 짧은 간격에 다른 운영진이 단계 진행한 경우 화면이 잠깐 stale 일 수 있음. mutation 의 invalidation 매트릭스(§6.3)로 본인 작업의 staleness 는 즉시 해소. 타인 작업의 자동 동기화는 manual refetch (Step 3 의 "결과 새로고침" 버튼) 또는 페이지 재진입.

---

## 13. 모집 시작 후 슬롯 관리 정책

본 spec 의 명시적 정책:

### 13.1 슬롯 신규 생성 (M3 POST slots)

- **`recruitment.startDate` 이후엔 차단**.
- 백엔드 `GeneralInterviewSlotService.createBulk()` 가 `LocalDate.now().isAfter(recruitment.getStartDate())` 검증 후 `RecruitmentAlreadyStarted` (409) 반환.
- frontend `InterviewSlotSection` 은 동일한 클라이언트 검증으로 패턴 입력 폼 disabled + 안내:
  ```
  모집이 시작된 후에는 새 슬롯을 추가할 수 없습니다.
  모집 시작 전에 충분한 슬롯을 등록하세요.
  ```

### 13.2 기존 슬롯 수정 (M5 PATCH slot)

- backend §5.5 의 slot edit rule 그대로:
  - `availabilityCount > 0` 인 슬롯의 시간 수정 → `SlotHasAvailability` (409)
  - capacity 증가 → 항상 허용
  - capacity 감소 → 현재 assigned 보다 작으면 `CapacityBelowAssigned` (409)
- 즉 모집 시작 후에도 capacity 증가는 가능. 시간 변경은 지원자 신뢰 보호 차원에서 차단.

### 13.3 기존 슬롯 삭제 (M6 DELETE slot)

- availability 0 + assigned 0 일 때만 가능. 그 외 409.

### 13.4 정책 채택 근거

대학 동아리 운영 패턴에서 "모집 공개 직전 슬롯 N개 등록 → 모집 진행 → 마감 후 자동배정" 흐름이 표준. 모집 시작 후 슬롯 추가는 기존 지원자의 선택 가능 범위와 신규 지원자의 선택 가능 범위가 달라져 공정성 이슈가 발생한다.

선택지 비교:

| 옵션 | 평가 |
|---|---|
| **A. 모집 시작 후 슬롯 신규 생성 허용** | 운영 유연성 ↑. 그러나 기존 지원자 = 새 슬롯 미선택 권리만 있고 신규 지원자만 새 슬롯 선택 가능 → 공정성 이슈. 또한 자동배정 시점에 어느 슬롯이 effective 인지 정책 추가 필요 |
| **B. 모집 시작 후 슬롯 신규 생성 금지 (채택)** | 운영진이 신중하게 사전 등록. 공정성 단순. 부족 시 capacity 증가로 일부 대응 가능 |

**채택: 옵션 B**. 현재 backend 동작과 일치.

향후 정책 변경 시 (옵션 A 로 전환) backend `RecruitmentAlreadyStarted` 검증 제거 + 자동배정 매칭 알고리즘에 "구슬롯 우선 / 신슬롯 보조" 같은 가중치 도입 별도 spec 필요.

---

## 14. 위험 / 미결정 사항

본 spec 단계에선 결정 안 하고 작업 중 만나면 가이드 적용.

- **slot 수정 후 ManagementSlotCard 가 재렌더링 안 됨** — invalidation 매트릭스 누락. §6.3 의 매트릭스 확인 + hooks 테스트로 사전 방어
- **수정 모달 열린 채로 deadline 통과** — 모달 진입 시 fresh fetch + 저장 시 409 처리 (§5.6)
- **운영진이 location 만 변경 (deadline 그대로)** — partial update. `null = unchanged` (§6.5). frontend 가 변경된 필드만 보내거나 모든 필드 다시 보내도 backend 안전
- **autosave 시 슬롯 선택 변경 race** — 슬롯 선택은 sessionStorage 라 backend race 무관. 답변 autosave 만 debounce 300~500ms
- **gen:api 실행 시 backend 미부팅** — Task 0 단계에서 backend dev 환경 부팅 필수

---

## 변경 이력

- 2026-06-08 — 최초 작성. 면접 스케줄링 frontend MVP 6 PR + Backend PR-IS 1 PR 분할 확정.
- 2026-06-08 — 리뷰 피드백 6건 반영. Stepper 를 server-derived only 로 (§4), location 을 MVP 본체로 승격 (§8.1), Known Limitations 섹션 신설 (§12), Auto Assign Dry Run 5 지표 + Step 4 tab 2개로 축소 (§4.5), 모집 시작 후 슬롯 정책 명문화 (§13).
