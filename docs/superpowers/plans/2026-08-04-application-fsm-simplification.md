# 지원 상태 머신 단순화 (UNDER_REVIEW 제거·ON_HOLD 도입) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지원 상태에서 서류심사(UNDER_REVIEW)를 제거하고 보류(ON_HOLD)를 도입, FSM·면접·통계·FE 전 구간을 스펙 `docs/superpowers/specs/2026-08-04-application-fsm-simplification-design.md` 대로 전환한다.

**Architecture:** BE는 UNDER_REVIEW 상수를 마지막 Task까지 유지한 채(죽은 상태) 전이 의미론 → API 리네임 → 통계 계약 → 상수 제거 스윕 순으로 진행해 각 Task 종료 시 컴파일·테스트 그린을 유지한다. FE는 유니온 교체가 원자적이라 Task 5에서 타입·전이·라벨 코어를 바꾼 뒤 6~8에서 화면별 전환, Task 8에서 전역 게이트를 통과한다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / QueryDSL / RestAssured·Fixture Monkey, Next.js 15 / React 19 / pnpm / vitest / openapi-typescript

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-08-04-application-fsm-simplification-design.md` — 모든 Task의 암묵 요구사항. 전이표는 스펙 §1-2가 유일 기준.
- 구현 서브에이전트는 **push·PR 생성 금지** — 로컬 커밋까지만.
- 커밋: Conventional Commits + 한국어 (`refactor(backend): …` / `refactor(frontend): …`). **Co-Authored-By/Generated 라인 금지.**
- Flyway 기존 마이그레이션 파일 수정 절대 금지 (V10/V11 주석의 UNDER_REVIEW 는 그대로 둔다). 새 파일 번호는 작성 직전 `ls backend/src/main/resources/db/migration | sort -V | tail -1` 로 재확인 (현재 최신 V96 → V97 예정).
- BE: 변수명 축약 금지, `@DisplayName` 은 요구사항 문장, 테스트에 하드코딩 미래 절대날짜 금지(상대 날짜).
- FE: `any`/`as` 금지, `type` 만 사용, 서버 상태는 TanStack Query. 사용자 대면 문구는 한글.
- 빌드/테스트 cwd: gradle 은 `backend/`, pnpm 은 `frontend/`. `| tail` 로 exit code 가리지 말 것.
- 리뷰 게이트(오케스트레이터 수행): Task 마다 spec+quality 리뷰 디스패치. FSM·마이그레이션·통계 계약 Task(1·3·5)는 적대적 리뷰 추가 (codex 플러그인 고장 시 fable 대체).

## PR 구조

- **PR-1 (backend)**: 브랜치 `refactor/application-status-fsm` — `docs/application-fsm-simplification-spec` 에서 분기(스펙 커밋 포함). Task 1~4. PR 제목: `refactor(backend): 지원 상태 머신 단순화 — 서류심사 제거·보류 도입`
- **PR-2 (frontend)**: PR-1 develop 머지 후 develop 에서 분기 `refactor/application-status-fsm-web`. Task 5~8. PR 제목: `refactor(frontend): 지원 상태 머신 단순화 — 서류심사 단계 제거·보류 UI 도입`
- prod 릴리스는 두 PR 을 한 릴리스로, BE 선배포 → FE 즉시 (스펙 §6).

---

### Task 1: FSM 코어 — ON_HOLD 도입·전이표 최종형·전이 지점 4곳·마이그레이션

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/entity/ApplicationStatus.java`
- Modify: `backend/src/main/java/com/duing/domain/application/entity/Application.java:97-108` (isAllowedTransition)
- Modify: `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java:456-475` (rejectActiveOnClubClosure)
- Modify: `backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewRoundService.java:133-139, 163-171` (후보 가드·승격)
- Modify: `backend/src/main/java/com/duing/domain/interview/repository/InterviewRoundMemberRepositoryImpl.java:58-66` (candidateStatuses)
- Create: `backend/src/main/resources/db/migration/V97__replace_under_review_with_submitted.sql`
- Test: `application/entity/ApplicationStatusTest.java`, `application/service/ApplicationStatusTransitionTest.java`, `ApplicationStatusServiceTest.java`, `ApplicationBulkStatusServiceTest.java`, `GeneralApplicationServiceTest.java`, `interview/controller/LeaderInterviewRoundCreateControllerTest.java`, `LeaderInterviewRoundCandidateControllerTest.java`

**Interfaces:**
- Produces: `ApplicationStatus.ON_HOLD` 상수(이후 모든 Task 가 사용), 새 FSM(§1-2), `candidateStatuses(boolean)` = INTERVIEW_PENDING ∪ {SUBMITTED, ON_HOLD}. **UNDER_REVIEW 상수는 이 Task 에서 삭제하지 않는다** (죽은 상태로 잔존, Task 4 에서 제거) — 이 Task 에서 컴파일을 깨지 않기 위한 유일한 이유.

- [ ] **Step 1: 전이표 실패 테스트 작성** — `ApplicationStatusTransitionTest` 를 스펙 §1-2 전수로 재작성 (기존 UNDER_REVIEW 전이 케이스 삭제). 대표 케이스:

