# 시설 관리자 콘솔 UX — PR-A 백엔드(A1~A5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프론트 4 PR(B~E)이 의존하는 additive 백엔드 변경 5건 — 후보 조회 기간 상한 62일, 후보 예약에 활성 배치 id, 제출 배치 목록 검색(q·생성일), 크롤 현황 단체명 검색(q), 크롤 현황 직전 월 열람.

**Architecture:** 전부 기존 서비스·리포지토리에 파라미터/필드를 **추가**한다(응답 필드 추가·선택 쿼리 파라미터). DB 마이그레이션 없음. 배치 검색은 QueryDSL `BooleanExpression` 추가, 크롤 검색은 메모리 그룹핑 뒤·페이징 전 필터, 동아리명 정규화는 기존 `OrganizationNameNormalizer` 재사용.

**Tech Stack:** Spring Boot 3.4 / Java 21 / QueryDSL / JUnit5 + Mockito + Testcontainers(PostgreSQL) + RestAssured.

**Spec:** `docs/superpowers/specs/2026-09-21-facility-admin-console-ux-design.md` §2.1(A1~A5), §3, §4.

## Global Constraints

- 브랜치 `feat/facility-admin-console-api`(`develop` 기준). 커밋 = Conventional Commits 한국어 `type(scope): 대상 — 변경점`. Co-Authored-By·🤖 라인 금지.
- 모든 변경은 additive: 기존 파라미터·응답 필드 삭제·의미 변경 금지(스펙 §0-3, §5).
- DDD 구조 유지: 컨트롤러는 `Api` 인터페이스 시그니처와 동일, 서비스 dto 는 `dto/query/` record, 예외는 `{Domain}Exception` 내부 static class(`backend/CLAUDE.md`).
- QueryDSL 은 `{Domain}RepositoryCustom` 구현체에서만, 동적 조건은 `BooleanExpression`(null = 무필터).
- 정규화 비교는 `OrganizationNameNormalizer.normalize` 경유(컬럼 직접 비교 금지, 시설 도메인 관례).
- 테스트: `@DisplayName` 은 요구사항 문장. 통합 테스트는 Testcontainers 라 **Docker 실행 필요**. 실행은 `backend/` 에서 `./gradlew test --tests '<FQCN>'`. 변수명은 역할이 드러나게(`dto`·`r`·`e` 금지).
- 각 태스크 GREEN 조건 = 해당 태스크 테스트 + 같은 클래스 기존 테스트 전부 통과.

---

### Task 1: A1 후보 조회 기간 상한 31 → 62일 (#3)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionQueryService.java:55` (`MAX_PERIOD_DAYS`)
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/exception/FacilitySubmissionException.java:77` (`InvalidCandidatePeriodException.MESSAGE`)
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionQueryServiceIntegrationTest.java:179-200`

**Interfaces:**
- Consumes: `FacilitySubmissionQueryService.getCandidates(SubmissionCandidatesQuery)` (기존).
- Produces: 62일 조회 허용, 63일 이상·역순 `InvalidCandidatePeriodException`(400). 프론트 PR-B 의 `MAX_PERIOD_DAYS = 62` 가 이 값에 맞춘다.

- [ ] **Step 1: 기존 경계 테스트를 62/63 으로 바꾼다(실패 테스트)**

`GeneralFacilitySubmissionQueryServiceIntegrationTest.java` 의 두 테스트를 아래로 교체:

```java
    @Test
    @DisplayName("조회 기간이 62일을 넘거나 역순이면 400 예외가 발생하고, 62일(이번 달 1일~다음 달 말일 최대)은 허용된다")
    void invalidPeriodRejects() {
        assertThatThrownBy(() -> queryService.getCandidates(new SubmissionCandidatesQuery(
                facility.getId(), baseDate, baseDate.plusDays(62), null)))
                .isInstanceOf(FacilitySubmissionException.InvalidCandidatePeriodException.class);
        assertThatThrownBy(() -> queryService.getCandidates(new SubmissionCandidatesQuery(
                facility.getId(), baseDate, baseDate.minusDays(1), null)))
                .isInstanceOf(FacilitySubmissionException.InvalidCandidatePeriodException.class);
        assertThatCode(() -> queryService.getCandidates(new SubmissionCandidatesQuery(
                facility.getId(), baseDate, baseDate.plusDays(61), null)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("전 시설 조회에서도 기간 상한(62일) 검증이 동일하게 적용된다")
    void invalidPeriodRejectsWhenFacilityOmitted() {
        assertThatThrownBy(() -> queryService.getCandidates(new SubmissionCandidatesQuery(
                null, baseDate, baseDate.plusDays(62), null)))
                .isInstanceOf(FacilitySubmissionException.InvalidCandidatePeriodException.class);
    }
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.facilitysubmission.service.GeneralFacilitySubmissionQueryServiceIntegrationTest' -q`
Expected: `invalidPeriodRejects` FAIL — `baseDate.plusDays(61)` 조회가 31일 상한에 걸려 `doesNotThrowAnyException` 단언 실패.

- [ ] **Step 3: 상한·메시지 변경**

`GeneralFacilitySubmissionQueryService.java:55`:
```java
    /** 제출 준비 기본 기간 "오늘~다음 달 말일"(최대 62일)을 한 번에 조회할 수 있어야 한다(콘솔 UX 스펙 A1). */
    private static final int MAX_PERIOD_DAYS = 62;
```

