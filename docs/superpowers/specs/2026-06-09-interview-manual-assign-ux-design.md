# Interview Scheduling UX Enhancement — Manager Manual Assignment Workflow

**Date:** 2026-06-09
**Status:** Draft (awaiting user review)
**Related:** PR-IS (Interview Scheduling MVP), `interview-scheduling-frontend` plan (executed)

---

## Goal

운영진 수동 배정 / 재배정 흐름을 "지원자가 선택한 가능 시간 내 최종 조정" 으로 재설계한다. 자동배정 결과의 사후 수정이 아니라 항상 지원자 선택 슬롯을 우선 노출한다. 동시에 지원자/운영진 양쪽 funnel UX 를 정리해 진행 상태가 명확히 전달되도록 한다.

## Architecture

- **`ApplicationStatus` enum 변경 없음** — `SUBMITTED / UNDER_REVIEW / INTERVIEW_PENDING / ACCEPTED / REJECTED` 유지. 신규 표시 단계는 `InterviewAvailability` / `InterviewSchedule` 존재 여부로 derived.
- **Backend 변경 범위:** `ApplicantDetailResponse` 에 `interviewAvailabilities` / `assignedSlot` 추가 (P0), `ApplicantQuery` 에 `interviewAvailabilityCount` / `assignedSlot` 추가 (P1, batch fetch). `MyApplicationDetailQuery` 에 `interviewAvailabilityCount` / `interviewScheduleAssigned` derived 필드 추가 (P0). M9 PUT 등 mutation API 는 무변경.
- **Frontend 변경 범위:** 운영진 사이드 — 지원자 상세 페이지, 수동 배정 모달 (Override Mode 포함), list 액션 명칭/확인 모달, list row 확장 (P1). 지원자 사이드 — my-application stepper.
- **공통 DTO 타입:**
  - `AvailabilityItem { slotId, startTime, endTime }` — 카드/리스트/stepper 시점의 경량 표현. capacity/assignedCount 미포함.
  - 모달에서 capacity/assignedCount 가 필요한 시점에는 `GET /api/v1/recruitments/{id}/interview-slots` 의 기존 `SlotListView` 와 frontend 에서 `slotId` 기준 merge.

## Tech Stack

- Backend: Spring Boot 3.4 / Java 21 / JPA / QueryDSL / Flyway / RestAssured / TestContainers
- Frontend: Next.js 15 App Router / React 19 / TypeScript 5 / TanStack Query 5 / Tailwind
- 기존 PR-IS 인프라 (`InterviewAvailability`, `InterviewSchedule`, `InterviewSlot` 도메인) 그대로 활용

---

## P0 — MVP 출시 전 권장

### P0-1. 지원자 funnel stepper (지원자 my-page)

지원자 본인이 `users/me/applications/{applicationId}` 에서 보는 stepper.

**기본 5 단계 (메인 진행 막대):**

| Step | 라벨 | derived 조건 |
|---|---|---|
| 1 | 지원 완료 | `status == SUBMITTED` |
| 2 | 서류 검토 중 | `status == UNDER_REVIEW` |
| 3 | 면접 대상 | `status == INTERVIEW_PENDING && !interviewScheduleAssigned` |
| 4 | 면접 일정 배정 완료 | `status == INTERVIEW_PENDING && interviewScheduleAssigned` |
| 5 | 최종 합격 / 최종 불합격 | `status == ACCEPTED / REJECTED` |

**Step 3 내부 sub-state (단계 내부 안내 문구로만 노출, 진행 막대는 그대로 Step 3):**

| Sub-state | 안내 문구 | 조건 |
|---|---|---|
| 가능시간 선택 대기 | "운영진이 면접 대상으로 선정했습니다. 면접 가능 시간을 선택해 주세요." | `interviewAvailabilityCount == 0 && availabilityDeadline 미경과` |
| 가능시간 제출 완료 | "면접 가능 시간 N개를 제출했습니다. 운영진이 일정을 배정 중입니다." | `interviewAvailabilityCount > 0 && !interviewScheduleAssigned` |
| 제출 마감 | "면접 가능 시간 제출이 마감되었습니다. 운영진과 별도 연락이 있을 수 있습니다." | `interviewAvailabilityCount == 0 && availabilityDeadline 경과` |

