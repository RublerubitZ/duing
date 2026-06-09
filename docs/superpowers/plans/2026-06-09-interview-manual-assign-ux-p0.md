# Interview Manual Assignment UX — P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec `docs/superpowers/specs/2026-06-09-interview-manual-assign-ux-design.md` 의 P0 4건을 구현한다. 운영진 지원자 상세에 선택 슬롯/현재 배정 표시, 수동 배정 모달 (Override 토글 포함), 면접 대상 선정 액션 명칭 정리, 지원자 my-page funnel stepper.

**Architecture:** Backend 신규 endpoint 0개. 기존 `ApplicantDetailQuery` / `MyApplicationDetailQuery` 에 `interviewAvailabilities` / `assignedSlot` / `interviewAvailabilityCount` / `interviewScheduleAssigned` / `availabilityDeadline` 필드만 추가. Frontend 는 신규 컴포넌트 4개 (Stepper, ApplicantInterviewScheduleCard, ManualAssignModal, BulkPromoteDialog) 와 기존 페이지 라우트에 합류.

**Tech Stack:** Spring Boot 3.4 / Java 21 / JPA / QueryDSL / RestAssured. Next.js 15 / React 19 / TypeScript 5 / TanStack Query 5 / Tailwind / MSW + Vitest.

**Scope:** P0 만. P1 (List 행 확장, 슬롯 중심 재배정 화면) 은 본 plan 범위 밖.

**Branching:** 모든 PR 은 `develop` 분기 → `develop` PR. 1 task = 1 브랜치 = 1 PR 원칙. Backend 작업은 frontend 시작 전 머지.

---

## File Structure

### Backend (신규 생성 없음, 기존 파일 확장만)

- `backend/src/main/java/com/duing/domain/application/service/dto/query/MyApplicationDetailQuery.java` — 필드 3개 추가 + factory 시그니처 확장
- `backend/src/main/java/com/duing/domain/application/service/dto/query/ApplicantDetailQuery.java` — 필드 2개 추가 + `AvailabilityItem` 내부 record + factory 확장
- `backend/src/main/java/com/duing/domain/application/controller/dto/response/MyApplicationDetailResponse.java` — Query 와 1:1 매칭
- `backend/src/main/java/com/duing/domain/application/controller/dto/response/ApplicantDetailResponse.java` — Query 와 1:1 매칭
- `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java` — service 에서 신규 repository 호출 + factory 인자 채움
- `backend/src/main/java/com/duing/domain/interview/repository/InterviewAvailabilityRepository.java` — `findSlotItemsByApplicationId` 추가
- `backend/src/main/java/com/duing/domain/interview/repository/InterviewScheduleRepository.java` — `findAssignedSlotByApplicationId` 추가 (없으면 신규 파일)
- `backend/src/test/java/com/duing/domain/application/...Test.java` — 단위/통합 테스트

### Frontend (신규 + 기존)

- `frontend/packages/types/src/application.ts` — `AvailabilityItem`, `ApplicantDetail` / `MyApplicationDetail` 확장
- `frontend/packages/api/src/client.ts` — 응답 타입 갱신 (OpenAPI generate 후 재사용)
- `frontend/packages/hooks/src/applications.ts` — 기존 훅 invalidation 매트릭스 갱신
- `frontend/apps/web/app/users/me/applications/[applicationId]/_components/ApplicationStepper.tsx` — 신규
- `frontend/apps/web/app/users/me/applications/[applicationId]/_utils/deriveStepperSubState.ts` — 신규
- `frontend/apps/web/app/users/me/applications/[applicationId]/page.tsx` — Stepper 합류
- `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ApplicantInterviewScheduleCard.tsx` — 신규
- `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ManualAssignModal.tsx` — 신규
- `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/page.tsx` — 카드 + 모달 wiring
- `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/BulkPromoteDialog.tsx` — 신규 (또는 기존 BulkStatusAction 내부 분리)
- `frontend/apps/web/components/status/ApplicationStatusBadge.tsx` (또는 기존 위치) — 라벨 정리
- `frontend/apps/web/test/...` — RTL + MSW 테스트

---

## Task Sequencing

```
Task 1 (Backend P0-1) ──┐
Task 2 (Backend P0-2) ──┴──> Task 3 (FE foundation) ──┬──> Task 4 (FE Stepper)
                                                      ├──> Task 5 (FE Applicant card)
                                                      ├──> Task 6 (FE Manual Assign Modal)
                                                      └──> Task 7 (FE Promote action + badge)
```

Task 1, 2 는 병렬 가능. Task 3 은 Task 1+2 머지 후. Task 4~7 은 Task 3 머지 후 병렬 가능.

---

### Task 1: Backend P0-1 — MyApplicationDetail 확장 (지원자 stepper 데이터)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/service/dto/query/MyApplicationDetailQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/application/controller/dto/response/MyApplicationDetailResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/repository/InterviewAvailabilityRepository.java` (count by applicationId)
- Create or Modify: `backend/src/main/java/com/duing/domain/interview/repository/InterviewScheduleRepository.java` (existsByApplicationId)
- Modify: `backend/src/main/java/com/duing/domain/recruitment/repository/InterviewConfigRepository.java` 또는 service 경유 (availabilityDeadline 조회)
- Test: `backend/src/test/java/com/duing/domain/application/service/MyApplicationDetailQueryTest.java`
- Test: `backend/src/test/java/com/duing/domain/application/controller/MyApplicationControllerStepperTest.java`

- [ ] **Step 1: Repository 메서드 시그니처 정의 (interface)**

```java
// InterviewAvailabilityRepository
long countByApplicationIdAndDeletedAtIsNull(Long applicationId);

// InterviewScheduleRepository
boolean existsByApplicationIdAndDeletedAtIsNull(Long applicationId);
```

`@SQLRestriction` 이 JPQL 에 자동 적용되므로 `existsByApplicationId` / `countByApplicationId` 형태도 작동하지만, 의도를 명시적으로 드러내기 위해 `AndDeletedAtIsNull` 접미사 사용 (기존 컨벤션 확인 후 일치시킬 것).

- [ ] **Step 2: Query DTO 필드 추가 (factory 확장, backward compat 유지)**

