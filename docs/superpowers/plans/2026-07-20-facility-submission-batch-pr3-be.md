# 학교 제출(Submission Batch) PR-3 백엔드 구현 계획 — Batch 완료 처리

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 담당자가 실제 학교 제출을 마친 시점의 "Batch 완료 처리" — 포함 예약을 best-effort 로 CONFIRMED 전이하고, 사람이 읽는 감사 요약을 남기며, 목록/상세 응답을 완료 상태·감사 이력으로 확장한다. **+v3: candidates 를 전 시설 조회로 확장(facilityId 옵션화, PR-4a 준비 탭의 시설별 섹션 기반).**

**Architecture:** V88(완료 컬럼 2개 + 감사 detail). Batch 상태 3종(검토 중/제출 완료/취소) 상호 배타 — batch 행잠금으로 완료/취소 동시 실행 직렬화. 전이는 기존 `confirmManually` 경로 재사용(상태 머신 무변경), 비APPROVED 는 스킵하고 응답·감사에 사유 나열. FE 는 교차 무효화 1줄만(이월분).

**Tech Stack:** Spring Boot 3.4 / Flyway V88 / 기존 facilitysubmission 도메인 확장.

**스펙:** `docs/superpowers/specs/2026-07-19-facility-submission-batch-design.md` **v2.1** — §2(V88)·§4.2/4.3·§5.3/5.4/5.6/5.7·§9 PR-3

## Global Constraints

- 기존 예약 상태 머신 무변경 — 전이는 `booking.confirmManually(now)` 만 사용(APPROVED 에서만 호출), 기존 마이그레이션 파일 수정 금지
- 커밋: Conventional Commits 한국어, Co-Authored-By/🤖 라인 금지, **push·PR 생성 금지**
- 완료 응답 계약(§4.3): `{ totalCount, confirmedCount, skippedCount, skippedBookings: [{bookingId, status}] }`
- 감사 요약 detail(§4.3): `학교 제출 완료 — 총 10건 / 등록 완료 8건 / 제외 2건: 예약 #123(취소됨), 예약 #531(충돌)` — 제외 0건이면 `학교 제출 완료 — 총 8건 / 등록 완료 8건`. 사유는 한글 라벨(취소됨/충돌/이미 등록 완료), 500자 절단(서로게이트 안전 — 기존 truncate 재사용)
- 상호 배타 가드: complete ← 기취소 409·기완료 409 / cancel ← **기완료 409(신규)**·기취소 409. 완료·취소 모두 **batch 행잠금(`findByIdForUpdate`)** 경유(동시 실행 직렬화 — 기존 이월 Minor 해소)
- 감사 이벤트는 기존 4종 + `COMPLETED` — 목록 조회 기록 금지 유지. 기존 4이벤트의 audit 은 detail null(하위호환)
- 예외 메시지 `private static final String MESSAGE` 상수(레포 다수 관례), 사용자 문구 한글
- 조회+감사 기록 메서드는 쓰기 `@Transactional`(readOnly 함정), 테스트 상대 날짜, `@DisplayName` 요구사항 문장
- 빌드·테스트는 `backend/` cwd, `| tail` 로 exit code 가리지 말 것. FE 검증은 `frontend/` cwd

**브랜치:** `feat/facility-submission-complete-be` (develop eff19678 에서 분기). 구현 subagent 는 push·PR 금지.

---

### Task 1: V88 + 엔티티 확장(complete·cancel 가드·audit detail) + 예외 2종

**Files:**
- Create: `backend/src/main/resources/db/migration/V88__facility_submission_completion.sql`
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/entity/FacilitySubmissionBatch.java`
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/entity/FacilitySubmissionAudit.java`
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/entity/SubmissionAuditAction.java` (`COMPLETED` 추가)
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/exception/FacilitySubmissionException.java` (inner 2개 추가)
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/repository/FacilitySubmissionPersistenceIntegrationTest.java` (테스트 추가)

**Interfaces:**
- Produces: `batch.complete(Long adminId, LocalDateTime completedAt)`(기취소·기완료 throw), `batch.isCompleted()`, `batch.getCompletedAt()/getCompletedById()`, `cancel()` 에 기완료 가드, `FacilitySubmissionAudit.of(batchId, action, adminId, ip, ua, detail)` 오버로드(detail 500 절단), `SubmissionAuditAction.COMPLETED`, 예외 `BatchAlreadyCompletedException`(409)·`CompletedBatchUncancellableException`(409)

- [ ] **Step 1: 실패하는 테스트 추가** (기존 영속성 테스트 파일에 — 기존 픽스처 헬퍼 재사용)

```java
    @Test
    @DisplayName("완료 처리된 Batch 는 완료 시각·처리자와 함께 저장되고 감사 detail 도 함께 남는다")
    void completedBatchPersistsWithDetailAudit() {
        User admin = userRepository.save(UserFixture.admin());
        Facility facility = facilityRepository.save(Facility.create(90005, "커뮤니티룸(5)", "1507호", 0));
        FacilitySubmissionBatch batch = batchRepository.save(FacilitySubmissionBatch.create(
                "SUB-20260801-005", facility.getId(), admin.getId(), LocalDateTime.now(), null));

        batch.complete(admin.getId(), LocalDateTime.now());
        batchRepository.save(batch);
        FacilitySubmissionAudit savedAudit = auditRepository.save(FacilitySubmissionAudit.of(
                batch.getId(), SubmissionAuditAction.COMPLETED, admin.getId(), "127.0.0.1", "JUnit",
                "학교 제출 완료 — 총 1건 / 등록 완료 1건"));

        FacilitySubmissionBatch found = batchRepository.findById(batch.getId()).orElseThrow();
        assertThat(found.isCompleted()).isTrue();
        assertThat(found.getCompletedById()).isEqualTo(admin.getId());
        assertThat(auditRepository.findById(savedAudit.getId()).orElseThrow().getDetail())
                .isEqualTo("학교 제출 완료 — 총 1건 / 등록 완료 1건");
    }

    @Test
    @DisplayName("완료된 Batch 는 취소할 수 없고, 완료·취소는 각각 중복 처리가 거부된다")
    void completionAndCancellationAreMutuallyExclusive() {
        User admin = userRepository.save(UserFixture.admin());
        Facility facility = facilityRepository.save(Facility.create(90006, "커뮤니티룸(6)", "1508호", 0));
        FacilitySubmissionBatch completed = batchRepository.save(FacilitySubmissionBatch.create(
                "SUB-20260801-006", facility.getId(), admin.getId(), LocalDateTime.now(), null));
        completed.complete(admin.getId(), LocalDateTime.now());

        assertThatThrownBy(() -> completed.cancel(admin.getId(), LocalDateTime.now()))
                .isInstanceOf(FacilitySubmissionException.CompletedBatchUncancellableException.class);
        assertThatThrownBy(() -> completed.complete(admin.getId(), LocalDateTime.now()))
                .isInstanceOf(FacilitySubmissionException.BatchAlreadyCompletedException.class);

        FacilitySubmissionBatch cancelled = batchRepository.save(FacilitySubmissionBatch.create(
                "SUB-20260801-007", facility.getId(), admin.getId(), LocalDateTime.now(), null));
        cancelled.cancel(admin.getId(), LocalDateTime.now());
        assertThatThrownBy(() -> cancelled.complete(admin.getId(), LocalDateTime.now()))
                .isInstanceOf(FacilitySubmissionException.BatchAlreadyCancelledException.class);
    }

    @Test
    @DisplayName("501자 감사 detail 은 500자로 절단되어 저장된다")
    void oversizedAuditDetailIsTruncated() {
        User admin = userRepository.save(UserFixture.admin());
        Facility facility = facilityRepository.save(Facility.create(90007, "커뮤니티룸(7)", "1509호", 0));
        FacilitySubmissionBatch batch = batchRepository.save(FacilitySubmissionBatch.create(
                "SUB-20260801-008", facility.getId(), admin.getId(), LocalDateTime.now(), null));

        FacilitySubmissionAudit saved = auditRepository.save(FacilitySubmissionAudit.of(
                batch.getId(), SubmissionAuditAction.COMPLETED, admin.getId(), "127.0.0.1", "JUnit",
                "가".repeat(501)));

        assertThat(auditRepository.findById(saved.getId()).orElseThrow().getDetail()).hasSize(500);
    }
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests FacilitySubmissionPersistenceIntegrationTest`
Expected: 컴파일 실패

- [ ] **Step 3: V88 작성**

```sql
-- 학교 제출 완료 처리(스펙 v2.1 §2·§4.3) — Batch 상태 3종(검토 중/제출 완료/취소) 상호 배타.
ALTER TABLE facility_submission_batch
    ADD COLUMN completed_at TIMESTAMP,
    ADD COLUMN completed_by BIGINT REFERENCES users (id);