이렇게 분리하는 이유 — 운영 프로세스 (운영진의 "면접 대상 선정" 액션) 와 지원자 관점의 진행 상태를 분리. 운영진이 INTERVIEW_PENDING 으로 전환한 시점부터 지원자는 Step 3 진입 (= "면접 대상"). 일정 조율 미묘함은 안내 문구로만 표현.

**Backend 변경:** `MyApplicationDetailQuery` / `MyApplicationDetailResponse` 에 다음 필드 추가:
- `interviewAvailabilityCount: int` — 해당 application 의 `InterviewAvailability` row 수
- `interviewScheduleAssigned: boolean` — `InterviewSchedule` 가 존재하고 `status == ASSIGNED` 인 경우 `true`. `CANCELLED` 상태는 `false` (취소된 일정은 미배정으로 취급).
- `availabilityDeadline: LocalDateTime | null` — `InterviewConfig.availabilityDeadline` 원본 값 (모집이 `useInterview=false` 거나 config 미존재 시 `null`)

`availabilityDeadlinePassed` 같은 derived boolean 대신 원본 timestamp 를 노출해 프론트에서 "D-Day", "남은 시간", "마감 여부" 등 다양한 UI 표현이 가능하도록 한다. sub-state 분기는 프론트에서 `availabilityDeadline != null && availabilityDeadline < now()` 로 계산.

**Frontend 변경:** 지원자 my-application 페이지에 stepper 컴포넌트 추가. 위 5 단계 + Step 3 sub-state 안내. sub-state 계산 유틸 함수 분리 + 단위 테스트.

### P0-2. 운영진 지원자 상세에 "선택 슬롯" / "현재 배정" 표시

`/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]` 페이지에 새 카드 섹션 추가:

```
┌─ 면접 일정 ────────────────────────────┐
│ 현재 배정                              │
│   4/13 (토) 18:00 – 18:30              │
│   (또는 "미배정")                      │
│                                        │
│ 지원자가 선택한 면접 가능 시간 (3개)   │
│   • 4/13 (토) 18:00 – 18:30  [현재 배정]│
│   • 4/13 (토) 18:30 – 19:00            │
│   • 4/14 (일) 19:00 – 19:30            │
│   (또는 "아직 선택하지 않았습니다")    │
│                                        │
│ [ 수동 배정 변경 ]                     │
└────────────────────────────────────────┘
```

**Backend 변경:** `ApplicantDetailQuery` / `ApplicantDetailResponse` 에 다음 필드 추가:
- `interviewAvailabilities: AvailabilityItem[]` — `InterviewAvailability` row 들의 `slotId` 를 `InterviewSlot` join 으로 `{ slotId, startTime, endTime }` 매핑. 정렬: `startTime ASC`.
- `assignedSlot: AvailabilityItem | null` — `InterviewSchedule` 가 가리키는 `InterviewSlot` 의 `{ slotId, startTime, endTime }`. 없으면 `null`.

`AvailabilityItem` 은 capacity/assignedCount 를 포함하지 않는 경량 표현이다. 운영진 상세 카드/지원자 stepper 시점에는 의도적으로 정원 정보 노출을 피해 카드 정보 밀도를 낮춘다. 정원 정보는 모달 시점에 `GET /api/v1/recruitments/{id}/interview-slots` 로 별도 fetch 후 frontend 에서 slotId merge.

**Frontend 변경:** ApplicantDetail 페이지에 위 섹션 컴포넌트 추가. "수동 배정 변경" 버튼이 P0-3 모달을 연다.

### P0-3. 수동 배정 모달 — 선택 슬롯 우선 노출 (Override Mode 토글 포함)

P0-2 의 "수동 배정 변경" 버튼이 여는 modal. P1 의 Override Mode 토글까지 함께 구현 (모달 일관성).

