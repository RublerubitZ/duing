# Legacy Interview Field Removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `application.interviewAt`/`interviewLocation` Legacy 컬럼과 그에 의존하는 모든 코드 경로를 제거하고 면접 일정의 Source of Truth 를 `InterviewSchedule` 로 일원화.

**Architecture:** BE 가 4 응답 DTO 를 `InterviewSchedule ⋈ InterviewSlot ⋈ InterviewConfig` JOIN 으로 채우고, Reminder Job 을 `InterviewSchedule.slot.startTime` 기반으로 재작성한다. 그 후 Legacy 쓰기 경로(`updateInterview` API + entity 필드/메서드 + 컬럼)를 atomic 하게 제거한다. FE 는 BE 응답 형태에 맞춘 schema.d.ts 갱신 + 타입/컴포넌트/테스트 정리.

**Tech Stack:** Spring Boot 3.4 / Java 21 / QueryDSL / Flyway / Next.js 15 / React 19 / TanStack Query / Vitest / openapi-typescript

**Spec:** `docs/superpowers/specs/2026-06-10-legacy-interview-removal-design.md`

---

## PR Strategy

- **BE PR**: Tasks 1–7. `backend/**` 만 변경 — `backend-ci` 만 실행.
- **FE PR**: Tasks 8–13. `frontend/**` 만 변경 — `frontend-ci` 만 실행.
- **머지 순서**: BE → FE. BE 머지 직후 FE PR 을 `git rebase develop` + force-push 해서 `frontend-ci` 재실행 후 머지.
- 두 PR 모두 develop 분기, develop 으로 PR.

---

## File Structure

### Backend
- **신규**: `src/main/resources/db/migration/V48__drop_application_interview_columns.sql`
- **신규**: `src/main/java/com/duing/domain/application/service/dto/query/AssignedInterviewQuery.java` (공용 projection record)
- **수정**:
  - `domain/application/entity/Application.java`
  - `domain/application/repository/ApplicationRepository.java`
  - `domain/application/service/ApplicationService.java`
  - `domain/application/service/GeneralApplicationService.java`
  - `domain/application/api/LeaderApplicationApi.java`
  - `domain/application/controller/LeaderApplicationController.java`
  - `domain/application/service/dto/query/{MyApplicationDetail,ApplicantDetail,Applicant,ApplicationSummary}Query.java`
  - `domain/application/controller/dto/response/{MyApplicationDetail,ApplicantDetail,Applicant,ApplicationSummary}Response.java`
  - `domain/application/repository/ApplicationRepositoryImpl.java` (QueryDSL)
  - `domain/notification/job/InterviewReminderJob.java`
  - `domain/interview/repository/InterviewScheduleRepository.java` (+ Custom 이 있다면 Impl)
- **삭제**:
  - `domain/application/service/dto/command/UpdateInterviewCommand.java`
  - `domain/application/controller/dto/request/UpdateApplicationInterviewRequest.java`
  - `src/test/java/com/duing/domain/application/service/ApplicationInterviewServiceTest.java`

### Frontend
- **수정**:
  - `packages/api/src/generated/schema.d.ts`
  - `packages/types/src/application.ts`
  - `packages/api/src/client.ts`
  - `packages/hooks/src/applications.ts`, `packages/hooks/src/index.ts`
  - `apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/StatusActionBar.tsx`
  - `apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ApplicantDetailPage.tsx`
  - `apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ApplicantProfilePanel.tsx`
  - `apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantTable.tsx`
  - `apps/web/app/me/_components/SectionApply.tsx`
  - `apps/web/app/me/applications/_pages/ApplicationsPage.tsx`
  - `apps/web/test/manage/applicants/detail/status-action-bar.test.tsx`
  - `apps/web/test/me/section-apply.test.tsx`, `test/me/section-archived.test.tsx`
  - `apps/web/test/manage/applicants/applicant-table-extension.test.tsx`
- **삭제**:
  - `apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/InterviewModal.tsx`

---

# Backend PR

브랜치: `feat/legacy-interview-removal-backend` (develop 분기)

각 Task 끝에서 `./gradlew test` 가 green 이어야 다음 Task 진입.

---

### Task 1: InterviewSchedule 기반 reminder 조회 API 추가

**Why first**: Task 2 (Reminder Job 재작성) 의 의존성. 다른 코드에 영향 없는 순수 추가.

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/interview/repository/InterviewScheduleRepository.java`
- Test: `backend/src/test/java/com/duing/domain/interview/repository/InterviewScheduleRepositoryTest.java` (없으면 신규)

- [ ] **Step 1: 실패 테스트 작성**

`InterviewScheduleRepositoryTest` 에 다음 추가 (테스트 클래스가 없으면 `@DataJpaTest` + TestContainers 기존 패턴 따라 신규 생성):

```java
@Test
@DisplayName("status=ASSIGNED 이고 slot.startTime 이 윈도 안인 schedule 만 반환된다")
void findAssignedBetween_filtersByStatusAndWindow() {
    // given — fixture 로 application, recruitment, interview_config, slot 3개 (윈도 안/밖/경계)
    //         InterviewSchedule 3개 (ASSIGNED/ASSIGNED/COMPLETED)
    LocalDateTime now = LocalDateTime.of(2026, 6, 11, 0, 0);
    LocalDateTime windowStart = now.plusHours(23);
    LocalDateTime windowEnd = now.plusHours(25);

    // 윈도 안 + ASSIGNED → 반환
    InterviewSchedule inWindowAssigned = createSchedule(now.plusHours(24), InterviewScheduleStatus.ASSIGNED);
    // 윈도 밖 + ASSIGNED → 제외
    createSchedule(now.plusHours(48), InterviewScheduleStatus.ASSIGNED);
    // 윈도 안 + COMPLETED → 제외
    createSchedule(now.plusHours(24), InterviewScheduleStatus.COMPLETED);

    List<InterviewSchedule> result = scheduleRepository.findAssignedBetween(windowStart, windowEnd);

    assertThat(result).extracting(InterviewSchedule::getId).containsExactly(inWindowAssigned.getId());
}
```

(fixture 헬퍼 `createSchedule(startTime, status)` 는 같은 클래스 안에 추가 — 기존 fixture 패턴 따라.)

- [ ] **Step 2: 테스트 실패 확인**

```bash
./gradlew test --tests com.duing.domain.interview.repository.InterviewScheduleRepositoryTest.findAssignedBetween_filtersByStatusAndWindow
```
Expected: `findAssignedBetween` 메서드 없음 → 컴파일 실패.

- [ ] **Step 3: Repository 메서드 추가**

`InterviewScheduleRepository.java` 에 다음 메서드 추가:

```java
@org.springframework.data.jpa.repository.Query("""
    select s
      from InterviewSchedule s
      join InterviewSlot slot on slot.id = s.slotId
     where s.status = com.duing.domain.interview.entity.InterviewScheduleStatus.ASSIGNED
       and slot.startTime between :start and :end
""")
List<InterviewSchedule> findAssignedBetween(
    @Param("start") LocalDateTime start,
    @Param("end") LocalDateTime end);