`FacilitySubmissionException.java:77`:
```java
        private static final String MESSAGE = "조회 기간은 시작일부터 최대 62일까지 선택할 수 있습니다.";
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.facilitysubmission.service.GeneralFacilitySubmissionQueryServiceIntegrationTest' -q`
Expected: PASS(클래스 전체).

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionQueryService.java backend/src/main/java/com/duing/domain/facilitysubmission/exception/FacilitySubmissionException.java backend/src/test/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionQueryServiceIntegrationTest.java
git commit -m "feat(backend): 제출 후보 조회 — 기간 상한 31→62일(오늘~다음 달 말일 한 번에 조회)"
```

---

### Task 2: A2 후보 예약에 활성 배치 id 노출 (#11)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/repository/FacilitySubmissionItemRepository.java:15-19,37-41` (프로젝션 + JPQL)
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/service/dto/query/SubmissionCandidateBooking.java` (필드 추가)
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionQueryService.java:80,144-160(getDetail 의 submissionNoByBookingId 사용부),238-248(activeSubmissionNos),270-283(toCandidate)`
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/controller/dto/response/SubmissionCandidatesResponse.java`
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionQueryServiceIntegrationTest.java:95-123`, `backend/src/test/java/com/duing/domain/facilitysubmission/controller/AdminFacilitySubmissionAcceptanceTest.java:186-199`

**Interfaces:**
- Consumes: `FacilitySubmissionItemRepository.findActiveByBookingIdIn(Collection<Long>)`.
- Produces: `ActiveSubmissionProjection.getBatchId(): Long`; `SubmissionCandidateBooking.submissionBatchId: Long`(미제출·취소 배치 소속 = null); 응답 `SubmissionCandidatesResponse.Booking.submissionBatchId: Long`(JSON 필드명 `submissionBatchId`, null 이면 `null` 로 직렬화). 프론트 PR-B B5 가 `submissionBatchId?: number | null` 로 읽는다.

- [ ] **Step 1: 실패 테스트 — 통합 + 인수**

`GeneralFacilitySubmissionQueryServiceIntegrationTest.candidatesDeriveFlagsAndExcludeRejected` 에서 `submissionNo` 를 받는 줄을 batchId 도 함께 받도록 바꾸고 단언 추가:

```java
        var createResult = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(submitted.getId()), null),
                new SubmissionActorContext(admin.getId(), "127.0.0.1", "JUnit"));
        String submissionNo = createResult.submissionNo();
        Long batchId = createResult.batchId();
```
(기존 `String submissionNo = submissionService.create(...).submissionNo();` 를 위 4줄로 교체)

그리고 `assertThat(submittedRow.submissionNo()).isEqualTo(submissionNo);` 아래에:
```java
        assertThat(submittedRow.submissionBatchId()).isEqualTo(batchId);
```
`assertThat(pendingRow.submissionNo()).isNull();` 아래에:
```java
        assertThat(pendingRow.submissionBatchId()).isNull();
        assertThat(awaitingRow.submissionBatchId()).isNull();
```

`cancelledBatchBookingBecomesSelectableAgain`(같은 파일 :126~) 의 마지막 단언 뒤에 취소 배치 소속은 null 임을 추가한다 — 기존 단언 블록 끝에 한 줄:
```java
        assertThat(result.bookings().get(0).submissionBatchId()).isNull();
```
(그 테스트의 `SubmissionCandidatesResult result = queryService.getCandidates(periodQuery());` 변수명이 다르면 그 변수명을 쓴다.)

`AdminFacilitySubmissionAcceptanceTest.java` 에 새 테스트 추가(기존 `candidatesPathIsNotSwallowedByBatchIdTemplate` 아래):
```java
    @Test
    @DisplayName("후보 응답의 제출 대기 예약에는 소속 활성 배치 id(submissionBatchId)가 실리고 미제출 예약은 null 이다")
    void candidatesCarrySubmissionBatchId() {
        FacilityBooking submitted = approvedBooking(9);
        approvedBooking(11);
        Integer batchId = createBatch(submitted);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(candidatesPath())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.bookings[0].submissionBatchId", equalTo(batchId))
                .body("data.bookings[1].submissionBatchId", nullValue());
    }
```
(`nullValue` 는 이미 `import static org.hamcrest.Matchers.nullValue;`(:6) 로 있으니 추가하지 않는다. 후보 정렬은 예약일→시작시각이라 9시 건이 `[0]`.)

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew compileTestJava -q`
Expected: 컴파일 실패 — `submissionBatchId()` 미정의.

- [ ] **Step 3: 구현**

`FacilitySubmissionItemRepository.java` — JPQL 과 프로젝션:
```java
    @Query("SELECT i.bookingId AS bookingId, b.submissionNo AS submissionNo, b.id AS batchId "
            + "FROM FacilitySubmissionItem i JOIN FacilitySubmissionBatch b ON i.batchId = b.id "
            + "WHERE i.bookingId IN :bookingIds AND b.cancelledAt IS NULL AND i.skippedAt IS NULL")
    List<ActiveSubmissionProjection> findActiveByBookingIdIn(@Param("bookingIds") Collection<Long> bookingIds);
```
```java
    interface ActiveSubmissionProjection {
        Long getBookingId();

        String getSubmissionNo();

        /** 활성 배치 id — 후보 화면의 제출번호를 배치 상세 링크로 만들기 위한 필드(콘솔 UX 스펙 A2). */
        Long getBatchId();
    }
```

`SubmissionCandidateBooking.java` — `submissionNo` 다음에 필드 추가:
```java
        String submissionNo,
        /** 활성 배치 id(submitted=false 면 null) — 콘솔 UX 스펙 A2. */
        Long submissionBatchId,
        String decidedByName,
        LocalDateTime decidedAt
```

`GeneralFacilitySubmissionQueryService.java` — `activeSubmissionNos` 가 번호 대신 프로젝션을 통째로 돌려주게 바꾼다. 다음 정의로 교체:
```java
    /** bookingId → 활성 제출(번호·배치 id). 후보 목록에서 제출번호와 배치 링크를 함께 내린다(콘솔 UX 스펙 A2). */
    private Map<Long, FacilitySubmissionItemRepository.ActiveSubmissionProjection> activeSubmissions(
            List<FacilityBooking> bookings) {
        if (bookings.isEmpty()) {
            return Map.of();
        }
        return itemRepository.findActiveByBookingIdIn(
                        bookings.stream().map(FacilityBooking::getId).toList()).stream()
                .collect(Collectors.toMap(
                        FacilitySubmissionItemRepository.ActiveSubmissionProjection::getBookingId,
                        Function.identity(),
                        (first, second) -> first));
    }