```
┌─ 면접 일정 배정 ────────────────────────┐
│ 지원자: 홍길동                          │
│ 현재 배정: 4/13 18:00 (또는 미배정)     │
│                                         │
│ 지원자가 선택한 슬롯 (3)                │
│  ○ 4/13 18:00 – 18:30   2/4 정원        │
│  ● 4/13 18:30 – 19:00   1/4 정원        │
│  ○ 4/14 19:00 – 19:30   0/4 정원        │
│                                         │
│ ☐ 선택하지 않은 슬롯도 보기             │
│                                         │
│ ─ 토글 ON 시 추가 노출 ─────────────────│
│ │ 선택하지 않은 슬롯                    │
│ │  ⚠ 4/15 20:00 – 20:30  0/4 정원       │
│ │     지원자가 선택하지 않은 시간입니다 │
│ │  ⚠ 4/15 20:30 – 21:00  2/4 정원       │
│ └─────────────────────────────────────  │
│                                         │
│ [취소]  [배정]                          │
└─────────────────────────────────────────┘
```

**동작 (Lazy Load 명시):**
- 모달 초기 렌더 — P0-2 의 `interviewAvailabilities` (ApplicantDetail 쿼리 캐시) 만 사용. 정원 정보가 필요하면 selectedSlot 만 따로 `useInterviewSlotsQuery` 로 부르되, 기본은 캐시만으로 충분하므로 즉시 fetch 하지 않는다.
- 토글 OFF 기본 — `interviewAvailabilities` 만 노출. capacity/assignedCount 가 필요하면 slotId 매트릭스에 해당하는 row 만 메모리 merge (slots query 가 있을 때).
- 토글 ON 시점 — 그 시점에 `GET /api/v1/recruitments/{recruitmentId}/interview-slots` 를 lazy fetch (TanStack Query `enabled: showAll`). 응답 도착 후 `interviewAvailabilities` 에 포함되지 않은 슬롯을 ⚠ 경고와 함께 추가 노출. `interviewAvailabilities` 도 정원 정보를 함께 merge.
- `interviewAvailabilities` 가 빈 배열 — empty state 안내:
  > 지원자가 면접 가능 시간을 제출하지 않았습니다.
  > 제출 마감 전이라면 제출을 요청하세요.
  > 긴급한 경우 아래 토글을 통해 운영진이 직접 배정할 수 있습니다.

  토글은 사용자 의도적 액션 이후에만 fetch (자동 ON 금지).
- "배정" 클릭 시:
  - 선택한 슬롯이 `interviewAvailabilities` 안 — 바로 mutation 실행
  - 선택한 슬롯이 `interviewAvailabilities` 밖 (Override) — confirm dialog 한 번 더:
    > 지원자가 선택하지 않은 시간입니다.
    > 이 시간으로 배정하면 지원자가 참석하기 어려울 수 있습니다.
    > 계속 진행하시겠습니까?
- mutation: 기존 `PUT /api/v1/applications/{id}/interview-schedule` 그대로 사용 — **Backend 무변경**

**Backend 변경:** 없음. M9 PUT 은 이미 선택 여부와 무관하게 슬롯 유효성만 검증.

**Frontend 변경:** ManualAssignModal 신규 컴포넌트. 기존 자동배정 결과 일정 관리 페이지 (`PR-FE3` 의 ScheduleManagement) 에서 row 별 "재배정" 버튼이 동일 모달을 열도록 wiring.

### P0-4. "면접 대상 선정" 액션 명칭 + 확인 모달

운영진 list 페이지의 일괄 상태 변경 액션 UI 정리:

**기존:**
- 라벨: "INTERVIEW_PENDING 으로 변경" (또는 enum 그대로 노출)

**변경:**
- 라벨: "면접 대상으로 선정"
- 클릭 시 확인 모달:
```
홍길동 외 5명을
면접 대상자로 선정하시겠습니까?

선정된 지원자는 자동배정 대상에 포함됩니다.

[취소]  [선정]
```