```java
public record MyApplicationDetailQuery(
        Long id,
        Long recruitmentId,
        String recruitmentTitle,
        Long clubId,
        String clubName,
        List<String> questions,
        List<String> answers,
        ApplicationStatus status,
        LocalDateTime interviewAt,
        String interviewLocation,
        LocalDateTime submittedAt,
        int interviewAvailabilityCount,
        boolean interviewScheduleAssigned,
        LocalDateTime availabilityDeadline
) {
    public static MyApplicationDetailQuery from(Application application) {
        return fromAll(application, 0, false, null);
    }

    public static MyApplicationDetailQuery fromAll(
            Application application,
            int interviewAvailabilityCount,
            boolean interviewScheduleAssigned,
            LocalDateTime availabilityDeadline
    ) {
        var recruitment = application.getRecruitment();
        var club = recruitment.getClub();
        RecruitmentForm form = recruitment.getForm();
        return new MyApplicationDetailQuery(
                application.getId(),
                recruitment.getId(),
                recruitment.getTitle(),
                club.getId(),
                club.getName(),
                form == null ? List.of() : form.getQuestions(),
                application.getAnswers(),
                application.getStatus(),
                application.getInterviewAt(),
                application.getInterviewLocation(),
                application.getCreatedAt(),
                interviewAvailabilityCount,
                interviewScheduleAssigned,
                availabilityDeadline
        );
    }
}
```

- [ ] **Step 3: Service 에서 신규 필드 채움**

`GeneralApplicationService.getMyApplicationDetail` 에서:
```java
long count = interviewAvailabilityRepository
        .countByApplicationIdAndDeletedAtIsNull(applicationId);
boolean scheduleAssigned = interviewScheduleRepository
        .existsByApplicationIdAndDeletedAtIsNull(applicationId);
LocalDateTime availabilityDeadline = recruitment.isUseInterview()
        ? interviewConfigRepository.findByRecruitmentId(recruitment.getId())
                .map(InterviewConfig::getAvailabilityDeadline)
                .orElse(null)
        : null;

return MyApplicationDetailQuery.fromAll(
        application,
        (int) count,
        scheduleAssigned,
        availabilityDeadline
);
```

- [ ] **Step 4: Response DTO 매칭**

```java
public record MyApplicationDetailResponse(
        // ...existing,
        int interviewAvailabilityCount,
        boolean interviewScheduleAssigned,
        LocalDateTime availabilityDeadline
) {
    public static MyApplicationDetailResponse from(MyApplicationDetailQuery q) {
        return new MyApplicationDetailResponse(
                // ...existing,
                q.interviewAvailabilityCount(),
                q.interviewScheduleAssigned(),
                q.availabilityDeadline()
        );
    }
}
```

- [ ] **Step 5: 단위 테스트 — MyApplicationDetailQuery factory 매트릭스**

```java
@Test
void fromAll_populates_interview_fields() {
    Application app = ...;  // status INTERVIEW_PENDING
    MyApplicationDetailQuery q = MyApplicationDetailQuery.fromAll(
            app, 3, false, LocalDateTime.of(2026, 6, 15, 18, 0));
    assertThat(q.interviewAvailabilityCount()).isEqualTo(3);
    assertThat(q.interviewScheduleAssigned()).isFalse();
    assertThat(q.availabilityDeadline()).isEqualTo(LocalDateTime.of(2026, 6, 15, 18, 0));
}

@Test
void from_backward_compat_defaults_zero_false_null() {
    MyApplicationDetailQuery q = MyApplicationDetailQuery.from(application);
    assertThat(q.interviewAvailabilityCount()).isZero();
    assertThat(q.interviewScheduleAssigned()).isFalse();
    assertThat(q.availabilityDeadline()).isNull();
}
```

- [ ] **Step 6: 통합 테스트 (RestAssured) — endpoint 가 신규 필드 노출**

```java
@Test
void getMyApplicationDetail_returns_interview_fields() {
    given().spec(authSpec(userToken))
        .when().get("/api/v1/users/me/applications/{id}", applicationId)
        .then()
        .statusCode(200)
        .body("data.interviewAvailabilityCount", equalTo(2))
        .body("data.interviewScheduleAssigned", equalTo(false))
        .body("data.availabilityDeadline", equalTo("2026-06-15T18:00:00"));
}

@Test
void getMyApplicationDetail_useInterview_false_returns_null_deadline() {
    // setup recruitment with useInterview=false
    given().spec(authSpec(userToken))
        .when().get("/api/v1/users/me/applications/{id}", applicationId)
        .then()
        .body("data.availabilityDeadline", nullValue());
}
```

- [ ] **Step 7: 테스트 실행 + commit**

```bash
./gradlew :backend:test --tests "MyApplicationDetailQueryTest" --tests "MyApplicationControllerStepperTest"
git add -A && git commit -m "feat(application): MyApplicationDetail 에 interview 진행 필드 추가 (Spec P0-1)"
```

- [ ] **Step 8: PR 생성 (develop)**

PR 본문: 🚀 / 🤔 / 💬 3 섹션. spec 링크 명시. 자동 머지 금지.

---

### Task 2: Backend P0-2 — ApplicantDetail 확장 (운영진 시점 선택 슬롯/현재 배정)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/service/dto/query/ApplicantDetailQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/application/controller/dto/response/ApplicantDetailResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/repository/InterviewAvailabilityRepository.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/repository/InterviewScheduleRepository.java`
- Test: `backend/src/test/java/com/duing/domain/application/service/ApplicantDetailQueryTest.java`
- Test: `backend/src/test/java/com/duing/domain/application/controller/LeaderApplicantDetailInterviewTest.java`

- [ ] **Step 1: AvailabilityItem 공용 record 위치 결정**

`ApplicantDetailQuery` 의 내부 record 로 두되 별도 패키지에 옮길 수 있도록 nested 가독성 유지. 위치: `ApplicantDetailQuery.AvailabilityItem`. P1 에서 `ApplicantQuery` 재사용을 고려하면 `application/service/dto/query/AvailabilityItem.java` 별도 파일로 두는 것도 가능 — 본 plan 은 nested record 채택, P1 단계에서 필요 시 추출.

```java
public record AvailabilityItem(
        Long slotId,
        LocalDateTime startTime,
        LocalDateTime endTime
) {}
```