```java
// 비면접: SUBMITTED → ACCEPTED / REJECTED / ON_HOLD 허용, INTERVIEW_PENDING 불허
// 면접:   SUBMITTED → INTERVIEW_PENDING / REJECTED / ON_HOLD 허용, ACCEPTED 불허
// ON_HOLD(비면접) → ACCEPTED / REJECTED 허용, ON_HOLD(면접) → INTERVIEW_PENDING / REJECTED 허용, ACCEPTED 불허
// INTERVIEW_PENDING → ACCEPTED / REJECTED 허용, ON_HOLD 불허
// ACCEPTED / REJECTED → 전부 불허, UNDER_REVIEW 는 to 로도 from 으로도 전부 불허(죽은 상태)
@Test
@DisplayName("면접을 사용하는 모집에서는 보류 상태에서 합격으로 바로 전이할 수 없다")
void onHoldCannotGoStraightToAcceptedWhenInterviewEnabled() {
    Application application = ApplicationFixture.withStatus(ApplicationStatus.ON_HOLD);
    assertThatThrownBy(() -> application.transitionTo(ApplicationStatus.ACCEPTED, true))
        .isInstanceOf(ApplicationDomainException.InvalidStatusTransitionException.class);
}
```
(픽스처 생성은 기존 `common/fixture/` 패턴을 그대로 따른다 — 기존 테스트 파일에서 UNDER_REVIEW 픽스처가 어떻게 만들어지는지 보고 동일 방식으로 ON_HOLD 생성.)

- [ ] **Step 2: 실패 확인** — `cd backend && ./gradlew test --tests '*ApplicationStatusTransitionTest*'` → 신규 케이스 FAIL (ON_HOLD 심볼 없음 컴파일 에러도 실패로 간주)

- [ ] **Step 3: enum + FSM 구현**

```java
// ApplicationStatus.java — ON_HOLD 추가, UNDER_REVIEW 는 Task 4 까지 잔존(죽은 상태)
public enum ApplicationStatus {
    SUBMITTED, UNDER_REVIEW, ON_HOLD, INTERVIEW_PENDING, ACCEPTED, REJECTED;
    public boolean isTerminal() { return this == ACCEPTED || this == REJECTED; }
    public boolean isActive() { return !isTerminal(); }
}
```

```java
// Application.java — isAllowedTransition 교체 (스펙 §1-2)
private static boolean isAllowedTransition(ApplicationStatus from, ApplicationStatus to, boolean useInterview) {
    return switch (from) {
        case SUBMITTED -> to == ApplicationStatus.ON_HOLD
                || to == ApplicationStatus.REJECTED
                || (useInterview
                        ? to == ApplicationStatus.INTERVIEW_PENDING
                        : to == ApplicationStatus.ACCEPTED);
        case ON_HOLD -> to == ApplicationStatus.REJECTED
                || (useInterview
                        ? to == ApplicationStatus.INTERVIEW_PENDING
                        : to == ApplicationStatus.ACCEPTED);
        case INTERVIEW_PENDING -> to == ApplicationStatus.ACCEPTED || to == ApplicationStatus.REJECTED;
        // UNDER_REVIEW 는 V97 치환 후 존재하지 않는 죽은 상태 — Task 4 에서 상수와 함께 제거한다.
        case UNDER_REVIEW, ACCEPTED, REJECTED -> false;
    };
}
```

- [ ] **Step 4: 폐쇄 일괄거절 직행 + 면접 전이 지점 교체**

```java
// GeneralApplicationService.rejectActiveOnClubClosure — 2단 우회 제거
List<ApplicationStatus> activeStatuses = List.of(
        ApplicationStatus.SUBMITTED,
        ApplicationStatus.ON_HOLD,
        ApplicationStatus.INTERVIEW_PENDING);
List<Application> applications =
        applicationRepository.findByRecruitmentIdInAndStatusIn(recruitmentIds, activeStatuses);
for (Application application : applications) {
    application.transitionTo(ApplicationStatus.REJECTED, application.getRecruitment().isUseInterview());
}
```

```java
// GeneralInterviewRoundService — 후보 상태 가드 (:133-139)
ApplicationStatus candidateStatus = application.getStatus();
if (candidateStatus != ApplicationStatus.SUBMITTED
        && candidateStatus != ApplicationStatus.ON_HOLD
        && candidateStatus != ApplicationStatus.INTERVIEW_PENDING) {
    throw new InterviewException.CandidateNotEligible();
}
```

```java
// GeneralInterviewRoundService — 승격 루프 (:163-171)
for (Application application : applications) {
    // 대기열(INTERVIEW_PENDING) 재수용은 상태 변화가 없으므로 전이·이력을 만들지 않는다.
    ApplicationStatus statusBeforePromotion = application.getStatus();
    if (statusBeforePromotion != ApplicationStatus.INTERVIEW_PENDING) {
        application.transitionTo(ApplicationStatus.INTERVIEW_PENDING, true);
        applicationStatusHistoryRepository.save(ApplicationStatusHistory.record(
                application, statusBeforePromotion,
                ApplicationStatus.INTERVIEW_PENDING, changedBy));
    }
}
```

```java
// InterviewRoundMemberRepositoryImpl.candidateStatuses — 파라미터명은 Task 2 에서 리네임, 여기선 의미만 교체
private BooleanExpression candidateStatuses(boolean includeUnderReview) {
    if (includeUnderReview) {
        return application.status.in(
                ApplicationStatus.INTERVIEW_PENDING, ApplicationStatus.SUBMITTED, ApplicationStatus.ON_HOLD);
    }
    return application.status.eq(ApplicationStatus.INTERVIEW_PENDING);
}
```