```

import 추가:
```java
import java.time.LocalDateTime;
import org.springframework.data.repository.query.Param;
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
./gradlew test --tests com.duing.domain.interview.repository.InterviewScheduleRepositoryTest.findAssignedBetween_filtersByStatusAndWindow
```
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/interview/repository/InterviewScheduleRepository.java \
       backend/src/test/java/com/duing/domain/interview/repository/InterviewScheduleRepositoryTest.java
git commit -m "feat(interview): InterviewScheduleRepository.findAssignedBetween — reminder 윈도 조회 (Legacy Removal Task 1)"
```

---

### Task 2: InterviewReminderJob 을 InterviewSchedule 기반으로 재작성

**Why**: Reminder 알림 출처를 Legacy `application.interview_at` 에서 `InterviewSchedule.slot.startTime` 으로 전환.

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/notification/job/InterviewReminderJob.java`
- Modify: `backend/src/main/java/com/duing/domain/application/repository/ApplicationRepository.java` (findInterviewBetween 제거)
- Test: `backend/src/test/java/com/duing/domain/notification/job/InterviewReminderJobTest.java` (재작성)

- [ ] **Step 1: 실패 테스트로 재작성**

`InterviewReminderJobTest.java` 의 기존 `interviewAt 이 23h~25h 윈도 안인 지원에만 INTERVIEW_REMINDER 가 생성된다` 테스트를 다음으로 교체:

```java
@Test
@DisplayName("ASSIGNED 상태이고 slot.startTime 이 23h~25h 윈도 안인 InterviewSchedule 만 INTERVIEW_REMINDER 가 생성된다")
void interviewReminder_createdForAssignedSchedulesInWindow() {
    LocalDateTime now = LocalDateTime.of(2026, 6, 11, 0, 0);
    when(clock.instant()).thenReturn(now.atZone(ZoneId.of("Asia/Seoul")).toInstant());

    InterviewSchedule inWindowAssigned = fixtureAssignedSchedule(now.plusHours(24));
    fixtureAssignedSchedule(now.plusHours(48));         // 윈도 밖
    fixtureCompletedSchedule(now.plusHours(24));        // 상태 제외

    job.run();

    List<Notification> created = notificationRepository.findAll();
    assertThat(created).hasSize(1);
    assertThat(created.get(0).getType()).isEqualTo(NotificationType.INTERVIEW_REMINDER);
    assertThat(created.get(0).getDedupKey())
        .isEqualTo("INTERVIEW_REMINDER:a=" + inWindowAssigned.getApplicationId()
            + ":t=" + now.plusHours(24).toString());
}
```

추가로 dedup 가드 테스트도 추가:

```java
@Test
@DisplayName("같은 dedup_key 로 한 번만 INTERVIEW_REMINDER 가 생성된다 (잡 재실행 idempotent)")
void interviewReminder_idempotentOnReRun() {
    LocalDateTime now = LocalDateTime.of(2026, 6, 11, 0, 0);
    when(clock.instant()).thenReturn(now.atZone(ZoneId.of("Asia/Seoul")).toInstant());

    fixtureAssignedSchedule(now.plusHours(24));

    job.run();
    job.run();

    assertThat(notificationRepository.findAll()).hasSize(1);
}
```

`fixtureAssignedSchedule(LocalDateTime startTime)` / `fixtureCompletedSchedule(LocalDateTime startTime)` 헬퍼를 같은 클래스 안에 추가 (Recruitment + InterviewConfig + InterviewSlot + Application + InterviewSchedule 생성).

기존 Legacy `interviewAt` 기반 fixture 모두 삭제.

- [ ] **Step 2: 테스트 실패 확인**

```bash
./gradlew test --tests com.duing.domain.notification.job.InterviewReminderJobTest
```
Expected: 컴파일 실패 또는 동작 mismatch.

- [ ] **Step 3: Reminder Job 재작성**

`InterviewReminderJob.java` 전체를 다음으로 교체:

```java
package com.duing.domain.notification.job;

import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Component
@RequiredArgsConstructor
public class InterviewReminderJob {

    private static final DateTimeFormatter BODY_TIME_FORMAT =
        DateTimeFormatter.ofPattern("yyyy.MM.dd HH:mm");

    private final InterviewScheduleRepository scheduleRepository;
    private final InterviewSlotRepository slotRepository;
    private final InterviewConfigRepository configRepository;
    private final ApplicationRepository applicationRepository;
    private final NotificationService notificationService;
    private final Clock clock;

    @Scheduled(cron = "0 0 * * * *", zone = "Asia/Seoul")
    @Transactional
    public void run() {
        LocalDateTime now = LocalDateTime.now(clock.withZone(ZoneId.of("Asia/Seoul")));
        LocalDateTime windowStart = now.plusHours(23);
        LocalDateTime windowEnd = now.plusHours(25);

        var targets = scheduleRepository.findAssignedBetween(windowStart, windowEnd);
        log.info("InterviewReminderJob start: targets={}", targets.size());

        int created = 0;
        for (InterviewSchedule schedule : targets) {
            InterviewSlot slot = slotRepository.findById(schedule.getSlotId()).orElse(null);
            if (slot == null) continue;

            InterviewConfig config = configRepository.findByRecruitmentId(schedule.getRecruitmentId())
                .orElse(null);
            if (config == null || config.getLocation() == null) continue;

            Application application = applicationRepository.findById(schedule.getApplicationId())
                .orElse(null);
            if (application == null) continue;

            String dedupKey = "INTERVIEW_REMINDER:a=" + schedule.getApplicationId()
                + ":t=" + slot.getStartTime().toString();
            String body = "면접 일정: " + slot.getStartTime().format(BODY_TIME_FORMAT)
                + " · 장소: " + config.getLocation();

            boolean inserted = notificationService.createIfAbsent(
                application.getUser().getId(),
                NotificationType.INTERVIEW_REMINDER,
                "면접 24시간 전 알림",
                body,
                null,
                dedupKey
            );
            if (inserted) created++;
        }
        log.info("InterviewReminderJob done: created={}", created);
    }
}
```

> 참고: `notificationService.createIfAbsent(...)` 는 기존 헬퍼명 — 실제 시그니처가 다르면 (createOrSkip, etc) 기존 호출 패턴 따라 조정. dedup_key 처리는 service 단에서 unique 제약 위배 시 noop.

- [ ] **Step 4: `ApplicationRepository.findInterviewBetween` 제거**

`backend/src/main/java/com/duing/domain/application/repository/ApplicationRepository.java` 에서 다음 메서드 + 그 위 javadoc + `import java.time.LocalDateTime;` 가 다른 곳에서 안 쓰이면 import 정리:

```java
@Query("""
        select a
          from Application a
         where a.status = com.duing.domain.application.entity.ApplicationStatus.INTERVIEW_PENDING
           and a.interviewAt between :start and :end
       """)
List<Application> findInterviewBetween(@Param("start") LocalDateTime start,
                                       @Param("end") LocalDateTime end);
