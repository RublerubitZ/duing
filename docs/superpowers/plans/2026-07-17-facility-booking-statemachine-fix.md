# 시설 예약 상태머신 보정(감사 §13) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2026-07-17 동시성 감사에서 확정된 §13 두 결함 — (High) 수동 확정이 자기 학교 등록 행에 막혀 본래 시나리오에서 항상 409, (Medium) CONFIRMED 완전 터미널이라 오확정·학교 측 취소의 복구 경로 부재 — 를 한 PR 로 수정한다.

**Architecture:** `confirmManually` 에서 학교 점유 재검증(`rejectIfSchoolOccupied`)만 제거하고 시설 행 잠금·내부 겹침 재검증·크롤 세대 이력 기록은 유지한다(수동 확정 = 관리자 오버라이드 경로). `FacilityBooking.cancelByAdmin` 가드에 CONFIRMED 를 추가해 CONFIRMED → CANCELLED 복구 전이를 연다 — CANCELLED 전이 시 EXCLUDE 제약 대상에서 자동 이탈하므로 추가 정리 로직은 불요. 승인 경로(`approve`)의 학교 점유 재검증은 그대로 유지한다(승인 시점의 겹치는 학교 행은 타 단체 행이 맞음).

**Tech Stack:** Spring Boot 3.4 / Java 21 / TestContainers(PostgreSQL 16) / JUnit 5 + AssertJ

## Global Constraints

- 커밋 메시지: Conventional Commits 한국어 — `fix(backend): ...` (`[#이슈번호]` 형식 금지, Claude attribution 라인 금지)
- 브랜치: `fix/facility-manual-confirm-override` (develop 에서 분기)
- Flyway 기존 마이그레이션 수정 금지 — 이 PR 은 DB 변경 없음
- 테스트 실행 cwd 는 `backend/`, `./gradlew test` 출력에서 BUILD SUCCESSFUL 직접 확인 (`| tail` 로 exit code 가리지 말 것)
- 테스트 날짜는 상대 날짜 헬퍼(`BookingWindowFixture.bookableDate()`) 사용 — 하드코딩 미래 날짜 금지
- 사용자 대면 메시지·`@DisplayName` 은 한국어 문장

## Out of Scope

- FE 관리자 모달의 CONFIRMED 취소 버튼 노출 — 별도 프론트 PR (백엔드 API 계약 선행)
- 감사 §14 항목 전부(아카이브 재검증, 매칭 게이트 완화, ACTIVE 잠금 재배열, DIVE 핸들러 분기, @Version 경합 테스트, 타임아웃 정합, 알림 연결 등) — 각각 별도 PR
- `confirmManually` 의 충돌 정보 경고 payload 반환(비차단 안내) — P2 여지로 남김
- CONFIRMED 취소 시 `matchedScheduleSeq`/`confirmedAt` 클리어 — 이력 보존 목적으로 유지(상태 CANCELLED 가 현재 상태를 전달)

---

### Task 1: CONFIRMED → CANCELLED 복구 전이 개방 (엔티티·상태 enum)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/entity/FacilityBooking.java:186-193`
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/entity/BookingStatus.java:3-5,25-27`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/entity/FacilityBookingAdminTransitionTest.java:83-98`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/entity/FacilityBookingTest.java:69`

**Interfaces:**
- Produces: `FacilityBooking.cancelByAdmin()` 이 APPROVED·CONFLICT·CONFIRMED 에서 허용(그 외 `InvalidStatusTransitionException`), `BookingStatus.isTerminal()` == (REJECTED || CANCELLED)

- [x] **Step 1: 단위 테스트를 새 계약으로 수정 (실패 확인용)**

`FacilityBookingAdminTransitionTest.conflictAndAdminCancelGuards` (:83-98) 를 다음으로 교체:

```java
    @Test
    @DisplayName("충돌 전환은 APPROVED 에서만, 관리자 취소는 APPROVED·CONFLICT·CONFIRMED 에서 가능하다")
    void conflictAndAdminCancelGuards() throws Exception {
        FacilityBooking approved = booking(BookingStatus.APPROVED);
        approved.markConflict("문화팀 예약과 겹침");
        assertThat(approved.getStatus()).isEqualTo(BookingStatus.CONFLICT);
        assertThat(approved.getConflictDetail()).isEqualTo("문화팀 예약과 겹침");

        approved.cancelByAdmin();
        assertThat(approved.getStatus()).isEqualTo(BookingStatus.CANCELLED);

        // CONFIRMED 취소는 학교 측 취소·오확정 정정용 복구 경로(감사 2026-07-17 후속)
        FacilityBooking confirmed = booking(BookingStatus.CONFIRMED);
        confirmed.cancelByAdmin();
        assertThat(confirmed.getStatus()).isEqualTo(BookingStatus.CANCELLED);

        assertThatThrownBy(() -> booking(BookingStatus.PENDING).markConflict("x"))
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);
        assertThatThrownBy(() -> booking(BookingStatus.PENDING).cancelByAdmin())
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);
        assertThatThrownBy(() -> booking(BookingStatus.CANCELLED).cancelByAdmin())
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);
    }
