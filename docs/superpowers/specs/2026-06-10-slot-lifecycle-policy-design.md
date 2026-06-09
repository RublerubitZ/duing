# Interview Slot Lifecycle Policy

**Date:** 2026-06-10
**Status:** Draft
**Related:**
- 면접 수동배정 UX spec (`2026-06-09-interview-manual-assign-ux-design.md`) — Out of Scope 에서 분리되어 별도 spec 으로 진행
- Backend `InterviewConfig` 도메인 인프라 (이미 존재: `availabilityDeadline`, `assignmentCompletedAt`, `markAssignmentCompleted`)

---

## Goal

운영진의 슬롯 lifecycle (생성·수정·삭제) 정책 기준을 **모집 일정** 에서 **면접 도메인 lifecycle** 로 전환한다. 모집 시작일 기반의 단일 가드 (`recruitmentStartDate <= today` → 생성 금지) 를 제거하고, `availabilityDeadline` 과 `assignmentCompletedAt` 을 기준으로 한 3-phase 매트릭스 정책으로 재설계한다.

현재 정책의 문제점 (UX 분석):
- "추가 금지 + 삭제 허용" 의 비대칭 — 삭제가 더 파괴적임에도 더 자유로움
- 모집 시작 후 추가 슬롯 필요 (면접관 추가 시간, 분산 필요 등) 대응 불가
- 지원자가 가용시간으로 선택한 슬롯도 삭제 가능 — 무방비

본 spec 의 목표:
- 운영진의 유연성 + 지원자 선택 보호 동시 확보
- 모집 도메인 / 면접 도메인 분리 (interview manual assign UX spec 과 일관)
- 기존 `InterviewConfig` 인프라 활용 — 신규 컬럼/migration 최소화

## Architecture

- **3-phase 매트릭스** — `InterviewConfig` 의 `availabilityDeadline` 과 `assignmentCompletedAt` 으로 derive. Recruitment 의 `startDate` 와 무관.
- **`InterviewSlotLifecyclePhase` enum** — `BEFORE_DEADLINE / AFTER_DEADLINE_BEFORE_ASSIGNMENT / AFTER_ASSIGNMENT`. 도메인 enum 이 아닌 `InterviewConfig.phase(now)` 로 derive (값 영구 저장 불필요).
- **도메인 메서드** — `InterviewConfig` 에 `canCreateSlot(now): boolean`, `canModifySlotFields(slot, hasAvailability, now): SlotModifiablePolicy`, `canDeleteSlot(slot, hasAvailability, now): boolean` 신설. service 가 호출.
- **Slot 별 `hasAvailability` 판단** — `InterviewAvailabilityRepository.existsBySlotIdAndDeletedAtIsNull(slotId)` 신규 메서드.
- **기존 가드 제거** — `GeneralInterviewSlotService.createBulk` 의 `RecruitmentAlreadyStarted` throw 삭제. 신규 phase 가드로 교체.
- **에러 코드 신설** — `InterviewException`:
  - `SlotCreationNotAllowedInCurrentPhase` (phase 3)
  - `SlotModificationNotAllowedInCurrentPhase` (phase 3 또는 phase 2 의 availability-bearing slot)
  - `SlotDeletionNotAllowedInCurrentPhase` (phase 3 또는 availability 존재)
  - `SlotTimeChangeForbiddenForSelectedSlot` (phase 1/2 에서 availability 가 있는 슬롯의 시간 변경 시도)

기존 `RecruitmentAlreadyStarted` 예외는 본 spec 적용 후 사용처가 없어지므로 deprecate (별도 cleanup PR 에서 제거).

## Tech Stack

- Backend: Spring Boot 3.4 / Java 21 / JPA / QueryDSL / Flyway / RestAssured / TestContainers
- Frontend: Next.js 15 / React 19 / TypeScript 5 / TanStack Query 5 / Tailwind
- Migration: **DB schema 변경 없음** — `InterviewConfig` 의 `availabilityDeadline` / `assignmentCompletedAt` 만 활용

## 정책 매트릭스 (사용자 확정)