```

전체 메서드 + 주변 javadoc 삭제.

- [ ] **Step 5: 테스트 통과 확인**

```bash
./gradlew test --tests com.duing.domain.notification.job.InterviewReminderJobTest
```
Expected: PASS

추가로 전체 빌드 확인 (다른 곳에서 findInterviewBetween 참조가 없는지):
```bash
./gradlew compileJava compileTestJava
```
Expected: BUILD SUCCESSFUL

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/notification/job/InterviewReminderJob.java \
       backend/src/main/java/com/duing/domain/application/repository/ApplicationRepository.java \
       backend/src/test/java/com/duing/domain/notification/job/InterviewReminderJobTest.java
git commit -m "feat(notification): InterviewReminderJob InterviewSchedule 기반으로 재작성 (Legacy Removal Task 2)"
```

---

### Task 3: ApplicantQuery + Response 를 scalar `interviewStartAt` 으로 전환

**Why**: 운영진 목록 row 응답이 가장 단순한 변경 패턴 — 다른 Query DTO 전환의 reference.

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/service/dto/query/ApplicantQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/application/controller/dto/response/ApplicantResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/application/repository/ApplicationRepositoryImpl.java` (QueryDSL)
- Test: `backend/src/test/java/com/duing/domain/application/service/ApplicantQueryTest.java` 또는 기존 통합 테스트

- [ ] **Step 1: 실패 테스트 작성/수정**

기존 ApplicantQuery 테스트 (`ApplicantQueryTest` 가 있으면 그곳, 없으면 통합 테스트에서) 다음 케이스 추가:

```java
@Test
@DisplayName("ASSIGNED InterviewSchedule 이 있으면 interviewStartAt 이 slot.startTime 으로 채워진다")
void applicantQuery_assignedInterview_populatesInterviewStartAt() {
    // given
    Recruitment recruitment = fixtureRecruitment(true);
    Application application = fixtureApplication(recruitment, ApplicationStatus.INTERVIEW_PENDING);
    InterviewSlot slot = fixtureSlot(recruitment, LocalDateTime.of(2026, 6, 20, 18, 0));
    fixtureAssignedSchedule(application, slot);

    List<ApplicantQuery> results = applicationRepository.findApplicants(
        recruitment.getId(), null, ApplicantSearchCondition.empty());

    ApplicantQuery target = results.stream()
        .filter(r -> r.applicationId().equals(application.getId()))
        .findFirst().orElseThrow();
    assertThat(target.interviewStartAt()).isEqualTo(LocalDateTime.of(2026, 6, 20, 18, 0));
}

@Test
@DisplayName("ASSIGNED schedule 이 없으면 interviewStartAt 은 null")
void applicantQuery_noAssignedInterview_returnsNull() {
    Recruitment recruitment = fixtureRecruitment(true);
    Application application = fixtureApplication(recruitment, ApplicationStatus.INTERVIEW_PENDING);

    List<ApplicantQuery> results = applicationRepository.findApplicants(
        recruitment.getId(), null, ApplicantSearchCondition.empty());

    assertThat(results.stream()
        .filter(r -> r.applicationId().equals(application.getId()))
        .findFirst().orElseThrow()
        .interviewStartAt()).isNull();
}
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
./gradlew test --tests "com.duing.domain.application.*Applicant*Test*"
```
Expected: `interviewStartAt` 메서드 없음 → 컴파일 실패.

- [ ] **Step 3: ApplicantQuery 필드 교체**

`ApplicantQuery.java` 의 `LocalDateTime interviewAt` 필드를 `LocalDateTime interviewStartAt` 로 변경. `from(Application)` 과 `fromAll(Application, Integer)` 팩토리는 더 이상 `application.getInterviewAt()` 호출하지 않음 — `interviewStartAt` 은 QueryDSL repo 에서 직접 set 한 값을 받도록 생성자 전용으로 사용.

```java
public record ApplicantQuery(
        Long applicationId,
        Long userId,
        String userName,
        String studentId,
        String email,
        College college,
        String major,
        Grade grade,
        List<String> answers,
        ApplicationStatus status,
        LocalDateTime submittedAt,
        LocalDateTime interviewStartAt,
        Integer myScore
) {
    public static ApplicantQuery of(Application application,
                                    LocalDateTime interviewStartAt,
                                    Integer myScore) {
        return new ApplicantQuery(
                application.getId(),
                application.getUser().getId(),
                application.getUser().getName(),
                application.getUser().getStudentId(),
                application.getUser().getEmail(),
                application.getUser().getCollege(),
                application.getUser().getMajor(),
                application.getUser().getGrade(),
                application.getAnswers(),
                application.getStatus(),
                application.getCreatedAt(),
                interviewStartAt,
                myScore
        );
    }
}
```

기존 `from` / `fromAll` 메서드는 제거. (호출자가 Task 4 의 repo 변경과 함께 `of(...)` 로 옮겨갈 것.)

- [ ] **Step 4: QueryDSL repo 의 ApplicantQuery 생성부 수정**

`ApplicationRepositoryImpl.java` 의 `findApplicants` (또는 동등 메서드) 안에서 QApplication 외에 QInterviewSchedule, QInterviewSlot 을 leftJoin:

```java
import static com.duing.domain.interview.entity.QInterviewSchedule.interviewSchedule;
import static com.duing.domain.interview.entity.QInterviewSlot.interviewSlot;

// 메서드 body
return queryFactory
    .select(application,
            applicationEvaluation.score,
            interviewSlot.startTime)
    .from(application)
    .leftJoin(applicationEvaluation).on(...)
    .leftJoin(interviewSchedule).on(
        interviewSchedule.applicationId.eq(application.id)
            .and(interviewSchedule.status.eq(InterviewScheduleStatus.ASSIGNED)))
    .leftJoin(interviewSlot).on(interviewSlot.id.eq(interviewSchedule.slotId))
    .where(...)
    .fetch()
    .stream()
    .map(tuple -> ApplicantQuery.of(
            tuple.get(application),
            tuple.get(interviewSlot.startTime),
            tuple.get(applicationEvaluation.score)))
    .toList();
```

> 정확한 기존 select 시그니처 / where 절은 기존 코드 그대로 유지. JOIN 만 추가.

- [ ] **Step 5: ApplicantResponse 갱신**

`ApplicantResponse.java`:
- 필드 `LocalDateTime interviewAt` → `LocalDateTime interviewStartAt`
- `from(ApplicantQuery)` 의 매핑을 `applicantQuery.interviewStartAt()` 로 교체

```java
public record ApplicantResponse(
        Long applicationId,
        Long userId,
        String userName,
        String studentId,
        String email,
        College college,
        String major,
        Grade grade,
        List<String> answers,
        ApplicationStatus status,
        LocalDateTime submittedAt,
        LocalDateTime interviewStartAt,
        Integer myScore
) {
    public static ApplicantResponse from(ApplicantQuery applicantQuery) {
        return new ApplicantResponse(
                applicantQuery.applicationId(),
                applicantQuery.userId(),
                applicantQuery.userName(),
                applicantQuery.studentId(),
                applicantQuery.email(),
                applicantQuery.college(),
                applicantQuery.major(),
                applicantQuery.grade(),
                applicantQuery.answers(),
                applicantQuery.status(),
                applicantQuery.submittedAt(),
                applicantQuery.interviewStartAt(),
                applicantQuery.myScore()
        );
    }
}
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
./gradlew test --tests "com.duing.domain.application.*Applicant*Test*"
./gradlew compileJava
```
Expected: 모두 PASS, compile clean.

- [ ] **Step 7: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/application/service/dto/query/ApplicantQuery.java \
       backend/src/main/java/com/duing/domain/application/controller/dto/response/ApplicantResponse.java \
       backend/src/main/java/com/duing/domain/application/repository/ApplicationRepositoryImpl.java \
       backend/src/test/java/com/duing/domain/application/
git commit -m "feat(application): ApplicantQuery scalar interviewStartAt 로 전환 (Legacy Removal Task 3)"
```