- [ ] **Step 5: V97 마이그레이션 작성** (번호 재확인 후)

```sql
-- 지원 FSM 단순화: 서류심사(UNDER_REVIEW) 상태 제거에 따른 값 치환 (스펙 §2).
-- 행 삭제 없음. soft-deleted 행 포함 전체 치환 — enum 역직렬화 안전성 확보.
UPDATE application SET status = 'SUBMITTED' WHERE status = 'UNDER_REVIEW';
UPDATE application_status_history SET previous_status = 'SUBMITTED' WHERE previous_status = 'UNDER_REVIEW';
UPDATE application_status_history SET new_status = 'SUBMITTED' WHERE new_status = 'UNDER_REVIEW';
```

- [ ] **Step 6: 영향 테스트 재작성** — 다음 파일에서 UNDER_REVIEW 전이를 새 FSM 으로 교체 (픽스처가 상태를 직접 세팅만 하는 곳은 SUBMITTED/ON_HOLD 로 치환, 전이를 수행하는 곳은 새 경로로): `ApplicationStatusTest`(isTerminal/isActive 에 ON_HOLD 추가), `ApplicationStatusServiceTest`, `ApplicationBulkStatusServiceTest`(벌크 SUBMITTED→ACCEPTED 직행·건별 실패 케이스), `GeneralApplicationServiceTest`(폐쇄 직행 — SUBMITTED/ON_HOLD/INTERVIEW_PENDING 각각 REJECTED 종료), `LeaderInterviewRoundCreateControllerTest`(SUBMITTED/ON_HOLD 후보 승격+이력, INTERVIEW_PENDING 재수용 no-op 유지), `LeaderInterviewRoundCandidateControllerTest`. 신규: 마이그레이션 검증 통합 테스트 1건 — V97 적용된 스키마에서 이력 포함 지원자 상세 조회 정상 (`ApplicantDetailServiceTest` 에 케이스 추가).

- [ ] **Step 7: 그린 확인** — `cd backend && ./gradlew test` → BUILD SUCCESSFUL 출력 확인 (`| tail` 금지)

- [ ] **Step 8: Commit** — `refactor(backend): 지원 상태 전이 개편 — 보류 도입·서류심사 죽은 상태화·폐쇄 직행`

### Task 2: includeUndecided 리네임 (면접 후보 API 계약)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/interview/repository/InterviewRoundMemberRepositoryCustom.java:15` (시그니처·javadoc)
- Modify: `backend/src/main/java/com/duing/domain/interview/repository/InterviewRoundMemberRepositoryImpl.java` (`findRoundCandidates(Long, boolean includeUndecided)` + private `candidateStatuses(boolean includeUndecided)`)
- Modify: `backend/src/main/java/com/duing/domain/interview/service/InterviewRoundService.java`, `GeneralInterviewRoundService.java` (파라미터명 전파)
- Modify: `backend/src/main/java/com/duing/domain/interview/api/LeaderInterviewRoundApi.java:36-51` (쿼리 파라미터명 + Swagger description — "includeUndecided=true 면 미결정 상태(SUBMITTED + ON_HOLD) 후보 포함, false 면 INTERVIEW_PENDING 만")
- Modify: interview 컨트롤러의 `@RequestParam` 명
- Test: `interview/controller/LeaderInterviewRoundCandidateControllerTest.java`

**Interfaces:**
- Consumes: Task 1 의 candidateStatuses 의미.
- Produces: 쿼리 파라미터 `includeUndecided` (FE Task 7 이 소비). 구 파라미터명 하위호환 없음(스펙 §3 — 동일 릴리스).

- [ ] **Step 1: 컨트롤러 테스트를 `includeUndecided` 로 교체** → `./gradlew test --tests '*LeaderInterviewRoundCandidate*'` FAIL 확인
- [ ] **Step 2: 리네임 체인 구현** (repo custom → impl → service 인터페이스/구현 → controller `@RequestParam("includeUndecided")` → api Swagger) — 기계적 rename, 의미 변화 없음
- [ ] **Step 3: `cd backend && ./gradlew test` 그린 확인**
- [ ] **Step 4: Commit** — `refactor(backend): 면접 후보 파라미터 개명 — includeUnderReview → includeUndecided`

### Task 3: 통계 계약 — summary onHold·funnel documentPassed 제거

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/recruitment/stats/service/dto/query/StatsSummaryQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/stats/service/GeneralRecruitmentStatsService.java:38-48`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/stats/service/dto/query/StatsFunnelQuery.java`
- Modify: summary/funnel 의 Response 레코드 (`StatsSummaryResponse`, `StatsFunnelResponse` — Query 와 1:1 필드)
- Test: `recruitment/stats/service/RecruitmentStatsSummaryServiceTest.java`, `RecruitmentStatsFunnelServiceTest.java`, `recruitment/stats/repository/RecruitmentStatsRepositoryTest.java`

**Interfaces:**
- Produces: summary `{ total, submitted, onHold, interviewPending, accepted, rejected, capacity, ratio }` — **Contract: `total == submitted + onHold + interviewPending + accepted + rejected` 항상 성립(테스트 기준)**. funnel `{ submitted, interviewEntered(Long, 비면접 null), accepted }`. FE Task 5·7 이 소비.