- [ ] **Step 2: Query DTO 확장**

```java
public record ApplicantDetailQuery(
        // ...existing,
        List<AvailabilityItem> interviewAvailabilities,
        AvailabilityItem assignedSlot
) {
    public static ApplicantDetailQuery fromAll(
            Application application,
            List<ApplicationStatusHistory> historyRows,
            List<ApplicationEvaluation> allEvaluations,
            Long currentUserId,
            List<AvailabilityItem> interviewAvailabilities,
            AvailabilityItem assignedSlot
    ) {
        // existing mapping...
        return new ApplicantDetailQuery(
                // ...existing,
                interviewAvailabilities,
                assignedSlot
        );
    }
}
```

기존 호출자 backward compat 을 위해 기존 `fromAll` 시그니처는 deprecated 표시 후 빈 리스트/null 로 위임하는 overload 유지. 또는 호출자 (`GeneralApplicationService.getApplicantDetail`) 한 곳만 신규 시그니처로 일괄 이전.

- [ ] **Step 3: Repository 신규 메서드**

```java
// InterviewAvailabilityRepository (QueryDSL)
List<AvailabilityItem> findAvailabilityItemsByApplicationId(Long applicationId);
// 구현: interview_availability ia JOIN interview_slot s ON s.id = ia.slot_id
//      WHERE ia.application_id = :id AND ia.deleted_at IS NULL AND s.deleted_at IS NULL
//      ORDER BY s.start_time ASC

// InterviewScheduleRepository (QueryDSL)
Optional<AvailabilityItem> findAssignedSlotByApplicationId(Long applicationId);
// 구현: interview_schedule sc JOIN interview_slot s ON s.id = sc.slot_id
//      WHERE sc.application_id = :id AND sc.deleted_at IS NULL AND s.deleted_at IS NULL
```

QueryDSL projection 으로 `Projections.constructor(AvailabilityItem.class, slot.id, slot.startTime, slot.endTime)` 사용.

- [ ] **Step 4: Service 에서 호출 + 매핑**

```java
public ApplicantDetailQuery getApplicantDetail(Long applicationId, Long currentUserId) {
    // ...existing
    List<AvailabilityItem> availabilities = interviewAvailabilityRepository
            .findAvailabilityItemsByApplicationId(applicationId);
    AvailabilityItem assigned = interviewScheduleRepository
            .findAssignedSlotByApplicationId(applicationId)
            .orElse(null);
    return ApplicantDetailQuery.fromAll(
            application, historyRows, evaluations, currentUserId,
            availabilities, assigned);
}
```

- [ ] **Step 5: Response DTO 매칭**

`ApplicantDetailResponse` 에 동일 필드 추가 + `AvailabilityItem` 그대로 반환 (또는 response 측 record 로 한 번 더 wrap — 기존 컨벤션 따름).

- [ ] **Step 6: 단위 테스트 — Query factory 매트릭스**

```java
@Test
void interviewAvailabilities_empty_when_none_selected() {
    var q = ApplicantDetailQuery.fromAll(app, List.of(), List.of(), null, List.of(), null);
    assertThat(q.interviewAvailabilities()).isEmpty();
    assertThat(q.assignedSlot()).isNull();
}

@Test
void interviewAvailabilities_preserves_startTime_asc() {
    var items = List.of(
            new AvailabilityItem(2L, LocalDateTime.of(2026,6,10,14,0), LocalDateTime.of(2026,6,10,14,30)),
            new AvailabilityItem(1L, LocalDateTime.of(2026,6,10,13,0), LocalDateTime.of(2026,6,10,13,30))
    );
    var q = ApplicantDetailQuery.fromAll(app, List.of(), List.of(), null, items, null);
    assertThat(q.interviewAvailabilities()).hasSize(2);
    // 정렬 보장은 repository 책임이므로 query 는 그대로 통과
}

@Test
void assignedSlot_present_when_scheduled() {
    var assigned = new AvailabilityItem(5L, LocalDateTime.of(2026,6,10,18,0), LocalDateTime.of(2026,6,10,18,30));
    var q = ApplicantDetailQuery.fromAll(app, List.of(), List.of(), null, List.of(), assigned);
    assertThat(q.assignedSlot()).isEqualTo(assigned);
}
```

- [ ] **Step 7: 통합 테스트 (RestAssured)**

```java
@Test
void leader_getApplicantDetail_returns_interview_fields() {
    // setup: availability 2개 + schedule 1개
    given().spec(authSpec(leaderToken))
        .when().get("/api/v1/leader/applications/{id}", applicationId)
        .then().statusCode(200)
        .body("data.interviewAvailabilities", hasSize(2))
        .body("data.interviewAvailabilities[0].slotId", notNullValue())
        .body("data.assignedSlot.slotId", equalTo(slot.getId().intValue()));
}

@Test
void leader_getApplicantDetail_no_availability_returns_empty() {
    given().spec(authSpec(leaderToken))
        .when().get("/api/v1/leader/applications/{id}", applicationId)
        .then()
        .body("data.interviewAvailabilities", hasSize(0))
        .body("data.assignedSlot", nullValue());
}
```

- [ ] **Step 8: 테스트 실행 + commit + PR**

```bash
./gradlew :backend:test --tests "ApplicantDetailQueryTest" --tests "LeaderApplicantDetailInterviewTest"
git add -A && git commit -m "feat(application): ApplicantDetail 에 interviewAvailabilities/assignedSlot 추가 (Spec P0-2)"
```

PR 생성. 자동 머지 금지.

---

### Task 3: Frontend foundation — types/api/hooks 갱신

> Task 1, 2 머지 후 시작. OpenAPI generate 가 backend 응답 변경을 자동 반영하지만, 도메인 타입 별칭과 query invalidation 매트릭스는 손으로 정리.

**Files:**
- Modify: `frontend/packages/types/src/application.ts`
- Modify: `frontend/packages/types/src/interview.ts` (또는 application 에 통합)
- Modify: `frontend/packages/api/src/client.ts` (OpenAPI generate 후 type re-export)
- Modify: `frontend/packages/hooks/src/applications.ts` (invalidation 갱신)
- Modify: `frontend/packages/hooks/src/interview.ts` (assignSchedule 의 invalidation 에 ApplicantDetail 추가)
- Test: `frontend/apps/web/test/types/applicationDetail.spec.ts` (있다면 갱신)