**상태 라벨 일관성:** ApplicationStatus 노출 라벨 전수 정리 (운영진/지원자 양쪽):

| Enum | 운영진 라벨 | 지원자 라벨 |
|---|---|---|
| SUBMITTED | 지원 완료 | 지원 완료 |
| UNDER_REVIEW | 서류 검토 중 | 서류 검토 중 |
| INTERVIEW_PENDING | 면접 대상 | 면접 대상 선정 / 일정 조율 중 / 일정 배정 완료 (derived) |
| ACCEPTED | 합격 | 최종 합격 |
| REJECTED | 불합격 | 최종 불합격 |

**Backend 변경:** 없음. 기존 `PATCH /api/v1/leader/applications/bulk-status` 그대로 호출.

**Frontend 변경:** 운영진 list 의 상태 변경 액션 컴포넌트 라벨/모달 교체, 공용 status badge 컴포넌트 라벨 정리.

---

## P1 — 출시 직후 (이번 spec 에 포함, plan 은 P0 만)

### P1-1. Applicant List 행 정보 확장

list table row 에 컬럼 추가:
- 선택 슬롯 N개 (`interviewAvailabilityCount`)
- 현재 배정 (`assignedSlot` 의 startTime — 없으면 "-")

행 확장 (accordion) 시 해당 지원자의 선택 슬롯 전체 목록 노출. 확장 시점에 `GET /api/v1/leader/applications/{id}` 호출 (P0-2 의 `interviewAvailabilities` 재사용) — list response 에는 count 와 배정만 포함해 payload 절약.

**Backend 변경:** `ApplicantQuery` / `ApplicantResponse` 에 다음 필드 추가:
- `interviewAvailabilityCount: int`
- `assignedSlot: AvailabilityItem | null`

**Query 성능 — N+1 회피 (Spec 명시):**

페이지네이션 list 는 row 당 N=20~100 수준. naive subquery (row 마다 InterviewAvailability count) 또는 join 후 group by 는 cardinality 폭발 위험. **batch fetch 패턴** 사용 — `ApplicantQuery` 메인 쿼리에서 application_id 목록을 먼저 확정한 뒤, 두 개의 보조 쿼리로 한 번에 묶어 메모리 merge:

1. `SELECT application_id, COUNT(*) FROM interview_availability WHERE application_id IN (:ids) AND deleted_at IS NULL GROUP BY application_id` → `Map<Long, Integer> availabilityCountByApp`
2. `SELECT s.application_id, sl.id, sl.start_time, sl.end_time FROM interview_schedule s JOIN interview_slot sl ON sl.id = s.slot_id WHERE s.application_id IN (:ids) AND s.deleted_at IS NULL AND sl.deleted_at IS NULL` → `Map<Long, AvailabilityItem> assignedByApp`

메인 쿼리 결과 + 두 맵 → DTO 매핑 시 합성. 총 3 쿼리, 페이지 사이즈 무관 O(1). 메인 쿼리 자체는 기존 QueryDSL 그대로.

**Soft delete 정합성:** `InterviewAvailability` / `InterviewSchedule` / `InterviewSlot` 3 entity 는 모두 `BaseEntity` 상속 + `@SQLDelete` + `@SQLRestriction("deleted_at IS NULL")` 적용되어 있다. JPQL/QueryDSL 은 `@SQLRestriction` 으로 자동 필터링되지만, 위 보조 쿼리들이 raw SQL 또는 QueryDSL 의 `nativeQuery` 경로로 작성될 경우 `deleted_at IS NULL` 절을 **명시적으로 포함**해야 한다. 표준 QueryDSL 경로면 생략 가능하나 명시 권장 (가독성 + 추후 native 전환 호환).

**Frontend 변경:** ApplicantTable 컬럼 추가 + row 확장 UI.

### P1-2. 슬롯 중심 재배정 화면 (Slot-Centric Reassignment View)