---

### Task 4: MyApplicationDetail · ApplicantDetail · ApplicationSummary 를 nested `interview` 로 전환

**Why**: 3 개 응답 DTO 가 동일 패턴 (nested `AssignedInterview` 객체) — 같은 트랜잭션으로 묶어 일관성 유지.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/application/service/dto/query/AssignedInterviewQuery.java`
- Modify: `domain/application/service/dto/query/MyApplicationDetailQuery.java`
- Modify: `domain/application/service/dto/query/ApplicantDetailQuery.java`
- Modify: `domain/application/service/dto/query/ApplicationSummaryQuery.java`
- Modify: `domain/application/controller/dto/response/MyApplicationDetailResponse.java`
- Modify: `domain/application/controller/dto/response/ApplicantDetailResponse.java`
- Modify: `domain/application/controller/dto/response/ApplicationSummaryResponse.java`
- Modify: `domain/application/service/GeneralApplicationService.java` (populate 코드)
- Modify: `domain/application/repository/ApplicationRepositoryImpl.java` (Summary QueryDSL — 있으면)

- [ ] **Step 1: 실패 테스트 작성 — MyApplicationDetailQuery**

`MyApplicationDetailQueryTest.java` 에 다음 케이스 추가/교체:

```java
@Test
@DisplayName("ASSIGNED InterviewSchedule 이 있으면 interview = { startAt, endAt, location } 으로 채워진다")
void myApplicationDetail_assignedInterview_populatesInterview() {
    // given (기존 fixture pattern 동일)
    InterviewConfig config = fixtureConfig(recruitment, "3호관 201호");
    InterviewSlot slot = fixtureSlot(recruitment,
        LocalDateTime.of(2026, 6, 20, 18, 0),
        LocalDateTime.of(2026, 6, 20, 18, 30));
    fixtureAssignedSchedule(application, slot);

    MyApplicationDetailQuery query = applicationService.getMyApplicationDetail(application.getId(), userId);

    assertThat(query.interview()).isNotNull();
    assertThat(query.interview().startAt()).isEqualTo(LocalDateTime.of(2026, 6, 20, 18, 0));
    assertThat(query.interview().endAt()).isEqualTo(LocalDateTime.of(2026, 6, 20, 18, 30));
    assertThat(query.interview().location()).isEqualTo("3호관 201호");
}

@Test
@DisplayName("ASSIGNED schedule 이 없으면 interview = null")
void myApplicationDetail_noSchedule_returnsNullInterview() {
    MyApplicationDetailQuery query = applicationService.getMyApplicationDetail(application.getId(), userId);
    assertThat(query.interview()).isNull();
}

@Test
@DisplayName("COMPLETED schedule 은 interview 응답에서 제외된다 (null)")
void myApplicationDetail_completedSchedule_returnsNullInterview() {
    fixtureCompletedSchedule(application, fixtureSlot(recruitment, LocalDateTime.now(), LocalDateTime.now().plusMinutes(30)));
    MyApplicationDetailQuery query = applicationService.getMyApplicationDetail(application.getId(), userId);
    assertThat(query.interview()).isNull();
}
```

ApplicantDetailQueryTest, ApplicationSummaryQuery 테스트에도 동일 매트릭스 3건.

- [ ] **Step 2: 테스트 실패 확인**

```bash
./gradlew test --tests "com.duing.domain.application.*Query*Test*"
```
Expected: `interview()` 메서드 없음 → 컴파일 실패.

- [ ] **Step 3: 공용 projection record 신설**

`backend/src/main/java/com/duing/domain/application/service/dto/query/AssignedInterviewQuery.java`:

```java
package com.duing.domain.application.service.dto.query;

import java.time.LocalDateTime;

public record AssignedInterviewQuery(
        LocalDateTime startAt,
        LocalDateTime endAt,
        String location
) {}
```

- [ ] **Step 4: 3 개 Query DTO 필드 교체**

`MyApplicationDetailQuery.java`:
- `LocalDateTime interviewAt`, `String interviewLocation`, `boolean interviewScheduleAssigned` 필드 제거
- `AssignedInterviewQuery interview` (nullable) 필드 추가
- `from(...)` 팩토리 시그니처에서 위 두 필드 받던 자리에 `AssignedInterviewQuery interview` 로 교체

`ApplicantDetailQuery.java`:
- `LocalDateTime interviewAt`, `String interviewLocation` 필드 제거
- `AssignedInterviewQuery interview` (nullable) 필드 추가
- (`assignedSlot`, `interviewAvailabilities` 는 유지)

`ApplicationSummaryQuery.java`:
- 같은 패턴

각 파일의 인근 javadoc/주석에서 Legacy 필드 설명 부분도 함께 정리.

- [ ] **Step 5: 3 개 Response DTO 필드 교체**

`MyApplicationDetailResponse.java`:

```java
public record MyApplicationDetailResponse(
        // ... 기존 필드 (interviewAt/Location/interviewScheduleAssigned 제외)
        AssignedInterview interview,
        // ...
) {
    public record AssignedInterview(
            LocalDateTime startAt,
            LocalDateTime endAt,
            String location
    ) {}

    public static MyApplicationDetailResponse from(MyApplicationDetailQuery query) {
        AssignedInterview interview = query.interview() == null
            ? null
            : new AssignedInterview(
                query.interview().startAt(),
                query.interview().endAt(),
                query.interview().location());
        return new MyApplicationDetailResponse(
                // ...
                interview,
                // ...
        );
    }
}
```

`ApplicantDetailResponse.java`, `ApplicationSummaryResponse.java` 도 동일 inner record `AssignedInterview` + 매핑.

- [ ] **Step 6: GeneralApplicationService 의 Query 생성부 수정**

`GeneralApplicationService.getMyApplicationDetail`, `getApplicantDetail`, `getMyApplications` (Summary 리스트) 의 Query DTO 생성 부분에서:
- `application.getInterviewAt()` / `application.getInterviewLocation()` 호출 제거
- 대신 `InterviewScheduleRepository.findByApplicationId(applicationId)` 로 ASSIGNED schedule 조회 → 있으면 `InterviewSlotRepository.findById(schedule.slotId)` + `InterviewConfigRepository.findByRecruitmentId(schedule.recruitmentId)` 로 join → `AssignedInterviewQuery` 생성

```java
// 헬퍼 메서드 (GeneralApplicationService 안에 private)
private AssignedInterviewQuery resolveAssignedInterview(Long applicationId, Long recruitmentId) {
    return interviewScheduleRepository.findByApplicationId(applicationId)
        .filter(schedule -> schedule.getStatus() == InterviewScheduleStatus.ASSIGNED)
        .flatMap(schedule -> interviewSlotRepository.findById(schedule.getSlotId()))
        .map(slot -> {
            String location = interviewConfigRepository.findByRecruitmentId(recruitmentId)
                .map(InterviewConfig::getLocation)
                .orElse(null);
            if (location == null) return null;
            return new AssignedInterviewQuery(slot.getStartTime(), slot.getEndTime(), location);
        })
        .orElse(null);
}
```

이 헬퍼를 3 Query DTO 생성부에서 호출. ApplicationSummary 리스트의 경우 N+1 발생 가능 — 가능하면 batch fetch 로 보완하되, 일단 단순 구현 후 통합 테스트에서 SQL count 검증 결과 따라 결정.

- [ ] **Step 7: 테스트 통과 확인**

```bash
./gradlew test --tests "com.duing.domain.application.*Query*Test*"
./gradlew compileJava compileTestJava
```
Expected: PASS, compile clean.

- [ ] **Step 8: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/application/service/dto/query/AssignedInterviewQuery.java \
       backend/src/main/java/com/duing/domain/application/service/dto/query/MyApplicationDetailQuery.java \
       backend/src/main/java/com/duing/domain/application/service/dto/query/ApplicantDetailQuery.java \
       backend/src/main/java/com/duing/domain/application/service/dto/query/ApplicationSummaryQuery.java \
       backend/src/main/java/com/duing/domain/application/controller/dto/response/ \
       backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java \
       backend/src/test/java/com/duing/domain/application/
git commit -m "feat(application): 3 응답 DTO nested interview 로 전환 + Query DTO JOIN 채움 (Legacy Removal Task 4)"
```

