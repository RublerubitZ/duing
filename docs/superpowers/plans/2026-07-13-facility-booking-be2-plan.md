# 시설 대관 신청 백엔드 2차(PR2: 관리자 승인·매칭) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 총동연(ADMIN) 승인 워크플로우 — 승인(재검증+시설 행 잠금)·거절·수동 확정·충돌 전환·관리자 취소, 관리자 큐/상세/대시보드 API, CONFIRMED 자동 매칭 잡 — 을 구현한다.

**Architecture:** PR1의 `domain/facilitybooking` 위에 얹는다. 상태 전이는 전부 엔티티 도메인 메서드(현재 상태 가드 + 409)로, 쓰기 액션은 `FacilityBookingAdminService`(트랜잭션), 조회(큐·상세·summary)는 `FacilityBookingAdminQueryService`(무트랜잭션 — 상세가 `ensureFresh` 온디맨드 크롤을 유발)로 분리한다. 승인은 시설 행 비관 잠금으로 직렬화하고 DB EXCLUDE 제약이 최종 백스톱. 매칭 잡은 SUCCESS 월 스냅샷만 신뢰하는 보수적 정확 매칭.

**Tech Stack:** Spring Boot 3.4 / Java 21 / JPA + QueryDSL / Flyway(신규 마이그레이션 없음 — 승인·확정 컬럼은 V82에 이미 존재) / Testcontainers

**Spec:** [`2026-07-13-facility-booking-design.md`](../specs/2026-07-13-facility-booking-design.md) §4(상태 머신·권한 매트릭스)·§5.2(승인 재검증)·§5.3(매칭)·§7(잠금·멱등·감사)·§8 #6~13(API)·§9.7(대시보드)

## Global Constraints