```

(getDetail 쪽 `Collectors.toMap(…, item -> new BatchBoundSubmission(…))` 이 `Map<Long, ActiveSubmissionProjection>` 대입에서 타입 불일치로 컴파일 실패하면 `Collectors.<FacilitySubmissionItem, Long, FacilitySubmissionItemRepository.ActiveSubmissionProjection>toMap(…)` 타입 위트니스를 준다.)
(`import java.util.function.Function;` 추가.)

`getCandidates` 의 호출부:
```java
        Map<Long, FacilitySubmissionItemRepository.ActiveSubmissionProjection> activeSubmissionByBookingId =
                activeSubmissions(bookings);
        ...
                .map(booking -> toCandidate(booking, activeSubmissionByBookingId, clubNames, userNames, facilityNames))
```

`toCandidate` 시그니처와 본문:
```java
    private SubmissionCandidateBooking toCandidate(FacilityBooking booking,
            Map<Long, FacilitySubmissionItemRepository.ActiveSubmissionProjection> activeSubmissionByBookingId,
            Map<Long, String> clubNames, Map<Long, String> userNames, Map<Long, String> facilityNames) {
        FacilitySubmissionItemRepository.ActiveSubmissionProjection activeSubmission =
                activeSubmissionByBookingId.get(booking.getId());
        boolean submitted = activeSubmission != null;
        boolean selectable = booking.getStatus() == BookingStatus.APPROVED && !submitted;
        return new SubmissionCandidateBooking(
                booking.getId(), booking.getFacilityId(), facilityNames.get(booking.getFacilityId()),
                booking.getClubId(), clubNames.get(booking.getClubId()),
                userNames.get(booking.getApplicantId()), blankToNull(booking.getContactPhone()),
                booking.getReservationDate(), booking.getStartTime(), booking.getEndTime(),
                booking.getPurpose(), booking.getAttendeeCount(), booking.getStatus(),
                submitted, selectable,
                submitted ? activeSubmission.getSubmissionNo() : null,
                submitted ? activeSubmission.getBatchId() : null,
                booking.getDecidedById() != null ? userNames.get(booking.getDecidedById()) : null,
                booking.getDecidedAt());
    }
```

`getDetail` 은 `Map<Long,String> submissionNoByBookingId`(이 배치 기준)를 만들어 `toCandidate` 를 호출하고 있다(:146~). 그 호출을 위 시그니처에 맞추려면 문자열 맵 대신 프로젝션 맵이 필요하므로, `getDetail` 안에서 다음처럼 바꾼다:
```java
        // 상세는 조회 중인 이 배치 기준 — 교차 배치를 물으면 남의 제출번호가 붙는다(기존 주석 유지).
        Map<Long, FacilitySubmissionItemRepository.ActiveSubmissionProjection> thisBatchByBookingId = items.stream()
                .filter(item -> item.getSkippedAt() == null)
                .collect(Collectors.toMap(FacilitySubmissionItem::getBookingId,
                        item -> new BatchBoundSubmission(item.getBookingId(), batch.getSubmissionNo(), batch.getId())));
```
그리고 클래스 하단에 프로젝션 구현 record 추가:
```java
    /** 배치 상세용 — 이 배치에 묶인 item 을 프로젝션 계약으로 감싼다(후보 조회와 toCandidate 를 공유). */
    private record BatchBoundSubmission(Long bookingId, String submissionNo, Long batchId)
            implements FacilitySubmissionItemRepository.ActiveSubmissionProjection {
        @Override
        public Long getBookingId() {
            return bookingId;
        }

        @Override
        public String getSubmissionNo() {
            return submissionNo;
        }

        @Override
        public Long getBatchId() {
            return batchId;
        }
    }