```

`FacilityBookingTest.statusDerivedFlags` (:69) 의 `assertThat(BookingStatus.CONFIRMED.isTerminal()).isTrue();` 를:

```java
        // CONFIRMED 는 관리자 취소(복구 경로)가 열려 있어 터미널이 아니다(감사 2026-07-17 후속)
        assertThat(BookingStatus.CONFIRMED.isTerminal()).isFalse();
```

- [x] **Step 2: 실패 확인**

Run (cwd `backend/`): `./gradlew test --tests FacilityBookingAdminTransitionTest --tests FacilityBookingTest`
Expected: FAIL — `conflictAndAdminCancelGuards` 는 CONFIRMED cancelByAdmin 에서 InvalidStatusTransitionException, `statusDerivedFlags` 는 isTerminal true

- [x] **Step 3: 엔티티·enum 구현**

`FacilityBooking.java:186-193` 교체:

```java
    /** 관리자 취소 — APPROVED·CONFLICT·CONFIRMED 에서(§4.3). CONFIRMED 취소는 학교 측 취소·오확정
     *  정정용 복구 경로다(CANCELLED 전이 시 EXCLUDE 대상에서 자동 이탈). 취소 사유는 이력(history.reason)에만
     *  남긴다 — rejectReason 은 거절 전용 필드라 의미를 오염시키지 않는다. */
    public void cancelByAdmin() {
        if (this.status != BookingStatus.APPROVED && this.status != BookingStatus.CONFLICT
                && this.status != BookingStatus.CONFIRMED) {
            throw new FacilityBookingException.InvalidStatusTransitionException(this.status, BookingStatus.CANCELLED);
        }
        this.status = BookingStatus.CANCELLED;
    }
```

`BookingStatus.java` 클래스 javadoc(:3-5)과 isTerminal(:25-27) 교체:

```java
/**
 * 대관 신청 상태 머신(설계 §4). PENDING → APPROVED → CONFIRMED 이 정상 경로,
 * 승인 후 학교 데이터 충돌만 CONFLICT 를 쓴다. CONFIRMED 탈출은 관리자 취소(학교 측 취소·
 * 오확정 정정 복구 경로) 하나만 허용된다.
 */
```

```java
    public boolean isTerminal() {
        return this == REJECTED || this == CANCELLED;
    }
```

- [x] **Step 4: 통과 확인**

Run: `./gradlew test --tests FacilityBookingAdminTransitionTest --tests FacilityBookingTest`
Expected: BUILD SUCCESSFUL

- [x] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking/entity/ backend/src/test/java/com/duing/domain/facilitybooking/entity/
git commit -m "fix(backend): CONFIRMED 예약에 관리자 취소 복구 경로 개방"
```

### Task 2: 수동 확정의 학교 점유 재검증 제거 (서비스·통합 테스트)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/GeneralFacilityBookingAdminService.java:64-83`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/FacilityBookingAdminServiceIntegrationTest.java:161-178,226-261`

**Interfaces:**
- Consumes: Task 1 의 `cancelByAdmin()` 새 가드
- Produces: `confirmManually(adminId, bookingId)` 가 학교 점유행 존재와 무관하게 APPROVED → CONFIRMED 성공(내부 APPROVED/CONFIRMED 겹침·시설 잠금·이력 crawlBasisAt 기록은 유지)

- [x] **Step 1: 제도화된 통합 테스트를 새 계약으로 교체 (실패 확인용)**

`confirmManuallyRevalidatesAgainstSchoolRows` (:161-178) 를 다음 두 테스트로 교체:

```java
    @Test
    @DisplayName("수동 확정은 학교 점유행과 겹쳐도 성공한다 — 표기 차이로 자동 매칭이 못 잡은 자기 등록 행의 관리자 오버라이드 경로다")
    void confirmManuallyOverridesSchoolRows() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        Long approved = pendingBooking(fixture, date, 18, 20);
        adminService.approve(admin.getId(), approved);
        // 승인 후 자기 동아리의 학교 등록 행이 표기 차이로 유입 — 정규화 불일치라 자동 매칭 불발(§5.3)
        facilityReservationRepository.save(FacilityReservation.create(
                fixture.facility().getId(), sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(20, 0), "두잉 대관동아리(중앙)", null, null, LocalDateTime.now()));

        adminService.confirmManually(admin.getId(), approved);

        FacilityBooking confirmed = bookingRepository.findById(approved).orElseThrow();
        assertThat(confirmed.getStatus()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(confirmed.getConfirmedAt()).isNotNull();
        var histories = historyRepository.findByBookingIdOrderByCreatedAtDesc(approved);
        assertThat(histories.get(0).getNewStatus()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(histories.get(0).getCrawlBasisAt()).isNotNull(); // 판정 근거 크롤 세대는 계속 기록
    }

    @Test
    @DisplayName("확정 취소는 슬롯을 해제한다 — 취소 후 같은 시간대의 다른 신청이 승인된다")
    void cancellingConfirmedReleasesSlot() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        Long confirmed = pendingBooking(fixture, date, 18, 20);
        adminService.approve(admin.getId(), confirmed);
        adminService.confirmManually(admin.getId(), confirmed);

        adminService.cancel(admin.getId(), confirmed, "학교 측 사정으로 예약 취소");
        assertThat(bookingRepository.findById(confirmed).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.CANCELLED);
        assertThat(historyRepository.findByBookingIdOrderByCreatedAtDesc(confirmed).get(0).getReason())
                .isEqualTo("학교 측 사정으로 예약 취소");

        // CANCELLED 는 EXCLUDE 대상에서 이탈 — 겹치는 타 동아리 신청이 승인까지 통과한다
        User otherLeader = saveUser("리더B");
        Club otherClub = saveActiveClub("후속동아리");
        clubMemberRepository.save(ClubMember.asLeader(otherClub, otherLeader));
        Long successor = bookingService.create(new CreateFacilityBookingCommand(
                otherClub.getId(), otherLeader.getId(), fixture.facility().getId(),
                date, LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE)).bookingId();
        adminService.approve(admin.getId(), successor);
        assertThat(bookingRepository.findById(successor).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED);
    }
```

`adminTransitionsFollowMatrix` (:238-245) 의 CONFIRMED 블록 교체:

```java
        Long confirmed = pendingBooking(fixture, date, 11, 12);
        adminService.approve(admin.getId(), confirmed);
        adminService.confirmManually(admin.getId(), confirmed);
        assertThat(bookingRepository.findById(confirmed).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.CONFIRMED);
        // CONFIRMED 취소는 관리자 전용 복구 경로 — 학교 측 취소·오확정 정정(§4.3)
        adminService.cancel(admin.getId(), confirmed, "학교 측 취소 확인");
        assertThat(bookingRepository.findById(confirmed).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.CANCELLED);
```

- [x] **Step 2: 실패 확인**

Run: `./gradlew test --tests FacilityBookingAdminServiceIntegrationTest`
Expected: FAIL — `confirmManuallyOverridesSchoolRows` 가 SchoolConflictException 으로 실패 (다른 두 테스트는 Task 1 반영으로 통과)

- [x] **Step 3: 서비스 구현 — rejectIfSchoolOccupied 호출 제거**

`GeneralFacilityBookingAdminService.confirmManually` (:64-83) 교체:

```java
    @Override
    @Transactional
    public void confirmManually(Long adminId, Long bookingId) {
        FacilityBooking booking = getBooking(bookingId);
        // 수동 확정은 '이 학교 점유행이 우리 예약의 등록 행'이라는 관리자 판단을 반영하는 오버라이드 경로다(§5.3).
        // 본래 시나리오(표기 차이로 자동 매칭 불발)에서는 자기 등록 행이 점유행으로 존재할 수밖에 없어,
        // 승인과 같은 학교 점유 재검증을 걸면 수동 확정이 필요한 모든 경우가 409 로 막힌다(2026-07-17 감사).
        // 시설 행 잠금(무방비 CONFIRMED 진입 차단)과 내부 APPROVED/CONFIRMED 겹침 재검증은 유지하고,
        // 판정 근거 크롤 세대(crawlBasisAt)는 이력에 계속 남긴다.
        facilityRepository.findByIdForUpdate(booking.getFacilityId())
                .orElseThrow(FacilityException.FacilityNotFoundException::new);
        List<FacilityReservation> monthRows = facilityReservationRepository.findByFacilityIdAndYearMonth(
                booking.getFacilityId(), YearMonth.from(booking.getReservationDate()));
        LocalDateTime crawlBasisAt = facilityCrawlBasis(monthRows);
        rejectIfInternallyBlocked(booking);

        BookingStatus previousStatus = booking.getStatus();
        booking.confirmManually(LocalDateTime.now(clock));
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), previousStatus, BookingStatus.CONFIRMED, adminId, "관리자 수동 확정", crawlBasisAt));
    }
```