- 브랜치 `feat/facility-booking-admin` — **`feat/facility-booking-core`(PR1, #637)에서 분기**(스택 PR). 신규 마이그레이션 없음.
- Admin API는 반드시 `/api/v1/admin/facility-bookings...` 네임스페이스 — SecurityConfig `/api/v1/admin/**` hasRole(ADMIN) 백스톱 자동 적용(추가 매처 불필요), 컨트롤러 클래스 레벨 `@PreAuthorize("hasRole('ADMIN')")` 이중 방어. Api 인터페이스는 `domain/facilitybooking/api/`, `@Tag`+`@SecurityRequirement(name = "BearerAuth")`는 인터페이스에.
- 관리자 큐 목록은 admin 관례대로 **`Pageable` + `PageResponse`**(스펙 §8 #6 — 동아리 목록의 미페이징 유예 결정과 별개). 복수 조건 동적 필터는 QueryDSL `FacilityBookingRepositoryCustom`.
- 상태 전이 규칙(§4.2·§4.3): approve=PENDING·CONFLICT에서 / reject=PENDING / confirm(수동·자동)=APPROVED / markConflict=APPROVED / cancelByAdmin=APPROVED·CONFLICT. CONFIRMED는 완전 터미널. 위반은 `InvalidStatusTransitionException`(409, 기존).
- 승인 재검증(§5.2): 트랜잭션 안에서 ① `FacilityRepository.findByIdForUpdate`(신규, PESSIMISTIC_WRITE)로 시설 단위 직렬화 → ② 크롤 **점유행** 겹침 → 409(신규 `SchoolConflictException`, code `FACILITY_BOOKING_SCHOOL_CONFLICT`, 메시지 "학교 예약과 시간이 충돌하여 승인할 수 없습니다.") → ③ 내부 APPROVED/CONFIRMED 겹침 → 409(`SlotUnavailableException` 재사용). 온디맨드 재크롤은 **상세 조회(트랜잭션 밖)** 가 담당하고 승인 트랜잭션은 저장 스냅샷만 읽는다.
- 점유행 판별은 반드시 `FacilityAvailabilityPolicy.classify` 경유(컬럼 직접 접근 금지 계약).
- 모든 전이는 `FacilityBookingStatusHistory.record(...)` append(같은 트랜잭션). 시스템 자동 전이(매칭)는 changedById=null. 관리자 취소 사유는 **history.reason에만** 기록(엔티티 rejectReason은 거절 전용 — 의미 오염 방지).
- 매칭 잡(§5.3): cron `0 3-59/10 * * * *`(크롤 잡과 3분 오프셋), zone Asia/Seoul, 토글 `duing.facility.booking.matching.enabled`(base=false, prod=true — **배포 체크리스트에 env 명시**), `AtomicBoolean` 중복 실행 가드. `fetch_status=SUCCESS` 월만 처리, CONFIRMED 스킵(멱등). 자동 CONFIRMED 조건: 예약의 모든 1시간 서브슬롯이 같은 시설·날짜 **점유행**으로 덮이고 정규화 단체명 == 정규화 동아리명(정확 일치). 자동 CONFLICT는 P2 후속 — 이번엔 "충돌 의심" 플래그 노출만.
- 정규화(§5.3): trim → 끝 괄호 그룹 제거 → 전체 공백 제거 → 소문자화. `OrganizationNameNormalizer` 순수 컴포넌트.
- 시간은 `Clock`(seoulClock) 주입 — 엔티티 전이 메서드는 시각을 파라미터로 받는다(엔티티에서 now() 금지). 테스트 시간은 상대 날짜/고정 Clock(timebomb 금지).
- **동시 승인 실스레드 테스트 필수**(PR1 codex 지적): 겹치는 두 PENDING 동시 approve → 정확히 1건 APPROVED. EXCLUDE 백스톱(23P01)은 잠금 우회 시나리오로 별도 검증.
- DTO record·한국어 검증 메시지·`toCommand`/`from`·POST 액션 204(스펙 §8 경로 유지: POST `/{id}/approve` 등)·커밋 한국어 Conventional Commits·Co-Authored-By/🤖 금지.
- 빌드·테스트는 `backend/`에서, 출력 끝 `BUILD SUCCESSFUL` 확인. 통합 테스트는 Docker(Testcontainers) 필요.

---

## File Structure

```
backend/src/main/java/com/duing/domain/facilitybooking/
├── entity/FacilityBooking.java                       (Task 1 수정 — admin 전이 메서드 6종)
├── exception/FacilityBookingException.java           (Task 2 수정 — SchoolConflictException 추가)
├── repository/
│   ├── FacilityBookingRepository.java                (Task 2·4 수정 — 상태·기간 조회 추가)
│   ├── FacilityBookingRepositoryCustom.java          (Task 5 신규 — admin 검색)
│   └── FacilityBookingRepositoryImpl.java            (Task 5 신규 — QueryDSL)
├── service/
│   ├── FacilityBookingAdminService.java              (Task 2 신규 — 액션 5종, 트랜잭션)
│   ├── GeneralFacilityBookingAdminService.java       (Task 2 신규)
│   ├── OrganizationNameNormalizer.java               (Task 3 신규)
│   ├── FacilityBookingMatchingService.java           (Task 3 신규 — 판정 + 적용)
│   ├── FacilityBookingAdminQueryService.java         (Task 5 신규 — 큐·상세·summary, 무트랜잭션)
│   └── dto/query/AdminBookingSearchCondition.java    (Task 5 신규)
├── config/FacilityBookingMatchingJobConfig.java      (Task 4 신규 — @EnableScheduling 조건부 활성화)
├── scheduler/FacilityBookingMatchingScheduler.java   (Task 4 신규)
├── api/AdminFacilityBookingApi.java                  (Task 6 신규)
└── controller/
    ├── AdminFacilityBookingController.java           (Task 6 신규)
    └── dto/ request/RejectFacilityBookingRequest.java, request/CancelFacilityBookingRequest.java,
             request/MarkConflictRequest.java, response/AdminBooking*Response.java (Task 6)

수정:
├── domain/facility/repository/FacilityRepository.java   (Task 2 — findByIdForUpdate)
├── resources/application.yml, application-prod.yml      (Task 4 — matching 토글)
```

---

### Task 1: 엔티티 admin 전이 메서드 + 상태 머신 단위 테스트

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/entity/FacilityBooking.java`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/entity/FacilityBookingAdminTransitionTest.java`

**Interfaces:**
- Produces: `approve(Long adminId, LocalDateTime crawlBasisAt, LocalDateTime decidedAt)` — PENDING·CONFLICT에서, conflictDetail 해제 / `reject(Long adminId, String reason, LocalDateTime decidedAt)` — PENDING / `confirmByMatching(Long matchedScheduleSeq, LocalDateTime crawlBasisAt, LocalDateTime confirmedAt)` — APPROVED, 시스템 전이 / `confirmManually(Long adminId, LocalDateTime confirmedAt)` — APPROVED / `markConflict(String detail)` — APPROVED / `cancelByAdmin()` — APPROVED·CONFLICT(사유는 호출부가 history에만 기록)

- [ ] **Step 1: 실패하는 테스트 작성**

```java
package com.duing.domain.facilitybooking.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FacilityBookingAdminTransitionTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 1, 15, 12, 0);

    private FacilityBooking booking(BookingStatus status) throws Exception {
        FacilityBooking booking = FacilityBooking.request(1L, 2L, 3L,
                LocalDate.of(2026, 1, 20), LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 합주", null);
        Field statusField = FacilityBooking.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(booking, status);
        return booking;
    }

    @Test
    @DisplayName("승인은 PENDING·CONFLICT 에서만 가능하고 결정자·크롤 기준 시각을 기록하며 충돌 상세를 해제한다")
    void approveFromPendingOrConflict() throws Exception {
        FacilityBooking pending = booking(BookingStatus.PENDING);
        pending.approve(9L, NOW.minusMinutes(5), NOW);
        assertThat(pending.getStatus()).isEqualTo(BookingStatus.APPROVED);
        assertThat(pending.getDecidedById()).isEqualTo(9L);
        assertThat(pending.getCrawlBasisAt()).isEqualTo(NOW.minusMinutes(5));

        FacilityBooking conflict = booking(BookingStatus.CONFLICT);
        Field detailField = FacilityBooking.class.getDeclaredField("conflictDetail");
        detailField.setAccessible(true);
        detailField.set(conflict, "문화팀 18~19 선점");
        conflict.approve(9L, NOW, NOW);
        assertThat(conflict.getStatus()).isEqualTo(BookingStatus.APPROVED);
        assertThat(conflict.getConflictDetail()).isNull();

        assertThatThrownBy(() -> booking(BookingStatus.CONFIRMED).approve(9L, NOW, NOW))
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);
    }

    @Test
    @DisplayName("거절은 PENDING 에서만 가능하고 사유를 기록한다")
    void rejectOnlyFromPending() throws Exception {
        FacilityBooking pending = booking(BookingStatus.PENDING);
        pending.reject(9L, "시설 점검 기간", NOW);
        assertThat(pending.getStatus()).isEqualTo(BookingStatus.REJECTED);
        assertThat(pending.getRejectReason()).isEqualTo("시설 점검 기간");

        assertThatThrownBy(() -> booking(BookingStatus.APPROVED).reject(9L, "사유", NOW))
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);
    }

    @Test
    @DisplayName("자동·수동 확정은 APPROVED 에서만 가능하고 확정 시각을 기록한다")
    void confirmOnlyFromApproved() throws Exception {
        FacilityBooking approved = booking(BookingStatus.APPROVED);
        approved.confirmByMatching(18134L, NOW.minusMinutes(3), NOW);
        assertThat(approved.getStatus()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(approved.getMatchedScheduleSeq()).isEqualTo(18134L);
        assertThat(approved.getConfirmedAt()).isEqualTo(NOW);

        FacilityBooking manual = booking(BookingStatus.APPROVED);
        manual.confirmManually(NOW);
        assertThat(manual.getStatus()).isEqualTo(BookingStatus.CONFIRMED);
        // 수동 확정은 승인 결정 쌍(decidedById/decidedAt)을 건드리지 않는다 — 확정 주체는 이력 전용
        assertThat(manual.getDecidedById()).isNull();

        assertThatThrownBy(() -> booking(BookingStatus.PENDING).confirmManually(NOW))
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);
        assertThatThrownBy(() -> booking(BookingStatus.PENDING).confirmByMatching(18134L, NOW, NOW))
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);
    }

    @Test
    @DisplayName("충돌 전환은 APPROVED 에서만, 관리자 취소는 APPROVED·CONFLICT 에서만 가능하다")
    void conflictAndAdminCancelGuards() throws Exception {
        FacilityBooking approved = booking(BookingStatus.APPROVED);
        approved.markConflict("문화팀 예약과 겹침");
        assertThat(approved.getStatus()).isEqualTo(BookingStatus.CONFLICT);
        assertThat(approved.getConflictDetail()).isEqualTo("문화팀 예약과 겹침");

        approved.cancelByAdmin();
        assertThat(approved.getStatus()).isEqualTo(BookingStatus.CANCELLED);

        assertThatThrownBy(() -> booking(BookingStatus.PENDING).markConflict("x"))
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);
        assertThatThrownBy(() -> booking(BookingStatus.CONFIRMED).cancelByAdmin())
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.entity.FacilityBookingAdminTransitionTest"`
Expected: 컴파일 실패(메서드 없음)

- [ ] **Step 3: 엔티티에 전이 메서드 추가**

`FacilityBooking.java` 의 `cancelByClub()` 아래에 추가:

```java
    /** 총동연 승인 — PENDING 또는 CONFLICT(재승인, §4.2). 겹침 재검증은 서비스(§5.2)가 잠금 하에 선행한다. */
    public void approve(Long adminId, LocalDateTime crawlBasisAt, LocalDateTime decidedAt) {
        if (this.status != BookingStatus.PENDING && this.status != BookingStatus.CONFLICT) {
            throw new FacilityBookingException.InvalidStatusTransitionException(this.status, BookingStatus.APPROVED);
        }
        this.status = BookingStatus.APPROVED;
        this.decidedById = adminId;
        this.decidedAt = decidedAt;
        this.crawlBasisAt = crawlBasisAt;
        this.conflictDetail = null;
    }

    /** 총동연 거절 — PENDING 에서만(§4.3). 사유 필수는 요청 DTO 검증이 보장한다. */
    public void reject(Long adminId, String reason, LocalDateTime decidedAt) {
        if (this.status != BookingStatus.PENDING) {
            throw new FacilityBookingException.InvalidStatusTransitionException(this.status, BookingStatus.REJECTED);
        }
        this.status = BookingStatus.REJECTED;
        this.decidedById = adminId;
        this.decidedAt = decidedAt;
        this.rejectReason = reason;
    }

    /** 매칭 잡의 자동 확정(§5.3) — APPROVED 에서만. 시스템 전이라 결정자를 기록하지 않는다. */
    public void confirmByMatching(Long matchedScheduleSeq, LocalDateTime crawlBasisAt, LocalDateTime confirmedAt) {
        if (this.status != BookingStatus.APPROVED) {
            throw new FacilityBookingException.InvalidStatusTransitionException(this.status, BookingStatus.CONFIRMED);
        }
        this.status = BookingStatus.CONFIRMED;
        this.matchedScheduleSeq = matchedScheduleSeq;
        this.crawlBasisAt = crawlBasisAt;
        this.confirmedAt = confirmedAt;
    }

    /** 관리자 수동 확정 — 자동 매칭 불발(학교 표기 차이) 시(§5.3). 확정 주체는 이력(changed_by)과
     *  confirmedAt 이 담으므로 decidedById/decidedAt 은 승인 결정 쌍 그대로 보존한다(오독 방지). */
    public void confirmManually(LocalDateTime confirmedAt) {
        if (this.status != BookingStatus.APPROVED) {
            throw new FacilityBookingException.InvalidStatusTransitionException(this.status, BookingStatus.CONFIRMED);
        }
        this.status = BookingStatus.CONFIRMED;
        this.confirmedAt = confirmedAt;
    }

    /** 승인 후 학교 데이터 충돌 — APPROVED 에서만(§4.1: CONFLICT 는 승인 후 전용 상태). */
    public void markConflict(String detail) {
        if (this.status != BookingStatus.APPROVED) {
            throw new FacilityBookingException.InvalidStatusTransitionException(this.status, BookingStatus.CONFLICT);
        }
        this.status = BookingStatus.CONFLICT;
        this.conflictDetail = detail;
    }

    /** 관리자 취소 — APPROVED·CONFLICT 에서(§4.3). 취소 사유는 이력(history.reason)에만 남긴다 —
     *  rejectReason 은 거절 전용 필드라 의미를 오염시키지 않는다. */
    public void cancelByAdmin() {
        if (this.status != BookingStatus.APPROVED && this.status != BookingStatus.CONFLICT) {
            throw new FacilityBookingException.InvalidStatusTransitionException(this.status, BookingStatus.CANCELLED);
        }
        this.status = BookingStatus.CANCELLED;
    }
```

(`java.time.LocalDateTime` import 는 이미 존재.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.entity.*"`
Expected: 기존 5건 + 신규 4건 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking backend/src/test/java/com/duing/domain/facilitybooking
git commit -m "feat(backend): 대관 신청 관리자 상태 전이 도메인 메서드 추가"
```

---

### Task 2: 관리자 액션 서비스 (승인 재검증 + 거절·확정·충돌·취소)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facility/repository/FacilityRepository.java`
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/exception/FacilityBookingException.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/service/FacilityBookingAdminService.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/service/GeneralFacilityBookingAdminService.java`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/FacilityBookingAdminServiceIntegrationTest.java`

**Interfaces:**
- Consumes: Task 1 전이 메서드, `FacilityAvailabilityPolicy.classify`, `FacilityBookingRepository.findOverlapping`, `FacilityReservationRepository.findByFacilityIdAndYearMonth`, `FacilityMonthSnapshotRepository.findByYearMonth`
- Produces: `FacilityBookingAdminService` — `approve(Long adminId, Long bookingId)` / `reject(Long adminId, Long bookingId, String reason)` / `confirmManually(Long adminId, Long bookingId)` / `markConflict(Long adminId, Long bookingId, String detail)` / `cancel(Long adminId, Long bookingId, String reason)`; `FacilityRepository.findByIdForUpdate(Long id)`; `FacilityBookingException.SchoolConflictException`

- [ ] **Step 1: FacilityRepository 잠금 메서드 추가**

`FacilityRepository.java` 에 추가 (기존 import 에 `jakarta.persistence.LockModeType`, `org.springframework.data.jpa.repository.Lock`, `org.springframework.data.jpa.repository.Query`, `org.springframework.data.repository.query.Param` 보충):

```java
    /** 승인·확정 전이의 시설 단위 직렬화(설계 §5.2·§7.3) — BankTransactionRepository 전례. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT f FROM Facility f WHERE f.id = :facilityId")
    Optional<Facility> findByIdForUpdate(@Param("facilityId") Long facilityId);
```

- [ ] **Step 2: SchoolConflictException 추가**

`FacilityBookingException.java` 에 추가:

```java
    public static class SchoolConflictException extends FacilityBookingException {
        public SchoolConflictException() {
            super("학교 예약과 시간이 충돌하여 승인할 수 없습니다.",
                    HttpStatus.CONFLICT, "FACILITY_BOOKING_SCHOOL_CONFLICT");
        }
    }
```

- [ ] **Step 3: 실패하는 통합 테스트 작성**

픽스처 헬퍼(saveUser/saveActiveClub/saveFacility/bookableDate)는 기존 `FacilityBookingServiceIntegrationTest` 와 동일 코드를 사용한다(같은 파일 패턴 복제 — 파일 상단 주석에 출처 명시). 테스트 본문:

```java
    @Autowired FacilityBookingAdminService adminService;
    @Autowired FacilityBookingService bookingService;
    // + 기존 리포지토리·픽스처 필드 동일

    private Long pendingBooking(Fixture fixture, LocalDate date, int startHour, int endHour) {
        return bookingService.create(new CreateFacilityBookingCommand(
                fixture.club().getId(), fixture.leader().getId(), fixture.facility().getId(),
                date, LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), "정기 합주", null)).bookingId();
    }

    @Test
    @DisplayName("승인은 APPROVED + 결정자·크롤 기준 시각 + 이력을 남긴다")
    void approveHappyPath() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        Long bookingId = pendingBooking(fixture, bookableDate(), 18, 20);

        adminService.approve(admin.getId(), bookingId);

        FacilityBooking approved = bookingRepository.findById(bookingId).orElseThrow();
        assertThat(approved.getStatus()).isEqualTo(BookingStatus.APPROVED);
        assertThat(approved.getDecidedById()).isEqualTo(admin.getId());
        var histories = historyRepository.findByBookingIdOrderByCreatedAtDesc(bookingId);
        assertThat(histories.get(0).getNewStatus()).isEqualTo(BookingStatus.APPROVED);
        assertThat(histories.get(0).getChangedById()).isEqualTo(admin.getId());
    }

    @Test
    @DisplayName("승인 시 크롤 점유행과 겹치면 SchoolConflict 409, 운영행 겹침은 승인된다")
    void approveRevalidatesAgainstSchoolRows() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        Long blocked = pendingBooking(fixture, date, 18, 20);
        // 신청 이후에 학교 점유행(꼬리 없음)이 크롤로 유입된 상황
        facilityReservationRepository.save(FacilityReservation.create(
                fixture.facility().getId(), sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(19, 0), LocalTime.of(20, 0), "문화팀", null, null, LocalDateTime.now()));

        assertThatThrownBy(() -> adminService.approve(admin.getId(), blocked))
                .isInstanceOf(FacilityBookingException.SchoolConflictException.class);

        // 운영행(꼬리 있음)만 겹치는 다른 신청은 승인된다
        Long allowed = pendingBooking(fixture, date, 9, 11);
        facilityReservationRepository.save(FacilityReservation.create(
                fixture.facility().getId(), sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(9, 0), LocalTime.of(10, 0), "고정관념",
                LocalTime.of(9, 0), LocalTime.of(20, 0), LocalDateTime.now()));
        adminService.approve(admin.getId(), allowed);
        assertThat(bookingRepository.findById(allowed).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED);
    }

    @Test
    @DisplayName("겹치는 두 PENDING 을 동시에 승인하면 정확히 1건만 APPROVED 다 (시설 잠금 직렬화)")
    void concurrentApproveSerializesPerFacility() throws Exception {
        Fixture first = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        Long firstBooking = pendingBooking(first, date, 18, 20);
        // 타 동아리의 겹치는 PENDING (PENDING 겹침은 설계상 허용)
        User otherLeader = saveUser("리더B");
        Club otherClub = saveActiveClub("경쟁동아리");
        clubMemberRepository.save(ClubMember.asLeader(otherClub, otherLeader));
        Long secondBooking = bookingService.create(new CreateFacilityBookingCommand(
                otherClub.getId(), otherLeader.getId(), first.facility().getId(),
                date, LocalTime.of(19, 0), LocalTime.of(21, 0), "회의", null)).bookingId();

        // 두 스레드를 같은 출발선에서 풀어 실제 경합을 만든다 — invokeAll 은 블로킹이라
        // startGate 를 열 틈이 없으므로 submit 으로 Future 를 먼저 확보한 뒤 gate 를 연다.
        CountDownLatch startGate = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        Callable<Throwable> approveFirst = () -> {
            startGate.await(5, TimeUnit.SECONDS);
            return tryApprove(admin.getId(), firstBooking);
        };
        Callable<Throwable> approveSecond = () -> {
            startGate.await(5, TimeUnit.SECONDS);
            return tryApprove(admin.getId(), secondBooking);
        };
        List<Future<Throwable>> outcomes = List.of(pool.submit(approveFirst), pool.submit(approveSecond));
        startGate.countDown();
        pool.shutdown();
        assertThat(pool.awaitTermination(15, TimeUnit.SECONDS)).isTrue();

        long successes = outcomes.stream().map(this::quietGet).filter(failure -> failure == null).count();
        assertThat(successes).as("정확히 한 건만 승인").isEqualTo(1);
        List<Throwable> failures = outcomes.stream().map(this::quietGet)
                .filter(failure -> failure != null).toList();
        assertThat(failures).hasSize(1);
        assertThat(failures.get(0))
                .as("후행은 잠금 대기 후 선행의 APPROVED 를 보고 우아한 409 로 실패해야 한다 — 제약 위반이면 잠금 회귀")
                .isInstanceOf(FacilityBookingException.SlotUnavailableException.class);
        long approvedCount = bookingRepository.findOverlapping(first.facility().getId(), date,
                List.of(BookingStatus.APPROVED), LocalTime.of(18, 0), LocalTime.of(21, 0)).size();
        assertThat(approvedCount).isEqualTo(1);
    }

    @Test
    @DisplayName("거절·수동확정·충돌전환·관리자취소 전이와 이력이 규칙대로 동작한다")
    void adminTransitionsFollowMatrix() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();

        Long rejected = pendingBooking(fixture, date, 9, 10);
        adminService.reject(admin.getId(), rejected, "시설 점검 기간입니다");
        assertThat(bookingRepository.findById(rejected).orElseThrow().getRejectReason())
                .isEqualTo("시설 점검 기간입니다");

        Long confirmed = pendingBooking(fixture, date, 11, 12);
        adminService.approve(admin.getId(), confirmed);
        adminService.confirmManually(admin.getId(), confirmed);
        assertThat(bookingRepository.findById(confirmed).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.CONFIRMED);
        // CONFIRMED 는 완전 터미널 — 관리자 취소도 409
        assertThatThrownBy(() -> adminService.cancel(admin.getId(), confirmed, "불가"))
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);

        Long conflicted = pendingBooking(fixture, date, 13, 14);
        adminService.approve(admin.getId(), conflicted);
        adminService.markConflict(admin.getId(), conflicted, "문화팀 일정과 충돌");
        // CONFLICT 재승인 경로(§4.2)
        adminService.approve(admin.getId(), conflicted);
        assertThat(bookingRepository.findById(conflicted).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED);

        adminService.cancel(admin.getId(), conflicted, "동아리 요청으로 취소");
        FacilityBooking cancelled = bookingRepository.findById(conflicted).orElseThrow();
        assertThat(cancelled.getStatus()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(cancelled.getRejectReason()).isNull(); // 취소 사유는 이력에만
        assertThat(historyRepository.findByBookingIdOrderByCreatedAtDesc(conflicted).get(0).getReason())
                .isEqualTo("동아리 요청으로 취소");
    }

    private Throwable tryApprove(Long adminId, Long bookingId) {
        try {
            adminService.approve(adminId, bookingId);
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private Throwable quietGet(Future<Throwable> future) {
        try {
            return future.get(10, TimeUnit.SECONDS);
        } catch (Exception executionFailure) {
            return executionFailure;
        }
    }
```

- [ ] **Step 4: 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.service.FacilityBookingAdminServiceIntegrationTest"`
Expected: 컴파일 실패

- [ ] **Step 5: 서비스 구현**

`FacilityBookingAdminService.java`:

```java
package com.duing.domain.facilitybooking.service;

public interface FacilityBookingAdminService {

    /** 승인 — 시설 행 잠금 + 저장 스냅샷 재검증(§5.2). PENDING·CONFLICT(재승인)에서만. */
    void approve(Long adminId, Long bookingId);

    void reject(Long adminId, Long bookingId, String reason);

    /** 자동 매칭 불발분의 수동 확정 — APPROVED 에서만. */
    void confirmManually(Long adminId, Long bookingId);

    /** 승인 후 학교 충돌 수동 전환(P1 — 자동 전환은 P2). */
    void markConflict(Long adminId, Long bookingId, String detail);

    /** 관리자 취소 — APPROVED·CONFLICT 에서. 사유는 이력에만 기록. */
    void cancel(Long adminId, Long bookingId, String reason);
}
```

`GeneralFacilityBookingAdminService.java`:

```java
package com.duing.domain.facilitybooking.service;

import com.duing.domain.facility.exception.FacilityException;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.entity.FacilityBookingStatusHistory;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingStatusHistoryRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFacilityBookingAdminService implements FacilityBookingAdminService {

    private final FacilityBookingRepository facilityBookingRepository;
    private final FacilityBookingStatusHistoryRepository historyRepository;
    private final FacilityRepository facilityRepository;
    private final FacilityReservationRepository facilityReservationRepository;
    private final FacilityMonthSnapshotRepository facilityMonthSnapshotRepository;
    private final FacilityAvailabilityPolicy availabilityPolicy;
    private final Clock clock;

    @Override
    @Transactional
    public void approve(Long adminId, Long bookingId) {
        FacilityBooking booking = getBooking(bookingId);
        // 시설 단위 승인 직렬화(§5.2) — 겹치는 두 신청의 동시 승인을 잠금으로 차단, EXCLUDE 는 최종 백스톱
        facilityRepository.findByIdForUpdate(booking.getFacilityId())
                .orElseThrow(FacilityException.FacilityNotFoundException::new);
        // 기준 스냅샷 시각을 재검증 전에 읽어, 기록된 crawlBasisAt 이 검증에 쓴 데이터보다 최신이 되는 skew 를 과거 방향으로 보수화한다.
        LocalDateTime crawlBasisAt = latestCrawlBasis(YearMonth.from(booking.getReservationDate()));
        rejectIfSchoolOccupied(booking);
        rejectIfInternallyBlocked(booking);

        BookingStatus previousStatus = booking.getStatus();
        booking.approve(adminId, crawlBasisAt, LocalDateTime.now(clock));
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), previousStatus, BookingStatus.APPROVED, adminId, null, crawlBasisAt));
    }

    @Override
    @Transactional
    public void reject(Long adminId, Long bookingId, String reason) {
        FacilityBooking booking = getBooking(bookingId);
        BookingStatus previousStatus = booking.getStatus();
        booking.reject(adminId, reason, LocalDateTime.now(clock));
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), previousStatus, BookingStatus.REJECTED, adminId, reason, null));
    }

    @Override
    @Transactional
    public void confirmManually(Long adminId, Long bookingId) {
        FacilityBooking booking = getBooking(bookingId);
        BookingStatus previousStatus = booking.getStatus();
        booking.confirmManually(LocalDateTime.now(clock));
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), previousStatus, BookingStatus.CONFIRMED, adminId, "관리자 수동 확정", null));
    }

    @Override
    @Transactional
    public void markConflict(Long adminId, Long bookingId, String detail) {
        FacilityBooking booking = getBooking(bookingId);
        BookingStatus previousStatus = booking.getStatus();
        booking.markConflict(detail);
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), previousStatus, BookingStatus.CONFLICT, adminId, detail, null));
    }

    @Override
    @Transactional
    public void cancel(Long adminId, Long bookingId, String reason) {
        FacilityBooking booking = getBooking(bookingId);
        BookingStatus previousStatus = booking.getStatus();
        booking.cancelByAdmin();
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), previousStatus, BookingStatus.CANCELLED, adminId, reason, null));
    }

    private FacilityBooking getBooking(Long bookingId) {
        return facilityBookingRepository.findById(bookingId)
                .orElseThrow(FacilityBookingException.BookingNotFoundException::new);
    }

    /** 크롤 점유행 겹침 — 승인 불가(§5.2-2c-①). 판별은 정책 경유(컬럼 접근 금지 계약). */
    private void rejectIfSchoolOccupied(FacilityBooking booking) {
        boolean blocked = facilityReservationRepository
                .findByFacilityIdAndYearMonth(booking.getFacilityId(),
                        YearMonth.from(booking.getReservationDate())).stream()
                .filter(reservation -> reservation.getReservationDate().equals(booking.getReservationDate()))
                .filter(reservation -> availabilityPolicy.classify(reservation) == CrawlRowType.OCCUPIED)
                .anyMatch(reservation -> reservation.getStartTime().isBefore(booking.getEndTime())
                        && reservation.getEndTime().isAfter(booking.getStartTime()));
        if (blocked) {
            throw new FacilityBookingException.SchoolConflictException();
        }
    }

    /** 내부 APPROVED/CONFIRMED 겹침 — 승인 불가(§5.2-2c-②). 자기 자신은 제외(CONFLICT 재승인 경로). */
    private void rejectIfInternallyBlocked(FacilityBooking booking) {
        boolean blocked = facilityBookingRepository.findOverlapping(
                        booking.getFacilityId(), booking.getReservationDate(),
                        List.of(BookingStatus.APPROVED, BookingStatus.CONFIRMED),
                        booking.getStartTime(), booking.getEndTime()).stream()
                .anyMatch(other -> !other.getId().equals(booking.getId()));
        if (blocked) {
            throw new FacilityBookingException.SlotUnavailableException();
        }
    }

    /** 검증에 사용한 크롤 스냅샷 기준 시각(§5.2) — 감사 기록용. 스냅샷이 없으면 null. */
    private LocalDateTime latestCrawlBasis(YearMonth yearMonth) {
        return facilityMonthSnapshotRepository.findByYearMonth(yearMonth)
                .map(snapshot -> snapshot.getCrawledAt())
                .orElse(null);
    }
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.service.FacilityBookingAdminServiceIntegrationTest"`
Expected: 4개 전부 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/duing backend/src/test/java/com/duing
git commit -m "feat(backend): 대관 신청 관리자 액션 서비스 추가 — 승인 재검증·시설 잠금·이력"
```

---

### Task 3: 이름 정규화 + 매칭 판정 서비스

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/service/OrganizationNameNormalizer.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/service/FacilityBookingMatchingService.java`
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/repository/FacilityBookingRepository.java` (매칭 대상 조회 추가)
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/OrganizationNameNormalizerTest.java`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/FacilityBookingMatchingServiceTest.java`

**Interfaces:**
- Produces: `normalizer.normalize(String) → String`; `matchingService.decide(FacilityBooking, String clubName, List<FacilityReservation> dayRows) → MatchDecision(record: boolean confirmed, Long matchedScheduleSeq)` — **교체 가능한 판정 정책(§5.3)**, 소비자는 결과만 본다; `FacilityBookingRepository.findByStatusAndReservationDateBetween(BookingStatus, LocalDate, LocalDate)`

- [ ] **Step 1: 실패하는 테스트 작성**

`OrganizationNameNormalizerTest.java`:

```java
package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class OrganizationNameNormalizerTest {

    private final OrganizationNameNormalizer normalizer = new OrganizationNameNormalizer();

    @Test
    @DisplayName("공백·끝 괄호 그룹을 제거하고 소문자로 통일한다")
    void normalizeStripsWhitespaceTrailingParenthesesAndCase() {
        assertThat(normalizer.normalize("비호 상무회")).isEqualTo("비호상무회");
        assertThat(normalizer.normalize("밴드부(공연준비)")).isEqualTo("밴드부");
        assertThat(normalizer.normalize("  BIHO Cheer ")).isEqualTo("bihocheer");
        assertThat(normalizer.normalize(null)).isEmpty();
    }

    @Test
    @DisplayName("중간 괄호는 보존하고 끝 괄호만 제거한다 — 커뮤니티룸(1) 같은 이름 보호")
    void keepsInnerParentheses() {
        assertThat(normalizer.normalize("고정관념(정기연습)")).isEqualTo("고정관념");
        assertThat(normalizer.normalize("동아리(A)연합")).isEqualTo("동아리(a)연합");
    }
}
```

`FacilityBookingMatchingServiceTest.java` — 순수 판정 로직 단위 테스트(엔티티는 `FacilityReservation.create` / `FacilityBooking.request` + 도메인 `approve` 로 APPROVED 전이):

```java
package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FacilityBookingMatchingServiceTest {

    private final FacilityBookingMatchingService matchingService =
            new FacilityBookingMatchingService(new FacilityAvailabilityPolicy(), new OrganizationNameNormalizer());

    private static final LocalDate DATE = LocalDate.of(2026, 1, 20);

    private FacilityBooking approvedBooking(int startHour, int endHour) {
        FacilityBooking booking = FacilityBooking.request(1L, 2L, 3L, DATE,
                LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), "정기 합주", null);
        booking.approve(9L, null, LocalDateTime.of(2026, 1, 20, 9, 0));
        return booking;
    }

    private FacilityReservation occupiedRow(long scheduleSeq, int startHour, String organization) {
        return FacilityReservation.create(1L, scheduleSeq, YearMonth.from(DATE), DATE,
                LocalTime.of(startHour, 0), LocalTime.of(startHour + 1, 0), organization,
                null, null, LocalDateTime.of(2026, 1, 20, 8, 0));
    }

    @Test
    @DisplayName("모든 서브슬롯이 같은 정규화 이름의 점유행으로 덮이면 CONFIRMED 판정이다")
    void confirmsWhenFullyCoveredByMatchingRows() {
        FacilityBooking booking = approvedBooking(18, 20);
        List<FacilityReservation> rows = List.of(
                occupiedRow(101L, 18, "밴드 부"), occupiedRow(102L, 19, "밴드부"));

        var decision = matchingService.decide(booking, "밴드부", rows);

        assertThat(decision.confirmed()).isTrue();
        assertThat(decision.matchedScheduleSeq()).isEqualTo(101L);
    }

    @Test
    @DisplayName("이름 불일치·부분 커버·운영행 커버는 CONFIRMED 판정이 아니다")
    void staysWhenNameMismatchOrPartialCoverage() {
        FacilityBooking booking = approvedBooking(18, 20);

        assertThat(matchingService.decide(booking, "밴드부",
                List.of(occupiedRow(101L, 18, "문화팀"), occupiedRow(102L, 19, "문화팀"))).confirmed()).isFalse();
        assertThat(matchingService.decide(booking, "밴드부",
                List.of(occupiedRow(101L, 18, "밴드부"))).confirmed()).isFalse(); // 19~20 미커버
        // 운영행(꼬리 있음)은 커버로 인정하지 않는다
        FacilityReservation operating = FacilityReservation.create(1L, 103L, YearMonth.from(DATE), DATE,
                LocalTime.of(18, 0), LocalTime.of(19, 0), "밴드부",
                LocalTime.of(9, 0), LocalTime.of(20, 0), LocalDateTime.of(2026, 1, 20, 8, 0));
        assertThat(matchingService.decide(booking, "밴드부",
                List.of(operating, occupiedRow(102L, 19, "밴드부"))).confirmed()).isFalse();
    }

    @Test
    @DisplayName("비정렬 점유행(18:30~19:30)은 겹쳐도 커버가 아니다 — 부분 반영은 자동 확정하지 않는다")
    void nonAlignedRowDoesNotCover() {
        FacilityBooking booking = approvedBooking(18, 20);
        FacilityReservation nonAligned = FacilityReservation.create(1L, 104L, YearMonth.from(DATE), DATE,
                LocalTime.of(18, 30), LocalTime.of(19, 30), "밴드부",
                null, null, LocalDateTime.of(2026, 1, 20, 8, 0));

        assertThat(matchingService.decide(booking, "밴드부", List.of(nonAligned)).confirmed()).isFalse();
    }
}
```

- [ ] **Step 2: 실패 확인 후 구현**

`OrganizationNameNormalizer.java`:

```java
package com.duing.domain.facilitybooking.service;

import java.util.Locale;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/** 학교 표기 ↔ 동아리명 비교용 정규화(§5.3): trim → 끝 괄호 그룹 제거 → 전체 공백 제거 → 소문자. */
@Component
public class OrganizationNameNormalizer {

    private static final Pattern TRAILING_PARENTHETICAL = Pattern.compile("\\([^()]*\\)\\s*$");

    public String normalize(String rawName) {
        if (rawName == null) {
            return "";
        }
        String withoutTrailingGroup = TRAILING_PARENTHETICAL.matcher(rawName.trim()).replaceFirst("");
        return withoutTrailingGroup.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
    }
}
```

`FacilityBookingMatchingService.java`:

```java
package com.duing.domain.facilitybooking.service;

import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import java.time.LocalTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * CONFIRMED 자동 매칭 판정(§5.3) — P1 의 보수적 정확 매칭 정책. 이 클래스가 교체 가능한 판정 정책이며
 * 소비자(스케줄러)는 MatchDecision 만 본다. 확장 경로: 표기명 매핑(P2)·후보 큐 승격·유사도 제안.
 */
@Component
@RequiredArgsConstructor
public class FacilityBookingMatchingService {

    private final FacilityAvailabilityPolicy availabilityPolicy;
    private final OrganizationNameNormalizer normalizer;

    public record MatchDecision(boolean confirmed, Long matchedScheduleSeq) {
        static MatchDecision none() {
            return new MatchDecision(false, null);
        }
    }

    /** dayRows = 해당 시설·해당 날짜의 크롤 행 전체(호출부가 필터). */
    public MatchDecision decide(FacilityBooking booking, String clubName, List<FacilityReservation> dayRows) {
        String normalizedClubName = normalizer.normalize(clubName);
        if (normalizedClubName.isEmpty()) {
            return MatchDecision.none();
        }
        List<FacilityReservation> matchingOccupiedRows = dayRows.stream()
                .filter(row -> availabilityPolicy.classify(row) == CrawlRowType.OCCUPIED)
                .filter(row -> normalizer.normalize(row.getOrganizationName()).equals(normalizedClubName))
                .toList();

        // 각 서브슬롯이 단일 점유행에 완전 포함되어야 커버로 인정 — 비정렬 크롤 행·분할 행은 미매칭(수동 확정 폴백, 보수 방향)
        Long representativeSeq = null;
        for (LocalTime slotStart = booking.getStartTime(); slotStart.isBefore(booking.getEndTime());
                slotStart = slotStart.plusHours(1)) {
            LocalTime slotEnd = slotStart.plusHours(1);
            LocalTime currentStart = slotStart;
            FacilityReservation covering = matchingOccupiedRows.stream()
                    .filter(row -> !row.getStartTime().isAfter(currentStart)
                            && !row.getEndTime().isBefore(slotEnd))
                    .findFirst()
                    .orElse(null);
            if (covering == null) {
                return MatchDecision.none();
            }
            if (representativeSeq == null) {
                representativeSeq = covering.getScheduleSeq();
            }
        }
        return new MatchDecision(true, representativeSeq);
    }
}
```

`FacilityBookingRepository.java` 에 추가:

```java
    List<FacilityBooking> findByStatusAndReservationDateBetween(
            BookingStatus status, LocalDate startDate, LocalDate endDate);
```

- [ ] **Step 3: 테스트 통과 확인 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.service.OrganizationNameNormalizerTest" --tests "com.duing.domain.facilitybooking.service.FacilityBookingMatchingServiceTest"`
Expected: 4개 전부 PASS

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking backend/src/test/java/com/duing/domain/facilitybooking
git commit -m "feat(backend): CONFIRMED 자동 매칭 판정 서비스와 이름 정규화 추가"
```

---

### Task 4: 매칭 스케줄러 + 설정 토글

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/config/FacilityBookingMatchingJobConfig.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/scheduler/FacilityBookingMatchingScheduler.java`
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/FacilityBookingMatchingService.java` (Task 3 서비스에 `applyAutoConfirm` 적용 메서드 추가)
- Modify: `backend/src/main/resources/application.yml`, `backend/src/main/resources/application-prod.yml`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/scheduler/FacilityBookingMatchingSchedulerIntegrationTest.java`

**Interfaces:**
- Consumes: Task 3 `MatchDecision`, Task 1 `confirmByMatching`, `FacilityMonthSnapshotRepository.findByYearMonth`(SUCCESS 게이트 + `crawlBasisAt` = 스냅샷 수집 시각), `ClubRepository.findAllById`(동아리명)
- Produces: `runMatchingCycle()` — 당월·익월의 APPROVED 를 스캔해 자동 CONFIRMED + 이력(changedById=null). 토글 `duing.facility.booking.matching.enabled`. 적용은 `FacilityBookingMatchingService.applyAutoConfirm(Long bookingId, MatchDecision decision, LocalDateTime crawlBasisAt)`(짧은 트랜잭션, 별도 빈 프록시).

- [ ] **Step 1: 설정 키 추가**

`application.yml` 의 `duing.facility.crawler` 블록 **다음에 형제로**:

```yaml
    booking:
      matching:
        # APPROVED → CONFIRMED 자동 매칭 잡(10분, 크롤 잡과 3분 오프셋). 로컬/테스트 기본 비활성 —
        # 운영에서 DUING_FACILITY_BOOKING_MATCHING_ENABLED=true(application-prod.yml)로 활성화한다.
        enabled: ${DUING_FACILITY_BOOKING_MATCHING_ENABLED:false}
```

`application-prod.yml` 의 `facility.crawler` 블록에 형제로:

```yaml
    booking:
      matching:
        enabled: ${DUING_FACILITY_BOOKING_MATCHING_ENABLED:true}
```

- [ ] **Step 2: 실패하는 통합 테스트 작성**

스케줄러 빈은 토글 조건부라 테스트는 **핵심 로직을 직접 주입 호출**한다(스케줄러를 `runMatchingCycle()` public 메서드로 노출, `@Import` 로 빈 강제 등록 대신 테스트에서 new 로 조립 — 의존이 전부 빈이므로 `@Autowired` 조립이 간단):

```java
package com.duing.domain.facilitybooking.scheduler;

// import 는 FacilityBookingAdminServiceIntegrationTest 와 동일 + FacilityMonthSnapshot 관련

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "duing.facility.booking.matching.enabled=true")
class FacilityBookingMatchingSchedulerIntegrationTest extends IntegrationTestBase {

    @Autowired FacilityBookingMatchingScheduler scheduler;
    @Autowired FacilityBookingAdminService adminService;
    @Autowired FacilityBookingService bookingService;
    @Autowired FacilityMonthSnapshotRepository snapshotRepository;
    // + 기존 픽스처 리포지토리·헬퍼 동일(FacilityBookingServiceIntegrationTest 패턴)

    private void recordSuccessSnapshot(YearMonth yearMonth) {
        FacilityMonthSnapshot snapshot = snapshotRepository.findByYearMonth(yearMonth)
                .orElseGet(() -> snapshotRepository.save(FacilityMonthSnapshot.firstAttempt(yearMonth,
                        CrawlSource.SCHEDULER)));
        snapshot.recordSuccessful(LocalDateTime.now(), CrawlSource.SCHEDULER);
        snapshotRepository.save(snapshot);
    }
    // ※ FacilityMonthSnapshot 의 실제 팩토리/기록 메서드명은 엔티티를 열어 그대로 사용한다
    //    (recordSuccessful/recordFailure 계열 — 선행 스펙 §4.3). 시그니처가 다르면 맞춰 수정.

    @Test
    @DisplayName("정확 매칭되는 APPROVED 는 자동 CONFIRMED + 시스템 이력, 이름 불일치는 APPROVED 유지다")
    void confirmsExactMatchesOnly() throws Exception {
        Fixture fixture = fixture(); // 동아리명이 픽스처에서 유니크 생성되므로 clubRepository 로 실명 조회
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        String clubName = clubRepository.findById(fixture.club().getId()).orElseThrow().getName();

        Long matched = pendingBooking(fixture, date, 18, 20);
        adminService.approve(admin.getId(), matched);
        // 학교가 동아리명 그대로 18~19·19~20 점유행 등록
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(19, 0), clubName, null, null, LocalDateTime.now()));
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(19, 0), LocalTime.of(20, 0), clubName, null, null, LocalDateTime.now()));

        Long mismatched = pendingBooking(fixture, date, 9, 10);
        adminService.approve(admin.getId(), mismatched);
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(9, 0), LocalTime.of(10, 0), "전혀다른단체", null, null, LocalDateTime.now()));

        recordSuccessSnapshot(YearMonth.from(date));
        scheduler.runMatchingCycle();

        assertThat(bookingRepository.findById(matched).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.CONFIRMED);
        assertThat(bookingRepository.findById(matched).orElseThrow().getMatchedScheduleSeq()).isNotNull();
        assertThat(historyRepository.findByBookingIdOrderByCreatedAtDesc(matched).get(0).getChangedById())
                .isNull(); // 시스템 전이
        assertThat(bookingRepository.findById(mismatched).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED); // 수동 확정 대상으로 유지

        // 멱등 — 두 번째 실행에도 결과·이력 개수 불변
        int historyCount = historyRepository.findByBookingIdOrderByCreatedAtDesc(matched).size();
        scheduler.runMatchingCycle();
        assertThat(historyRepository.findByBookingIdOrderByCreatedAtDesc(matched)).hasSize(historyCount);
    }

    @Test
    @DisplayName("스냅샷이 SUCCESS 가 아닌 월은 건너뛴다 — 반쪽 데이터로 오판하지 않는다")
    void skipsNonSuccessMonths() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        String clubName = clubRepository.findById(fixture.club().getId()).orElseThrow().getName();
        Long approved = pendingBooking(fixture, date, 11, 12);
        adminService.approve(admin.getId(), approved);
        facilityReservationRepository.save(FacilityReservation.create(fixture.facility().getId(),
                sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(11, 0), LocalTime.of(12, 0), clubName, null, null, LocalDateTime.now()));
        // 스냅샷 미기록(또는 FAILED) 상태

        scheduler.runMatchingCycle();

        assertThat(bookingRepository.findById(approved).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED);
    }
}
```

- [ ] **Step 3: JobConfig + 스케줄러 구현**

먼저 조건부 `@EnableScheduling` 설정을 둔다(전례: `FacilityCrawlerJobConfig`·`FeeAutoIssueJobConfig`) — 이게 없으면 매칭 잡의 `@Scheduled` 는 다른 잡의 `@EnableScheduling` 이 켜져 있을 때만 우연히 발화한다. `FacilityBookingMatchingJobConfig.java`:

```java
package com.duing.domain.facilitybooking.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "duing.facility.booking.matching", name = "enabled", havingValue = "true")
public class FacilityBookingMatchingJobConfig {}
```

스케줄러는 판정(`decide`)만 위임하고 적용(`applyAutoConfirm`)은 별도 빈인 `FacilityBookingMatchingService` 의 `@Transactional public` 메서드로 호출한다(self-invocation 회피 — 아래 구현 주의 참조). `FacilityBookingMatchingScheduler.java`:

```java
package com.duing.domain.facilitybooking.scheduler;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.service.FacilityBookingMatchingService;
import com.duing.domain.facilitybooking.service.FacilityBookingMatchingService.MatchDecision;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * APPROVED → CONFIRMED 자동 매칭 잡(§5.3). 크롤 잡(매 10분 0초)과 3분 오프셋으로 최신 스냅샷을 뒤따른다.
 * fetch_status=SUCCESS 월만 신뢰하고, 판정은 FacilityBookingMatchingService(교체 가능 정책)에 위임한다.
 * 예약 1건 단위 확정도 같은 서비스의 applyAutoConfirm(짧은 트랜잭션)에 위임한다 — self-invocation 회피.
 * AtomicBoolean.compareAndSet 으로 in-JVM 중복 실행을 막는다(이전 사이클 진행 중이면 skip).
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "duing.facility.booking.matching", name = "enabled", havingValue = "true")
public class FacilityBookingMatchingScheduler {

    private final FacilityBookingRepository facilityBookingRepository;
    private final FacilityReservationRepository facilityReservationRepository;
    private final FacilityMonthSnapshotRepository facilityMonthSnapshotRepository;
    private final FacilityBookingMatchingService matchingService;
    private final ClubRepository clubRepository;
    private final Clock clock;

    private final AtomicBoolean running = new AtomicBoolean(false);

    @Scheduled(cron = "0 3-59/10 * * * *", zone = "Asia/Seoul")
    public void runScheduled() {
        if (!running.compareAndSet(false, true)) {
            log.info("FacilityBooking Matching skip: 이전 사이클이 아직 진행 중");
            return;
        }
        try {
            runMatchingCycle();
        } finally {
            running.set(false);
        }
    }

    /** 테스트에서 직접 호출 가능한 코어 — 당월·익월의 APPROVED 를 스캔한다. */
    public void runMatchingCycle() {
        YearMonth currentMonth = YearMonth.now(clock);
        int confirmedCount = 0;
        for (YearMonth month : List.of(currentMonth, currentMonth.plusMonths(1))) {
            Optional<LocalDateTime> crawlBasisAt = successCrawledAt(month);
            if (crawlBasisAt.isEmpty()) {
                log.info("FacilityBooking Matching skip month={} (스냅샷 미신뢰)", month);
                continue;
            }
            confirmedCount += matchMonth(month, crawlBasisAt.get());
        }
        log.info("FacilityBooking Matching done confirmed={}", confirmedCount);
    }

    /** SUCCESS 월이면 그 스냅샷의 크롤 수집 시각(판단 근거 = crawlBasisAt), 미신뢰 월이면 empty. */
    private Optional<LocalDateTime> successCrawledAt(YearMonth month) {
        return facilityMonthSnapshotRepository.findByYearMonth(month)
                .filter(snapshot -> snapshot.getFetchStatus() == FetchStatus.SUCCESS)
                .map(snapshot -> snapshot.getCrawledAt());
    }

    private int matchMonth(YearMonth month, LocalDateTime crawlBasisAt) {
        List<FacilityBooking> approvedBookings = facilityBookingRepository
                .findByStatusAndReservationDateBetween(BookingStatus.APPROVED,
                        month.atDay(1), month.atEndOfMonth());
        if (approvedBookings.isEmpty()) {
            return 0;
        }
        Map<Long, String> clubNames = clubRepository.findAllById(
                        approvedBookings.stream().map(FacilityBooking::getClubId).distinct().toList()).stream()
                .collect(Collectors.toMap(club -> club.getId(), club -> club.getName(), (first, second) -> first));

        // (시설,월) 크롤 행을 시설당 한 번만 조회해 재사용 — 같은 시설의 반복 조회 제거(날짜 필터는 예약별로 적용).
        Map<Long, List<FacilityReservation>> rowsByFacility = new HashMap<>();

        int confirmedCount = 0;
        for (FacilityBooking booking : approvedBookings) {
            // 한 건 처리 실패가 잔여 예약·익월 스캔을 죽이지 않도록 예약 단위로 격리한다(낙관 잠금 충돌 포함).
            try {
                List<FacilityReservation> dayRows = rowsByFacility
                        .computeIfAbsent(booking.getFacilityId(), facilityId ->
                                facilityReservationRepository.findByFacilityIdAndYearMonth(facilityId, month))
                        .stream()
                        .filter(row -> row.getReservationDate().equals(booking.getReservationDate()))
                        .toList();
                MatchDecision decision = matchingService.decide(
                        booking, clubNames.getOrDefault(booking.getClubId(), ""), dayRows);
                if (decision.confirmed()) {
                    matchingService.applyAutoConfirm(booking.getId(), decision, crawlBasisAt);
                    confirmedCount++;
                }
            } catch (Exception exception) {
                log.error("FacilityBooking Matching 실패 bookingId={}", booking.getId(), exception);
            }
        }
        return confirmedCount;
    }
}
```

적용 메서드는 Task 3 의 `FacilityBookingMatchingService` 에 둔다(별도 빈 프록시라 `@Transactional` 이 실제로 적용됨):

```java
    /** 예약 1건 단위의 짧은 트랜잭션 — 상태 재확인 후 전이(멱등: APPROVED 가 아니면 조용히 스킵).
     *  crawlBasisAt = 판정 근거가 된 SUCCESS 스냅샷의 수집 시각(확정 시점 now 가 아님). */
    @Transactional
    public void applyAutoConfirm(Long bookingId, MatchDecision decision, LocalDateTime crawlBasisAt) {
        FacilityBooking booking = facilityBookingRepository.findById(bookingId).orElse(null);
        // 관리자 전이와의 경합은 @Version 낙관 잠금이 차단(늦은 커밋이 실패·롤백) — 재확인은 멱등 게이트.
        if (booking == null || booking.getStatus() != BookingStatus.APPROVED) {
            return;
        }
        LocalDateTime now = LocalDateTime.now(clock);
        booking.confirmByMatching(decision.matchedScheduleSeq(), crawlBasisAt, now);
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), BookingStatus.APPROVED, BookingStatus.CONFIRMED,
                null, "크롤 데이터 자동 매칭 확정", crawlBasisAt));
    }
```

**구현 주의:**
- **self-invocation:** `@Transactional` 자기 호출은 프록시를 우회한다. `applyAutoConfirm` 을 스케줄러 대신 별도 빈 `FacilityBookingMatchingService`(판정과 적용이 한 서비스로 모임)에 두어 프록시 트랜잭션이 실제로 걸리게 한다.
- **@EnableScheduling:** 매칭 잡은 전용 `FacilityBookingMatchingJobConfig`(`@EnableScheduling` + 동일 `@ConditionalOnProperty`)로 독립 활성화한다 — 전역 `@EnableScheduling` 이 없으므로 이 설정이 없으면 다른 잡이 켜져야만 cron 이 발화한다.
- **crawlBasisAt:** 스냅샷의 `getCrawledAt()`(판단 근거 크롤 시각)을 `applyAutoConfirm` 까지 전달해 엔티티 `crawl_basis_at`·이력에 확정 시점(now)이 아닌 크롤 수집 시각을 남긴다(승인 경로 관례와 일치).
- **per-booking 격리·행 메모이즈:** `matchMonth` 는 예약 1건 처리를 try/catch 로 감싸 한 건 실패가 잔여·익월 스캔을 죽이지 않게 하고, `(시설,월)` 크롤 행을 `HashMap` 으로 메모이즈해 같은 시설 반복 조회를 없앤다.

- [ ] **Step 4: 테스트 통과 확인 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.scheduler.*"`
Expected: 2개 전부 PASS

```bash
git add backend/src/main/java/com/duing backend/src/main/resources backend/src/test/java/com/duing
git commit -m "feat(backend): CONFIRMED 자동 매칭 스케줄러 추가 — SUCCESS 월 게이트·멱등·시스템 이력"
```

---

### Task 5: 관리자 큐·상세·summary 조회 서비스 (QueryDSL)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/repository/FacilityBookingRepositoryCustom.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/repository/FacilityBookingRepositoryImpl.java`
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/repository/FacilityBookingRepository.java` (Custom 상속)
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/service/dto/query/AdminBookingSearchCondition.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/service/FacilityBookingAdminQueryService.java`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/FacilityBookingAdminQueryIntegrationTest.java`

**Interfaces:**
- Produces: `searchForAdmin(AdminBookingSearchCondition(status, facilityId, dateFrom, dateTo), Pageable) → Page<FacilityBooking>`(최신순 기본); `FacilityBookingAdminQueryService` — `getQueue(condition, pageable) → Page<AdminBookingSummaryResult>`(clubName·roomName·pendingDays(APPROVED 경과일)·conflictSuspected 파생), `getDetail(bookingId) → AdminBookingDetailResult`(**ensureFresh 시도 + crawlBasisAt/stale + 겹침 컨텍스트(점유행·내부 예약·겹치는 PENDING) + 이력**), `getSummary() → AdminBookingSummaryCounts(pendingCount, todaySubmittedCount, approvedWaitingCount, oldestApprovedWaitingDays, conflictCount, confirmedThisMonthCount)`
- **주의: `FacilityBookingAdminQueryService` 는 클래스 레벨 `@Transactional` 금지** — `getDetail` 이 `ensureFresh`(온디맨드 크롤 쓰기)를 호출한다(가용성 서비스와 동일 원칙).

- [ ] **Step 1: QueryDSL 검색 구현**

`FacilityBookingRepositoryCustom.java`:

```java
package com.duing.domain.facilitybooking.repository;

import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.service.dto.query.AdminBookingSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FacilityBookingRepositoryCustom {

    Page<FacilityBooking> searchForAdmin(AdminBookingSearchCondition condition, Pageable pageable);
}
```

`AdminBookingSearchCondition.java`:

```java
package com.duing.domain.facilitybooking.service.dto.query;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import java.time.LocalDate;

public record AdminBookingSearchCondition(
        BookingStatus status,
        Long facilityId,
        LocalDate dateFrom,
        LocalDate dateTo
) {}
```

`FacilityBookingRepositoryImpl.java` (QueryDSL — 기존 `{Domain}RepositoryImpl` 전례의 `JPAQueryFactory` 주입 방식을 그대로 따른다):

```java
package com.duing.domain.facilitybooking.repository;

import static com.duing.domain.facilitybooking.entity.QFacilityBooking.facilityBooking;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.service.dto.query.AdminBookingSearchCondition;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

@RequiredArgsConstructor
public class FacilityBookingRepositoryImpl implements FacilityBookingRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<FacilityBooking> searchForAdmin(AdminBookingSearchCondition condition, Pageable pageable) {
        List<FacilityBooking> content = queryFactory.selectFrom(facilityBooking)
                .where(statusEquals(condition.status()),
                        facilityEquals(condition.facilityId()),
                        dateFrom(condition.dateFrom()),
                        dateTo(condition.dateTo()))
                .orderBy(facilityBooking.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();
        Long total = queryFactory.select(facilityBooking.count())
                .from(facilityBooking)
                .where(statusEquals(condition.status()),
                        facilityEquals(condition.facilityId()),
                        dateFrom(condition.dateFrom()),
                        dateTo(condition.dateTo()))
                .fetchOne();
        return new PageImpl<>(content, pageable, total != null ? total : 0L);
    }

    private BooleanExpression statusEquals(BookingStatus status) {
        return status != null ? facilityBooking.status.eq(status) : null;
    }

    private BooleanExpression facilityEquals(Long facilityId) {
        return facilityId != null ? facilityBooking.facilityId.eq(facilityId) : null;
    }

    private BooleanExpression dateFrom(LocalDate from) {
        return from != null ? facilityBooking.reservationDate.goe(from) : null;
    }

    private BooleanExpression dateTo(LocalDate to) {
        return to != null ? facilityBooking.reservationDate.loe(to) : null;
    }
}
```

`FacilityBookingRepository` 선언을 `extends JpaRepository<FacilityBooking, Long>, FacilityBookingRepositoryCustom` 으로 변경.

- [ ] **Step 2: AdminQueryService 구현**

`FacilityBookingAdminQueryService.java` — result record 3종 + 메서드 3개. 핵심 형태:

```java
package com.duing.domain.facilitybooking.service;

// (import 정리 — 아래 본문에서 쓰는 타입 전부)

/**
 * 관리자 큐·상세·대시보드 조회. 클래스 레벨 @Transactional 금지 — getDetail 이 ensureFresh(온디맨드
 * 크롤 쓰기)를 호출하는 무트랜잭션 오케스트레이션이다(§7.3 readOnly 함정, 가용성 서비스와 동일 원칙).
 */
@Service
@RequiredArgsConstructor
public class FacilityBookingAdminQueryService {

    private final FacilityBookingRepository facilityBookingRepository;
    private final FacilityBookingStatusHistoryRepository historyRepository;
    private final FacilityRepository facilityRepository;
    private final FacilityReservationRepository facilityReservationRepository;
    private final FacilityMonthSnapshotRepository facilityMonthSnapshotRepository;
    private final FacilityCrawlService facilityCrawlService;
    private final FacilityAvailabilityPolicy availabilityPolicy;
    private final OrganizationNameNormalizer normalizer;
    private final ClubRepository clubRepository;
    private final Clock clock;

    public record AdminBookingSummaryResult(Long bookingId, Long clubId, String clubName,
            Long facilityId, String roomName, LocalDate date, LocalTime startTime, LocalTime endTime,
            BookingStatus status, String purpose, LocalDateTime createdAt,
            Integer approvedWaitingDays, boolean conflictSuspected) {}

    public record OverlapContext(String source, String organization, LocalTime startTime, LocalTime endTime) {}

    public record AdminBookingDetailResult(Long bookingId, Long clubId, String clubName,
            Long facilityId, String roomName, LocalDate date, LocalTime startTime, LocalTime endTime,
            BookingStatus status, String purpose, Integer attendeeCount, String rejectReason,
            String conflictDetail, Long matchedScheduleSeq,
            LocalDateTime crawlBasisAt, boolean stale,
            List<OverlapContext> overlaps, long overlappingPendingCount,
            List<FacilityBookingService.HistoryEntry> history) {}

    public record AdminBookingSummaryCounts(long pendingCount, long todaySubmittedCount,
            long approvedWaitingCount, long oldestApprovedWaitingDays,
            long conflictCount, long confirmedThisMonthCount) {}

    public Page<AdminBookingSummaryResult> getQueue(AdminBookingSearchCondition condition, Pageable pageable) { ... }

    public AdminBookingDetailResult getDetail(Long bookingId) { ... }

    public AdminBookingSummaryCounts getSummary() { ... }
}
```

구현 규칙(코드로 옮길 때 그대로):
- `getQueue`: `searchForAdmin` → 페이지 항목의 clubName/roomName 은 `findAllById` 일괄 매핑(N+1 금지). `approvedWaitingDays` = status==APPROVED 일 때 `ChronoUnit.DAYS.between(decidedAt.toLocalDate(), LocalDate.now(clock))`, 그 외 null. `conflictSuspected` = APPROVED 이고, 해당 (시설,월) 크롤 행 중 **점유행**이 예약 시간과 겹치는데 정규화 이름이 동아리명과 불일치하는 행이 존재할 때 true — 크롤 행은 페이지 내 (시설,월) 조합당 1회만 조회해 캐시(Map)한다.
- `getDetail`: ① `ensureFresh(YearMonth.from(date))` 시도(반환 DataSource 무시하지 말고 stale 계산에 사용 — 가용성 서비스의 `isStale` 로직과 동일 규칙: STALE_CACHE·스냅샷 null·비SUCCESS·10분 초과) ② 겹침 컨텍스트: 점유행(OverlapContext source="SCHOOL", 단체명)·내부 APPROVED/CONFIRMED(source="INTERNAL", 동아리명 — **관리자 화면은 내부용이므로 노출**)·겹치는 PENDING 개수 ③ 이력은 기존 `HistoryEntry` 재사용.
- `getSummary`: `pendingCount`=PENDING 전체, `todaySubmittedCount`=오늘 생성 PENDING, `approvedWaitingCount`=APPROVED 전체, `oldestApprovedWaitingDays`=가장 오래된 APPROVED 의 경과일(없으면 0), `conflictCount`=CONFLICT 전체, `confirmedThisMonthCount`=이달(reservationDate 기준) CONFIRMED. 카운트는 `countByStatus`/`countByStatusAndCreatedAtBetween` 등 파생 쿼리를 리포지토리에 추가해 사용(각 1쿼리).

- [ ] **Step 3: 실패하는 통합 테스트 → 구현 → 통과**

`FacilityBookingAdminQueryIntegrationTest.java` — 픽스처는 기존 패턴, `@MockitoBean FacilityCrawlService`(STALE_CACHE 스텁, 실 크롤 차단). 테스트 3건:
1. "큐는 상태·시설 필터와 페이지를 적용하고 APPROVED 에 경과일·충돌 의심 플래그를 파생한다" — PENDING 2 + APPROVED 1(불일치 점유행 겹침 → conflictSuspected true) 생성 후 `getQueue(new AdminBookingSearchCondition(APPROVED, null, null, null), PageRequest.of(0, 10))` 단언.
2. "상세는 겹침 컨텍스트(SCHOOL·INTERNAL·PENDING 수)와 이력·stale 을 담는다" — 점유행 1 + 타 동아리 APPROVED 1 + 겹치는 PENDING 1 구성 후 `getDetail` 단언(overlaps 2건·pendingCount 1·stale true).
3. "summary 는 상태별 카운트를 정확히 센다" — 상태 분포 만들고 `getSummary()` 단언.

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.service.FacilityBookingAdminQueryIntegrationTest"`
Expected: 3개 전부 PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking backend/src/test/java/com/duing/domain/facilitybooking
git commit -m "feat(backend): 관리자 대관 큐·상세·대시보드 조회 서비스 추가 — QueryDSL 검색·충돌 의심 파생"
```

---

### Task 6: 관리자 API 컨트롤러 + 인수 테스트

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/api/AdminFacilityBookingApi.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/controller/AdminFacilityBookingController.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/controller/dto/request/RejectFacilityBookingRequest.java` (+`CancelFacilityBookingRequest`, `MarkConflictRequest`)
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/controller/dto/response/AdminFacilityBookingSummaryResponse.java` (+`AdminFacilityBookingDetailResponse`, `AdminFacilityBookingCountsResponse`)
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/controller/AdminFacilityBookingAcceptanceTest.java`

**Interfaces:**
- Produces (스펙 §8 #6~13): `GET /api/v1/admin/facility-bookings`(PageResponse) / `GET /api/v1/admin/facility-bookings/{id}` / `POST .../{id}/approve`(204) / `POST .../{id}/reject {reason 필수, ≤500}`(204) / `POST .../{id}/confirm`(204) / `POST .../{id}/conflict {detail 필수, ≤500}`(204) / `POST .../{id}/cancel {reason 필수, ≤500}`(204) / `GET .../summary`

- [ ] **Step 1: Request/Response DTO 작성**

`RejectFacilityBookingRequest.java`:

```java
package com.duing.domain.facilitybooking.controller.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RejectFacilityBookingRequest(
        @NotBlank(message = "거절 사유는 필수 입력값입니다.")
        @Size(max = 500, message = "거절 사유는 500자 이하로 입력해주세요.") String reason
) {}
```

(`CancelFacilityBookingRequest(reason)`, `MarkConflictRequest(detail)` 도 동일 구조 — 메시지만 "취소 사유는…"/"충돌 상세는…".)

Response 3종은 Task 5 result record 를 `from(...)` 으로 그대로 옮기는 record(시간 필드 타입 유지, `@JsonInclude(NON_NULL)` 은 rejectReason/conflictDetail/matchedScheduleSeq/crawlBasisAt/approvedWaitingDays 에).

- [ ] **Step 2: Api 인터페이스 + 컨트롤러 작성**

`AdminFacilityBookingApi.java` — admin 관례(@Tag "시설 대관(총동연)", @SecurityRequirement, 경로는 인터페이스에, Pageable 은 `@Parameter(hidden = true)`):

```java
@Tag(name = "시설 대관(총동연)", description = "총동연 전용 대관 신청 승인·관리 API")
@SecurityRequirement(name = "BearerAuth")
public interface AdminFacilityBookingApi {

    @Operation(summary = "대관 신청 큐 조회", description = "기본 최신순. APPROVED 에 학교 반영 대기 경과일·충돌 의심 플래그 포함.")
    @GetMapping("/admin/facility-bookings")
    ResponseEntity<ApiResponse<PageResponse<AdminFacilityBookingSummaryResponse>>> getQueue(
            @Parameter(description = "상태 필터") @RequestParam(required = false) BookingStatus status,
            @Parameter(description = "시설 필터") @RequestParam(required = false) Long facilityId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,
            @Parameter(hidden = true) Pageable pageable);

    @Operation(summary = "대관 신청 상세", description = "해당 월 온디맨드 재크롤을 시도하고 크롤 신선도·겹침 컨텍스트·이력을 포함한다(§5.2).")
    @GetMapping("/admin/facility-bookings/{bookingId}")
    ResponseEntity<ApiResponse<AdminFacilityBookingDetailResponse>> getDetail(@PathVariable Long bookingId);

    @Operation(summary = "승인", description = "저장 스냅샷 기준 재검증(시설 잠금). 학교 점유 충돌 시 409 FACILITY_BOOKING_SCHOOL_CONFLICT.")
    @PostMapping("/admin/facility-bookings/{bookingId}/approve")
    ResponseEntity<ApiResponse<Void>> approve(@PathVariable Long bookingId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "거절")
    @PostMapping("/admin/facility-bookings/{bookingId}/reject")
    ResponseEntity<ApiResponse<Void>> reject(@PathVariable Long bookingId,
            @Valid @RequestBody RejectFacilityBookingRequest rejectFacilityBookingRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "수동 확정", description = "자동 매칭 불발(학교 표기 차이) 건의 관리자 확정.")
    @PostMapping("/admin/facility-bookings/{bookingId}/confirm")
    ResponseEntity<ApiResponse<Void>> confirm(@PathVariable Long bookingId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "충돌 전환", description = "승인 후 학교 데이터 충돌 확인 시 수동 전환(P1).")
    @PostMapping("/admin/facility-bookings/{bookingId}/conflict")
    ResponseEntity<ApiResponse<Void>> markConflict(@PathVariable Long bookingId,
            @Valid @RequestBody MarkConflictRequest markConflictRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "관리자 취소", description = "APPROVED·CONFLICT 취소. 사유는 이력에 기록.")
    @PostMapping("/admin/facility-bookings/{bookingId}/cancel")
    ResponseEntity<ApiResponse<Void>> cancel(@PathVariable Long bookingId,
            @Valid @RequestBody CancelFacilityBookingRequest cancelFacilityBookingRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "대시보드 카드 수치", description = "승인 대기·학교 반영 대기·충돌·이달 확정(§9.7).")
    @GetMapping("/admin/facility-bookings/summary")
    ResponseEntity<ApiResponse<AdminFacilityBookingCountsResponse>> getSummary();
}
```

`AdminFacilityBookingController.java` — `@RestController @RequestMapping("/api/v1") @RequiredArgsConstructor @PreAuthorize("hasRole('ADMIN')")`, `implements AdminFacilityBookingApi`. 조회 2개+summary 는 QueryService 위임 후 `ApiResponse.success(...)`(목록은 `PageResponse.from(page.map(AdminFacilityBookingSummaryResponse::from))`), 액션 5개는 AdminService 위임 후 `ResponseEntity.noContent().build()`.

**라우팅 주의:** `GET /admin/facility-bookings/summary` 가 `GET /admin/facility-bookings/{bookingId}` 템플릿보다 리터럴 우선 매칭됨(Preset GET 전례와 동일) — 별도 처리 불필요하나 인수 테스트로 고정한다.

- [ ] **Step 3: 인수 테스트 작성 → 통과**

`AdminFacilityBookingAcceptanceTest.java` — `AdminUrlLayerAuthorizationAcceptanceTest` 의 RestAssured 방식:
1. "익명·일반 사용자 요청은 각각 401·403 이다" — 무토큰 GET 큐 → 401, STUDENT 토큰(기존 테스트의 토큰 헬퍼 사용) GET 큐 → 403
2. "summary 경로가 상세 템플릿에 삼켜지지 않는다" — ADMIN 토큰으로 `GET /api/v1/admin/facility-bookings/summary` → 200 + counts 필드 존재
3. "승인 액션은 204 를 반환하고 상태를 바꾼다" — 서비스로 PENDING 생성 후 ADMIN 토큰 POST approve → 204, 상태 APPROVED (ADMIN 사용자 생성·토큰 발급은 `AdminUrlLayerAuthorizationAcceptanceTest` 의 헬퍼 방식을 그대로 따른다 — 파일을 열어 복제)

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.controller.AdminFacilityBookingAcceptanceTest"`
Expected: 3개 전부 PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking backend/src/test/java/com/duing/domain/facilitybooking
git commit -m "feat(backend): 총동연 대관 승인 API 추가 — 큐·상세·액션 5종·대시보드"
```

---

### Task 7: 전체 검증

- [ ] **Step 1: 전체 빌드 + 전체 테스트**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew build`
Expected: `BUILD SUCCESSFUL` (출력 끝 확인). 실패 시 해당 테스트 수정 후 재실행.

- [ ] **Step 2: 회귀 확인 포인트**

- PR1 테스트 전부 PASS(신청·가용성·보안 게이트 무회귀)
- `RowLevelSecurityMigrationTest`·`AdminUrlLayerAuthorizationAcceptanceTest` PASS
- QueryDSL Q-클래스 생성 확인(`build/generated` — 컴파일 단계에서 자동)

- [ ] **Step 3: 워킹트리 클린 확인**

Run: `git status --short`
Expected: clean.

---

## Out of Scope (P2 이후)

- 자동 CONFLICT 전환(연속 2회 관측 규칙)·겹침 PENDING 자동 거절 — P2
- 인앱 알림(FACILITY_* 타입) — P2
- 동아리별 학교 표기명 매핑·유사도 매칭 — P2 (판정 정책 내부 교체)
- 관리자 메모·Preset CRUD — P2
- 동아리 목록 페이징 — P2(관리자 큐는 이번에 PageResponse 로 구현)
- 프론트엔드 전체(관리자 화면 UI 포함) — PR3~