기존 schedule management 페이지 옆에 새 view: "슬롯별 보기". 슬롯을 중심에 두고
- 현재 슬롯에 배정된 지원자
- 해당 슬롯을 "선택만 한" (배정되지 않은) 지원자

두 목록을 노출해 운영진이 slot 단위로 면접자를 옮겨붙일 수 있게 한다.

상세 UX (drag and drop / 클릭 이동 / 빈자리 통계) 는 P0 출시 후 사용자 피드백을 받고 별도 spec 으로 분기. **이 spec 에서는 의도만 정의**.

**Backend / Frontend 변경:** 상세 정의는 별도 spec.

---

## Out of Scope

- `ApplicationStatus` enum 값 추가/변경 — `SUBMITTED / UNDER_REVIEW / INTERVIEW_PENDING / ACCEPTED / REJECTED` 유지. 신규 단계는 derived.
- 선택 슬롯이 아닌 곳에 배정 시 backend 차단 — 운영진 권한 신뢰, frontend warning + confirm 만.
- **Override 배정의 audit trail** — 현재 audit infra 는 `ApplicationStatusHistory` (status 변경만). InterviewSchedule 변경 이력/사유 저장은 별도 schema (예: `interview_schedule_history` 테이블 + `overrideReason` 컬럼) 가 필요하므로 본 spec 범위 밖. 후속 spec 으로 분리. 본 spec 에서는 confirm dialog 만으로 "운영진 의도성" 확보 → 후속 audit spec 에서 frontend 의 override 플래그/사유를 backend 에 전달하도록 확장.
- 자동배정 알고리즘 변경 — 기존 M7 무변경.
- 슬롯 자체 lifecycle (생성/수정/삭제) — 기존 슬롯 관리 페이지에서 처리.
- 면접 진행 후 평가 UI — 별도 도메인.
- 알림 (메일/푸시) 송신 — 별도 도메인.
- P1-2 슬롯 중심 재배정 화면의 상세 UI/UX — 별도 spec.
- 지원자 본인이 stepper 위에서 직접 단계를 진행시킬 수 있는 액션 (예: "선택 다시 하기" 버튼) — 본 spec 에선 표시 only.
- 권한 확장 (예: STAFF role 의 일부 액션 허용) — 기존 LEADER/EXECUTIVE 권한 모델 그대로.

---

## Data Flow

### P0-2 / P0-3 운영진 지원자 상세 + 모달

```
Operator: open ApplicantDetail page
  └─> GET /api/v1/leader/applications/{id}
        └─> ApplicantDetailResponse {
              ...existing,
              interviewAvailabilities: AvailabilityItem[],
              assignedSlot: AvailabilityItem | null
            }

Operator: click "수동 배정 변경"
  └─> open ManualAssignModal
        └─> use ApplicantDetailResponse.interviewAvailabilities (cached)
        ── no slot list fetch yet ──

Operator: toggle "선택하지 않은 슬롯도 보기" ON
  └─> lazy fetch GET /api/v1/recruitments/{recruitmentId}/interview-slots
        └─> SlotListView[] (전체 활성 slot, capacity/assignedCount 포함)
        └─> frontend merge by slotId

Operator: select slot + click "배정"
  ├─> if slot ∈ interviewAvailabilities → PUT /api/v1/applications/{id}/interview-schedule
  └─> if slot ∉ interviewAvailabilities → confirm dialog → PUT (same)
        └─> invalidate: ApplicantDetail, ApplicantList, ScheduleManagement, slots
```

### P0-1 지원자 stepper

```
Applicant: open my-application page
  └─> GET /api/v1/users/me/applications/{id}
        └─> MyApplicationDetailResponse {
              ...existing,
              interviewAvailabilityCount: int,
              interviewScheduleAssigned: boolean,
              availabilityDeadline: LocalDateTime | null
            }
  └─> derive 5-step + step3 sub-state from
        { status, availabilityCount, scheduleAssigned, availabilityDeadline, now() }
```

---

## Error Handling