(주의: `rejectIfSchoolOccupied` 는 approve 가 계속 사용하므로 메서드 자체는 유지. javadoc 의 "승인·확정 불가" 문구를 "승인 불가"로 갱신)

- [x] **Step 4: 통과 확인**

Run: `./gradlew test --tests FacilityBookingAdminServiceIntegrationTest`
Expected: BUILD SUCCESSFUL (전 테스트 통과)

- [x] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking/service/GeneralFacilityBookingAdminService.java backend/src/test/java/com/duing/domain/facilitybooking/service/FacilityBookingAdminServiceIntegrationTest.java
git commit -m "fix(backend): 수동 확정의 학교 점유 재검증 제거 — 자기 등록 행 409 결함 수정"
```

### Task 3: API 문서·설계 스펙 정합화 + 전체 테스트

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/api/AdminFacilityBookingApi.java:57,68`
- Modify: `docs/superpowers/specs/2026-07-13-facility-booking-design.md:114,137,139,150,196` (±α — 실제 문맥 확인 후 해당 문장만)

**Interfaces:**
- Consumes: Task 1·2 의 새 계약
- Produces: Swagger·설계 문서가 코드와 일치

- [x] **Step 1: Swagger @Operation 갱신**

```java
    @Operation(summary = "수동 확정", description = "자동 매칭 불발(학교 표기 차이) 건의 관리자 확정 — "
            + "학교 점유행 재검증 없이 확정하는 오버라이드 경로(내부 겹침 재검증은 유지).")
```

```java
    @Operation(summary = "관리자 취소", description = "APPROVED·CONFLICT·CONFIRMED 취소. "
            + "CONFIRMED 취소는 학교 측 취소·오확정 정정용 복구 경로. 사유는 이력에 기록.")
```

- [x] **Step 2: 설계 스펙 문서의 CONFIRMED 터미널·수동 확정 재검증 서술 갱신**

해당 라인 실제 문맥을 읽고 다음 취지로 문장 단위 수정 (2026-07-17 감사 후속임을 명기):
- §4.1 상태표: CONFIRMED "수정·변경 불가, **관리자 취소만 가능**(학교 측 취소·오확정 정정 복구 경로)"
- 전이 규칙: "CONFIRMED 탈출 전이는 관리자 취소 하나만 허용" + 전이 행렬에 `CONFIRMED → CANCELLED | 관리자 취소(복구) | ADMIN` 행 추가
- "APPROVED/CONFIRMED 진입 전이는 겹침 재검증 통과" 문장: 수동 확정은 내부 겹침 재검증만(학교 점유 재검증은 자기 행 구분 불가로 제거) 단서 추가
- §4.3 권한 표의 CONFIRMED 행: 관리자 취소 가능으로 갱신

- [x] **Step 3: backend 전체 테스트**

Run (cwd `backend/`): `./gradlew test`
Expected: BUILD SUCCESSFUL — 출력에서 직접 확인

- [x] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking/api/AdminFacilityBookingApi.java docs/superpowers/specs/2026-07-13-facility-booking-design.md docs/superpowers/plans/2026-07-17-facility-booking-statemachine-fix.md
git commit -m "docs(backend): 수동 확정 오버라이드·CONFIRMED 취소 복구 경로를 API 문서·설계 스펙에 반영"
```

### Task 4: 리뷰 디스패치 → PR

- [x] **Step 1**: duing-code-reviewer + codex:review + codex:adversarial-review(상태전이·동시성 해당) 디스패치, 지적 반영
- [x] **Step 2**: PR 직전 self-check 7항목 수행
- [x] **Step 3**: push + PR 생성 (머지 금지 — 사용자 지시 대기). PR 본문: 🚀/🤔/💬, 자연스러운 문장, attribution 금지