---

### Task 5: Legacy `updateInterview` API 경로 전면 제거

**Why**: API/Service/Command/Request DTO 가 응답 변경과 독립적 — 단독 task. Application 필드 제거의 전 단계 (Application.updateInterview 사용처가 모두 사라져야 entity strip 가능).

**Files:**
- Modify: `domain/application/api/LeaderApplicationApi.java`
- Modify: `domain/application/controller/LeaderApplicationController.java`
- Modify: `domain/application/service/ApplicationService.java`
- Modify: `domain/application/service/GeneralApplicationService.java`
- Delete: `domain/application/service/dto/command/UpdateInterviewCommand.java`
- Delete: `domain/application/controller/dto/request/UpdateApplicationInterviewRequest.java`
- Delete: `backend/src/test/java/com/duing/domain/application/service/ApplicationInterviewServiceTest.java`

- [ ] **Step 1: 실패 테스트 작성 (회귀 가드)**

`LeaderApplicationControllerTest` 등 통합 테스트에 다음 추가:

```java
@Test
@DisplayName("PATCH /leader/applications/{id}/interview 엔드포인트는 더 이상 존재하지 않는다 (404)")
void updateInterviewEndpoint_returns404() {
    given()
        .auth().preemptive().basic(...)
        .contentType(ContentType.JSON)
        .body(Map.of(
            "interviewAt", "2026-06-20T18:00:00",
            "interviewLocation", "3호관 201호"))
    .when()
        .patch("/leader/applications/" + applicationId + "/interview")
    .then()
        .statusCode(404);
}
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
./gradlew test --tests com.duing.domain.application.controller.LeaderApplicationControllerTest
```
Expected: 현재 200/204 → 404 기대와 불일치 → FAIL

- [ ] **Step 3: API/Controller 메서드 삭제**

`LeaderApplicationApi.java` 의 `updateInterview` Swagger 인터페이스 메서드 + `@PatchMapping` 관련 어노테이션 + javadoc 전부 삭제.
`LeaderApplicationController.java` 의 `updateInterview` 구현 메서드 삭제.

- [ ] **Step 4: Service 메서드 + 호출부 삭제**

`ApplicationService.java` 의 `void updateInterview(UpdateInterviewCommand command);` 삭제.
`GeneralApplicationService.java` 의 `updateInterview` 구현 (line 324-342) 통째로 삭제. `notifyInterviewScheduled(...)` 호출 사이트도 함께 사라짐 (헬퍼 메서드 자체는 다른 곳에서 안 쓰이면 같이 제거 — grep 으로 확인).

- [ ] **Step 5: Command + Request DTO 파일 삭제**

```bash
rm backend/src/main/java/com/duing/domain/application/service/dto/command/UpdateInterviewCommand.java
rm backend/src/main/java/com/duing/domain/application/controller/dto/request/UpdateApplicationInterviewRequest.java
```

- [ ] **Step 6: 미사용 import 정리**

`LeaderApplicationApi`, `LeaderApplicationController`, `GeneralApplicationService` 의 미사용 import 정리.

- [ ] **Step 7: 사용하지 않게 된 테스트 삭제**

```bash
rm backend/src/test/java/com/duing/domain/application/service/ApplicationInterviewServiceTest.java
```

- [ ] **Step 8: 빌드 + 테스트 통과 확인**

```bash
./gradlew compileJava compileTestJava
./gradlew test --tests com.duing.domain.application.controller.LeaderApplicationControllerTest
```
Expected: BUILD SUCCESSFUL, 회귀 가드 테스트 PASS.

- [ ] **Step 9: 커밋**

```bash
git add -A backend/src/main/java/com/duing/domain/application/api/LeaderApplicationApi.java \
          backend/src/main/java/com/duing/domain/application/controller/LeaderApplicationController.java \
          backend/src/main/java/com/duing/domain/application/service/ApplicationService.java \
          backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java \
          backend/src/main/java/com/duing/domain/application/service/dto/command/ \
          backend/src/main/java/com/duing/domain/application/controller/dto/request/ \
          backend/src/test/java/com/duing/domain/application/
git commit -m "feat(application): Legacy updateInterview API 경로 제거 (Legacy Removal Task 5)"
```

---

### Task 6: `Application` 엔티티에서 Legacy 필드/메서드 제거 + Flyway DROP COLUMN

**Why**: Task 3, 4, 5 후 모든 호출자가 사라졌으므로 entity 자체와 컬럼 제거 가능.

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/entity/Application.java`
- Create: `backend/src/main/resources/db/migration/V48__drop_application_interview_columns.sql`

- [ ] **Step 1: 사전 grep 확인 (회귀 가드)**

```bash
grep -rn "interviewAt\|interviewLocation\|updateInterview\|scheduleInterview" backend/src/main/java
```
Expected: 본 task 의 entity 파일 외 일치 없음. (Task 3 의 ApplicantQuery `interviewStartAt` 은 다른 이름이라 미포함.)

만약 다른 곳에서 일치하면 그 호출부 먼저 정리 후 진행.

- [ ] **Step 2: Application 엔티티 strip**

`Application.java` 에서 다음 모두 삭제:

```java
@Column(name = "interview_at")
private LocalDateTime interviewAt;

@Column(name = "interview_location", length = 200)
private String interviewLocation;