| Phase | 조건 | Slot 추가 | Slot 수정 | Slot 삭제 |
|---|---|---|---|---|
| **Phase 1 — 마감 전** | `now < availabilityDeadline` | ✅ | `hasAvailability=false`: 시간 + capacity ✅<br>`hasAvailability=true`: capacity 만 ✅ / 시간 ❌ | `hasAvailability=false`: ✅<br>`hasAvailability=true`: ❌ (409) |
| **Phase 2 — 마감 ~ 자동배정 전** | `availabilityDeadline ≤ now`<br>`assignmentCompletedAt = null` | ✅ (운영진 직권 배정 용도) | `hasAvailability=false`: 시간 + capacity ✅<br>`hasAvailability=true`: ❌ | `hasAvailability=false`: ✅<br>`hasAvailability=true`: ❌ (409) |
| **Phase 3 — 자동배정 후** | `assignmentCompletedAt != null` | ❌ | ❌ | ❌ |

**원칙:**
- `hasAvailability` 는 "지원자가 가용시간으로 선택한 슬롯" 의 의미 — 운영진의 액션 (배정) 과는 무관 (배정은 별도 도메인).
- 시간 변경은 선택 의미 파괴라 위험 → 보호.
- capacity 변경은 비교적 안전 → phase 2 의 hasAvailability=true 슬롯에 한해 추가 검토 필요한데, **사용자 답변에 따르면 phase 2 에서는 availability 존재 슬롯 수정 완전 차단** (capacity 도 X).
- phase 2 에서 추가된 신규 슬롯은 `hasAvailability=false` 라 자유 수정/삭제 — 운영진의 "잘못 만든 슬롯" 회수 경로 보존.
- phase 3 진입은 일방향 — 자동배정 결과의 신뢰성 보호.

## Backend 변경

### `InterviewConfig` (entity)

기존 `markAssignmentCompleted` / `isAvailabilitySubmissionOpen` 패턴에 맞춰 phase 메서드 추가:

```java
public enum SlotMutableFields {
    NONE,
    CAPACITY_ONLY,
    TIME_AND_CAPACITY
}

public boolean canCreateSlot(LocalDateTime now) {
    return assignmentCompletedAt == null;  // phase 1 또는 phase 2
}

public SlotMutableFields canModifySlot(boolean hasAvailability, LocalDateTime now) {
    if (assignmentCompletedAt != null) return SlotMutableFields.NONE;          // phase 3
    if (now.isBefore(availabilityDeadline)) {                                   // phase 1
        return hasAvailability ? SlotMutableFields.CAPACITY_ONLY : SlotMutableFields.TIME_AND_CAPACITY;
    }
    // phase 2
    return hasAvailability ? SlotMutableFields.NONE : SlotMutableFields.TIME_AND_CAPACITY;
}

public boolean canDeleteSlot(boolean hasAvailability, LocalDateTime now) {
    if (assignmentCompletedAt != null) return false;     // phase 3
    return !hasAvailability;                              // phase 1/2: availability 없으면 OK
}
```

`hasAvailability` 는 service 에서 주입. 도메인 메서드는 pure logic.

### `GeneralInterviewSlotService`

3 mutation 모두 가드 교체:

```java
// createBulk
public List<Long> createBulk(CreateInterviewSlotsCommand command) {
    ...existing config 조회...
    InterviewConfig config = configRepository.findByRecruitmentId(recruitmentId)
            .orElseThrow(InterviewException.InterviewConfigNotFound::new);

    if (!config.canCreateSlot(LocalDateTime.now())) {
        throw new InterviewException.SlotCreationNotAllowedInCurrentPhase();
    }
    // 기존 RecruitmentAlreadyStarted throw 제거
    ...slot 생성 및 저장...
}

// updateSlot
public void updateSlot(UpdateInterviewSlotCommand command) {
    InterviewSlot slot = slotRepository.findById(command.slotId())
            .orElseThrow(InterviewException.InterviewSlotNotFound::new);
    InterviewConfig config = configRepository.findByRecruitmentId(slot.getRecruitmentId())
            .orElseThrow(InterviewException.InterviewConfigNotFound::new);
    boolean hasAvailability = availabilityRepository.existsBySlotIdAndDeletedAtIsNull(slot.getId());

    SlotMutableFields mutable = config.canModifySlot(hasAvailability, LocalDateTime.now());
    switch (mutable) {
        case NONE -> throw new InterviewException.SlotModificationNotAllowedInCurrentPhase();
        case CAPACITY_ONLY -> {
            if (command.startTime() != null || command.endTime() != null) {
                throw new InterviewException.SlotTimeChangeForbiddenForSelectedSlot();
            }
        }
        case TIME_AND_CAPACITY -> { /* allow all fields */ }
    }
    ...실제 update...
}

// deleteSlot
public void deleteSlot(DeleteInterviewSlotCommand command) {
    InterviewSlot slot = slotRepository.findById(command.slotId())
            .orElseThrow(InterviewException.InterviewSlotNotFound::new);
    InterviewConfig config = configRepository.findByRecruitmentId(slot.getRecruitmentId())
            .orElseThrow(InterviewException.InterviewConfigNotFound::new);
    boolean hasAvailability = availabilityRepository.existsBySlotIdAndDeletedAtIsNull(slot.getId());

    if (!config.canDeleteSlot(hasAvailability, LocalDateTime.now())) {
        throw new InterviewException.SlotDeletionNotAllowedInCurrentPhase();
    }
    ...실제 delete...
}
```