-- 사람이 읽는 감사 요약(COMPLETED 전용, 기존 이벤트는 NULL) — auth_event.detail 전례(500·절단 내장)
ALTER TABLE facility_submission_audit
    ADD COLUMN detail VARCHAR(500);
```

- [ ] **Step 4: 엔티티·enum·예외 확장**

`FacilitySubmissionBatch.java` — 필드 2개 추가 + `cancel()` 교체 + `complete()`/`isCompleted()` 추가:

```java
    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "completed_by")
    private Long completedById;
```

```java
    /** 제출 취소(§4) — booking·item 은 건드리지 않는다. 완료된 Batch 는 종결 상태라 취소 불가(§4.2). */
    public void cancel(Long adminId, LocalDateTime cancelledAt) {
        if (isCompleted()) {
            throw new FacilitySubmissionException.CompletedBatchUncancellableException();
        }
        if (isCancelled()) {
            throw new FacilitySubmissionException.BatchAlreadyCancelledException();
        }
        this.cancelledAt = cancelledAt;
        this.cancelledById = adminId;
    }

    /** 학교 제출 완료(§4.3) — 담당자가 실제 제출을 마친 시점의 종결 전이. 취소와 상호 배타. */
    public void complete(Long adminId, LocalDateTime completedAt) {
        if (isCancelled()) {
            throw new FacilitySubmissionException.BatchAlreadyCancelledException();
        }
        if (isCompleted()) {
            throw new FacilitySubmissionException.BatchAlreadyCompletedException();
        }
        this.completedAt = completedAt;
        this.completedById = adminId;
    }

    public boolean isCompleted() {
        return completedAt != null;
    }