public void updateInterview(LocalDateTime interviewAt, String interviewLocation) { ... }
public void scheduleInterview(LocalDateTime interviewAt, String interviewLocation) { ... }
```

미사용 import (`java.time.LocalDateTime` 가 다른 곳에서 안 쓰이면) 정리.

- [ ] **Step 3: Flyway 마이그레이션 작성**

`backend/src/main/resources/db/migration/V48__drop_application_interview_columns.sql`:

```sql
ALTER TABLE application DROP COLUMN IF EXISTS interview_at;
ALTER TABLE application DROP COLUMN IF EXISTS interview_location;
```

- [ ] **Step 4: 전체 빌드 + 테스트**

```bash
./gradlew clean test
```
Expected: BUILD SUCCESSFUL. Flyway 가 V48 적용 후 TestContainers DB 스키마에 컬럼 부재. 기존 테스트 통과.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/application/entity/Application.java \
       backend/src/main/resources/db/migration/V48__drop_application_interview_columns.sql
git commit -m "feat(application): Application.interviewAt/Location 컬럼 + 메서드 제거 (Legacy Removal Task 6)"
```

---

### Task 7: BE PR 생성

- [ ] **Step 1: 푸시 + PR 생성**

```bash
git push -u origin feat/legacy-interview-removal-backend
gh pr create --base develop --title "feat(application): Legacy 면접 필드 제거 + Reminder Job InterviewSchedule 기반 재작성" \
  --body "$(cat <<'EOF'
## 🚀 작업 내용
면접 일정 Source of Truth 를 InterviewSchedule 로 일원화. Legacy `application.interviewAt`/`interviewLocation` 컬럼과 그에 의존하는 모든 코드 경로를 제거한다. Reminder Job 은 InterviewSchedule.slot.startTime 기반으로 재작성하되 dedup_key 포맷 유지로 재배정 자동 처리를 보존.

## 🤔 고민했던 내용
- 운영 데이터 0 전제로 dual-write 폐기, 단일 PR atomic 제거 선택.
- 3 응답 DTO 는 nested `interview: { startAt, endAt, location }` 채택. ApplicantResponse 만 scalar `interviewStartAt` 으로 — 리스트 row 컨텍스트.
- `interview.status` 미포함 (ASSIGNED 만 노출 정책).

## 💬 리뷰 중점사항
- Query DTO JOIN 의 N+1 여부.
- Reminder Job dedup_key 포맷 유지 (재배정 자동 처리 보존).
- 응답 nested 가 모든 호출 경로에서 일관되게 채워지는지.

본 PR 머지 후 FE PR rebase + 머지 예정.
EOF
)"
```

---

# Frontend PR

브랜치: `feat/legacy-interview-removal-frontend` (develop 분기)

각 Task 끝에서 `pnpm --filter @duing/web typecheck` + 해당 테스트 통과.

---

### Task 8: schema.d.ts 수동 갱신

**Why**: BE PR 의 응답 형태에 맞춤. 모든 후속 FE task 의 의존성.

**Files:**
- Modify: `frontend/packages/api/src/generated/schema.d.ts`

- [ ] **Step 1: 응답 schema 갱신**

`schema.d.ts` 에서 다음 변경:

`MyApplicationDetailResponse` schema:
```jsonc
// 제거: interviewAt, interviewLocation, interviewScheduleAssigned
// 추가:
interview: {
  startAt: string;
  endAt: string;
  location: string;
} | null;
```

`ApplicantDetailResponse` schema:
```jsonc
// 제거: interviewAt, interviewLocation
// 추가:
interview: {
  startAt: string;
  endAt: string;
  location: string;
} | null;
```

`ApplicantResponse` schema:
```jsonc
// 제거: interviewAt
// 추가:
interviewStartAt: string | null;
```

`ApplicationSummaryResponse` schema:
```jsonc
// 제거: interviewAt, interviewLocation
// 추가:
interview: { ... } | null;
```

`paths` 객체에서 `/leader/applications/{applicationId}/interview` 의 `patch` 항목 + 해당 `operations["updateInterview"]` 블럭 + `UpdateApplicationInterviewRequest` schema 전체 제거.

- [ ] **Step 2: typecheck 확인 (실패 예상)**

```bash
cd frontend && pnpm --filter @duing/web typecheck
```
Expected: 다른 곳에서 schema 의 옛 필드 참조 → 컴파일 실패. (Task 9 에서 fix)

- [ ] **Step 3: 커밋**

```bash
git add frontend/packages/api/src/generated/schema.d.ts
git commit -m "feat(api): schema.d.ts — 응답 nested interview 구조 반영 (Legacy Removal Task 8)"
```

---

### Task 9: 도메인 타입 갱신 (`@duing/types`)

**Files:**
- Modify: `frontend/packages/types/src/application.ts`

- [ ] **Step 1: `AssignedInterview` 타입 신설 + 응답 타입 갱신**

`packages/types/src/application.ts` 에서:

```ts
// 신설
export type AssignedInterview = {
  startAt: string;
  endAt: string;
  location: string;
};

// Applicant — interviewAt 제거, interviewStartAt 추가
export type Applicant = {
  // ... 기존 필드 (interviewAt 제외)
  interviewStartAt: string | null;
};

// MyApplicationDetail — interviewAt, interviewLocation, interviewScheduleAssigned 제거, interview 추가
export type MyApplicationDetail = {
  // ... 기존 필드 (위 3개 제외)
  interview: AssignedInterview | null;
};

// ApplicantDetail — 동일 패턴
export type ApplicantDetail = {
  // ... 기존 필드 (interviewAt, interviewLocation 제외)
  interview: AssignedInterview | null;
};

// ApplicationSummary — 동일 패턴
export type ApplicationSummary = {
  // ... 기존 필드 (interviewAt, interviewLocation 제외)
  interview: AssignedInterview | null;
};

// 제거
// export type UpdateInterviewPayload = { ... };
```

- [ ] **Step 2: typecheck 확인**

```bash
cd frontend && pnpm --filter @duing/types typecheck 2>&1 || true
pnpm --filter @duing/web typecheck 2>&1 | head -40
```
Expected: 다른 패키지의 옛 필드 참조 → 여전히 실패. Task 10–12 에서 fix.

- [ ] **Step 3: 커밋**

```bash
git add frontend/packages/types/src/application.ts
git commit -m "feat(types): AssignedInterview 신설 + 응답 타입 nested interview 로 전환 (Legacy Removal Task 9)"
```

---

### Task 10: API Client + Hooks 정리

**Files:**
- Modify: `frontend/packages/api/src/client.ts`
- Modify: `frontend/packages/hooks/src/applications.ts`
- Modify: `frontend/packages/hooks/src/index.ts`

- [ ] **Step 1: client.ts 에서 `updateInterview` 제거**

`packages/api/src/client.ts`:
- `import { ... UpdateInterviewPayload, ... }` 에서 `UpdateInterviewPayload` 제거
- 인터페이스의 `updateInterview(applicationId: number, payload: UpdateInterviewPayload): Promise<void>;` 시그니처 제거
- 실제 구현부 `updateInterview: (applicationId, payload) => ...` 객체 키 제거

- [ ] **Step 2: hooks 에서 `useUpdateInterviewMutation` 제거**

`packages/hooks/src/applications.ts`:
- import 의 `UpdateInterviewPayload` 제거
- `useUpdateInterviewMutation` 함수 전체 (line 147+) 삭제

`packages/hooks/src/index.ts`:
- export 목록에서 `useUpdateInterviewMutation` 제거

- [ ] **Step 3: typecheck 확인**