### `InterviewAvailabilityRepository`

신규 derived 메서드:
```java
boolean existsBySlotIdAndDeletedAtIsNull(Long slotId);
```
(또는 컨벤션 따라 `existsBySlotId` — `@SQLRestriction` 자동 적용 확인 후 결정.)

### `InterviewException`

신규 4 예외:
```java
public static class SlotCreationNotAllowedInCurrentPhase extends InterviewException {
    public SlotCreationNotAllowedInCurrentPhase() {
        super(HttpStatus.CONFLICT, "현재 단계에서는 슬롯을 추가할 수 없습니다. 자동배정이 이미 완료되었습니다.");
    }
}

public static class SlotModificationNotAllowedInCurrentPhase extends InterviewException {
    public SlotModificationNotAllowedInCurrentPhase() {
        super(HttpStatus.CONFLICT, "현재 단계에서는 이 슬롯을 수정할 수 없습니다.");
    }
}

public static class SlotDeletionNotAllowedInCurrentPhase extends InterviewException {
    public SlotDeletionNotAllowedInCurrentPhase() {
        super(HttpStatus.CONFLICT, "지원자가 선택한 슬롯이거나 자동배정이 완료되어 삭제할 수 없습니다.");
    }
}

public static class SlotTimeChangeForbiddenForSelectedSlot extends InterviewException {
    public SlotTimeChangeForbiddenForSelectedSlot() {
        super(HttpStatus.CONFLICT, "지원자가 선택한 슬롯의 시간은 변경할 수 없습니다. 정원만 변경할 수 있습니다.");
    }
}
```

### Response 확장 (Frontend 가 phase 표시에 활용)

`InterviewConfigResponse` 에 derived 필드 추가:
- `slotLifecyclePhase: "BEFORE_DEADLINE" | "AFTER_DEADLINE_BEFORE_ASSIGNMENT" | "AFTER_ASSIGNMENT"`

`SlotListView` 에 derived 필드 추가:
- `hasAvailability: boolean` — 해당 슬롯에 가용시간 제출이 1건 이상 있는지

이 두 필드로 frontend 는 백엔드 호출 전에 운영진에게 UI 상태 (수정 가능 필드, 삭제 가능 여부) 를 정확히 안내할 수 있다.

### 기존 가드 제거

`InterviewException.RecruitmentAlreadyStarted` 사용처 (`GeneralInterviewSlotService.createBulk`) 에서 제거. 예외 클래스 자체는 본 spec 의 cleanup 범위 외 (deprecated, 별도 PR).

## Frontend 변경

### 운영진 슬롯 관리 페이지

기존 `InterviewSlotSection` (모집 관리 페이지) 의 가드 갱신:

- 기존: `recruitmentStarted` 로컬 derive → 정책 안내
- 변경: `recruitment.interviewConfig.slotLifecyclePhase` 기준 → phase 별 UI

**Phase 1 (마감 전):** 기존 UI 그대로 — 모든 액션 허용. 단, 슬롯별 `hasAvailability=true` 면 시간 수정 비활성화 + 안내 "지원자가 선택한 슬롯이라 시간 변경이 제한됩니다. 정원만 변경 가능".

**Phase 2 (마감 ~ 배정 전):** 신규 슬롯 추가는 허용 — 상단 안내 callout 변경:
> 면접 가능시간 제출이 마감되었습니다.
> 추가 슬롯은 운영진 직권 배정 용도로 사용할 수 있습니다.
> 지원자가 선택한 슬롯의 시간/정원은 더 이상 변경할 수 없습니다.

`hasAvailability=true` 슬롯의 수정 폼 완전 비활성화 (capacity 도 X).

**Phase 3 (자동배정 완료):** 모든 액션 비활성화 + 상단 안내:
> 자동배정이 완료되었습니다.
> 슬롯 추가·수정·삭제가 잠금되었습니다.
> 면접 일정 변경은 운영진 수동 배정(개별 지원자 상세 페이지) 으로만 가능합니다.