- `interviewAvailabilities` 가 빈 배열이고 토글 OFF: empty state 안내, "배정" 버튼 disabled
- 토글 ON lazy fetch 실패: 모달 내 inline error + 토글 OFF 로 자동 복귀 (`interviewAvailabilities` 모드는 계속 사용 가능)
- Override confirm dialog 거부 시: mutation 호출하지 않음, 모달 그대로 유지
- M9 PUT 실패 (409 슬롯 만원 / 404 슬롯 없음 등): 기존 `ApiError` callout 패턴으로 모달 내 표시
- ApplicantDetail fetch 실패: 기존 페이지 에러 fallback 노출
- bulk-status mutation 실패: 기존 list 페이지 toast 패턴

---

## Testing

### Backend

- `ApplicantDetailQueryTest` — `interviewAvailabilities` 매핑 (0개 / 1개 / 다수, startTime ASC 정렬) + `assignedSlot` 매핑 (null / 존재)
- `MyApplicationDetailQueryTest` — `interviewAvailabilityCount` + `interviewScheduleAssigned` + `availabilityDeadline` 매트릭스. `useInterview=false` 또는 config 미존재 시 `availabilityDeadline == null` 검증
- Frontend `deriveStepperSubState` 유틸 단위 테스트 — `(availabilityCount, scheduleAssigned, availabilityDeadline, now)` 입력 → sub-state 매트릭스 (가능시간 선택 대기 / 가능시간 제출 완료 / 제출 마감)
- `LeaderApplicationControllerTest` (RestAssured) — 운영진 권한으로 `interviewAvailabilities` 가 응답에 포함되는지
- `ApplicationApiControllerTest` (RestAssured) — 본인 my-application 에 derived 필드 포함 검증
- P1: `ApplicantQueryTest` + list endpoint 통합 — `interviewAvailabilityCount` / `assignedSlot`
- P1: list batch fetch 쿼리 카운트 검증 (Hibernate statistics) — 페이지 size 와 무관하게 보조 쿼리 2회만 발생

### Frontend

- ApplicantDetail 페이지의 InterviewScheduleCard RTL: `interviewAvailabilities` 0/N/배정-있음/배정-없음 매트릭스
- ManualAssignModal RTL: 토글 OFF/ON, `interviewAvailabilities` 0개 case, Override confirm 흐름, M9 mutation 에러 표시
- MyApplicationStepper RTL: 7 단계 라벨 derived 매트릭스
- BulkStatusAction RTL: 새 라벨 + 확인 모달
- E2E smoke: 운영진 — 선정 → 모달 → 선택슬롯 배정 → Override 배정 / 지원자 — 단계 진행에 따른 stepper 갱신

### Manual smoke

- 운영진 시점: list → 상태 변경 → 상세 → 수동 배정 (선택/Override 양쪽) → 자동배정 결과 충돌 시 재배정
- 지원자 시점: 지원 → 운영진이 면접 대상 선정 → 슬롯 선택 → 배정 후 stepper 단계 확인

---

## Migration / Rollout

- DB schema 변경 없음 (모든 신규 필드는 기존 entity 에서 derived).
- 기존 ApplicantDetail / MyApplication API 응답에 필드 **추가만** 발생 — 기존 클라이언트와 호환.
- 프론트 stepper / 모달은 새 라우트 추가 없이 기존 페이지에 컴포넌트 합류.
- 단일 릴리즈로 backend + P0 frontend 머지. P1 은 별도 cycle.
- Override audit 후속 spec 에서 schema (예: `interview_schedule_history`) 가 추가되면 그 시점에 frontend confirm 흐름에서 `overrideReason` 입력 + mutation payload 확장 — 본 spec 의 모달은 후속 변경에 호환되도록 confirm dialog 위치를 고정.

---

## Implementation Plan Scope (다음 단계)

다음 단계 `writing-plans` 스킬은 **P0 (P0-1 ~ P0-4) 만** 대상으로 task breakdown 한다. P1-1 / P1-2 는 본 spec 에 정의만 남기고 별도 후속 plan 으로 분리.