```

`SubmissionAuditAction.java` — `COMPLETED` 값 추가(주석의 "4개" 문구를 5개 기준으로 갱신).

`FacilitySubmissionAudit.java` — 필드 `@Column(length = 500) private String detail;` + builder 파라미터 추가, 기존 5-인자 `of(...)` 는 `of(batchId, action, adminId, ipAddress, userAgent, null)` 위임으로 유지하고 6-인자 오버로드 신설(detail 은 `truncate(detail, 500)`).

`FacilitySubmissionException.java` — inner 2개(기존 MESSAGE 상수 패턴 그대로):

```java
    public static class BatchAlreadyCompletedException extends FacilitySubmissionException {
        private static final String MESSAGE = "이미 학교 제출 완료 처리된 Batch입니다.";

        public BatchAlreadyCompletedException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static class CompletedBatchUncancellableException extends FacilitySubmissionException {
        private static final String MESSAGE = "학교 제출이 완료된 Batch는 취소할 수 없습니다.";

        public CompletedBatchUncancellableException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }
```

- [ ] **Step 5: 통과 확인**

Run: `cd backend && ./gradlew test --tests FacilitySubmissionPersistenceIntegrationTest`
Expected: PASS (7/7 — 기존 4 + 신규 3)

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/resources/db/migration/V88__facility_submission_completion.sql \
  backend/src/main/java/com/duing/domain/facilitysubmission/ \
  backend/src/test/java/com/duing/domain/facilitysubmission/
git commit -m "feat(backend): 제출 Batch 완료 상태·감사 detail 스키마 추가"
```

---

### Task 2: 완료 처리 서비스 + batch 행잠금 + 동시성 테스트

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/repository/FacilitySubmissionBatchRepository.java` (`findByIdForUpdate` 추가)
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/service/FacilitySubmissionService.java` (complete 추가)
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionService.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/SubmissionCompletionSummaryFormatter.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/dto/query/CompleteSubmissionBatchResult.java`
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/service/SubmissionCompletionSummaryFormatterTest.java` (순수 유닛)
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionServiceIntegrationTest.java` (완료 테스트 추가)
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/service/FacilitySubmissionConcurrencyTest.java` (완료/취소 레이스 추가)

**Interfaces:**
- Consumes: Task 1 산출물, 기존 `FacilityBookingRepository.findAllByIdInForUpdate`, `FacilityBookingStatusHistory.record`, `FacilityBookingConfirmedEvent(bookingId, clubId, historyId)`, `booking.confirmManually(LocalDateTime)`
- Produces(Task 4 소비): `FacilitySubmissionService.complete(Long batchId, SubmissionActorContext actor) → CompleteSubmissionBatchResult(int totalCount, int confirmedCount, LocalDateTime completedAt, List<SkippedBooking> skippedBookings)` — `SkippedBooking(Long bookingId, BookingStatus status, String reason)` 중첩 record(**reason = 사람이 읽는 한글 라벨**, FE 재매핑 불요)
- Produces(내부): `SubmissionCompletionSummaryFormatter` — `reasonLabel(BookingStatus) → String`, `summarize(int totalCount, int confirmedCount, List<SkippedBooking>) → String`. **응답 reason 과 감사 요약의 표현 단일 출처**(스펙 §4.3 v2.2 보완) — 서비스는 호출만 한다

- [ ] **Step 1: 실패하는 통합 테스트 추가** (기존 서비스 통합 테스트 파일에 — 픽스처 헬퍼 재사용)

```java
    @Test
    @DisplayName("완료 처리는 APPROVED 예약을 CONFIRMED 로 전이하고 이력·감사 요약을 남긴다")
    void completeConfirmsApprovedBookingsWithHistoryAndAudit() {
        FacilityBooking first = approvedBooking(9);
        FacilityBooking second = approvedBooking(11);
        CreateSubmissionBatchResult created = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(first.getId(), second.getId()), null), actor());

        CompleteSubmissionBatchResult result = submissionService.complete(created.batchId(), actor());

        assertThat(result.totalCount()).isEqualTo(2);
        assertThat(result.confirmedCount()).isEqualTo(2);
        assertThat(result.completedAt()).isNotNull();
        assertThat(result.skippedBookings()).isEmpty();
        assertThat(bookingRepository.findById(first.getId()).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.CONFIRMED);
        assertThat(batchRepository.findById(created.batchId()).orElseThrow().isCompleted()).isTrue();
        List<FacilitySubmissionAudit> audits = auditRepository.findByBatchIdOrderByIdAsc(created.batchId());
        assertThat(audits).extracting(FacilitySubmissionAudit::getAction)
                .containsExactly(SubmissionAuditAction.CREATED, SubmissionAuditAction.COMPLETED);
        assertThat(audits.get(1).getDetail()).isEqualTo("학교 제출 완료 — 총 2건 / 등록 완료 2건");
    }

    @Test
    @DisplayName("검토 중 상태가 변한 예약은 스킵되고 응답·감사에 사유가 나열된다")
    void completeSkipsChangedBookingsWithReasons() {
        FacilityBooking kept = approvedBooking(9);
        FacilityBooking cancelledOne = approvedBooking(11);
        CreateSubmissionBatchResult created = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(kept.getId(), cancelledOne.getId()), null), actor());
        FacilityBooking toCancel = bookingRepository.findById(cancelledOne.getId()).orElseThrow();
        toCancel.cancelByAdmin();
        bookingRepository.save(toCancel);

        CompleteSubmissionBatchResult result = submissionService.complete(created.batchId(), actor());

        assertThat(result.totalCount()).isEqualTo(2);
        assertThat(result.confirmedCount()).isEqualTo(1);
        assertThat(result.skippedBookings()).hasSize(1);
        assertThat(result.skippedBookings().get(0).bookingId()).isEqualTo(cancelledOne.getId());
        assertThat(result.skippedBookings().get(0).status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(result.skippedBookings().get(0).reason()).isEqualTo("취소됨");
        List<FacilitySubmissionAudit> audits = auditRepository.findByBatchIdOrderByIdAsc(created.batchId());
        assertThat(audits.get(1).getDetail())
                .isEqualTo("학교 제출 완료 — 총 2건 / 등록 완료 1건 / 제외 1건: 예약 #"
                        + cancelledOne.getId() + "(취소됨)");
    }

    @Test
    @DisplayName("완료 처리 후에도 후보 조회의 제출함 파생은 유지되고 예약은 등록 완료로 집계된다")
    void candidatesDerivationSurvivesCompletion() {
        FacilityBooking booking = approvedBooking(9);
        CreateSubmissionBatchResult created = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor());

        submissionService.complete(created.batchId(), actor());

        SubmissionCandidatesResult candidates = queryService.getCandidates(new SubmissionCandidatesQuery(
                facility.getId(), LocalDate.now().plusDays(6), LocalDate.now().plusDays(8), null));
        assertThat(candidates.bookings().get(0).submitted()).isTrue();
        assertThat(candidates.bookings().get(0).selectable()).isFalse();
        assertThat(candidates.summary().submittedCount()).isEqualTo(1);
        assertThat(candidates.summary().confirmedCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("취소된 Batch 완료·미존재 Batch 완료·완료된 Batch 취소는 각각 거부된다")
    void completeGuardsAreEnforced() {
        FacilityBooking booking = approvedBooking(9);
        CreateSubmissionBatchResult cancelledBatch = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor());
        submissionService.cancel(cancelledBatch.batchId(), actor());
        assertThatThrownBy(() -> submissionService.complete(cancelledBatch.batchId(), actor()))
                .isInstanceOf(FacilitySubmissionException.BatchAlreadyCancelledException.class);

        assertThatThrownBy(() -> submissionService.complete(999_999L, actor()))
                .isInstanceOf(FacilitySubmissionException.BatchNotFoundException.class);

        CreateSubmissionBatchResult completedBatch = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor());
        submissionService.complete(completedBatch.batchId(), actor());
        assertThatThrownBy(() -> submissionService.cancel(completedBatch.batchId(), actor()))
                .isInstanceOf(FacilitySubmissionException.CompletedBatchUncancellableException.class);
        assertThatThrownBy(() -> submissionService.complete(completedBatch.batchId(), actor()))
                .isInstanceOf(FacilitySubmissionException.BatchAlreadyCompletedException.class);
    }
```

(import 추가: `CompleteSubmissionBatchResult`, `SubmissionCandidatesQuery`/`SubmissionCandidatesResult`, `FacilitySubmissionQueryService`(`@Autowired FacilitySubmissionQueryService queryService;` 필드), `LocalDate`)

동시성 테스트(`FacilitySubmissionConcurrencyTest` 에 추가 — 기존 runConcurrently 재사용):

```java
    @Test
    @DisplayName("같은 Batch 의 완료와 취소가 동시에 실행되면 행잠금으로 정확히 한쪽만 성공한다")
    void concurrentCompleteAndCancelAllowExactlyOne() throws InterruptedException {
        User admin = userRepository.save(UserFixture.admin());
        User applicant = userRepository.save(UserFixture.unique());
        Club club = clubRepository.save(Club.create("완료동시성", ClubCategory.OTHER, "분과", "설명", null));
        Facility facility = facilityRepository.save(Facility.create(91001, "커뮤니티룸(2)", "1504호", 0));
        FacilityBooking booking = FacilityBooking.request(
                facility.getId(), club.getId(), applicant.getId(), LocalDate.now().plusDays(7),
                LocalTime.of(9, 0), LocalTime.of(10, 0), "정기 합주", 20,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        booking.approve(admin.getId(), null, LocalDateTime.now());
        Long bookingId = bookingRepository.save(booking).getId();
        SubmissionActorContext actor = new SubmissionActorContext(admin.getId(), "127.0.0.1", "JUnit");
        Long batchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(bookingId), null), actor).batchId();

        java.util.concurrent.atomic.AtomicInteger turn = new java.util.concurrent.atomic.AtomicInteger();
        List<Throwable> failures = runConcurrently(2, () -> {
            if (turn.getAndIncrement() == 0) submissionService.complete(batchId, actor);
            else submissionService.cancel(batchId, actor);
        });

        assertThat(failures).as("행잠금 직렬화로 정확히 한쪽만 거부돼야 한다").hasSize(1);
        FacilitySubmissionBatch batch = batchRepository.findById(batchId).orElseThrow();
        assertThat(batch.isCompleted() ^ batch.isCancelled())
                .as("완료·취소는 상호 배타 — 정확히 하나만 참").isTrue();
    }
```

Formatter 순수 유닛 테스트(`SubmissionCompletionSummaryFormatterTest.java` 신규 — Spring 미기동):

```java
package com.duing.domain.facilitysubmission.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitysubmission.service.dto.query.CompleteSubmissionBatchResult.SkippedBooking;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SubmissionCompletionSummaryFormatterTest {

    private final SubmissionCompletionSummaryFormatter formatter = new SubmissionCompletionSummaryFormatter();

    @Test
    @DisplayName("스킵 사유는 운영자가 읽는 한글 라벨로 변환된다")
    void reasonLabelsAreHumanReadable() {
        assertThat(formatter.reasonLabel(BookingStatus.CANCELLED)).isEqualTo("취소됨");
        assertThat(formatter.reasonLabel(BookingStatus.CONFLICT)).isEqualTo("충돌");
        assertThat(formatter.reasonLabel(BookingStatus.CONFIRMED)).isEqualTo("이미 등록 완료");
        assertThat(formatter.reasonLabel(BookingStatus.PENDING)).isEqualTo("승인 대기");
        assertThat(formatter.reasonLabel(BookingStatus.REJECTED)).isEqualTo("반려됨");
    }

    @Test
    @DisplayName("제외가 없으면 총·등록 건수만으로 요약한다")
    void summaryWithoutSkipsOmitsExclusionClause() {
        assertThat(formatter.summarize(8, 8, List.of()))
                .isEqualTo("학교 제출 완료 — 총 8건 / 등록 완료 8건");
    }

    @Test
    @DisplayName("제외가 있으면 예약별 사유가 나열된다")
    void summaryListsSkippedBookingsWithReasons() {
        List<SkippedBooking> skipped = List.of(
                new SkippedBooking(123L, BookingStatus.CANCELLED, "취소됨"),
                new SkippedBooking(531L, BookingStatus.CONFLICT, "충돌"));

        assertThat(formatter.summarize(10, 8, skipped))
                .isEqualTo("학교 제출 완료 — 총 10건 / 등록 완료 8건 / 제외 2건: 예약 #123(취소됨), 예약 #531(충돌)");
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests GeneralFacilitySubmissionServiceIntegrationTest --tests FacilitySubmissionConcurrencyTest --tests SubmissionCompletionSummaryFormatterTest`
Expected: 컴파일 실패

- [ ] **Step 3: 구현**

`FacilitySubmissionBatchRepository.java` 에 추가(import: `jakarta.persistence.LockModeType`, `java.util.Optional`, `org.springframework.data.jpa.repository.Lock/Query`, `org.springframework.data.repository.query.Param`):

```java
    /** 완료/취소의 동시 실행 직렬화(§4.2·§4.3) — 상태 가드가 잠금 하에서 평가되도록 한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT batch FROM FacilitySubmissionBatch batch WHERE batch.id = :batchId")
    Optional<FacilitySubmissionBatch> findByIdForUpdate(@Param("batchId") Long batchId);
```

`CompleteSubmissionBatchResult.java`:

```java
package com.duing.domain.facilitysubmission.service.dto.query;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import java.util.List;

/** 완료 처리 결과(스펙 §4.3) — best-effort 전이의 투명한 요약. skippedCount 는 응답 계층이 파생한다. */
public record CompleteSubmissionBatchResult(
        int totalCount,
        int confirmedCount,
        LocalDateTime completedAt,
        List<SkippedBooking> skippedBookings
) {
    /** reason = 사람이 읽는 한글 라벨(Formatter 단일 출처) — FE 가 상태 코드를 재매핑하지 않는다. */
    public record SkippedBooking(Long bookingId, BookingStatus status, String reason) {
    }
}
```

(import 에 `java.time.LocalDateTime` 추가)

`SubmissionCompletionSummaryFormatter.java`:

```java
package com.duing.domain.facilitysubmission.service;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitysubmission.service.dto.query.CompleteSubmissionBatchResult;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * 완료 처리의 사람이 읽는 표현 단일 출처(스펙 §4.3 v2.2 보완) — 응답 reason 과 감사 요약이 같은 라벨을 쓴다.
 * 문구·다국어·포맷 변경은 이 클래스에서만 이뤄진다(서비스는 호출만).
 */
@Component
public class SubmissionCompletionSummaryFormatter {

    private static final Map<BookingStatus, String> SKIP_REASON_LABELS = Map.of(
            BookingStatus.CANCELLED, "취소됨",
            BookingStatus.CONFLICT, "충돌",
            BookingStatus.CONFIRMED, "이미 등록 완료",
            BookingStatus.PENDING, "승인 대기",
            BookingStatus.REJECTED, "반려됨");

    public String reasonLabel(BookingStatus status) {
        return SKIP_REASON_LABELS.getOrDefault(status, status.name());
    }

    /** 감사 detail 요약(§4.3) — 요약 수치가 앞이라 500자 절단에도 핵심은 보존된다. */
    public String summarize(int totalCount, int confirmedCount,
            List<CompleteSubmissionBatchResult.SkippedBooking> skippedBookings) {
        StringBuilder summary = new StringBuilder()
                .append("학교 제출 완료 — 총 ").append(totalCount).append("건 / 등록 완료 ")
                .append(confirmedCount).append("건");
        if (!skippedBookings.isEmpty()) {
            summary.append(" / 제외 ").append(skippedBookings.size()).append("건: ");
            for (int index = 0; index < skippedBookings.size(); index++) {
                CompleteSubmissionBatchResult.SkippedBooking skipped = skippedBookings.get(index);
                if (index > 0) summary.append(", ");
                summary.append("예약 #").append(skipped.bookingId())
                        .append('(').append(skipped.reason()).append(')');
            }
        }
        return summary.toString();
    }
}
```

`FacilitySubmissionService.java` 에 추가:

```java
    CompleteSubmissionBatchResult complete(Long batchId, SubmissionActorContext actor);
```

`GeneralFacilitySubmissionService.java` — `cancel` 의 `findById` 를 `findByIdForUpdate` 로 교체하고, complete 구현 추가. 신규 주입: `FacilityBookingStatusHistoryRepository historyRepository`, `ApplicationEventPublisher eventPublisher`, `SubmissionCompletionSummaryFormatter summaryFormatter`(import: `com.duing.domain.facilitybooking.entity.FacilityBookingStatusHistory`, `com.duing.domain.facilitybooking.repository.FacilityBookingStatusHistoryRepository`, `com.duing.domain.notification.event.FacilityBookingConfirmedEvent`, `org.springframework.context.ApplicationEventPublisher`, `java.util.ArrayList`, `CompleteSubmissionBatchResult`):

```java
    @Override
    @Transactional
    public CompleteSubmissionBatchResult complete(Long batchId, SubmissionActorContext actor) {
        // 행잠금(§4.3-1) — 완료/취소 동시 실행을 직렬화해 상태 가드가 잠금 하에서 평가되게 한다.
        FacilitySubmissionBatch batch = batchRepository.findByIdForUpdate(batchId)
                .orElseThrow(FacilitySubmissionException.BatchNotFoundException::new);
        List<Long> bookingIds = itemRepository.findByBatchIdOrderByIdAsc(batchId).stream()
                .map(FacilitySubmissionItem::getBookingId)
                .toList();
        // 생성과 동일한 ID 정렬 행잠금(§4.3-2) — 생성·완료의 교차 실행도 booking 잠금에서 직렬화된다.
        List<FacilityBooking> bookings = bookingRepository.findAllByIdInForUpdate(bookingIds);

        LocalDateTime completedAt = LocalDateTime.now(clock);
        List<CompleteSubmissionBatchResult.SkippedBooking> skippedBookings = new ArrayList<>();
        int confirmedCount = 0;
        for (FacilityBooking booking : bookings) {
            if (booking.getStatus() != BookingStatus.APPROVED) {
                skippedBookings.add(new CompleteSubmissionBatchResult.SkippedBooking(
                        booking.getId(), booking.getStatus(),
                        summaryFormatter.reasonLabel(booking.getStatus())));
                continue;
            }
            // best-effort(§4.3-3) — 기존 수동 확정 경로 재사용(상태 머신 무변경), 이력·알림도 기존 계약 그대로.
            booking.confirmManually(completedAt);
            FacilityBookingStatusHistory confirmationHistory = historyRepository.save(
                    FacilityBookingStatusHistory.record(booking.getId(), BookingStatus.APPROVED,
                            BookingStatus.CONFIRMED, actor.adminId(),
                            "학교 제출 완료 — " + batch.getSubmissionNo(), null));
            eventPublisher.publishEvent(new FacilityBookingConfirmedEvent(
                    booking.getId(), booking.getClubId(), confirmationHistory.getId()));
            confirmedCount++;
        }

        batch.complete(actor.adminId(), completedAt);
        auditRepository.save(FacilitySubmissionAudit.of(batchId, SubmissionAuditAction.COMPLETED,
                actor.adminId(), actor.ipAddress(), actor.userAgent(),
                summaryFormatter.summarize(bookings.size(), confirmedCount, skippedBookings)));
        return new CompleteSubmissionBatchResult(bookings.size(), confirmedCount, completedAt, skippedBookings);
    }
```

`cancel` 교체(잠금 + 가드는 엔티티가 담당):

```java
    @Override
    @Transactional
    public void cancel(Long batchId, SubmissionActorContext actor) {
        // 행잠금(§4.2) — 완료 처리와의 동시 실행을 직렬화한다.
        FacilitySubmissionBatch batch = batchRepository.findByIdForUpdate(batchId)
                .orElseThrow(FacilitySubmissionException.BatchNotFoundException::new);
        batch.cancel(actor.adminId(), LocalDateTime.now(clock));
        auditRepository.save(FacilitySubmissionAudit.of(batchId, SubmissionAuditAction.CANCELLED,
                actor.adminId(), actor.ipAddress(), actor.userAgent()));
    }
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests GeneralFacilitySubmissionServiceIntegrationTest --tests FacilitySubmissionConcurrencyTest`
Expected: PASS (기존 10 + 신규 5 = 15/15)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitysubmission/ \
  backend/src/test/java/com/duing/domain/facilitysubmission/
git commit -m "feat(backend): Batch 완료 처리 — best-effort CONFIRMED 전이·감사 요약"
```

---

### Task 3: 목록·상세 응답 확장 (completed 상태 + Audit 이력)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/service/dto/query/SubmissionBatchListItem.java` (필드 2개)
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/dto/query/SubmissionAuditEntry.java`
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/service/dto/query/SubmissionBatchDetailResult.java` (audits 필드)
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionQueryService.java`
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionHistoryQueryIntegrationTest.java` (테스트 추가)

**Interfaces:**
- Consumes: Task 1·2 산출물(`isCompleted`/`getCompletedAt`, `getDetail()` on audit, `complete` 서비스 — 테스트 시드용)
- Produces(Task 4 소비): `SubmissionBatchListItem(..., boolean completed, LocalDateTime completedAt)` (기존 필드 뒤에 추가), `SubmissionAuditEntry(SubmissionAuditAction action, String adminName, LocalDateTime createdAt, String ipAddress, String detail)`, `SubmissionBatchDetailResult(batch, bookings, List<SubmissionAuditEntry> audits)`

- [ ] **Step 1: 실패하는 테스트 추가** (기존 이력 쿼리 테스트 파일에)

```java
    @Test
    @DisplayName("이력 행과 상세 헤더에 완료 상태가 노출된다")
    void batchListExposesCompletionState() {
        FacilityBooking booking = approvedBooking(9);
        Long batchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor()).batchId();
        submissionService.complete(batchId, actor());

        Page<SubmissionBatchListItem> page = queryService.getBatches(null, PageRequest.of(0, 20));

        assertThat(page.getContent().get(0).completed()).isTrue();
        assertThat(page.getContent().get(0).completedAt()).isNotNull();
        assertThat(page.getContent().get(0).cancelled()).isFalse();
    }

    @Test
    @DisplayName("상세는 감사 이력을 시간순으로 — 관리자 이름·요약 detail 과 함께 반환한다")
    void detailReturnsAuditTrailWithAdminNamesAndSummary() {
        FacilityBooking booking = approvedBooking(9);
        Long batchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor()).batchId();
        submissionService.complete(batchId, actor());

        SubmissionBatchDetailResult detail = queryService.getDetail(batchId, actor());

        // CREATED → COMPLETED → VIEWED(방금 상세 조회 자신)
        assertThat(detail.audits()).extracting(SubmissionAuditEntry::action)
                .containsExactly(SubmissionAuditAction.CREATED, SubmissionAuditAction.COMPLETED,
                        SubmissionAuditAction.VIEWED);
        assertThat(detail.audits().get(0).adminName()).isEqualTo(admin.getName());
        assertThat(detail.audits().get(1).detail()).contains("학교 제출 완료 — 총 1건 / 등록 완료 1건");
        assertThat(detail.audits().get(0).ipAddress()).isEqualTo("127.0.0.1");
        assertThat(detail.batch().completed()).isTrue();
    }
```

(import 추가: `SubmissionAuditEntry`, `SubmissionAuditAction`)

**주의(구현자):** VIEWED 감사는 `getDetail` 안에서 응답 조립 **후·return 직전**에 저장된다(Task 5 정착 순서) — audits 목록은 **감사 저장 전에 조회**하므로 "방금의 VIEWED" 포함 여부가 구현 순서에 따라 달라진다. **audits 조회를 VIEWED 저장 이후로 이동**해 방금의 조회까지 포함시킨다(운영 기록 화면에서 "지금 본 것"도 보이는 게 §7.3 의도. 위 테스트가 이 순서를 고정한다).

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests GeneralFacilitySubmissionHistoryQueryIntegrationTest`
Expected: 컴파일 실패

- [ ] **Step 3: 구현**

`SubmissionBatchListItem.java` — 마지막에 필드 2개 추가:

```java
        boolean cancelled,
        LocalDateTime cancelledAt,
        boolean completed,
        LocalDateTime completedAt
```

`SubmissionAuditEntry.java`:

```java
package com.duing.domain.facilitysubmission.service.dto.query;

import com.duing.domain.facilitysubmission.entity.SubmissionAuditAction;
import java.time.LocalDateTime;

/** 상세 화면의 감사 이력 행(스펙 §5.4) — COMPLETED 행은 사람이 읽는 요약(detail)을 그대로 노출한다. */
public record SubmissionAuditEntry(
        SubmissionAuditAction action,
        String adminName,
        LocalDateTime createdAt,
        String ipAddress,
        String detail
) {
}
```

`SubmissionBatchDetailResult.java` — `List<SubmissionAuditEntry> audits` 필드 추가.

`GeneralFacilitySubmissionQueryService.java`:
- `toListItem(...)` 에 `batch.isCompleted(), batch.getCompletedAt()` 전달(시그니처 변경 없음 — 내부에서 batch 를 이미 받음).
- `getDetail` 끝부분을 다음 순서로 재구성: header·bookingRows 조립 → **audit VIEWED 저장** → `auditRepository.findByBatchIdOrderByIdAsc(batchId)` 조회 → 감사 관리자 이름 맵(`userRepository.findAllById(adminIds)`) → `SubmissionAuditEntry` 매핑 → return. 매핑:

```java
        auditRepository.save(FacilitySubmissionAudit.of(batchId, SubmissionAuditAction.VIEWED,
                actor.adminId(), actor.ipAddress(), actor.userAgent()));
        List<FacilitySubmissionAudit> auditRows = auditRepository.findByBatchIdOrderByIdAsc(batchId);
        Map<Long, String> auditAdminNames = userRepository.findAllById(
                        auditRows.stream().map(FacilitySubmissionAudit::getAdminId).distinct().toList()).stream()
                .collect(Collectors.toMap(User::getId, User::getName, (first, second) -> first));
        List<SubmissionAuditEntry> audits = auditRows.stream()
                .map(auditRow -> new SubmissionAuditEntry(auditRow.getAction(),
                        auditAdminNames.get(auditRow.getAdminId()), auditRow.getCreatedAt(),
                        auditRow.getIpAddress(), auditRow.getDetail()))
                .toList();
        return new SubmissionBatchDetailResult(header, bookingRows, audits);
```

(신규 주입: `FacilitySubmissionAuditRepository auditRepository` 는 이미 있음 — Task 5 에서 VIEWED 저장에 사용 중. import 추가만.)

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests GeneralFacilitySubmissionHistoryQueryIntegrationTest`
Expected: PASS (기존 5 + 신규 2 = 7/7)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitysubmission/ \
  backend/src/test/java/com/duing/domain/facilitysubmission/
git commit -m "feat(backend): 제출 이력·상세에 완료 상태·감사 이력 노출"
```

---

### Task 4: API — complete 엔드포인트 + 응답 DTO 확장 + 인수 테스트

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/api/AdminFacilitySubmissionApi.java`
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/controller/AdminFacilitySubmissionController.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/controller/dto/response/CompleteSubmissionBatchResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/controller/dto/response/SubmissionBatchSummaryResponse.java` (completed 필드 2개)
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/controller/dto/response/SubmissionBatchDetailResponse.java` (audits 필드)
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/controller/AdminFacilitySubmissionAcceptanceTest.java` (테스트 추가)

**Interfaces:**
- Consumes: Task 2 `complete(...)`, Task 3 확장 DTO
- Produces(PR-4 FE 계약): `POST /api/v1/admin/facility-bookings/submission/{batchId}/complete` → **200**(스펙 §5.7 명시 — 생성이 아닌 액션 결과라 POST=201 규칙의 예외) `{ totalCount, confirmedCount, skippedCount, skippedBookings: [{bookingId, status}] }`; 목록/상세 batch 에 `completed`/`completedAt`; 상세에 `audits[]: {action, adminName, createdAt, ipAddress, detail}`

- [ ] **Step 1: 실패하는 인수 테스트 추가** (기존 인수 테스트 파일에)

```java
    @Test
    @DisplayName("완료 처리는 200 과 전이 요약을 반환하고 예약을 CONFIRMED 로 바꾼다")
    void completeReturns200WithSummary() {
        FacilityBooking booking = approvedBooking(9);
        Integer batchId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("bookingIds", List.of(booking.getId())))
                .when().post(SUBMISSION_PATH)
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().path("data.batchId");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().post(SUBMISSION_PATH + "/" + batchId + "/complete")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalCount", equalTo(1))
                .body("data.confirmedCount", equalTo(1))
                .body("data.skippedCount", equalTo(0))
                .body("data.completedAt", notNullValue())
                .body("data.skippedBookings", notNullValue());

        Assertions.assertThat(bookingRepository.findById(booking.getId()).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.CONFIRMED);

        // 기완료 재요청 409, 완료 후 취소 409, 완료 후 CSV 재다운로드 허용(§9)
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().post(SUBMISSION_PATH + "/" + batchId + "/complete")
                .then().statusCode(HttpStatus.CONFLICT.value());
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().delete(SUBMISSION_PATH + "/" + batchId)
                .then().statusCode(HttpStatus.CONFLICT.value());
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH + "/" + batchId + "/csv")
                .then().statusCode(HttpStatus.OK.value());

        // 목록에 completed 노출 + 상세에 감사 이력(요약 detail 포함) 노출
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].completed", is(true));
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH + "/" + batchId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.batch.completed", is(true))
                .body("data.audits.action", org.hamcrest.Matchers.hasItems("CREATED", "COMPLETED", "VIEWED"))
                .body("data.audits.find { it.action == 'COMPLETED' }.detail",
                        org.hamcrest.Matchers.containsString("학교 제출 완료"));
    }

    @Test
    @DisplayName("완료 처리도 익명 401·일반 사용자 403·미존재 404 규약을 따른다")
    void completeAuthAndNotFoundContracts() {
        RestAssured.given()
                .when().post(SUBMISSION_PATH + "/1/complete")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().post(SUBMISSION_PATH + "/1/complete")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().post(SUBMISSION_PATH + "/999999/complete")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests AdminFacilitySubmissionAcceptanceTest`
Expected: 컴파일/단언 실패

- [ ] **Step 3: DTO·API·Controller 구현**

`CompleteSubmissionBatchResponse.java`:

```java
package com.duing.domain.facilitysubmission.controller.dto.response;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitysubmission.service.dto.query.CompleteSubmissionBatchResult;
import java.util.List;

public record CompleteSubmissionBatchResponse(
        int totalCount,
        int confirmedCount,
        int skippedCount,
        LocalDateTime completedAt,
        List<SkippedBookingResponse> skippedBookings
) {
    /** reason = 서비스가 내려준 한글 라벨 그대로(Formatter 단일 출처) — FE 재매핑 금지 계약. */
    public record SkippedBookingResponse(Long bookingId, BookingStatus status, String reason) {
    }

    public static CompleteSubmissionBatchResponse from(CompleteSubmissionBatchResult result) {
        return new CompleteSubmissionBatchResponse(
                result.totalCount(), result.confirmedCount(), result.skippedBookings().size(),
                result.completedAt(),
                result.skippedBookings().stream()
                        .map(skipped -> new SkippedBookingResponse(
                                skipped.bookingId(), skipped.status(), skipped.reason()))
                        .toList());
    }
}
```

(import 에 `java.time.LocalDateTime` 추가)

`SubmissionBatchSummaryResponse.java` — `boolean completed, LocalDateTime completedAt` 필드 추가 + `from` 매핑에 `listItem.completed(), listItem.completedAt()` 추가.

`SubmissionBatchDetailResponse.java` — `List<SubmissionAuditResponse> audits` 추가:

```java
    public record SubmissionAuditResponse(
            String action, String adminName, LocalDateTime createdAt, String ipAddress, String detail) {
        public static SubmissionAuditResponse from(SubmissionAuditEntry entry) {
            return new SubmissionAuditResponse(entry.action().name(), entry.adminName(),
                    entry.createdAt(), entry.ipAddress(), entry.detail());
        }
    }
```

`AdminFacilitySubmissionApi.java` 에 추가:

```java
    @Operation(summary = "학교 제출 완료 처리", description = "담당자가 실제 학교 제출을 마친 뒤 호출(§4.3). "
            + "APPROVED 예약만 CONFIRMED 로 전이하고 상태가 변한 예약은 제외 목록으로 반환한다. 기취소·기완료 409.")
    @PostMapping("/admin/facility-bookings/submission/{batchId}/complete")
    ResponseEntity<ApiResponse<CompleteSubmissionBatchResponse>> complete(@PathVariable Long batchId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser,
            @Parameter(hidden = true) HttpServletRequest httpServletRequest);
```

`AdminFacilitySubmissionController.java` 에 추가:

```java
    @Override
    public ResponseEntity<ApiResponse<CompleteSubmissionBatchResponse>> complete(Long batchId,
            @AuthenticationPrincipal UserPrincipal currentUser, HttpServletRequest httpServletRequest) {
        return ResponseEntity.ok(ApiResponse.success(CompleteSubmissionBatchResponse.from(
                submissionService.complete(batchId, actorFrom(currentUser, httpServletRequest)))));
    }
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests AdminFacilitySubmissionAcceptanceTest`
Expected: PASS (기존 6 + 신규 2 = 8/8)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitysubmission/ \
  backend/src/test/java/com/duing/domain/facilitysubmission/
git commit -m "feat(backend): 학교 제출 완료 API·이력 응답 확장"
```

---

### Task 5: candidates 전 시설 조회 확장 (§5.1 v3)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/repository/FacilityBookingRepository.java` (파생 메서드 1개 추가만)
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/service/dto/query/SubmissionCandidateBooking.java` (필드 2개)
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionQueryService.java`
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/api/AdminFacilitySubmissionApi.java` (facilityId required=false)
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/controller/dto/response/SubmissionCandidatesResponse.java` (Booking +2필드)
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionQueryServiceIntegrationTest.java` (테스트 추가)
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/controller/AdminFacilitySubmissionAcceptanceTest.java` (테스트 추가)

**Interfaces:**
- Produces(PR-4a FE 계약): `GET /candidates` 의 `facilityId` **옵션** — 생략 시 전 시설 후보. booking 항목에 `facilityId: Long`, `facilityName: String|null` 추가(bookingId 바로 뒤 위치). 기존 시설 지정 호출은 완전 하위호환.
- 주의: `toCandidate` 는 상세(getDetail)와 공유 — 상세 bookings 에도 시설 필드가 함께 실린다(단일 시설이라 동일값, 무해).

- [ ] **Step 1: 실패하는 테스트 추가**

쿼리 서비스 통합 테스트(기존 파일)에:

```java
    @Test
    @DisplayName("facilityId 를 생략하면 전 시설의 후보가 시설 정보와 함께 반환된다")
    void omittingFacilityReturnsAllFacilitiesWithNames() {
        savedBooking(9, BookingStatus.APPROVED);
        Facility secondFacility = facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "세미나실(2)", "1602호", 0));
        FacilityBooking otherFacilityBooking = FacilityBooking.request(
                secondFacility.getId(), club.getId(), applicant.getId(), baseDate,
                LocalTime.of(9, 0), LocalTime.of(10, 0), "정기 회의", 10,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        otherFacilityBooking.approve(admin.getId(), null, LocalDateTime.now());
        bookingRepository.save(otherFacilityBooking);

        SubmissionCandidatesResult result = queryService.getCandidates(new SubmissionCandidatesQuery(
                null, baseDate.minusDays(1), baseDate.plusDays(1), null));

        assertThat(result.bookings()).hasSize(2);
        assertThat(result.bookings()).extracting(SubmissionCandidateBooking::facilityName)
                .containsExactlyInAnyOrder(facility.getRoomName(), "세미나실(2)");
        assertThat(result.summary().approvedCount()).as("summary 는 전 시설 합산").isEqualTo(2);
    }

    @Test
    @DisplayName("facilityId 를 지정하면 기존처럼 해당 시설만 반환된다(하위호환)")
    void specifyingFacilityKeepsExistingBehaviour() {
        savedBooking(9, BookingStatus.APPROVED);
        Facility secondFacility = facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "세미나실(3)", "1603호", 0));
        FacilityBooking otherFacilityBooking = FacilityBooking.request(
                secondFacility.getId(), club.getId(), applicant.getId(), baseDate,
                LocalTime.of(9, 0), LocalTime.of(10, 0), "정기 회의", 10,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        bookingRepository.save(otherFacilityBooking);

        SubmissionCandidatesResult result = queryService.getCandidates(periodQuery());

        assertThat(result.bookings()).hasSize(1);
        assertThat(result.bookings().get(0).facilityId()).isEqualTo(facility.getId());
    }
```

인수 테스트(기존 파일)에:

```java
    @Test
    @DisplayName("facilityId 없이 후보를 조회하면 전 시설이 시설명과 함께 반환된다")
    void candidatesWithoutFacilityReturnAllFacilities() {
        approvedBooking(9);
        LocalDate baseDate = LocalDate.now().plusDays(7);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH + "/candidates?startDate=" + baseDate.minusDays(1)
                        + "&endDate=" + baseDate.plusDays(1))
                .then().statusCode(HttpStatus.OK.value())
                .body("data.bookings[0].facilityId", notNullValue())
                .body("data.bookings[0].facilityName", equalTo(facility.getRoomName()));
    }
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests GeneralFacilitySubmissionQueryServiceIntegrationTest --tests AdminFacilitySubmissionAcceptanceTest`
Expected: 컴파일/단언 실패

- [ ] **Step 3: 구현**

`FacilityBookingRepository.java` 에 파생 메서드 추가:

```java
    /** 학교 제출 준비 전 시설 조회(제출 스펙 §5.1 v3) — 기간·상태 조건, 시설 무제한. */
    List<FacilityBooking> findByReservationDateBetweenAndStatusIn(
            LocalDate startDate, LocalDate endDate, Collection<BookingStatus> statuses);
```

`SubmissionCandidateBooking.java` — `bookingId` 바로 뒤에 `Long facilityId, String facilityName` 필드 추가(주석: 전 시설 조회의 시설별 섹션 그룹핑용 — §5.1 v3).

`GeneralFacilitySubmissionQueryService.java`:
- `getCandidates` 조회 분기 + 시설 이름 맵:

```java
        List<FacilityBooking> fetchedBookings = query.facilityId() != null
                ? bookingRepository.findByFacilityIdAndReservationDateBetweenAndStatusIn(
                        query.facilityId(), query.startDate(), query.endDate(), CANDIDATE_STATUSES)
                : bookingRepository.findByReservationDateBetweenAndStatusIn(
                        query.startDate(), query.endDate(), CANDIDATE_STATUSES);
```

- 신규 헬퍼 `bookingFacilityNames(List<FacilityBooking>)` — `facilityRepository.findAllById(distinct facilityIds)` → `Map<Long, String>`(병합 함수 `(first, second) -> first` 스타일 유지).
- `toCandidate(booking, submissionNoByBookingId, clubNames, userNames, facilityNames)` 로 시그니처 확장(getCandidates·getDetail 두 호출부 모두 갱신), 새 필드는 `booking.getFacilityId(), facilityNames.get(booking.getFacilityId())`.

`AdminFacilitySubmissionApi.java` — candidates 의 facilityId 를 `@RequestParam(required = false)` 로, `@Parameter(description = "시설(생략 시 전 시설)")`.

`SubmissionCandidatesResponse.java` — `Booking` record 의 `bookingId` 뒤에 `Long facilityId, String facilityName` + `from` 매핑 갱신.

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests GeneralFacilitySubmissionQueryServiceIntegrationTest --tests AdminFacilitySubmissionAcceptanceTest --tests GeneralFacilitySubmissionHistoryQueryIntegrationTest`
Expected: PASS (신규 3 + 기존 회귀 전부 — toCandidate 시그니처 변경이 상세 경로 회귀를 깨지 않는지 포함)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking/repository/FacilityBookingRepository.java \
  backend/src/main/java/com/duing/domain/facilitysubmission/ \
  backend/src/test/java/com/duing/domain/facilitysubmission/
git commit -m "feat(backend): 제출 후보 전 시설 조회 지원 — 시설 정보 응답 포함"
```

---

### Task 6: FE 교차 무효화·타입 확장 + 전체 스위트 검증

**Files:**
- Modify: `frontend/packages/hooks/src/facilityBookingsAdmin.ts` (무효화 1줄)
- Modify: `frontend/packages/types/src/facilitySubmission.ts` (타입 확장 — PR-4a 선행 계약)

- [ ] **Step 1: FE 교차 무효화 추가**

`useAdminBookingInvalidation`(현재 `facilityBookingsAll`+`availabilityAll` 무효화)에 1줄 추가:

```ts
    // 승인/반려/취소는 학교 제출 후보(제출 필요 목록)의 파생에도 반영된다 — 교차 무효화(PR-2 최종 리뷰 이월).
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.facilitySubmissionAll });
```

- [ ] **Step 1.5: FE 타입 확장 (PR-4a 선행 계약)**

`facilitySubmission.ts`:
- `SubmissionCandidateBooking` 에 `bookingId` 뒤 `facilityId: number;` `facilityName: string | null;` 추가
- `SubmissionCandidatesParams` 의 `facilityId: number` → `facilityId?: number;` (생략=전 시설 — 기존 호출부는 항상 전달하므로 하위호환. 주석으로 §5.1 v3 근거 명시)

- [ ] **Step 2: FE 검증**

Run: `cd frontend && pnpm typecheck && pnpm --filter @duing/web test`
Expected: 통과 (기존 스위트 무회귀)

- [ ] **Step 3: BE 전체 스위트**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL, 실패 0 — 출력에서 `BUILD SUCCESSFUL` 직접 확인(`| tail` 금지)

- [ ] **Step 4: self-check**

1. 기존 Flyway 파일 무수정(V88 신규만), 기존 상태 머신 무변경(`confirmManually` 재사용만)
2. 스펙 §4.3·§5.7 계약(응답 5필드·reason 라벨·감사 요약 형식·가드 매트릭스)·§5.1 v3(전 시설·시설 필드)와 구현 일치
3. 커밋 규칙·attribution 없음·상대 날짜
4. FE 변경이 무효화 1줄+타입 확장뿐인지

- [ ] **Step 5: 커밋**

```bash
git add frontend/packages/hooks/src/facilityBookingsAdmin.ts frontend/packages/types/src/facilitySubmission.ts
git commit -m "fix(frontend): 제출 후보 교차 무효화·전 시설 조회 타입 확장"
```

**완료 후:** push·PR 생성은 하지 않는다 — 컨트롤러가 최종 리뷰 뒤 사용자 지시로 진행한다.