`ManagementSlotCard` 에 `hasAvailability` 배지 + 액션 활성 상태 prop 추가.

### Phase 1 의 삭제 confirm 강화

기존 `window.confirm('이 슬롯을 삭제하시겠습니까? 이미 배정된 지원자가 있다면 영향을 받을 수 있습니다.')` 를 phase + hasAvailability 매트릭스에 맞춰 세분화:

- `hasAvailability=false`: 기존 confirm 유지
- `hasAvailability=true` (마감 전): 새 안내 — "이 슬롯은 N명의 지원자가 선택한 슬롯입니다. 삭제할 수 없습니다." 버튼 disabled (서버 가드 회피하는 client-side 보호)

### 운영진의 phase 인식

`InterviewConfigResponse.slotLifecyclePhase` 를 `useInterviewConfigQuery` 에서 노출 → 슬롯 관리 페이지 헤더에 현재 phase 표시:
- "현재: 면접 가능시간 제출 단계" / "운영진 배정 단계" / "자동배정 완료 — 잠금"

운영진이 다음 phase 진입 조건/시점을 명확히 인지할 수 있도록.

## Data Flow

### 슬롯 생성

```
Operator: POST /api/v1/recruitments/{id}/interview-slots
  └─> GeneralInterviewSlotService.createBulk
        ├─> ClubAuthService.requireManager
        ├─> InterviewConfig.canCreateSlot(now)
        │     ├─> phase 1 / 2 → OK
        │     └─> phase 3 → SlotCreationNotAllowedInCurrentPhase (409)
        └─> 슬롯 저장
```

### 슬롯 수정

```
Operator: PATCH /api/v1/interview-slots/{slotId}
  └─> GeneralInterviewSlotService.updateSlot
        ├─> InterviewSlot 조회
        ├─> InterviewConfig.canModifySlot(hasAvailability, now)
        │     ├─> phase 3 → SlotModificationNotAllowedInCurrentPhase
        │     ├─> phase 2 hasAvailability=true → SlotModificationNotAllowedInCurrentPhase
        │     ├─> phase 1 hasAvailability=true + 시간 변경 요청 → SlotTimeChangeForbiddenForSelectedSlot
        │     └─> 기타 → OK
        └─> 슬롯 update
```

### 슬롯 삭제

```
Operator: DELETE /api/v1/interview-slots/{slotId}
  └─> GeneralInterviewSlotService.deleteSlot
        ├─> InterviewConfig.canDeleteSlot(hasAvailability, now)
        │     ├─> phase 3 → SlotDeletionNotAllowedInCurrentPhase
        │     ├─> hasAvailability=true → SlotDeletionNotAllowedInCurrentPhase
        │     └─> 그 외 → OK
        └─> 슬롯 soft delete
```

## Error Handling

- 백엔드 409 (Phase 위반) → 프론트는 ApiError callout 으로 표시. 단 frontend 가 phase 정보를 미리 알 수 있으므로 거의 발생하지 않아야 함 — 발생 시점은 race condition (예: phase 전환 직후 액션 시도).
- 백엔드 가드와 프론트 UI 가드는 **이중 방어**: 프론트가 잘못 활성화한 경우 backend 가 보호.
- 슬롯별 `hasAvailability` 는 `SlotListView` 응답 시점에 derived — 프론트는 stale 한 데이터로 액션 가능. invalidation 매트릭스에 새 액션 cascade (예: availability 제출/수정 → slots 캐시 invalidate).

## Testing

### Backend

- `InterviewConfigTest` (도메인 단위)
  - `canCreateSlot` 매트릭스 (phase 1/2/3)
  - `canModifySlot` 매트릭스 (phase × hasAvailability)
  - `canDeleteSlot` 매트릭스
- `GeneralInterviewSlotServiceTest` (단위)
  - createBulk: phase 3 → 409
  - updateSlot: phase 2 hasAvailability=true → 409 / phase 1 hasAvailability=true + 시간 변경 → 409 / capacity 만 → OK
  - deleteSlot: hasAvailability=true → 409 / phase 3 → 409
- `ManagerInterviewSlotControllerTest` (RestAssured 통합)
  - 각 phase × 각 액션 매트릭스 (12 케이스)
  - phase 전환 (`availabilityDeadline` 지나기 / `assignmentCompletedAt` 마킹) 시점 변화 검증