```bash
cd frontend && pnpm --filter @duing/hooks typecheck && pnpm --filter @duing/api typecheck
```
Expected: 두 패키지 모두 PASS. (web 은 아직 컴포넌트 미정리로 실패.)

- [ ] **Step 4: 커밋**

```bash
git add frontend/packages/api/src/client.ts \
       frontend/packages/hooks/src/applications.ts \
       frontend/packages/hooks/src/index.ts
git commit -m "feat(api): updateInterview client + useUpdateInterviewMutation hook 제거 (Legacy Removal Task 10)"
```

---

### Task 11: InterviewModal 삭제 + StatusActionBar/ApplicantDetailPage 정리

**Files:**
- Delete: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/InterviewModal.tsx`
- Modify: `.../_components/StatusActionBar.tsx`
- Modify: `.../_components/ApplicantDetailPage.tsx`

- [ ] **Step 1: InterviewModal 삭제**

```bash
rm "frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/InterviewModal.tsx"
```

- [ ] **Step 2: StatusActionBar 정리**

`StatusActionBar.tsx` 전체를 다음으로 교체:

```tsx
'use client';

import { useUpdateApplicationStatusMutation } from '@duing/hooks';
import type { ApplicationStatus, UpdateApplicationStatusPayload } from '@duing/types';
import { allowedTransitionsFrom } from '../../_components/applicationStatusTransitions';
import { APPLICATION_STATUS_LABEL } from '../../../../../../../../_constants/application-status';

type Props = {
  applicationId: number;
  recruitmentId: number;
  currentStatus: ApplicationStatus;
  useInterview: boolean;
};