- [ ] **Step 1: OpenAPI schema regenerate**

```bash
cd frontend && pnpm --filter @duing/api openapi:generate
```

생성된 components 타입에 `interviewAvailabilities`, `assignedSlot`, `interviewAvailabilityCount`, `interviewScheduleAssigned`, `availabilityDeadline` 가 포함됨을 확인.

- [ ] **Step 2: 도메인 타입 별칭 추가**

`packages/types/src/application.ts`:

```ts
import type { components } from '@duing/api/openapi';

export type AvailabilityItem = components['schemas']['AvailabilityItemResponse'];
export type ApplicantDetail = components['schemas']['ApplicantDetailResponse'];
export type MyApplicationDetail = components['schemas']['MyApplicationDetailResponse'];
```

> 실제 schema 이름은 OpenAPI generate 결과를 보고 맞춤. 추가 narrowing 필요 시 별도 type 분리.

- [ ] **Step 3: Invalidation 매트릭스 갱신**

`packages/hooks/src/interview.ts` 의 `useAssignInterviewScheduleMutation` / `useCancelInterviewScheduleMutation` 의 `onSuccess` 에서 invalidation 항목에 다음을 추가:
- `applicationQueryKeys.leaderDetail(applicationId)` — ApplicantDetail
- `applicationQueryKeys.myDetail(applicationId)` — 지원자 stepper (assignedSlot 갱신 반영)

이미 ScheduleManagement / slots 는 invalidation 되어 있을 것 (PR-FE5 에서 추가됨). 신규 항목만 보강.

- [ ] **Step 4: 빌드 + typecheck**

```bash
pnpm --filter @duing/web typecheck
pnpm --filter @duing/web build
```

- [ ] **Step 5: commit + PR**

```bash
git add -A && git commit -m "feat(types): interview 진행/배정 필드 타입 갱신 + invalidation 매트릭스 정리 (Spec P0)"
```

PR 생성. 자동 머지 금지.

---

### Task 4: Frontend P0-1 — 지원자 stepper

> Task 3 머지 후 시작. Task 5, 6, 7 과 병렬 가능.

**Files:**
- Create: `frontend/apps/web/app/users/me/applications/[applicationId]/_utils/deriveStepperSubState.ts`
- Create: `frontend/apps/web/app/users/me/applications/[applicationId]/_components/ApplicationStepper.tsx`
- Modify: `frontend/apps/web/app/users/me/applications/[applicationId]/page.tsx`
- Test: `frontend/apps/web/test/users/me/applications/deriveStepperSubState.spec.ts`
- Test: `frontend/apps/web/test/users/me/applications/ApplicationStepper.spec.tsx`

- [ ] **Step 1: 실패하는 util 단위 테스트 작성**

```ts
import { describe, it, expect } from 'vitest';
import { deriveStepperSubState } from '@/app/users/me/applications/[applicationId]/_utils/deriveStepperSubState';

describe('deriveStepperSubState', () => {
  const now = new Date('2026-06-09T10:00:00');

  it('returns "slot-select-pending" when no availability and deadline not passed', () => {
    expect(deriveStepperSubState({
      interviewAvailabilityCount: 0,
      interviewScheduleAssigned: false,
      availabilityDeadline: '2026-06-15T18:00:00',
      now,
    })).toBe('slot-select-pending');
  });

  it('returns "slot-submitted" when availability exists and no schedule', () => {
    expect(deriveStepperSubState({
      interviewAvailabilityCount: 3,
      interviewScheduleAssigned: false,
      availabilityDeadline: '2026-06-15T18:00:00',
      now,
    })).toBe('slot-submitted');
  });

  it('returns "slot-deadline-passed" when no availability and deadline passed', () => {
    expect(deriveStepperSubState({
      interviewAvailabilityCount: 0,
      interviewScheduleAssigned: false,
      availabilityDeadline: '2026-06-01T18:00:00',
      now,
    })).toBe('slot-deadline-passed');
  });

  it('returns "slot-select-pending" when deadline is null (no useInterview)', () => {
    expect(deriveStepperSubState({
      interviewAvailabilityCount: 0,
      interviewScheduleAssigned: false,
      availabilityDeadline: null,
      now,
    })).toBe('slot-select-pending');
  });
});
```

- [ ] **Step 2: util 구현**

```ts
export type StepperSubState =
  | 'slot-select-pending'
  | 'slot-submitted'
  | 'slot-deadline-passed';

type Input = {
  interviewAvailabilityCount: number;
  interviewScheduleAssigned: boolean;
  availabilityDeadline: string | null;
  now: Date;
};

export function deriveStepperSubState({
  interviewAvailabilityCount,
  interviewScheduleAssigned,
  availabilityDeadline,
  now,
}: Input): StepperSubState {
  if (interviewAvailabilityCount > 0 && !interviewScheduleAssigned) {
    return 'slot-submitted';
  }
  if (
    interviewAvailabilityCount === 0 &&
    availabilityDeadline !== null &&
    new Date(availabilityDeadline) < now
  ) {
    return 'slot-deadline-passed';
  }
  return 'slot-select-pending';
}
```

- [ ] **Step 3: util 테스트 통과 확인**

```bash
pnpm --filter @duing/web test deriveStepperSubState
```

- [ ] **Step 4: ApplicationStepper 컴포넌트 — 실패 RTL 테스트**