- `InterviewAvailabilityRepositoryTest`
  - `existsBySlotIdAndDeletedAtIsNull` — soft-deleted row 제외 확인

### Frontend

- `InterviewSlotSection` RTL — 3 phase 매트릭스 × hasAvailability 매트릭스. 액션 버튼 활성/비활성 + 안내 문구 정확성
- `ManagementSlotCard` — `hasAvailability` 배지 + disabled 상태
- 운영진 페이지 헤더의 phase 인식 표시

### Manual smoke

- Phase 1 시점에 슬롯 추가/수정/삭제 — 모두 작동
- 마감 시점 지나면 자동 phase 2 진입 (백엔드 시간 기준) — UI 갱신 (refetch)
- 자동배정 실행 → phase 3 → 슬롯 액션 전부 잠금
- Override 운영진 직권 배정 (M9) 은 phase 와 무관하게 작동 (별도 도메인)

## Migration / Rollout

- **DB schema 변경 없음** — `InterviewConfig.assignmentCompletedAt` 이미 nullable 컬럼으로 존재.
- 기존 데이터 호환:
  - 신규 모집 — 즉시 새 정책 적용
  - 기존 모집 (assignmentCompletedAt 이미 있는 케이스) — phase 3 으로 처리되므로 슬롯 추가 시도가 차단됨. 운영진에게 UI 안내로 명확히 전달
  - 기존 모집 (마감일 지난 케이스) — 자동으로 phase 2 진입. 슬롯 추가가 새로 허용됨 — 기능 추가라 호환
- Frontend 응답 변경 (`slotLifecyclePhase`, `hasAvailability`) — 필드 추가만 발생, 기존 클라이언트 무영향
- 기존 `RecruitmentAlreadyStarted` 에러 메시지에 의존하는 e2e/통합 테스트가 있다면 새 예외로 갱신 필요 — search 후 확인

## Out of Scope

- `assignmentCompletedAt` 의 rollback (phase 3 → phase 2) 액션 — 자동배정 결과 무효화는 별도 도메인 액션, 별도 spec 필요. 본 spec 은 phase 진입은 일방향으로 가정.
- 재자동배정 (assignmentCompletedAt 이 이미 set 인데 다시 실행) — 현재 `AssignmentAlreadyCompleted` 로 차단됨. 본 spec 에서는 유지.
- 슬롯의 위치/메모 등 메타데이터 필드 lifecycle — 본 spec 은 시간/capacity/존재 만. (InterviewConfig 의 `location` 은 phase 와 무관하게 운영진이 항상 변경 가능 — 별도 처리)
- Audit trail (누가 언제 어떤 슬롯을 어떻게 변경했는지 기록) — 별도 후속 spec
- `RecruitmentAlreadyStarted` 예외 클래스 자체의 삭제 — 사용처 제거만 본 spec 에서, 클래스 제거는 별도 cleanup PR
- 알림 (마감 임박/배정 완료) — 별도 도메인
- 슬롯 추가 시 자동배정 알고리즘 영향 — phase 2 에서 추가된 슬롯은 availability 가 없어 어차피 알고리즘이 매칭할 후보가 없음. 결과적으로 자동배정 알고리즘 변경 불필요.

## Implementation Plan Scope (다음 단계)

`writing-plans` 스킬에서 다음 순서로 task breakdown:

1. **Backend Task A:** `InterviewConfig` 에 `canCreateSlot` / `canModifySlot` / `canDeleteSlot` + `SlotMutableFields` enum 추가 + 단위 테스트
2. **Backend Task B:** `InterviewException` 신규 4 예외 추가
3. **Backend Task C:** `InterviewAvailabilityRepository.existsBySlotIdAndDeletedAtIsNull` 추가
4. **Backend Task D:** `GeneralInterviewSlotService` 의 createBulk / updateSlot / deleteSlot 의 가드 교체 + `RecruitmentAlreadyStarted` throw 제거 + 통합 테스트
5. **Backend Task E:** `InterviewConfigResponse` 에 `slotLifecyclePhase` + `SlotListView` 에 `hasAvailability` 추가
6. **Frontend Task F:** types/api/hooks 갱신 (OpenAPI regenerate + 도메인 타입)
7. **Frontend Task G:** `InterviewSlotSection` + `ManagementSlotCard` + 운영진 페이지 헤더 phase 표시
8. **Manual smoke + 후속 cleanup PR 백로그**

Backend Task A-D 는 직접적 의존이라 순서대로. Task E 는 D 머지 후. Frontend Task F-G 는 백엔드 전체 머지 후.