```
`getDetail` 의 `toCandidate(booking, submissionNoByBookingId, …)` 호출을 `toCandidate(booking, thisBatchByBookingId, …)` 로 바꾼다. `getDetail` 에서 `submissionNoByBookingId` 를 다른 곳에서도 쓰면(예: submitted 플래그 계산) 같은 맵으로 대체한다 — 컴파일러가 남은 참조를 알려준다.

`SubmissionCandidatesResponse.Booking` — `submissionNo` 다음에 `Long submissionBatchId` 추가, `from` 에 `candidate.submissionBatchId()` 전달:
```java
            String submissionNo,
            Long submissionBatchId,
            String decidedByName,
            Instant decidedAt
    ) {
        public static Booking from(SubmissionCandidateBooking candidate) {
            return new Booking(candidate.bookingId(), candidate.facilityId(), candidate.facilityName(),
                    candidate.clubId(), candidate.clubName(),
                    candidate.applicantName(), candidate.contactPhone(), candidate.reservationDate(),
                    candidate.startTime(), candidate.endTime(), candidate.purpose(), candidate.attendeeCount(),
                    candidate.status(), candidate.submitted(), candidate.selectable(), candidate.submissionNo(),
                    candidate.submissionBatchId(),
                    // decided_at 은 seoulClock(KST wall-clock) 기록값 — seoul 변환.
                    candidate.decidedByName(), TimeMapper.seoulWallClockToInstant(candidate.decidedAt()));
        }
```
`SubmissionBatchDetailResponse` 등 `SubmissionCandidateBooking` 을 생성·해체하는 다른 코드(`grep -rn "new SubmissionCandidateBooking(" backend/src`)가 있으면 같은 위치에 인자를 추가한다(테스트 포함).

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.facilitysubmission.*' -q`
Expected: PASS(facilitysubmission 패키지 전체 — getDetail 경로 회귀까지 확인).

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitysubmission backend/src/test/java/com/duing/domain/facilitysubmission
git commit -m "feat(backend): 제출 후보 응답 — 제출 대기 예약에 활성 배치 id(submissionBatchId) 추가"
```

---

### Task 3: A3-1 배치 목록 검색 조건·리포지토리·서비스 (#15)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/service/dto/query/SubmissionBatchSearchCondition.java`
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/repository/FacilitySubmissionBatchRepositoryImpl.java`
- Modify(호출부 컴파일): `backend/src/main/java/com/duing/domain/facilitysubmission/controller/AdminFacilitySubmissionController.java:70`
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionHistoryQueryIntegrationTest.java`

**Interfaces:**
- Produces: `SubmissionBatchSearchCondition(SubmissionBatchStatusFilter status, String q, LocalDate submittedFrom, LocalDate submittedTo)` — 전부 null 허용(무필터). `q` 는 trim 후 빈 문자열이면 무필터, `submissionNo`·`memo`·동아리명(`Club.name`) 대소문자 무시 부분 일치 OR. 날짜는 `submittedAt >= from.atStartOfDay()` · `submittedAt < to.plusDays(1).atStartOfDay()`.

- [ ] **Step 1: 실패 테스트**

`GeneralFacilitySubmissionHistoryQueryIntegrationTest.java` 에 추가(기존 `statusFilterPartitionsBatchesByDerivedState` 아래). 기존 호출 `new SubmissionBatchSearchCondition(status|null)` 는 **이 파일에 7곳(:123, :147, :167, :201, :291, :314, :342)** — `grep -n 'new SubmissionBatchSearchCondition(' backend/src/test/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionHistoryQueryIntegrationTest.java` 로 전부 찾아 `new SubmissionBatchSearchCondition(status, null, null, null)` 로 바꾼다(하나라도 남으면 컴파일 실패). 컨트롤러 :70 은 Step 3 에서 바꾼다.

```java
    @Test
    @DisplayName("배치 검색 q 는 제출번호·메모·동아리명 부분 일치(대소문자 무시)로 걸리고, 공백만이면 무필터다")
    void keywordSearchMatchesSubmissionNoMemoAndClubName() {
        Club namedClub = clubRepository.save(Club.create("검색밴드부-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null));
        FacilityBooking memoTarget = approvedBooking(9);
        FacilityBooking clubTarget = approvedBooking(namedClub, 11);
        Long memoBatchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(memoTarget.getId()), "가을 학기 MEMO 제출"), actor()).batchId();
        Long clubBatchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(clubTarget.getId()), null), actor()).batchId();
        String clubSubmissionNo = queryService.getBatches(
                        new SubmissionBatchSearchCondition(null, null, null, null), PageRequest.of(0, 20))
                .getContent().stream()
                .filter(item -> item.batchId().equals(clubBatchId))
                .findFirst().orElseThrow().submissionNo();

        assertThat(batchIdsOf("memo")).containsExactly(memoBatchId);
        assertThat(batchIdsOf("검색밴드부")).containsExactly(clubBatchId);
        assertThat(batchIdsOf(clubSubmissionNo.substring(clubSubmissionNo.length() - 3)))
                .contains(clubBatchId);
        assertThat(batchIdsOf("   ")).contains(memoBatchId, clubBatchId);
        assertThat(batchIdsOf("없는키워드zzz")).isEmpty();
    }

    @Test
    @DisplayName("submittedFrom·submittedTo 는 KST 일 단위로 생성일 범위를 거르고 to 당일은 포함, 다음날 0시는 제외한다")
    void submittedDateRangeFiltersBatches() {
        FacilityBooking target = approvedBooking(9);
        Long batchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(target.getId()), null), actor()).batchId();
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));

        assertThat(batchIdsBetween(today, today)).contains(batchId);
        assertThat(batchIdsBetween(today.minusDays(3), today.minusDays(1))).doesNotContain(batchId);
        assertThat(batchIdsBetween(today.plusDays(1), null)).doesNotContain(batchId);
        assertThat(batchIdsBetween(null, today)).contains(batchId);
    }

    private List<Long> batchIdsOf(String keyword) {
        return queryService.getBatches(new SubmissionBatchSearchCondition(null, keyword, null, null),
                        PageRequest.of(0, 50)).getContent().stream()
                .map(SubmissionBatchListItem::batchId)
                .toList();
    }

    private List<Long> batchIdsBetween(LocalDate from, LocalDate to) {
        return queryService.getBatches(new SubmissionBatchSearchCondition(null, null, from, to),
                        PageRequest.of(0, 50)).getContent().stream()
                .map(SubmissionBatchListItem::batchId)
                .toList();
    }
```
(`import java.time.ZoneId;` 추가. `SubmissionBatchListItem.submissionNo()` accessor 이름은 `SubmissionBatchListItem` record 를 열어 확인 — `submissionNo` 가 아니면 그 이름으로.)

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew compileTestJava -q`
Expected: 컴파일 실패 — 4-인자 생성자 없음.

- [ ] **Step 3: 구현**

`SubmissionBatchSearchCondition.java`:
```java
package com.duing.domain.facilitysubmission.service.dto.query;

import java.time.LocalDate;

/**
 * 제출 Batch 목록 검색 조건 — 전부 null 허용(무필터). q 는 제출번호·메모·동아리명 부분 일치(대소문자 무시),
 * submittedFrom/To 는 KST 일 단위 생성일 범위(한쪽만 가능). 시설 필터는 v2 에서 제거(FE 미사용).
 */
public record SubmissionBatchSearchCondition(
        SubmissionBatchStatusFilter status,
        String q,
        LocalDate submittedFrom,
        LocalDate submittedTo
) {
}
```

`FacilitySubmissionBatchRepositoryImpl.java` — where 절에 세 술어 추가, import 추가:
```java
import static com.duing.domain.club.entity.QClub.club;
import static com.duing.domain.facilitysubmission.entity.QFacilitySubmissionBatch.facilitySubmissionBatch;

import com.querydsl.jpa.JPAExpressions;
import java.time.LocalDate;
```
`search`:
```java
    @Override
    public Page<FacilitySubmissionBatch> search(SubmissionBatchSearchCondition condition, Pageable pageable) {
        List<FacilitySubmissionBatch> content = queryFactory.selectFrom(facilitySubmissionBatch)
                .where(statusMatches(condition.status()),
                        keywordMatches(condition.q()),
                        submittedOnOrAfter(condition.submittedFrom()),
                        submittedBefore(condition.submittedTo()))
                .orderBy(facilitySubmissionBatch.id.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();
        Long total = queryFactory.select(facilitySubmissionBatch.count())
                .from(facilitySubmissionBatch)
                .where(statusMatches(condition.status()),
                        keywordMatches(condition.q()),
                        submittedOnOrAfter(condition.submittedFrom()),
                        submittedBefore(condition.submittedTo()))
                .fetchOne();
        return new PageImpl<>(content, pageable, total != null ? total : 0L);
    }
```
술어(클래스 하단에 추가):
```java
    /**
     * 키워드(콘솔 UX 스펙 A3) — 제출번호·메모·동아리명 부분 일치 OR. 동아리명은 배치의 club_id 서브쿼리로
     * 조인 없이 건다(Club 은 @SQLRestriction 으로 삭제 동아리가 자동 제외됨). 공백만이면 무필터.
     */
    private BooleanExpression keywordMatches(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return null;
        }
        String trimmed = keyword.trim();
        return facilitySubmissionBatch.submissionNo.containsIgnoreCase(trimmed)
                .or(facilitySubmissionBatch.memo.containsIgnoreCase(trimmed))
                .or(facilitySubmissionBatch.clubId.in(
                        JPAExpressions.select(club.id).from(club).where(club.name.containsIgnoreCase(trimmed))));
    }

    /** submittedAt 은 KST 벽시계(seoulClock) 기록 — 일 단위 하한은 그 날 00:00 포함. */
    private BooleanExpression submittedOnOrAfter(LocalDate from) {
        return from == null ? null : facilitySubmissionBatch.submittedAt.goe(from.atStartOfDay());
    }

    /** 상한은 to 다음날 00:00 미만 — to 당일 23:59:59 까지 포함. */
    private BooleanExpression submittedBefore(LocalDate to) {
        return to == null ? null : facilitySubmissionBatch.submittedAt.lt(to.plusDays(1).atStartOfDay());
    }
```

`AdminFacilitySubmissionController.java:70` 컴파일 유지(Task 4 에서 파라미터를 잇는다):
```java
                queryService.getBatches(new SubmissionBatchSearchCondition(status, null, null, null), pageable)
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.facilitysubmission.service.GeneralFacilitySubmissionHistoryQueryIntegrationTest' -q`
Expected: PASS(클래스 전체).

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitysubmission backend/src/test/java/com/duing/domain/facilitysubmission
git commit -m "feat(backend): 제출 배치 검색 — 제출번호·메모·동아리명 키워드와 생성일 범위 조건(리포지토리·서비스)"
```

---

### Task 4: A3-2 배치 목록 검색 API 파라미터 (#15)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/api/AdminFacilitySubmissionApi.java:54-57`
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/controller/AdminFacilitySubmissionController.java:66-72`
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/controller/AdminFacilitySubmissionAcceptanceTest.java`

**Interfaces:**
- Produces: `GET /api/v1/admin/facility-bookings/submission?status=&q=&submittedFrom=YYYY-MM-DD&submittedTo=YYYY-MM-DD` — 프론트 PR-C C6 가 `SubmissionBatchListParams { q?, submittedFrom?, submittedTo? }` 로 보낸다.

- [ ] **Step 1: 실패 테스트(인수)**

`AdminFacilitySubmissionAcceptanceTest.java` 에 추가:
```java
    @Test
    @DisplayName("배치 목록은 q(메모 키워드)와 submittedFrom/To(생성일 범위) 쿼리 파라미터로 걸러진다")
    void batchListSupportsKeywordAndDateRangeParams() {
        FacilityBooking memoTarget = approvedBooking(9);
        Integer memoBatchId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("bookingIds", List.of(memoTarget.getId()), "memo", "인수 KEYWORD 메모"))
                .when().post(SUBMISSION_PATH)
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().path("data.batchId");
        FacilityBooking plainTarget = approvedBooking(11);
        Integer plainBatchId = createBatch(plainTarget);
        String today = LocalDate.now(ZoneId.of("Asia/Seoul")).toString();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH + "?q=keyword")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.batchId", hasItem(memoBatchId)) // static import: hasItem, hasItems, not (org.hamcrest.Matchers)
                .body("data.content.batchId", not(hasItem(plainBatchId)));
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH + "?submittedFrom=" + today + "&submittedTo=" + today)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.batchId", hasItems(memoBatchId, plainBatchId));
    }
```
(`import java.time.LocalDate; import java.time.ZoneId;` 가 없으면 추가. `CreateSubmissionBatchRequest` 의 memo 필드명이 `memo` 인지 확인 — `grep -n memo backend/src/main/java/com/duing/domain/facilitysubmission/controller/dto/request/CreateSubmissionBatchRequest.java`.)

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.facilitysubmission.controller.AdminFacilitySubmissionAcceptanceTest' -q`
Expected: `batchListSupportsKeywordAndDateRangeParams` FAIL — `q` 가 무시돼 plainBatchId 도 포함됨.

- [ ] **Step 3: 구현**

`AdminFacilitySubmissionApi.java:54-57`:
```java
    ResponseEntity<ApiResponse<PageResponse<SubmissionBatchSummaryResponse>>> getBatches(
            @Parameter(description = "파생 상태 필터(생략 시 전체)") @RequestParam(required = false)
            SubmissionBatchStatusFilter status,
            @Parameter(description = "제출번호·메모·동아리명 부분 일치(대소문자 무시, 공백만이면 무필터)")
            @RequestParam(required = false) String q,
            @Parameter(description = "생성일 하한(YYYY-MM-DD, KST, 포함)") @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate submittedFrom,
            @Parameter(description = "생성일 상한(YYYY-MM-DD, KST, 당일 포함)") @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate submittedTo,
            @Parameter(hidden = true) Pageable pageable);
```
(import `java.time.LocalDate`, `org.springframework.format.annotation.DateTimeFormat` — 같은 파일의 `getCandidates` 가 이미 `startDate` 에 `@DateTimeFormat` 을 쓰고 있으면 그 형식을 그대로 따른다.)

`AdminFacilitySubmissionController.java:66-72`:
```java
    @Override
    public ResponseEntity<ApiResponse<PageResponse<SubmissionBatchSummaryResponse>>> getBatches(
            SubmissionBatchStatusFilter status, String q, LocalDate submittedFrom, LocalDate submittedTo,
            Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(
                queryService.getBatches(new SubmissionBatchSearchCondition(status, q, submittedFrom, submittedTo),
                                pageable)
                        .map(SubmissionBatchSummaryResponse::from))));
    }
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.facilitysubmission.*' -q`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitysubmission backend/src/test/java/com/duing/domain/facilitysubmission
git commit -m "feat(backend): 제출 배치 목록 API — q·submittedFrom·submittedTo 검색 파라미터"
```

---

### Task 5: A4 크롤 현황 단체명 검색 q (#17)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/FacilityCrawlAdminQueryService.java:59-98`
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/api/AdminFacilityCrawlApi.java:27-33`
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/controller/AdminFacilityCrawlController.java:29-38`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/FacilityCrawlAdminQueryServiceTest.java`, `backend/src/test/java/com/duing/domain/facilitybooking/controller/AdminFacilityCrawlAcceptanceTest.java`

**Interfaces:**
- Produces: `FacilityCrawlAdminQueryService.getReservations(YearMonth requestedMonth, Long facilityId, AdminCrawlGroupBy groupBy, String q, Pageable pageable)`; `GET /admin/facility-crawl/reservations?q=`. 규칙: `q` 공백만 = 무필터. CLUB·EXTERNAL 보기 = 그룹 `title` 정규화 contains 매치 시 그룹 전체 유지. FACILITY·FACILITY_DATE = 행 `organizationName` 정규화 contains 매치 행만 남기고, 남는 행이 없는 그룹은 제거. `totalElements` = 필터 후 그룹 수.

- [ ] **Step 1: 실패 테스트(Mockito 단위)**

`FacilityCrawlAdminQueryServiceTest.java` — 기존 호출 `service.getReservations(month, null, AdminCrawlGroupBy.CLUB, PageRequest.of(0, 10))` 을 `service.getReservations(month, null, AdminCrawlGroupBy.CLUB, null, PageRequest.of(0, 10))` 로 바꾸고, 아래 테스트 추가:
```java
    @Test
    @DisplayName("q 는 동아리별 보기에서 그룹 제목 정규화 부분 일치로 그룹을 남기고, 시설별 보기에서는 매치 행만 남기며, 공백만이면 무필터다")
    void keywordFiltersGroupsByNormalizedTitleOrRows() {
        YearMonth month = YearMonth.now(clock);
        LocalDate date = month.atDay(15);
        Facility facility = Facility.create(4, "공동연습실(1)", "2105", 0);
        ReflectionTestUtils.setField(facility, "id", 10L);
        FacilityReservation clubRow = FacilityReservation.create(10L, 100L, month, date,
                LocalTime.of(10, 0), LocalTime.of(12, 0), "고정 관념", false, LocalDateTime.of(2026, 8, 1, 9, 0));
        FacilityReservation externalRow = FacilityReservation.create(10L, 101L, month, date,
                LocalTime.of(13, 0), LocalTime.of(15, 0), "학생생활상담센터", false, LocalDateTime.of(2026, 8, 1, 9, 0));
        when(facilityReservationRepository.findByYearMonth(month)).thenReturn(List.of(clubRow, externalRow));
        when(facilityRepository.findAllById(any())).thenReturn(List.of(facility));
        when(clubRepository.findSecuredTargetNameRows()).thenReturn(List.of(new SecuredNameRow(7L, "고정관념", false)));

        Page<AdminCrawlReservationGroupResponse> clubView =
                service.getReservations(month, null, AdminCrawlGroupBy.CLUB, "고정", PageRequest.of(0, 10));
        assertThat(clubView.getTotalElements()).isEqualTo(1);
        assertThat(clubView.getContent().get(0).title()).isEqualTo("고정관념");
        assertThat(clubView.getContent().get(0).reservations()).hasSize(1);

        Page<AdminCrawlReservationGroupResponse> externalView =
                service.getReservations(month, null, AdminCrawlGroupBy.CLUB, "상담 센터", PageRequest.of(0, 10));
        assertThat(externalView.getContent()).extracting(AdminCrawlReservationGroupResponse::title)
                .containsExactly("학생생활상담센터"); // 공백 차이는 정규화가 흡수

        Page<AdminCrawlReservationGroupResponse> facilityView =
                service.getReservations(month, null, AdminCrawlGroupBy.FACILITY, "고정", PageRequest.of(0, 10));
        assertThat(facilityView.getTotalElements()).isEqualTo(1);
        assertThat(facilityView.getContent().get(0).title()).isEqualTo("공동연습실(1)");
        assertThat(facilityView.getContent().get(0).reservations())
                .extracting(AdminCrawlReservationGroupResponse.AdminCrawlReservation::organizationName)
                .containsExactly("고정 관념");

        Page<AdminCrawlReservationGroupResponse> noMatch =
                service.getReservations(month, null, AdminCrawlGroupBy.FACILITY, "없는단체", PageRequest.of(0, 10));
        assertThat(noMatch.getTotalElements()).isZero();

        Page<AdminCrawlReservationGroupResponse> blank =
                service.getReservations(month, null, AdminCrawlGroupBy.CLUB, "   ", PageRequest.of(0, 10));
        assertThat(blank.getTotalElements()).isEqualTo(2);
    }
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew compileTestJava -q`
Expected: 컴파일 실패 — 5-인자 `getReservations` 없음.

- [ ] **Step 3: 구현**

`FacilityCrawlAdminQueryService.getReservations` 시그니처와 그룹 생성 이후 부분:
```java
    public Page<AdminCrawlReservationGroupResponse> getReservations(YearMonth requestedMonth, Long facilityId,
            AdminCrawlGroupBy groupBy, String keyword, Pageable pageable) {
```
`List<AdminCrawlReservationGroupResponse> groups = switch (groupBy) { … };` 바로 아래에:
```java
        groups = filterByKeyword(groups, groupBy, keyword);
```
헬퍼(클래스 하단, `facilitySortKey` 위):
```java
    /**
     * 단체명 검색(콘솔 UX 스펙 A4) — 그룹 생성 후·페이징 전. 양쪽을 정규화(공백·끝 괄호 제거·소문자)해
     * contains 로 비교하므로 "고정 관념"·"고정관념(중앙)" 표기 차이를 흡수한다. 동아리별 보기(CLUB·EXTERNAL
     * 그룹)는 제목 매치 시 그룹 전체를 유지하고, 장소 보기(FACILITY·FACILITY_DATE)는 제목이 시설명이라
     * 행 단체명으로 걸러 매치 행만 남긴다(남는 행이 없으면 그룹 제거). totalElements 는 필터 후 그룹 수.
     */
    private List<AdminCrawlReservationGroupResponse> filterByKeyword(List<AdminCrawlReservationGroupResponse> groups,
            AdminCrawlGroupBy groupBy, String keyword) {
        String normalizedKeyword = normalizer.normalize(keyword);
        if (normalizedKeyword.isEmpty()) {
            return groups;
        }
        // 정규화는 끝 괄호 그룹을 떼므로 q="(중앙)" 은 빈 키(무필터), q="고정관념(중앙)" 은 "고정관념" 으로 매치된다 — 표기 차이 흡수 의도.
        if (groupBy == AdminCrawlGroupBy.CLUB) {
            return groups.stream()
                    .filter(group -> normalizer.normalize(group.title()).contains(normalizedKeyword))
                    .toList();
        }
        return groups.stream()
                .map(group -> new AdminCrawlReservationGroupResponse(group.groupType(), group.clubId(),
                        group.facilitySecuredTimeTarget(), group.facilityId(), group.reservationDate(),
                        group.title(),
                        group.reservations().stream()
                                .filter(reservation -> normalizer.normalize(reservation.organizationName())
                                        .contains(normalizedKeyword))
                                .toList()))
                .filter(group -> !group.reservations().isEmpty())
                .toList();
    }
```
(`normalizer.normalize(null)` 은 `""` 를 돌려주므로 null 가드 불필요 — `OrganizationNameNormalizer` 참고. `AdminCrawlGroupBy` 의 상수가 `CLUB, FACILITY, FACILITY_DATE` 인지 파일을 열어 확인.)

`AdminFacilityCrawlApi.java` — `groupBy` 다음에:
```java
            @RequestParam(required = false, defaultValue = "CLUB") AdminCrawlGroupBy groupBy,
            @Parameter(description = "단체명 검색(정규화 부분 일치, 공백만이면 무필터). 동아리별 보기는 그룹 단위, 시설 보기는 행 단위로 거른다")
            @RequestParam(required = false) String q,
            @Parameter(hidden = true) Pageable pageable
```
`description` 문자열에 `"q 로 단체명 검색. "` 를 덧붙인다(선택).

`AdminFacilityCrawlController.java`:
```java
    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminCrawlReservationGroupResponse>>> getCrawlReservations(
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM") YearMonth yearMonth,
            @RequestParam(required = false) Long facilityId,
            @RequestParam(required = false, defaultValue = "CLUB") AdminCrawlGroupBy groupBy,
            @RequestParam(required = false) String q,
            Pageable pageable
    ) {
        Page<AdminCrawlReservationGroupResponse> page =
                crawlAdminQueryService.getReservations(yearMonth, facilityId, groupBy, q, pageable);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }
```
다른 호출자 확인: `grep -rn "getReservations(" backend/src --include=*.java` — 테스트·컨트롤러 외 호출이 있으면 `null` 을 q 자리에 넘긴다.

- [ ] **Step 4: 인수 테스트 1건 추가 후 통과 확인**

`AdminFacilityCrawlAcceptanceTest.java` 에 추가:
```java
    @Test
    @DisplayName("q 로 단체명을 검색하면 동아리별 보기에서 매치 그룹만 돌아온다")
    void keywordSearchNarrowsGroups() {
        Facility facility = saveFacility("검색연습실");
        YearMonth currentMonth = YearMonth.now(clock);
        saveReservation(facility, currentMonth.atDay(10), 13, 15, "학생생활상담센터");
        saveReservation(facility, currentMonth.atDay(10), 17, 19, "총학생회");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(PATH + "?yearMonth=" + currentMonth + "&facilityId=" + facility.getId() + "&q=상담")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content.size()", equalTo(1))
                .body("data.content[0].title", equalTo("학생생활상담센터"));
    }
```
Run: `cd backend && ./gradlew test --tests 'com.duing.domain.facilitybooking.service.FacilityCrawlAdminQueryServiceTest' --tests 'com.duing.domain.facilitybooking.controller.AdminFacilityCrawlAcceptanceTest' -q`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking backend/src/test/java/com/duing/domain/facilitybooking
git commit -m "feat(backend): 크롤 예약 현황 — 단체명 검색 q(정규화 부분 일치, 그룹/행 단위)"
```

---

### Task 6: A5 크롤 현황 직전 월 열람 (#19)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/FacilityCrawlAdminQueryService.java:63-66`
- Modify(문서 문자열): `backend/src/main/java/com/duing/domain/facilitybooking/api/AdminFacilityCrawlApi.java:22-26`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/FacilityCrawlAdminQueryServiceTest.java`, `backend/src/test/java/com/duing/domain/facilitybooking/controller/AdminFacilityCrawlAcceptanceTest.java:199-207`

**Interfaces:**
- Produces: `yearMonth` 허용 범위 = 당월 -1 ~ +1(재크롤 없음, 저장 행 그대로). 그 밖은 `MonthOutOfBookingRangeException`(400). 프론트 PR-D D3 가 "지난 달" 옵션을 켠다.

- [ ] **Step 1: 실패 테스트**

`FacilityCrawlAdminQueryServiceTest.java` 에 추가:
```java
    @Test
    @DisplayName("직전 월은 저장된 행 그대로 조회되고(재크롤 없음), 2개월 전은 조회 범위 밖 400 이다")
    void previousMonthIsReadableButTwoMonthsAgoIsNot() {
        YearMonth previousMonth = YearMonth.now(clock).minusMonths(1);
        LocalDate date = previousMonth.atDay(20);
        Facility facility = Facility.create(4, "공동연습실(1)", "2105", 0);
        ReflectionTestUtils.setField(facility, "id", 10L);
        FacilityReservation row = FacilityReservation.create(10L, 100L, previousMonth, date,
                LocalTime.of(10, 0), LocalTime.of(12, 0), "고정관념", false, LocalDateTime.of(2026, 7, 1, 9, 0));
        when(facilityReservationRepository.findByYearMonth(previousMonth)).thenReturn(List.of(row));
        when(facilityRepository.findAllById(any())).thenReturn(List.of(facility));
        when(clubRepository.findSecuredTargetNameRows()).thenReturn(List.of());

        Page<AdminCrawlReservationGroupResponse> page =
                service.getReservations(previousMonth, null, AdminCrawlGroupBy.CLUB, null, PageRequest.of(0, 10));
        assertThat(page.getTotalElements()).isEqualTo(1);

        assertThatThrownBy(() -> service.getReservations(YearMonth.now(clock).minusMonths(2), null,
                AdminCrawlGroupBy.CLUB, null, PageRequest.of(0, 10)))
                .isInstanceOf(FacilityBookingException.MonthOutOfBookingRangeException.class);
    }
```
(`import static org.assertj.core.api.Assertions.assertThatThrownBy;` 와 `import com.duing.domain.facilitybooking.exception.FacilityBookingException;` 추가.)

`AdminFacilityCrawlAcceptanceTest.monthOutOfCrawlWindowIs400` 를 아래로 교체:
```java
    @Test
    @DisplayName("크롤 창(직전 월·당월·익월) 밖 월 조회는 400 이고 직전 월은 200 이다")
    void monthOutOfCrawlWindowIs400() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(PATH + "?yearMonth=" + YearMonth.now(clock).plusMonths(2))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(PATH + "?yearMonth=" + YearMonth.now(clock).minusMonths(2))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(PATH + "?yearMonth=" + YearMonth.now(clock).minusMonths(1))
                .then().statusCode(HttpStatus.OK.value());
    }
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.facilitybooking.service.FacilityCrawlAdminQueryServiceTest' -q`
Expected: `previousMonthIsReadableButTwoMonthsAgoIsNot` FAIL — 직전 월이 `MonthOutOfBookingRangeException`.

- [ ] **Step 3: 구현**

`FacilityCrawlAdminQueryService.java:63-66` 을:
```java
        YearMonth currentMonth = YearMonth.now(clock);
        YearMonth targetMonth = requestedMonth != null ? requestedMonth : currentMonth;
        // 직전 월 열람 허용(콘솔 UX 스펙 A5) — 동아리 측 가용성(GeneralFacilityAvailabilityService)과 같은
        // -1~+1 창. 직전 월 행은 월 단위 purge 가 없어 저장 그대로이며 재크롤은 하지 않는다.
        if (targetMonth.isBefore(currentMonth.minusMonths(1)) || targetMonth.isAfter(currentMonth.plusMonths(1))) {
            throw new FacilityBookingException.MonthOutOfBookingRangeException();
        }
```
`AdminFacilityCrawlApi.java` description 의 `"yearMonth 는 당월·익월만 허용(기본 당월). "` 를 `"yearMonth 는 직전 월·당월·익월만 허용(기본 당월). "` 로.

클래스 javadoc(`:31`) 의 "크롤 데이터는 당월·익월 한정" 문구를 "직전 월·당월·익월 한정" 으로 고친다.

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.facilitybooking.service.FacilityCrawlAdminQueryServiceTest' --tests 'com.duing.domain.facilitybooking.controller.AdminFacilityCrawlAcceptanceTest' -q`
Expected: PASS.

- [ ] **Step 5: 커밋 + 전체 회귀**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking backend/src/test/java/com/duing/domain/facilitybooking
git commit -m "feat(backend): 크롤 예약 현황 — 직전 월 열람 허용(-1~+1 창)"
cd backend && ./gradlew test --tests 'com.duing.domain.facilitysubmission.*' --tests 'com.duing.domain.facilitybooking.*' -q
```
Expected: PASS. 이후 `git push -u origin feat/facility-admin-console-api` 후 PR(제목 `feat(backend): 시설 관리자 콘솔 — 제출 후보 62일·배치 id·배치 검색·크롤 단체명 검색·직전 월 열람`). 머지는 사용자 지시 후.

---

## Self-Review

- 스펙 커버리지: A1→Task 1, A2→Task 2, A3→Task 3+4, A4→Task 5, A5→Task 6. §5 호환(additive)·§3 테스트 파일 전부 대응. 누락 없음.
- 플레이스홀더: "적절히/유사하게/TBD" 없음. 확인이 필요한 곳은 grep 명령을 명시(`new SubmissionCandidateBooking(` 호출자, `AdminCrawlGroupBy` 상수, `CreateSubmissionBatchRequest.memo`, `SubmissionBatchListItem.submissionNo`).
- 타입 일관성: `SubmissionBatchSearchCondition(status, q, submittedFrom, submittedTo)` 4-인자를 Task 3·4·테스트가 동일 순서로 사용. `getReservations(month, facilityId, groupBy, q, pageable)` 5-인자를 Task 5·6·테스트가 동일 사용. `ActiveSubmissionProjection.getBatchId()`·`submissionBatchId` 명명이 Task 2 전 구간 일치.