```tsx
import { render, screen } from '@testing-library/react';
import { ApplicationStepper } from '@/app/users/me/applications/[applicationId]/_components/ApplicationStepper';

describe('ApplicationStepper', () => {
  it('renders SUBMITTED step as active', () => {
    render(<ApplicationStepper detail={{
      status: 'SUBMITTED',
      interviewAvailabilityCount: 0,
      interviewScheduleAssigned: false,
      availabilityDeadline: null,
    }} now={new Date('2026-06-09T10:00:00')} />);
    expect(screen.getByText('지원 완료')).toHaveAttribute('aria-current', 'step');
  });

  it('shows step 3 with "가능시간 제출 완료" sub-state when availability submitted', () => {
    render(<ApplicationStepper detail={{
      status: 'INTERVIEW_PENDING',
      interviewAvailabilityCount: 3,
      interviewScheduleAssigned: false,
      availabilityDeadline: '2026-06-15T18:00:00',
    }} now={new Date('2026-06-09T10:00:00')} />);
    expect(screen.getByText('면접 대상')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText(/면접 가능 시간 3개를 제출했습니다/)).toBeInTheDocument();
  });

  it('shows step 4 active when schedule assigned', () => {
    render(<ApplicationStepper detail={{
      status: 'INTERVIEW_PENDING',
      interviewAvailabilityCount: 3,
      interviewScheduleAssigned: true,
      availabilityDeadline: '2026-06-15T18:00:00',
    }} now={new Date('2026-06-09T10:00:00')} />);
    expect(screen.getByText('면접 일정 배정 완료')).toHaveAttribute('aria-current', 'step');
  });
});
```

- [ ] **Step 5: ApplicationStepper 컴포넌트 구현**

```tsx
'use client';
import type { MyApplicationDetail } from '@duing/types';
import { deriveStepperSubState } from '../_utils/deriveStepperSubState';

const STEPS = [
  { key: 'submitted', label: '지원 완료' },
  { key: 'under-review', label: '서류 검토 중' },
  { key: 'interview-pending', label: '면접 대상' },
  { key: 'interview-assigned', label: '면접 일정 배정 완료' },
  { key: 'finalized', label: '최종 결과' },
] as const;

const SUB_STATE_MESSAGE: Record<
  ReturnType<typeof deriveStepperSubState>,
  (count: number) => string
> = {
  'slot-select-pending': () =>
    '운영진이 면접 대상으로 선정했습니다. 면접 가능 시간을 선택해 주세요.',
  'slot-submitted': (count) =>
    `면접 가능 시간 ${count}개를 제출했습니다. 운영진이 일정을 배정 중입니다.`,
  'slot-deadline-passed': () =>
    '면접 가능 시간 제출이 마감되었습니다. 운영진과 별도 연락이 있을 수 있습니다.',
};

type Props = {
  detail: Pick<
    MyApplicationDetail,
    'status' | 'interviewAvailabilityCount' | 'interviewScheduleAssigned' | 'availabilityDeadline'
  >;
  now?: Date;
};

export function ApplicationStepper({ detail, now = new Date() }: Props) {
  const activeIndex = deriveActiveStepIndex(detail);
  const finalizedLabel =
    detail.status === 'ACCEPTED' ? '최종 합격'
    : detail.status === 'REJECTED' ? '최종 불합격'
    : '최종 결과';
  const subState = activeIndex === 2 ? deriveStepperSubState({
    interviewAvailabilityCount: detail.interviewAvailabilityCount,
    interviewScheduleAssigned: detail.interviewScheduleAssigned,
    availabilityDeadline: detail.availabilityDeadline,
    now,
  }) : null;

  return (
    <ol className="...">
      {STEPS.map((step, index) => (
        <li
          key={step.key}
          aria-current={index === activeIndex ? 'step' : undefined}
          className={index <= activeIndex ? 'active' : 'inactive'}
        >
          {step.key === 'finalized' ? finalizedLabel : step.label}
        </li>
      ))}
      {subState && (
        <p className="mt-3 text-sm text-slate-600">
          {SUB_STATE_MESSAGE[subState](detail.interviewAvailabilityCount)}
        </p>
      )}
    </ol>
  );
}

function deriveActiveStepIndex(detail: Props['detail']): number {
  switch (detail.status) {
    case 'SUBMITTED': return 0;
    case 'UNDER_REVIEW': return 1;
    case 'INTERVIEW_PENDING':
      return detail.interviewScheduleAssigned ? 3 : 2;
    case 'ACCEPTED':
    case 'REJECTED':
      return 4;
    default: return 0;
  }
}
```

- [ ] **Step 6: RTL 테스트 통과 확인**

```bash
pnpm --filter @duing/web test ApplicationStepper
```

- [ ] **Step 7: page.tsx 에 Stepper 합류**

기존 `users/me/applications/[applicationId]/page.tsx` 상단에 `<ApplicationStepper detail={detail} />` 배치.

- [ ] **Step 8: 수동 smoke (dev server 기동 + 로그인 → 본인 지원서 진입 → 각 단계 노출 확인)**

```bash
pnpm --filter @duing/web dev
# 브라우저에서 ApplicationStatus 별 stepper / sub-state 노출 매트릭스 확인
```

- [ ] **Step 9: commit + PR**

```bash
git add -A && git commit -m "feat(application): 지원자 my-page funnel stepper + sub-state 안내 (Spec P0-1)"
```

PR 생성. 자동 머지 금지.

---

### Task 5: Frontend P0-2 — 운영진 지원자 상세의 면접 일정 카드

> Task 3 머지 후 시작. Task 4, 6, 7 과 병렬 가능.

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ApplicantInterviewScheduleCard.tsx`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/page.tsx`
- Test: `frontend/apps/web/test/manage/applicants/ApplicantInterviewScheduleCard.spec.tsx`

- [ ] **Step 1: 실패 RTL 테스트 — 4 매트릭스**

```tsx
import { render, screen } from '@testing-library/react';
import { ApplicantInterviewScheduleCard } from '...';

describe('ApplicantInterviewScheduleCard', () => {
  const slotA = { slotId: 1, startTime: '2026-06-13T18:00:00', endTime: '2026-06-13T18:30:00' };
  const slotB = { slotId: 2, startTime: '2026-06-13T18:30:00', endTime: '2026-06-13T19:00:00' };

  it('renders empty state when no availability and no assigned', () => {
    render(<ApplicantInterviewScheduleCard
      interviewAvailabilities={[]}
      assignedSlot={null}
      onOpenManualAssign={() => {}}
    />);
    expect(screen.getByText('미배정')).toBeInTheDocument();
    expect(screen.getByText('아직 선택하지 않았습니다')).toBeInTheDocument();
  });

  it('marks the assigned slot inside the availabilities list', () => {
    render(<ApplicantInterviewScheduleCard
      interviewAvailabilities={[slotA, slotB]}
      assignedSlot={slotA}
      onOpenManualAssign={() => {}}
    />);
    const assignedRow = screen.getByText(/6\/13.*18:00/).closest('li');
    expect(assignedRow).toHaveTextContent('현재 배정');
  });

  it('shows "수동 배정 변경" button that triggers onOpenManualAssign', () => {
    const onOpen = vi.fn();
    render(<ApplicantInterviewScheduleCard ... onOpenManualAssign={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: '수동 배정 변경' }));
    expect(onOpen).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 컴포넌트 구현**

```tsx
'use client';
import type { AvailabilityItem } from '@duing/types';
import { formatSlotLabel } from '@/components/interview/_utils/formatSlot';