- [ ] **Step 1: 계약 실패 테스트** — summary 테스트에 ON_HOLD 픽스처 포함 total 등식 검증 추가, funnel 테스트에서 documentPassed 단언 제거·필드 부재 반영 → FAIL 확인

```java
@Test
@DisplayName("통계 요약의 전체 인원은 지원·보류·면접 대상·합격·불합격 상태 수의 합과 항상 같다")
void summaryTotalEqualsSumOfAllStatusCounts() { /* SUBMITTED 2, ON_HOLD 1, INTERVIEW_PENDING 1, ACCEPTED 1, REJECTED 1 → total 6 */ }
```

- [ ] **Step 2: 구현**

```java
public record StatsSummaryQuery(
        long total, long submitted, long onHold, long interviewPending,
        long accepted, long rejected, int capacity, double ratio
) {
    public static StatsSummaryQuery of(long submitted, long onHold, long interviewPending,
                                       long accepted, long rejected, int capacity) {
        long total = submitted + onHold + interviewPending + accepted + rejected;
        double ratio = capacity == 0 ? 0.0 : (double) accepted / capacity;
        return new StatsSummaryQuery(total, submitted, onHold, interviewPending, accepted, rejected, capacity, ratio);
    }
}
```

```java
// GeneralRecruitmentStatsService.getSummary — underReview 행을 onHold 로 교체
long onHold = statusCountMap.getOrDefault(ApplicationStatus.ON_HOLD, 0L);
// return StatsSummaryQuery.of(submitted, onHold, interviewPending, accepted, rejected, recruitment.getCapacity());
```

```java
public record StatsFunnelQuery(long submitted, Long interviewEntered, long accepted) {
    public static StatsFunnelQuery from(Map<ApplicationStatus, Long> applicationStatusCounts, boolean useInterview) {
        long submittedCount = applicationStatusCounts.getOrDefault(ApplicationStatus.SUBMITTED, 0L);
        long onHoldCount = applicationStatusCounts.getOrDefault(ApplicationStatus.ON_HOLD, 0L);
        long interviewPendingCount = applicationStatusCounts.getOrDefault(ApplicationStatus.INTERVIEW_PENDING, 0L);
        long acceptedCount = applicationStatusCounts.getOrDefault(ApplicationStatus.ACCEPTED, 0L);
        long rejectedCount = applicationStatusCounts.getOrDefault(ApplicationStatus.REJECTED, 0L);
        long totalSubmitted = submittedCount + onHoldCount + interviewPendingCount + acceptedCount + rejectedCount;
        Long interviewParticipants = useInterview
                ? interviewPendingCount + acceptedCount + rejectedCount
                : null;
        return new StatsFunnelQuery(totalSubmitted, interviewParticipants, acceptedCount);
    }
}
```
(Response 레코드도 동일 필드로 교체 — `from()` 매핑 확인.)

- [ ] **Step 3: `cd backend && ./gradlew test` 그린 확인**
- [ ] **Step 4: Commit** — `refactor(backend): 지원 통계 계약 교체 — 보류 카운트 도입·서류통과 지표 제거`

### Task 4: UNDER_REVIEW 상수 제거 스윕 + 지원자 노출 정리

**Files:**
- Modify: `ApplicationStatus.java` (UNDER_REVIEW 삭제 — 최종형 `SUBMITTED, ON_HOLD, INTERVIEW_PENDING, ACCEPTED, REJECTED`), `Application.java` (switch 의 `UNDER_REVIEW,` arm 제거)
- Modify: `backend/src/main/java/com/duing/domain/interview/service/dto/query/ApplicantInterviewPhase.java` — `DOCUMENT_REVIEW` enum 값 제거 + `derive()` 수정
- Modify: `backend/src/main/java/com/duing/domain/application/api/ApplicationApi.java:48`, `LeaderApplicationApi.java:43,90` (Swagger 설명·example `UNDER_REVIEW` → `ON_HOLD`), `interview/api/LeaderInterviewRoundApi.java` 잔여 설명, `InterviewRoundMemberRepositoryCustom` javadoc
- Modify: `MyApplicationDetailResponse.java`(+Query) — **`useInterview: boolean` 필드 추가** (recruitment.isUseInterview() 전달, FE 스테퍼 §5-5 "면접 단계는 면접 모집에서만 표시"의 데이터 소스)
- Test: 잔여 UNDER_REVIEW 참조 테스트 전부 (`ApplicantInterviewPhaseTest`, `MyApplicationsScopeTest`, `MyApplicationDetailAccessTest`, `ApplicantDetailServiceTest`, `MyApplicationsQueryTest`, `ApplicantQueryTest`, `InterviewReminderJobTest`, `LeaderApplicationControllerTest`, `MyApplicationControllerStepperTest`, `InterviewControllerTestSupport` 등 — 픽스처 상태값 치환)

**Interfaces:**
- Produces: 최종 enum(5값), `ApplicantInterviewPhase` 에서 DOCUMENT_REVIEW 부재(FE Task 8 소비), `MyApplicationDetail.useInterview`(FE Task 8 소비).

- [ ] **Step 1: ApplicantInterviewPhase 수정**

```java
// derive() — 구간 가드와 visibleRoundStatus==null 분기 교체
if (applicationStatus != ApplicationStatus.INTERVIEW_PENDING) {
    return NOT_APPLICABLE; // SUBMITTED/ON_HOLD 는 면접 구간 밖 — application 결과 뷰가 담당
}
if (visibleRoundStatus == null) {
    return hasConcludedMembership ? WAITING_NEXT_ROUND : WAITING_ROUND;
}
```
(enum 상수 목록에서 `DOCUMENT_REVIEW,` 삭제. javadoc 의 평가 순서 문구도 동기화.)