export function StatusActionBar({
  applicationId,
  recruitmentId,
  currentStatus,
  useInterview,
}: Props) {
  const updateStatus = useUpdateApplicationStatusMutation(recruitmentId);

  const transitions = allowedTransitionsFrom(currentStatus, useInterview);

  return (
    <section className="rounded border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold text-slate-900">상태 변경</h2>
      {transitions.length === 0 ? (
        <p className="text-sm text-slate-400">더 이상 변경 가능한 상태가 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {transitions.map((target) => (
            <button
              key={target}
              type="button"
              onClick={() =>
                updateStatus.mutate({
                  applicationId,
                  payload: { status: target } satisfies UpdateApplicationStatusPayload,
                })
              }
              disabled={updateStatus.isPending}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {APPLICATION_STATUS_LABEL[target]}으로
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
```

(useState, InterviewModal import, `hasInterviewConfig` prop, `legacyInterviewInputAllowed`, "면접 일정 입력" 버튼, 모달 렌더 모두 사라짐.)

- [ ] **Step 3: ApplicantDetailPage 에서 `hasInterviewConfig` 제거**

`ApplicantDetailPage.tsx`:
- `const hasInterviewConfig = recruitment?.interviewAvailabilityDeadline != null;` 라인 삭제
- `<StatusActionBar ... hasInterviewConfig={hasInterviewConfig} />` 의 prop 전달 삭제

- [ ] **Step 4: typecheck 확인**

```bash
cd frontend && pnpm --filter @duing/web typecheck 2>&1 | head -20
```
Expected: 표시 컴포넌트 (Task 12) 와 테스트 (Task 13) 외에는 통과. 표시 컴포넌트가 아직 옛 필드 참조 중.

- [ ] **Step 5: 커밋**

```bash
git add -A "frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/"
git commit -m "feat(manage): InterviewModal 삭제 + StatusActionBar Legacy 버튼 제거 (Legacy Removal Task 11)"
```

---

### Task 12: 표시 컴포넌트 4 개 갱신

**Files:**
- Modify: `apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ApplicantProfilePanel.tsx`
- Modify: `apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantTable.tsx`
- Modify: `apps/web/app/me/_components/SectionApply.tsx`
- Modify: `apps/web/app/me/applications/_pages/ApplicationsPage.tsx`

- [ ] **Step 1: ApplicantProfilePanel 갱신**

기존:
```tsx
{detail.interviewAt && (
  <>
    <dt>면접일정</dt>
    <dd>
      {new Date(detail.interviewAt).toLocaleString('ko-KR')}
      {detail.interviewLocation && ` · ${detail.interviewLocation}`}
    </dd>
  </>
)}
```

→ 신규:
```tsx
{detail.interview && (
  <>
    <dt>면접일정</dt>
    <dd>
      {new Date(detail.interview.startAt).toLocaleString('ko-KR')}
      {' · '}
      {detail.interview.location}
    </dd>
  </>
)}
```

- [ ] **Step 2: ApplicantTable 갱신**

기존 `applicant.interviewAt ? new Date(applicant.interviewAt).toLocaleString('ko-KR') : '—'` 의 `interviewAt` → `interviewStartAt` 로 교체:

```tsx
{useInterview && (
  <td className="px-4 py-3 text-slate-600">
    {applicant.interviewStartAt
      ? new Date(applicant.interviewStartAt).toLocaleString('ko-KR')
      : '—'}
  </td>
)}
```

- [ ] **Step 3: SectionApply 갱신**

`apps/web/app/me/_components/SectionApply.tsx` 에서 `interviewAt`/`interviewLocation` 직접 참조 두 곳을 다음 패턴으로 교체 (정확한 jsx 구조는 기존 코드 보존):

```tsx
// 기존: row.interviewAt, row.interviewLocation
// 신규: row.interview?.startAt, row.interview?.location
{row.interview && (
  <span>
    {new Date(row.interview.startAt).toLocaleString('ko-KR')} · {row.interview.location}
  </span>
)}
```

- [ ] **Step 4: ApplicationsPage 갱신**

`apps/web/app/me/applications/_pages/ApplicationsPage.tsx` 동일 패턴.

- [ ] **Step 5: typecheck 확인**

```bash
cd frontend && pnpm --filter @duing/web typecheck
```
Expected: 본 task 까지 표시 컴포넌트 정리 완료 → 통과. (테스트 파일은 Task 13.)

- [ ] **Step 6: 커밋**

```bash
git add -A "frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/" \
          frontend/apps/web/app/me/
git commit -m "feat(manage,me): 표시 컴포넌트 4개 nested interview 로 전환 (Legacy Removal Task 12)"
```

---

### Task 13: 테스트 갱신

**Files:**
- Modify: `apps/web/test/manage/applicants/detail/status-action-bar.test.tsx`
- Modify: `apps/web/test/me/section-apply.test.tsx`
- Modify: `apps/web/test/me/section-archived.test.tsx`
- Modify: `apps/web/test/manage/applicants/applicant-table-extension.test.tsx`

- [ ] **Step 1: status-action-bar.test.tsx 회귀 가드로 재정렬**

전체 파일을 다음으로 교체:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusActionBar } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/StatusActionBar';

const mockMutate = vi.fn();

vi.mock('@duing/hooks', () => ({
  useUpdateApplicationStatusMutation: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('StatusActionBar', () => {
  it('UNDER_REVIEW + useInterview=true 면 면접대기와 불합격 버튼이 노출되고 합격 버튼은 없다', () => {
    render(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="UNDER_REVIEW" useInterview />);
    expect(screen.getByRole('button', { name: /면접 대상/ })).toBeInTheDocument();
    const buttonTexts = screen.getAllByRole('button').map((btn) => btn.textContent ?? '');
    expect(buttonTexts.some((text) => text.includes('불합격'))).toBe(true);
    expect(buttonTexts.every((text) => !text.trim().startsWith('합격'))).toBe(true);
  });

  it('UNDER_REVIEW + useInterview=false 면 합격과 불합격 버튼이 노출된다', () => {
    render(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="UNDER_REVIEW" useInterview={false} />);
    expect(screen.queryByRole('button', { name: /면접 대상/ })).not.toBeInTheDocument();
    const buttonTexts = screen.getAllByRole('button').map((btn) => btn.textContent ?? '');
    expect(buttonTexts.some((text) => text.includes('합격'))).toBe(true);
    expect(buttonTexts.some((text) => text.includes('불합격'))).toBe(true);
  });

  it('어떤 상태/조합에서도 "면접 일정 입력" 버튼이 렌더되지 않는다 (Legacy 회귀 가드)', () => {
    render(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="INTERVIEW_PENDING" useInterview />);
    expect(screen.queryByRole('button', { name: '면접 일정 입력' })).not.toBeInTheDocument();
  });

  it('ACCEPTED 상태에서 최종 상태 메시지가 표시된다', () => {
    render(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="ACCEPTED" useInterview />);
    expect(screen.getByText(/더 이상 변경 가능한 상태가 없습니다/)).toBeInTheDocument();
  });

  it('전이 버튼 클릭 시 updateStatus mutation 이 호출된다', async () => {
    render(<StatusActionBar applicationId={5} recruitmentId={2} currentStatus="SUBMITTED" useInterview />);
    await userEvent.click(screen.getByRole('button', { name: /서류 검토 중으로/ }));
    expect(mockMutate).toHaveBeenCalledWith({ applicationId: 5, payload: { status: 'UNDER_REVIEW' } });
  });
});
```

(`useUpdateInterviewMutation` mock 라인, `hasInterviewConfig` prop 전달, Legacy 버튼 노출 케이스 3개 모두 제거. 회귀 가드 1건 추가.)

- [ ] **Step 2: section-apply.test.tsx 갱신**

테스트 fixture 의 `interviewAt`/`interviewLocation` 필드를 `interview: { startAt, endAt, location }` 로 교체. 검증 부분도 `interview.startAt` / `interview.location` 으로 참조 변경.

- [ ] **Step 3: section-archived.test.tsx 갱신**

동일 패턴.

- [ ] **Step 4: applicant-table-extension.test.tsx 갱신**

`interviewAt` 필드 → `interviewStartAt`.

- [ ] **Step 5: 테스트 + typecheck**

```bash
cd frontend && pnpm --filter @duing/web typecheck && pnpm --filter @duing/web test
```
Expected: 모든 테스트 PASS.

- [ ] **Step 6: 커밋**

```bash
git add -A frontend/apps/web/test/
git commit -m "test(web): Legacy interview 필드 의존 테스트 정리 + 회귀 가드 추가 (Legacy Removal Task 13)"
```

---

### Task 14: FE PR 생성 + BE 머지 후 rebase

- [ ] **Step 1: 푸시 + PR 생성**

```bash
git push -u origin feat/legacy-interview-removal-frontend
gh pr create --base develop --title "feat(web): Legacy 면접 필드 응답 nested 전환 + InterviewModal 제거" \
  --body "$(cat <<'EOF'
## 🚀 작업 내용
BE PR (#XXX) 의 응답 형태에 맞춰 schema.d.ts 수동 갱신 + 타입/컴포넌트/테스트 정리. Legacy InterviewModal 진입점을 코드베이스에서 완전히 제거.

## 🤔 고민했던 내용
- 3 응답은 nested `interview` 객체로, 운영진 목록 row 하나는 scalar `interviewStartAt` 으로 — 표현 단위 차이 반영.
- StatusActionBar 의 `hasInterviewConfig` prop + `legacyInterviewInputAllowed` 도출은 Legacy 버튼 자체가 사라지면서 의미 잃음 — 모두 정리.

## 💬 리뷰 중점사항
- schema.d.ts 가 BE 응답과 정확히 일치하는지.
- 회귀 가드 테스트 (`면접 일정 입력 버튼이 렌더되지 않는다`) 가 향후 Legacy 진입점 부활을 방지하는지.

본 PR 은 BE PR 머지 후 rebase 해서 머지.
EOF
)"
```

- [ ] **Step 2: BE PR 머지 대기 → 머지되면 rebase**

BE PR 이 develop 으로 머지된 후:

```bash
git checkout feat/legacy-interview-removal-frontend
git fetch origin
git rebase origin/develop
git push --force-with-lease
```

`frontend-ci` 가 develop tip 위에서 재실행 → green → 머지.

---

## Self-Review

### Spec coverage

| Spec 항목 | 대응 Task |
|---|---|
| §3.1 응답 nested 적용 (3개) | Task 4 |
| §3.1 ApplicantResponse scalar | Task 3 |
| §3.1 `interviewScheduleAssigned` 제거 | Task 4 (MyApplicationDetailResponse) |
| §3.2 Query DTO JOIN | Task 3 (Applicant), Task 4 (나머지 3) |
| §3.3 Reminder Job 재작성 | Task 2 |
| §3.3 dedup_key 포맷 유지 | Task 2 Step 3 |
| §3.4 쓰기 경로 제거 | Task 5 |
| §3.4 Application 메서드 2개 + 필드 제거 | Task 6 |
| §3.5 Flyway V48 | Task 6 |
| §4.1 schema.d.ts 갱신 | Task 8 |
| §4.2 타입 갱신 | Task 9 |
| §4.3 client + hooks 정리 | Task 10 |
| §4.4 InterviewModal 삭제 + 컴포넌트 정리 | Task 11, Task 12 |
| §4.5 회귀 가드 테스트 1건 | Task 13 Step 1 |
| §4.5 표시 테스트 4개 갱신 | Task 13 Step 2–4 |

빠진 spec 요구사항 없음.

### Placeholder scan

- "기존 fixture pattern" / "기존 select 시그니처 유지" 등의 표현이 일부 step 에 있으나, 이는 실제 코드 위치 (`ApplicationRepositoryImpl.java` 의 특정 메서드) 가 명시되어 있고 구현자가 그 파일을 보면 즉시 확인 가능 — 실행 차단성 placeholder 아님.
- `notificationService.createIfAbsent(...)` 시그니처 — 본 plan 에 explicit fallback ("기존 호출 패턴 따라 조정") 명시.

### Type consistency

- `AssignedInterviewQuery` (Task 4) ↔ Response inner record `AssignedInterview` (Task 4 Step 5) — 두 단어 다름. 의도적 (query layer vs response layer 별 record). 명시적으로 매핑하는 코드 포함되어 있음.
- `interviewStartAt` 명명이 ApplicantQuery (Task 3) → ApplicantResponse (Task 3) → schema.d.ts (Task 8) → Applicant 타입 (Task 9) → ApplicantTable (Task 12) → 테스트 (Task 13) 일관.
- `interview` 명명이 3 응답 + 3 도메인 타입 + schema + 표시 컴포넌트 일관.

문제 없음.