type Props = {
  interviewAvailabilities: AvailabilityItem[];
  assignedSlot: AvailabilityItem | null;
  onOpenManualAssign: () => void;
};

export function ApplicantInterviewScheduleCard({
  interviewAvailabilities,
  assignedSlot,
  onOpenManualAssign,
}: Props) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold">면접 일정</h2>
        <button
          type="button"
          onClick={onOpenManualAssign}
          className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
        >
          수동 배정 변경
        </button>
      </header>

      <dl className="mt-4 space-y-3">
        <div>
          <dt className="text-xs text-slate-500">현재 배정</dt>
          <dd className="mt-1 text-sm text-slate-900">
            {assignedSlot ? formatSlotLabel(assignedSlot) : '미배정'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">
            지원자가 선택한 면접 가능 시간 ({interviewAvailabilities.length}개)
          </dt>
          <dd className="mt-1">
            {interviewAvailabilities.length === 0 ? (
              <p className="text-sm text-slate-500">아직 선택하지 않았습니다</p>
            ) : (
              <ul className="space-y-1">
                {interviewAvailabilities.map((item) => (
                  <li key={item.slotId} className="flex items-center gap-2 text-sm">
                    <span>{formatSlotLabel(item)}</span>
                    {assignedSlot?.slotId === item.slotId && (
                      <span className="rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
                        현재 배정
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
```

`formatSlotLabel` 은 기존 `components/interview/_utils/` 의 wall-clock format 유틸 재사용 (PR-FE3 에서 만든 유틸). 없으면 신규로 `(item) => "M/D (요일) HH:mm – HH:mm"` 작성.

- [ ] **Step 3: RTL 통과 확인**

```bash
pnpm --filter @duing/web test ApplicantInterviewScheduleCard
```

- [ ] **Step 4: page.tsx 에 카드 합류 + Modal 자리 표시 (Task 6 에서 실제 wiring)**

기존 ApplicantDetail page 에 카드 배치. 일단 `onOpenManualAssign={() => alert('TODO: modal')}` placeholder (Task 6 에서 교체) — **단, placeholder 라도 commit 직전엔 실제 모달 wiring 으로 교체되어야 함**. 본 Task 단독 머지 가능하게 하려면 placeholder 가 아닌 임시 `useState` + 빈 modal 도 가능.

본 plan 은 단순화를 위해 **Task 5 머지 시점에 button 만 disabled 노출**, Task 6 PR 에서 modal wiring 까지 한 번에 진행. button 클릭 시점에 콘솔 경고만:

```tsx
const [showManualAssign, setShowManualAssign] = useState(false);
// ...
<ApplicantInterviewScheduleCard
  interviewAvailabilities={detail.interviewAvailabilities}
  assignedSlot={detail.assignedSlot}
  onOpenManualAssign={() => setShowManualAssign(true)}
/>
{showManualAssign && (
  <p className="text-xs text-slate-400">모달은 다음 PR 에서 추가됩니다.</p>
)}
```

(또는 Task 5, 6 을 하나의 PR 로 묶는 것을 고려. spec 의 1 PR = 1 단위 원칙은 "독립 기능" 기준이므로 카드+모달은 같은 단위로 봐도 무방. 본 plan 은 분리 유지 — 카드만 먼저 머지하면 detail 응답 변경의 가시화가 빨라짐.)

- [ ] **Step 5: 수동 smoke**

운영진 로그인 → 지원자 상세 진입 → 4 매트릭스 시각 확인.

- [ ] **Step 6: commit + PR**

```bash
git add -A && git commit -m "feat(manage): 운영진 지원자 상세에 면접 일정 카드 추가 (Spec P0-2)"
```

PR 생성. 자동 머지 금지.

---

### Task 6: Frontend P0-3 — 수동 배정 모달 + Override 토글

> Task 5 머지 후 시작. Task 4, 7 과 병렬 가능.

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ManualAssignModal.tsx`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/page.tsx`
- Test: `frontend/apps/web/test/manage/applicants/ManualAssignModal.spec.tsx`

- [ ] **Step 1: 실패 RTL 테스트 매트릭스**

```tsx
describe('ManualAssignModal', () => {
  it('renders only interviewAvailabilities when toggle is off', () => {
    // setup: availabilities = [slotA, slotB], all slots = [slotA, slotB, slotC]
    render(<ManualAssignModal ... />);
    expect(screen.getByText(/slotA label/)).toBeInTheDocument();
    expect(screen.queryByText(/slotC label/)).not.toBeInTheDocument();
  });

  it('lazy-fetches all slots when toggle turned on', async () => {
    // MSW handler counts fetch invocations
    render(<ManualAssignModal ... />);
    expect(slotsFetchCount).toBe(0);
    fireEvent.click(screen.getByRole('switch', { name: /선택하지 않은 슬롯도 보기/ }));
    await waitFor(() => expect(slotsFetchCount).toBe(1));
    expect(screen.getByText(/slotC label/)).toBeInTheDocument();
  });

  it('shows empty state when no availabilities and toggle off', () => {
    render(<ManualAssignModal interviewAvailabilities={[]} ... />);
    expect(screen.getByText(/지원자가 면접 가능 시간을 제출하지 않았습니다/)).toBeInTheDocument();
  });

  it('opens override confirm when assigning a non-selected slot', async () => {
    render(<ManualAssignModal ... />);
    // turn on toggle, click slotC, click 배정
    // expect confirm dialog text
    expect(await screen.findByText(/지원자가 선택하지 않은 시간입니다/)).toBeInTheDocument();
    expect(screen.getByText(/이 시간으로 배정하면 지원자가 참석하기 어려울 수 있습니다/)).toBeInTheDocument();
  });

  it('skips confirm when assigning a selected slot', async () => {
    render(<ManualAssignModal ... />);
    fireEvent.click(screen.getByText(/slotA label/));
    fireEvent.click(screen.getByRole('button', { name: '배정' }));
    expect(screen.queryByText(/계속 진행하시겠습니까/)).not.toBeInTheDocument();
    await waitFor(() => expect(mutationFn).toHaveBeenCalledWith({ slotId: slotA.slotId }));
  });

  it('shows mutation error inside modal', async () => {
    // MSW returns 409
    render(<ManualAssignModal ... />);
    fireEvent.click(screen.getByText(/slotA/));
    fireEvent.click(screen.getByRole('button', { name: '배정' }));
    expect(await screen.findByText(/슬롯이 이미 가득 찼습니다/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 컴포넌트 구현**

```tsx
'use client';
import { useState } from 'react';
import { useInterviewSlotsQuery } from '@duing/hooks';
import { useAssignInterviewScheduleMutation } from '@duing/hooks';
import type { AvailabilityItem } from '@duing/types';
import { ApiError } from '@duing/api';
import { formatSlotLabel } from '@/components/interview/_utils/formatSlot';

type Props = {
  applicationId: number;
  recruitmentId: number;
  interviewAvailabilities: AvailabilityItem[];
  assignedSlotId: number | null;
  onClose: () => void;
};

export function ManualAssignModal({
  applicationId, recruitmentId, interviewAvailabilities, assignedSlotId, onClose,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(assignedSlotId);
  const [overrideConfirm, setOverrideConfirm] = useState<{ slotId: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const allSlotsQuery = useInterviewSlotsQuery(recruitmentId, { enabled: showAll });
  const assignMutation = useAssignInterviewScheduleMutation(applicationId);

  const availabilitySlotIds = new Set(interviewAvailabilities.map((it) => it.slotId));
  const nonAvailabilitySlots = (allSlotsQuery.data ?? []).filter(
    (slot) => !availabilitySlotIds.has(slot.slotId),
  );

  const handleAssign = () => {
    setErrorMessage(null);
    if (selectedSlotId == null) return;
    if (!availabilitySlotIds.has(selectedSlotId)) {
      setOverrideConfirm({ slotId: selectedSlotId });
      return;
    }
    runAssign(selectedSlotId);
  };

  const runAssign = (slotId: number) => {
    assignMutation.mutate({ slotId }, {
      onSuccess: () => {
        setOverrideConfirm(null);
        onClose();
      },
      onError: (error: unknown) => {
        const message = error instanceof ApiError ? error.message : '배정에 실패했습니다.';
        setErrorMessage(message);
        setOverrideConfirm(null);
      },
    });
  };

  return (
    <div role="dialog" aria-modal="true" className="...">
      {/* header, current assignment */}
      {/* interviewAvailabilities list */}
      {interviewAvailabilities.length === 0 && !showAll && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p>지원자가 면접 가능 시간을 제출하지 않았습니다.</p>
          <p>제출 마감 전이라면 제출을 요청하세요.</p>
          <p>긴급한 경우 아래 토글을 통해 운영진이 직접 배정할 수 있습니다.</p>
        </div>
      )}

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          role="switch"
          checked={showAll}
          onChange={(event) => setShowAll(event.currentTarget.checked)}
        />
        선택하지 않은 슬롯도 보기
      </label>

      {showAll && allSlotsQuery.isLoading && <p>슬롯을 불러오는 중…</p>}
      {showAll && allSlotsQuery.isError && (
        <div role="alert">슬롯을 불러오지 못했습니다. 토글을 다시 켜주세요.</div>
      )}
      {showAll && allSlotsQuery.data && nonAvailabilitySlots.length > 0 && (
        <ul>
          {nonAvailabilitySlots.map((slot) => (
            <li key={slot.slotId}>
              <label className="flex items-center gap-2 text-amber-800">
                <input
                  type="radio"
                  name="slot"
                  value={slot.slotId}
                  checked={selectedSlotId === slot.slotId}
                  onChange={() => setSelectedSlotId(slot.slotId)}
                />
                ⚠ {formatSlotLabel(slot)} — 지원자가 선택하지 않은 시간입니다
              </label>
            </li>
          ))}
        </ul>
      )}

      {errorMessage && (
        <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose}>취소</button>
        <button
          type="button"
          onClick={handleAssign}
          disabled={selectedSlotId == null || assignMutation.isPending}
        >
          배정
        </button>
      </div>

      {overrideConfirm && (
        <ConfirmDialog
          title="지원자가 선택하지 않은 시간입니다."
          message={`이 시간으로 배정하면 지원자가 참석하기 어려울 수 있습니다.\n계속 진행하시겠습니까?`}
          onConfirm={() => runAssign(overrideConfirm.slotId)}
          onCancel={() => setOverrideConfirm(null)}
        />
      )}
    </div>
  );
}
```

> `ConfirmDialog` 는 기존 공용 컴포넌트가 있으면 재사용, 없으면 inline. `useInterviewSlotsQuery` 는 PR-FE2 에서 만든 기존 훅 — `enabled` 옵션 미지원이면 wrapper 작성.

- [ ] **Step 3: RTL 통과**

```bash
pnpm --filter @duing/web test ManualAssignModal
```

- [ ] **Step 4: page.tsx wiring — Task 5 의 placeholder 제거**

```tsx
const [showManualAssign, setShowManualAssign] = useState(false);
return (
  <>
    <ApplicantInterviewScheduleCard
      interviewAvailabilities={detail.interviewAvailabilities}
      assignedSlot={detail.assignedSlot}
      onOpenManualAssign={() => setShowManualAssign(true)}
    />
    {showManualAssign && (
      <ManualAssignModal
        applicationId={detail.applicationId}
        recruitmentId={detail.recruitmentId}
        interviewAvailabilities={detail.interviewAvailabilities}
        assignedSlotId={detail.assignedSlot?.slotId ?? null}
        onClose={() => setShowManualAssign(false)}
      />
    )}
  </>
);
```

ScheduleManagement 페이지의 row 별 "재배정" 버튼이 동일 모달을 열도록 wiring (필요 시 별도 step).

- [ ] **Step 5: 수동 smoke**

운영진 로그인 → 지원자 상세 → 수동 배정 변경 → 토글 OFF 배정 / 토글 ON Override 배정 / empty state 케이스.

- [ ] **Step 6: commit + PR**

```bash
git add -A && git commit -m "feat(manage): 수동 배정 모달 + Override 토글 (Spec P0-3)"
```

PR 생성. 자동 머지 금지.

---

### Task 7: Frontend P0-4 — "면접 대상 선정" 액션 + status badge 라벨 정리

> Task 3 머지 후 시작. Task 4, 5, 6 과 병렬 가능.

**Files:**
- Modify: 기존 BulkStatusAction 또는 신규 `BulkPromoteDialog.tsx` (위치는 기존 컴포넌트 구조 확인 후 결정)
- Modify: `frontend/apps/web/components/status/ApplicationStatusBadge.tsx` (또는 기존 위치)
- Test: 해당 컴포넌트 RTL

- [ ] **Step 1: 기존 위치 식별**

```bash
rg "INTERVIEW_PENDING|면접" frontend/apps/web/app/manage --type ts -l
rg "ApplicationStatus.*Badge|StatusBadge" frontend/apps/web --type ts -l
```

- [ ] **Step 2: 라벨 매트릭스 정리**

운영진 / 지원자 라벨 분리 (spec P0-4 표 참조). status badge 컴포넌트가 두 시점에서 재사용되면 prop `audience: 'operator' | 'applicant'` 추가, 또는 시점별 별도 컴포넌트.

```ts
const OPERATOR_LABEL: Record<ApplicationStatus, string> = {
  SUBMITTED: '지원 완료',
  UNDER_REVIEW: '서류 검토 중',
  INTERVIEW_PENDING: '면접 대상',
  ACCEPTED: '합격',
  REJECTED: '불합격',
};

const APPLICANT_LABEL: Record<ApplicationStatus, string> = {
  SUBMITTED: '지원 완료',
  UNDER_REVIEW: '서류 검토 중',
  INTERVIEW_PENDING: '면접 대상',  // 지원자 stepper 는 sub-state 로 분기
  ACCEPTED: '최종 합격',
  REJECTED: '최종 불합격',
};
```

- [ ] **Step 3: 일괄 액션 명칭 + 확인 모달**

list 페이지의 일괄 상태 변경 액션 중 `INTERVIEW_PENDING` 으로의 전환 액션을 다음으로 변경:
- 버튼 라벨: "면접 대상으로 선정"
- 클릭 시 confirm 모달:
  - 제목: "면접 대상자 선정"
  - 본문: `{대표 이름} 외 {N-1}명을\n면접 대상자로 선정하시겠습니까?\n\n선정된 지원자는 자동배정 대상에 포함됩니다.`
  - 버튼: 취소 / 선정
- 확인 시 기존 `PATCH /api/v1/leader/applications/bulk-status` mutation 호출

- [ ] **Step 4: RTL 테스트**

```tsx
it('shows new label on the promote button', () => {
  render(<BulkPromoteAction selectedApplications={[...]} />);
  expect(screen.getByRole('button', { name: '면접 대상으로 선정' })).toBeInTheDocument();
});

it('shows confirm modal with correct copy', () => {
  render(<BulkPromoteAction selectedApplications={[applicantA, applicantB]} />);
  fireEvent.click(screen.getByRole('button', { name: '면접 대상으로 선정' }));
  expect(screen.getByText(/홍길동 외 1명을/)).toBeInTheDocument();
  expect(screen.getByText(/면접 대상자로 선정하시겠습니까/)).toBeInTheDocument();
});

it('fires bulk-status mutation with INTERVIEW_PENDING on confirm', async () => {
  render(<BulkPromoteAction selectedApplications={[applicantA]} />);
  fireEvent.click(screen.getByRole('button', { name: '면접 대상으로 선정' }));
  fireEvent.click(screen.getByRole('button', { name: '선정' }));
  await waitFor(() => expect(mutationFn).toHaveBeenCalledWith({
    applicationIds: [applicantA.id], status: 'INTERVIEW_PENDING',
  }));
});
```

- [ ] **Step 5: 구현 — 라벨 매트릭스 + 신규/수정 컴포넌트**

기존 status badge 사용처 grep 후 두 시점 라벨 적용. 일괄 액션 컴포넌트는 기존 BulkStatusAction 분리 또는 신규 BulkPromoteDialog 도입.

- [ ] **Step 6: RTL 통과 + 수동 smoke**

운영진 list → 다중 선택 → 면접 대상으로 선정 → 확인 모달 → 상태 전환 확인. 지원자 my-page → status badge 라벨 "최종 합격/불합격" 노출 확인.

- [ ] **Step 7: commit + PR**

```bash
git add -A && git commit -m "feat(manage): 면접 대상 선정 액션 + 상태 라벨 정리 (Spec P0-4)"
```

PR 생성. 자동 머지 금지.

---

## Post-P0

P0 7 PR 모두 머지 후 운영진/지원자 시점 end-to-end 수동 smoke:
- 운영진 list → 면접 대상 선정 → 자동배정 → 충돌 케이스 수동 재배정 (Override)
- 지원자 my-page → 단계별 stepper / sub-state 갱신 확인

이슈 발생 시 후속 PR. P1 (List 행 확장, 슬롯 중심 재배정 화면) 은 별도 plan.

---

## Self-Review Checklist (작성자 self-check, 머지 전)

- [ ] spec Out of Scope 항목과 충돌하지 않는가
- [ ] 모든 PR 본문에 spec 링크 포함되어 있는가
- [ ] Backend 응답 변경이 기존 클라이언트에 breaking 인지 (필드 추가만 → 비파괴)
- [ ] Frontend 컴포넌트 prop 이름이 spec 의 API 필드명과 일치 (`interviewAvailabilities`, `assignedSlot`, `availabilityDeadline`)
- [ ] Empty state / Override confirm 문구가 spec 최종본과 글자 단위로 일치
- [ ] 시각 노출은 운영진/지원자 라벨 매트릭스 표를 따랐는가
- [ ] 자동 머지 시도 금지 — 사용자 지시 후에만 머지