- [ ] **Step 2: enum 상수 삭제 + 컴파일 에러 지점 소거** — Application switch arm, Swagger 문자열, javadoc, 테스트 픽스처(UNDER_REVIEW → 문맥상 SUBMITTED 또는 ON_HOLD). `MyApplicationDetailResponse` 에 `useInterview` 추가.
- [ ] **Step 3: grep 검증** — `grep -rn "UNDER_REVIEW" backend/src --include='*.java'` → 0건. `grep -rn "UNDER_REVIEW" backend/src/main/resources/db/migration` 은 V10/V11 주석만 잔존(정상).
- [ ] **Step 4: `cd backend && ./gradlew test` 전체 그린 확인**
- [ ] **Step 5: Commit** — `refactor(backend): 서류심사 상태 완전 제거 — enum·면접 단계·문서 정리`

---

### Task 5: FE 타입·전이표·라벨·뱃지 코어

**Files:**
- Modify: `frontend/packages/types/src/application.ts:9-22` (유니온·배열), `frontend/packages/types/src/stats.ts` (`underReview`→`onHold`, `documentPassed` 제거), `frontend/packages/types/src/dashboard.ts:44` (`underReview`→`onHold`)
- Modify: `frontend/packages/api/src/generated/schema.d.ts` — BE(Task 1~4 반영본) 로컬 기동 후 `cd frontend && pnpm gen:api` 재생성. 기동이 불가한 환경이면 유니온 리터럴 9곳(`:4590,4595,5010,5040,5603,5627,5986,6046,6048` 부근)과 stats/funnel/파라미터 시그니처를 수동 동기화하고 PR 본문에 재생성 필요를 명시.
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/applicationStatusTransitions.ts`
- Modify: `frontend/apps/web/app/_constants/application-status.ts`
- Modify: `frontend/apps/web/app/manage/.../applicants/_components/ApplicantTable.tsx:11-17` (STATUS_BADGE_CLASS), `frontend/apps/web/app/manage/.../interview/rounds/new/_components/Step1Candidates.tsx:20-21` (뱃지 동기)
- Test: `apps/web/test/manage/applicants/application-status-labels.test.ts`, transitions 관련 기존 테스트

**Interfaces:**
- Produces: `ApplicationStatus = 'SUBMITTED'|'ON_HOLD'|'INTERVIEW_PENDING'|'ACCEPTED'|'REJECTED'`, `getStatusTransitions/allowedTransitionsFrom`(§1-2 동형), 라벨 2벌 — Task 6~8 전부가 소비.
- 주의: 이 Task 이후 전역 `pnpm typecheck` 는 Task 6~8 완료 전까지 실패할 수 있다(유니온 전환의 원자성). 각 Task 는 자기 영역 테스트만 그린으로 만들고, 전역 게이트는 Task 8 이 완료 조건으로 가진다.

- [ ] **Step 1: 타입·전이표·라벨 교체**

```ts
// packages/types/src/application.ts
export type ApplicationStatus =
  | 'SUBMITTED'
  | 'ON_HOLD'
  | 'INTERVIEW_PENDING'
  | 'ACCEPTED'
  | 'REJECTED';

const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'SUBMITTED', 'ON_HOLD', 'INTERVIEW_PENDING', 'ACCEPTED', 'REJECTED',
];
```

```ts
// applicationStatusTransitions.ts — BE Application.isAllowedTransition 과 완전 동형 (스펙 §1-2)
const TRANSITIONS: Record<ApplicationStatus, NextStatus[]> = {
  SUBMITTED: useInterview
    ? ['INTERVIEW_PENDING', 'ON_HOLD', 'REJECTED']
    : ['ACCEPTED', 'ON_HOLD', 'REJECTED'],
  ON_HOLD: useInterview ? ['INTERVIEW_PENDING', 'REJECTED'] : ['ACCEPTED', 'REJECTED'],
  INTERVIEW_PENDING: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: [],
  REJECTED: [],
};
```

```ts
// application-status.ts — 라벨 표 (스펙 §5-4). 파일 상단 주석 표도 함께 갱신.
export const APPLICATION_STATUS_OPERATOR_LABEL: Record<ApplicationStatus, string> = {
  SUBMITTED: '지원 완료',
  ON_HOLD: '보류',
  INTERVIEW_PENDING: '면접 대상',
  ACCEPTED: '합격',
  REJECTED: '불합격',
};

export const APPLICATION_STATUS_APPLICANT_LABEL: Record<ApplicationStatus, string> = {
  SUBMITTED: '심사 중',
  ON_HOLD: '심사 중', // 보류는 지원자에게 노출하지 않는다 — SUBMITTED 와 동일 표기 (스펙 §1-1)
  INTERVIEW_PENDING: '면접 대상',
  ACCEPTED: '최종 합격',
  REJECTED: '최종 불합격',
};
```

```ts
// ApplicantTable.tsx — ON_HOLD 가 amber 승계
const STATUS_BADGE_CLASS: Record<ApplicationStatus, string> = {
  SUBMITTED: /* 기존값 유지 */,
  ON_HOLD: 'bg-amber-50 text-amber-700',  // 기존 UNDER_REVIEW 클래스 문자열 그대로 이전
  INTERVIEW_PENDING: /* 기존 purple 유지 */,
  ACCEPTED: /* 유지 */, REJECTED: /* 유지 */,
};
```
(Step1Candidates 의 뱃지 2건도 동일 색으로 교체.)

- [ ] **Step 2: stats/dashboard 타입 교체** — `stats.ts`: `underReview: number` → `onHold: number`, funnel 타입에서 `documentPassed` 제거. `dashboard.ts:44` 동일.
- [ ] **Step 3: schema.d.ts 재생성** (위 Files 항목의 절차)
- [ ] **Step 4: 영역 테스트 그린** — `cd frontend && pnpm vitest run apps/web/test/manage/applicants/application-status-labels.test.ts` 및 transitions 테스트 (지원자 라벨 "심사 중" 동일 표기 케이스 추가)
- [ ] **Step 5: Commit** — `refactor(frontend): 지원 상태 타입·전이표·라벨 전환 — 보류 도입`

### Task 6: 운영진 지원현황 UI — 필터·벌크·확인 모달·타임라인

**Files:**
- Modify: `applicants/_components/ApplicantsFilterBar.tsx:43` (옵션 교체)
- Modify: `applicants/_components/BulkActionBar.tsx` (버튼 구성)
- Modify: `applicants/_components/BulkConfirmDialog.tsx` (Record 3개 + 문구)
- Modify: `applicants/page.tsx` (`:287` 주석 등 UNDER_REVIEW 잔재)
- Modify: `applicants/[applicationId]/_components/StatusActionBar.tsx` + Create: `applicants/[applicationId]/_components/StatusConfirmDialog.tsx`
- Modify: `applicants/[applicationId]/_components/StatusTimeline.tsx` (동일 상태 이력 숨김)
- Modify: `applicants/[applicationId]/_components/ApplicantInterviewScheduleCard.tsx:157` (UNDER_REVIEW fallback 분기 → SUBMITTED/ON_HOLD)
- Test: `apps/web/test/manage/applicants/` 의 bulk-action-bar, applicants-filter-bar, detail/status-action-bar, detail/status-timeline, detail/applicant-interview-schedule-card, detail/applicant-nav-bar, detail/status-timeline

**Interfaces:**
- Consumes: Task 5 라벨·전이표. Produces: 단건 최종 상태 확인 모달 `StatusConfirmDialog` (props: `{ targetStatus: 'ACCEPTED' | 'REJECTED'; isPending: boolean; onConfirm: () => void; onCancel: () => void }`).

- [ ] **Step 1: 필터·벌크 교체**

```tsx
// ApplicantsFilterBar — UNDER_REVIEW 옵션 제거, 보류 추가 (무조건 노출)
<option value="SUBMITTED">{APPLICATION_STATUS_LABEL.SUBMITTED}</option>
<option value="ON_HOLD">{APPLICATION_STATUS_LABEL.ON_HOLD}</option>
```

```tsx
// BulkActionBar — "서류 검토 중" 버튼 제거, "보류" 추가. GenericBulkTarget 타입은 그대로
// (Exclude<..., 'INTERVIEW_PENDING'> 가 ON_HOLD 를 자동 포함). 버튼 순서:
// [면접 대상으로 선정*] [보류] [일괄 불합격] [일괄 합격]  (*useInterview 일 때만)
// 일괄 합격은 면접 모집에서도 유지 (스펙 §5-2 — INTERVIEW_PENDING 선택분 처리, 리그레션 금지)
<button type="button" onClick={() => onBulkAction('ON_HOLD')}
  className="rounded-md border border-amber-200 px-3 py-2 text-[13px] font-semibold text-amber-700 hover:bg-amber-50 sm:py-1.5 sm:text-xs">
  보류
</button>
```

```ts
// BulkConfirmDialog — Record 키 교체 + 거짓 문구 삭제 (스펙 §5-3)
const LABEL: Record<GenericTargetStatus, string> = {
  ON_HOLD: '보류', ACCEPTED: '합격', REJECTED: '불합격',
};
const DESCRIPTION: Record<GenericTargetStatus, string> = {
  ON_HOLD: '보류는 운영진 내부 관리 상태이며 지원자에게 노출되지 않습니다.',
  ACCEPTED: '선택한 지원자가 동아리 회원으로 자동 등록되며, 지원자에게 결과가 반영됩니다.',
  REJECTED: '되돌릴 수 없습니다. 잘못 누른 항목이 있으면 취소하고 선택을 다시 확인하세요.',
};
const CONFIRM_BUTTON_CLASS: Record<GenericTargetStatus, string> = {
  ON_HOLD: 'btn btn-primary btn-sm disabled:opacity-50',
  ACCEPTED: 'btn btn-primary btn-sm disabled:opacity-50',
  REJECTED: 'btn btn-sm bg-coral text-paper transition-colors hover:bg-[#c2603f] disabled:opacity-50',
};
```

- [ ] **Step 2: 단건 확인 모달** — `StatusConfirmDialog.tsx` 신규 (BulkConfirmDialog 의 Dialog 골격 재사용, 단건 문구):

```tsx
const TITLE: Record<'ACCEPTED' | 'REJECTED', string> = {
  ACCEPTED: '합격 처리하시겠습니까?',
  REJECTED: '불합격 처리하시겠습니까?',
};
const DESCRIPTION: Record<'ACCEPTED' | 'REJECTED', string> = {
  ACCEPTED: '합격 처리 후에는 지원자에게 결과가 반영되며, 동아리 회원으로 자동 등록됩니다.',
  REJECTED: '불합격 처리 후에는 지원자에게 결과가 반영됩니다. 되돌릴 수 없습니다.',
};
```

`StatusActionBar` 는 `useState<'ACCEPTED' | 'REJECTED' | null>(pendingFinalStatus)` 를 추가해 최종 상태 버튼 클릭 시 모달을 열고, 확인 시 mutate. **ON_HOLD·INTERVIEW_PENDING 버튼은 기존대로 즉시 mutate** (스펙 §5-3).

- [ ] **Step 3: 타임라인 필터** — `StatusTimeline` 의 `history.map(...)` 앞에 마이그레이션 잔재 숨김:

```tsx
{history
  .filter((item) => item.previousStatus !== item.newStatus) // V97 치환 잔재(동일 상태 이력) 숨김 — DB 는 보존
  .map((item) => ( ... ))}
```

- [ ] **Step 4: 테스트** — bulk-action-bar(면접 모집에서 일괄 합격 버튼 존재·보류 버튼 존재·서류 검토 중 부재), status-action-bar(최종 상태 클릭 시 모달 경유·보류 클릭 시 즉시 mutate), status-timeline(동일 상태 이력 미렌더) 케이스 추가/수정 후 해당 파일 vitest 그린
- [ ] **Step 5: Commit** — `refactor(frontend): 지원현황 운영 UI 전환 — 보류 액션·최종 상태 확인 모달·타임라인 정리`

### Task 7: 면접 위저드·통계 화면·대시보드

**Files:**
- Modify: `packages/api/src/client.ts:1768 부근` (`includeUnderReview` → `includeUndecided` 쿼리 파라미터), `packages/hooks/src/` 의 `useInterviewRoundCandidatesQuery` 시그니처
- Modify: `interview/rounds/new/_components/Step1Candidates.tsx` (그룹 헤더 "서류 검토 중" → "미결정(지원·보류)", 상태 그룹 판정 SUBMITTED/ON_HOLD, 토글 파라미터명), `RoundWizard.tsx:22,94-96` (`underReviewSelectedCount` → `undecidedSelectedCount`), `Step2RoundForm.tsx:126-128` (경고 문구 "미결정 지원자 N명이 면접 대상으로 전환됩니다" — enum 명 노출 제거)
- Modify: `packages/hooks/src/dashboardSelectors.ts:41,77,111` — `stats.submitted + stats.onHold`(검토 대기), `aggregateApplicantTotals` 의 `underReview` 필드 → `onHold`; `assignedPendingCount = stats.interviewPending - candidateCount` 로직은 불변
- Modify: `stats/_components/SummaryCards.tsx:22` (`{ label: '보류', value: statsSummary.onHold }`), `recruitments/_components/RecruitmentKpiRow.tsx:46` ("검토 대기" 타일 = `submitted + onHold`), `manage/_components/dashboard/ApplicantSummaryCard.tsx:13` (라벨 '검토중' → '보류', 값 onHold)
- Modify: `stats/_components/FunnelChart.tsx` — '서류 통과' 스테이지 제거:

```tsx
const allStages: FunnelStage[] = [
  { name: '제출', value: funnelData.submitted, color: STAGE_COLORS[0] },
  ...(funnelData.interviewEntered !== null
    ? [{ name: '면접 진입', value: funnelData.interviewEntered, color: STAGE_COLORS[1] }]
    : []),
  { name: '합격', value: funnelData.accepted, color: STAGE_COLORS[2] },
];
// interviewEntered === null 안내 문구는 "면접 없는 모집 — 2단계 표시" 로 갱신
```
- Test: `apps/web/test/manage/interview-rounds/round-wizard.test.tsx`, `packages/hooks/test/dashboardSelectors.test.ts`, `dashboardActionItems.test.tsx`, `dashboardApplicantSummary.test.tsx`, `apps/web/test/manage/ApplicantSummaryCard.test.tsx`, `DashboardCardGrid.test.tsx`, `recruitments/*.test.tsx`, `packages/api/test/interviewRound.test.ts`

**Interfaces:**
- Consumes: Task 2 의 `includeUndecided`, Task 3 의 summary/funnel 계약, Task 5 타입.

- [ ] **Step 1: client/hook 파라미터 리네임 + 위저드 교체** (위 코드 명세대로)
- [ ] **Step 2: 대시보드 셀렉터·통계 카드 교체** — "검토 대기" = `submitted + onHold` (스펙 §4)
- [ ] **Step 3: 관련 테스트 파일 수정 후 vitest 그린** (검토 대기 합산에 onHold 포함 케이스 추가)
- [ ] **Step 4: Commit** — `refactor(frontend): 면접 위저드·통계·대시보드 전환 — 미결정 후보·보류 지표`

### Task 8: 지원자 화면 전환 + 전역 게이트

**Files:**
- Modify: `me/_components/SectionApply.tsx` — 유니온·미니 진행바·문구:

```ts
type ActiveApplicationStatus = 'SUBMITTED' | 'ON_HOLD' | 'INTERVIEW_PENDING';
const STEPS = ['심사', '면접'] as const; // 서류검토 단계 제거 (스펙 §5-5)
const STATUS_STEP: Record<ActiveApplicationStatus, number> = {
  SUBMITTED: 1, ON_HOLD: 1, INTERVIEW_PENDING: 2, // 보류는 지원자에게 심사 중과 동일
};
const ACTION_LABEL: Record<ActiveApplicationStatus, string> = {
  SUBMITTED: '지원서 보기', ON_HOLD: '지원서 보기', INTERVIEW_PENDING: '면접 일정 보기',
};
// statusNote: UNDER_REVIEW 분기 제거 → SUBMITTED/ON_HOLD 공통 '동아리에서 심사 중입니다'
```
(미니 진행바는 useInterview 정보가 목록 응답에 없어 기존처럼 무조건 2단 표시 — 현행과 동일한 수준의 근사, 스펙 §5-5 의 조건부 표시는 상세 스테퍼가 담당.)
- Modify: `me/applications/_pages/ApplicationsPage.tsx` — `toAppStatus` 의 `'doc-review'` 매핑 제거(AppStatus 유니온에서 doc-review 값 소거), **`case 'ON_HOLD': return 'applied';`** (지원자에게 심사 중과 동일 — 별도 시각 구분 없음), `deriveSteps` 를 3단으로:

```ts
const stateMap: Record<ApplicationStatus, [StepStateValue, StepStateValue, StepStateValue]> = {
  SUBMITTED:         ['current', 'pending', 'pending'],
  ON_HOLD:           ['current', 'pending', 'pending'], // 지원자에게 심사 중과 동일
  INTERVIEW_PENDING: ['done',    'current', 'pending'],
  ACCEPTED:          ['done',    'done',    'done'   ],
  REJECTED:          ['done',    'done',    'done'   ],
};
const [screening, interview, finalResult] = stateMap[status];
return [
  { label: '서류접수·심사', date: '-', state: screening },
  { label: '면접/인터뷰',   date: '-', state: interview },
  { label: '최종발표',      date: '-', state: finalResult },
];
```
- Modify: `me/applications/[applicationId]/_components/ApplicationStepper.tsx` — `useInterview`(Task 4 가 추가한 `MyApplicationDetail.useInterview`) 기반 단계 구성:

```ts
// 면접 모집: 지원 완료 → 면접 대상 → 면접 일정 배정 완료 → 최종 결과
// 비면접 모집: 지원 완료 → 최종 결과   (서류검토 단계 제거, 면접 단계는 면접 모집에서만 — 스펙 §5-5)
// status fallback: SUBMITTED/ON_HOLD → 0, INTERVIEW_PENDING → 면접 대상 index, ACCEPTED/REJECTED → 마지막
```
`StepperDetail` Pick 에 `'useInterview'` 추가. exhaustive switch 의 UNDER_REVIEW arm 제거, ON_HOLD → 0.
- Modify: `me/applications/[applicationId]/_utils/interviewPhaseGuide.ts` — `DOCUMENT_REVIEW` case 제거, `stepIndex: 1 | 2` 로 축소(면접 대상=1, 일정 확정=2), 각 case 의 stepIndex 를 1 씩 내림. `packages/types` 의 `ApplicantInterviewPhase` 유니온에서 `DOCUMENT_REVIEW` 제거 (Task 4 BE 와 동기).
- Verify(변경 없음 확인): `me/_components/SectionArchived.tsx:12` `ArchivedStatus` — ACCEPTED/REJECTED 뿐이므로 유지.
- Modify: `packages/types/src/application.ts` — `MyApplicationDetail` 에 `useInterview: boolean` 추가.
- Test: `apps/web/test/me/section-apply.test.tsx`, `me/applications/ApplicationStepper.test.tsx`, `me/applications/interviewPhaseGuide.test.ts` — "SUBMITTED 와 ON_HOLD 가 동일하게 심사 중으로 보인다", "비면접 모집 스테퍼에 면접 단계가 없다" 케이스 추가

- [ ] **Step 1: 위 명세대로 지원자 화면 전환 + 테스트 수정·추가, 해당 파일 vitest 그린**
- [ ] **Step 2: 전역 게이트** — `cd frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build` 전부 통과
- [ ] **Step 3: grep 검증** — `grep -rn "UNDER_REVIEW\|underReview\|documentPassed\|DOCUMENT_REVIEW" frontend --include='*.ts' --include='*.tsx' -l | grep -v node_modules` → 0건
- [ ] **Step 4: Commit** — `refactor(frontend): 지원자 화면 전환 — 심사 중 통합 표기·스테퍼 단계 축소`

---

## 최종 검증 체크리스트 (PR 전, 오케스트레이터)

- [ ] BE·FE 전이표가 스펙 §1-2 와 삼자 일치 (육안 대조)
- [ ] summary total 계약 테스트 존재·통과, funnel 에 documentPassed 부재
- [ ] 면접 모집 벌크 바에 일괄 합격 존재 (리그레션 체크)
- [ ] V97 이 마지막 마이그레이션 번호인지 develop 기준 재확인
- [ ] `db/migration` 제외 UNDER_REVIEW grep 0건 (BE·FE 각각)
- [ ] 스펙 §8 체크리스트 전 항목 완료
- [ ] PR 본문: 🚀/🤔/💬 템플릿, 파일명 나열 금지, 상태 머신 변경·마이그레이션 전략·API 계약 변경(summary/funnel/includeUndecided/MyApplicationDetail.useInterview) 명시
