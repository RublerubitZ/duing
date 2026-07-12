# 시설 대관 신청 백엔드 1차(PR1: 코어) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시설 대관 신청 도메인의 백엔드 코어 — 스키마(신청·이력·목적 preset), 예약 상태 머신 엔티티, 크롤 행 분류 정책, 슬롯 가용성 API, 동아리 신청·취소·조회 API — 를 구현한다. (관리자 승인·매칭 잡은 PR2)

**Architecture:** 신규 도메인 `com.duing.domain.facilitybooking` — 크롤 미러 도메인(`domain.facility`)과 분리하고 ID 스칼라 참조만 한다. 크롤 행 판별은 `FacilityAvailabilityPolicy` 한 곳에 격리, 신청 규칙은 `BookingPolicyValidator`에 격리(P2 설정화 대비). 이중 승인 방지의 최종 백스톱은 DB EXCLUDE 제약(btree_gist).

**Tech Stack:** Spring Boot 3.4 / Java 21 / JPA / Flyway / PostgreSQL(Testcontainers 테스트) / JUnit5 + AssertJ

**Spec:** [`docs/superpowers/specs/2026-07-13-facility-booking-design.md`](../specs/2026-07-13-facility-booking-design.md) (§3 가용성 모델, §4 상태 머신, §5.1·5.4 신청·취소, §6 스키마, §8 API)

## Global Constraints

- 시크릿/환경변수 하드코딩 절대 금지.
- DTO 는 전부 `record`. Response 는 `static from(...)`, Request 는 `toCommand(...)` 변환.
- 도메인 예외는 `ApplicationException` 상속 부모 + 중첩 static 클래스(`FacilityBookingException.XxxException`), HttpStatus 를 생성자에서 지정.
- Controller 는 반드시 `api/` Swagger 인터페이스(`@Tag`/`@Operation`/매핑 어노테이션은 인터페이스 쪽)를 implements. HTTP 상태: POST 생성=201, GET=200, PATCH/DELETE/액션형 POST(본문 없음)=204.
- 현재 사용자: `@AuthenticationPrincipal UserPrincipal currentUser` → `currentUser.id()`. 운영진 권한: `clubAuthService.requireManager(userId, clubId)` (LEADER/OFFICER + ACTIVE 동아리 검증 내장).
- 신규 테이블: `id BIGSERIAL PK` + `created_at/updated_at/deleted_at TIMESTAMP` + **`ENABLE ROW LEVEL SECURITY` 필수**(`RowLevelSecurityMigrationTest` 가드) + `IntegrationTestBase` TRUNCATE 목록 추가 필수.
- 기존 마이그레이션 파일 수정 금지 — 새 파일만 추가.
- 시간 로직은 `Clock` 주입(`seoulClock` 빈, 타입 유일이라 `@Qualifier` 불필요) + `now(clock)`. 테스트는 `Clock.fixed(...)` — **하드코딩 미래 절대날짜로 만료되는 테스트 금지**(CI timebomb).
- 슬롯 그리드: 09:00~22:00, 1시간 단위, 같은 날짜 내 연속 슬롯. 신청 가능 기간: 오늘~다음 달 말일. 동아리당 활성(PENDING+APPROVED) 상한 10건.
- 가용성 판별: 점유행(운영시간 꼬리 없음)만 차단, 운영행은 정보 라벨. **컬럼 조건(`reservedStartTime == null`)은 `FacilityAvailabilityPolicy` 내부에만** 존재해야 한다.
- 커밋 메시지: 한국어 Conventional Commits(`feat(backend): ...`). Co-Authored-By/🤖 라인 절대 금지.
- 빌드·테스트는 반드시 `backend/` 디렉터리에서 실행. 출력 끝의 `BUILD SUCCESSFUL` 확인(파이프로 가리지 말 것). 통합 테스트는 Docker(Testcontainers) 필요.

**마이그레이션 버전 규칙(중요):** 이 계획은 **V82/V83/V84** 를 사용하며 `V81` 은 열린 PR #629(email 인프라 제거)의 몫으로 남긴다. Flyway 는 out-of-order 적용을 금지하므로 두 브랜치가 같은 번호를 쓰면 부팅에 실패한다. 만약 이 브랜치가 #629 보다 **먼저** develop 에 머지·배포되면 #629 쪽이 V85+ 로 리넘버해야 한다. Task 1 시작 시 `ls backend/src/main/resources/db/migration | sort -V | tail -5` 으로 develop 최신을 재확인한다.

---

## File Structure

```
backend/src/main/resources/db/migration/
├── V82__create_facility_booking.sql                     (Task 1)
├── V83__create_facility_booking_status_history.sql      (Task 1)
└── V84__create_facility_booking_purpose_preset.sql      (Task 1)

backend/src/main/java/com/duing/domain/facilitybooking/
├── api/
│   ├── FacilityAvailabilityApi.java                     (Task 6)
│   └── ClubFacilityBookingApi.java                      (Task 7, Task 8 확장)
├── entity/
│   ├── BookingStatus.java                               (Task 2)
│   ├── FacilityBooking.java                             (Task 2)
│   ├── FacilityBookingStatusHistory.java                (Task 3)
│   └── FacilityBookingPurposePreset.java                (Task 3)
├── exception/FacilityBookingException.java              (Task 2)
├── repository/
│   ├── FacilityBookingRepository.java                   (Task 3)
│   ├── FacilityBookingStatusHistoryRepository.java      (Task 3)
│   └── FacilityBookingPurposePresetRepository.java      (Task 3)
├── service/
│   ├── CrawlRowType.java                                (Task 4)
│   ├── FacilityAvailabilityPolicy.java                  (Task 4)
│   ├── BookingPolicyValidator.java                      (Task 4)
│   ├── FacilitySlotAssembler.java                       (Task 5)
│   ├── FacilityAvailabilityService.java                 (Task 6)
│   ├── GeneralFacilityAvailabilityService.java          (Task 6)
│   ├── FacilityBookingService.java                      (Task 7)
│   ├── GeneralFacilityBookingService.java               (Task 7, Task 8 확장)
│   └── dto/command/CreateFacilityBookingCommand.java    (Task 7)
└── controller/
    ├── FacilityAvailabilityController.java              (Task 6)
    ├── ClubFacilityBookingController.java               (Task 7, Task 8 확장)
    └── dto/
        ├── request/CreateFacilityBookingRequest.java    (Task 7)
        └── response/ (Task 6·7·8 — 아래 각 Task 에 명시)

수정:
├── global/config/SecurityConfig.java                    (Task 7 — clubs GET permitAll 앞 매처 2줄)
└── test/java/com/duing/common/IntegrationTestBase.java  (Task 1 — TRUNCATE 3테이블)
```

브랜치: `feat/facility-booking-core` (develop 에서 분기).

---

### Task 1: Flyway 마이그레이션 3종 + RLS·TRUNCATE 등록

**Files:**
- Create: `backend/src/main/resources/db/migration/V82__create_facility_booking.sql`
- Create: `backend/src/main/resources/db/migration/V83__create_facility_booking_status_history.sql`
- Create: `backend/src/main/resources/db/migration/V84__create_facility_booking_purpose_preset.sql`
- Modify: `backend/src/test/java/com/duing/common/IntegrationTestBase.java` (TRUNCATE 목록)
- Test: `backend/src/test/java/com/duing/global/RowLevelSecurityMigrationTest.java` (기존 — 실행만)

**Interfaces:**
- Produces: 테이블 `facility_booking`(EXCLUDE 제약 `excl_facility_booking_active_overlap` 포함), `facility_booking_status_history`, `facility_booking_purpose_preset`(시드 9행)

- [ ] **Step 1: 버전 번호 확인**

Run: `ls /Users/ksy/Desktop/BASIC/Coding/Duing/backend/src/main/resources/db/migration | sort -V | tail -5`
Expected: `V80__...` 이 최신이고 `V81` 은 PR #629 몫으로 비워 둔다. **이 Task 는 V82/V83/V84 를 쓴다.** 만약 develop 에 이미 V82+ 가 존재하면(다른 브랜치 선점) 그 뒤 번호로 시프트한다.

- [ ] **Step 2: V82 — facility_booking**

```sql
-- 시설 대관 신청. 크롤 미러(facility_reservation)는 월 단위 delete+insert 전면 교체이므로
-- 신청 데이터는 반드시 별도 테이블이어야 한다(설계 §6.1).
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE facility_booking (
    id                   BIGSERIAL PRIMARY KEY,
    facility_id          BIGINT       NOT NULL REFERENCES facility (id),
    club_id              BIGINT       NOT NULL REFERENCES club (id),
    applicant_id         BIGINT       NOT NULL REFERENCES users (id),
    reservation_date     DATE         NOT NULL,
    start_time           TIME         NOT NULL,
    end_time             TIME         NOT NULL,
    purpose              VARCHAR(200) NOT NULL,
    attendee_count       INT,
    status               VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    reject_reason        VARCHAR(500),
    conflict_detail      VARCHAR(500),
    matched_schedule_seq BIGINT,
    crawl_basis_at       TIMESTAMP,
    decided_by           BIGINT       REFERENCES users (id),
    decided_at           TIMESTAMP,
    confirmed_at         TIMESTAMP,
    version              BIGINT       NOT NULL DEFAULT 0,
    created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMP,
    CONSTRAINT chk_facility_booking_time
        CHECK (start_time >= TIME '09:00' AND end_time <= TIME '22:00' AND start_time < end_time)
);

-- 활성(APPROVED/CONFIRMED) 예약의 시설·시간 겹침을 DB 레벨에서 차단 — 승인 로직을 우회하는
-- 어떤 경로(버그·수동 SQL)도 이중 승인을 커밋할 수 없다(설계 §6.1). 위반 시
-- DataIntegrityViolationException → GlobalExceptionHandler 가 409 로 변환한다.
ALTER TABLE facility_booking
    ADD CONSTRAINT excl_facility_booking_active_overlap
    EXCLUDE USING gist (
        facility_id WITH =,
        (tsrange(reservation_date + start_time, reservation_date + end_time)) WITH &&
    ) WHERE (status IN ('APPROVED', 'CONFIRMED') AND deleted_at IS NULL);

CREATE INDEX idx_facility_booking_slot ON facility_booking (facility_id, reservation_date);
CREATE INDEX idx_facility_booking_club ON facility_booking (club_id, created_at DESC);
CREATE INDEX idx_facility_booking_queue ON facility_booking (status, reservation_date)
    WHERE status IN ('PENDING', 'APPROVED', 'CONFLICT');

ALTER TABLE facility_booking ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 3: V83 — facility_booking_status_history (append-only 감사 로그)**

```sql
-- 예약 상태 전이 audit log. append-only — application_status_history(V43)와 동일 원칙.
-- changed_by NULL = 시스템 자동 전이(매칭 잡). crawl_basis_at = 전이 판단에 사용한 크롤 스냅샷 시각.
CREATE TABLE facility_booking_status_history (
    id              BIGSERIAL PRIMARY KEY,
    booking_id      BIGINT      NOT NULL REFERENCES facility_booking (id),
    previous_status VARCHAR(20),
    new_status      VARCHAR(20) NOT NULL,
    changed_by      BIGINT      REFERENCES users (id),
    reason          VARCHAR(500),
    crawl_basis_at  TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMP
);

CREATE INDEX idx_fbsh_booking ON facility_booking_status_history (booking_id, created_at);

ALTER TABLE facility_booking_status_history ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: V84 — facility_booking_purpose_preset (+시드)**

```sql
-- 사용 목적 Preset — 신청 폼 입력 보조 UX(설계 §6.3). 서버는 최종 텍스트만 저장하므로 FK 없음.
CREATE TABLE facility_booking_purpose_preset (
    id         BIGSERIAL   PRIMARY KEY,
    label      VARCHAR(50) NOT NULL UNIQUE,
    sort_order INT         NOT NULL DEFAULT 0,
    active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);

ALTER TABLE facility_booking_purpose_preset ENABLE ROW LEVEL SECURITY;

INSERT INTO facility_booking_purpose_preset (label, sort_order) VALUES
    ('동아리 정기 모임', 0),
    ('동아리 정기 연습', 1),
    ('정기 합주', 2),
    ('공연 연습', 3),
    ('행사 준비', 4),
    ('회의', 5),
    ('세미나', 6),
    ('신입부원 교육', 7),
    ('촬영', 8);
```

- [ ] **Step 5: IntegrationTestBase TRUNCATE 목록에 추가**

`cleanDatabase()` 의 TRUNCATE 문자열에서 `"facility_reservation, "` 라인 **앞**에 자식→부모 순으로 추가:

```java
"facility_booking_status_history, " +
"facility_booking, " +
```

**주의: `facility_booking_purpose_preset` 은 목록에 넣지 않는다** — Flyway 시드 정적 데이터라 TRUNCATE 하면 매 테스트에서 preset 이 사라져 Task 3 의 시드 검증이 깨진다(P1 에서 이 테이블을 쓰는 테스트는 조회뿐이고, 다른 truncate 대상 테이블을 FK 참조하지 않아 CASCADE 에도 걸리지 않는다).

- [ ] **Step 6: 마이그레이션·RLS 검증**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.global.RowLevelSecurityMigrationTest"`
Expected: PASS (3개 신규 테이블 모두 RLS on, EXCLUDE/CHECK 문법 오류 없이 마이그레이션 적용)

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/resources/db/migration backend/src/test/java/com/duing/common/IntegrationTestBase.java
git commit -m "feat(backend): 시설 대관 신청 스키마 추가 — booking·상태 이력·목적 preset (V82~V84)"
```

---

### Task 2: BookingStatus + FacilityBooking 엔티티 + 도메인 예외

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/entity/BookingStatus.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/entity/FacilityBooking.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/exception/FacilityBookingException.java`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/entity/FacilityBookingTest.java`

**Interfaces:**
- Produces: `FacilityBooking.request(facilityId, clubId, applicantId, reservationDate, startTime, endTime, purpose, attendeeCount)` → PENDING 신청 생성. `cancelByClub()` — PENDING 에서만. `overlaps(LocalTime, LocalTime)`. `BookingStatus.blocksSlot()/countsTowardActiveCap()/isTerminal()`. Task 7~8 및 PR2 가 이 계약을 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

```java
package com.duing.domain.facilitybooking.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FacilityBookingTest {

    private FacilityBooking pendingBooking() {
        return FacilityBooking.request(1L, 2L, 3L,
                LocalDate.of(2026, 1, 15), LocalTime.of(18, 0), LocalTime.of(20, 0),
                "정기 합주", 15);
    }

    private void forceStatus(FacilityBooking booking, BookingStatus status) throws Exception {
        Field statusField = FacilityBooking.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(booking, status);
    }

    @Test
    @DisplayName("신청 생성 시 상태는 PENDING 이다")
    void requestCreatesPendingBooking() {
        assertThat(pendingBooking().getStatus()).isEqualTo(BookingStatus.PENDING);
    }

    @Test
    @DisplayName("PENDING 신청은 동아리가 취소할 수 있다")
    void cancelByClubFromPending() {
        FacilityBooking booking = pendingBooking();
        booking.cancelByClub();
        assertThat(booking.getStatus()).isEqualTo(BookingStatus.CANCELLED);
    }

    @Test
    @DisplayName("PENDING 이 아닌 상태에서 동아리 취소는 409 도메인 예외다")
    void cancelByClubRejectsNonPending() throws Exception {
        FacilityBooking booking = pendingBooking();
        forceStatus(booking, BookingStatus.APPROVED);
        assertThatThrownBy(booking::cancelByClub)
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);
    }

    @Test
    @DisplayName("overlaps 는 경계 접촉(끝==시작)을 겹침으로 보지 않는다")
    void overlapsExcludesBoundaryTouch() {
        FacilityBooking booking = pendingBooking(); // 18~20
        assertThat(booking.overlaps(LocalTime.of(20, 0), LocalTime.of(21, 0))).isFalse();
        assertThat(booking.overlaps(LocalTime.of(17, 0), LocalTime.of(18, 0))).isFalse();
        assertThat(booking.overlaps(LocalTime.of(19, 0), LocalTime.of(21, 0))).isTrue();
    }

    @Test
    @DisplayName("BookingStatus 파생 속성 — 차단/상한/터미널")
    void statusDerivedFlags() {
        assertThat(BookingStatus.APPROVED.blocksSlot()).isTrue();
        assertThat(BookingStatus.CONFIRMED.blocksSlot()).isTrue();
        assertThat(BookingStatus.PENDING.blocksSlot()).isFalse();
        assertThat(BookingStatus.PENDING.countsTowardActiveCap()).isTrue();
        assertThat(BookingStatus.APPROVED.countsTowardActiveCap()).isTrue();
        assertThat(BookingStatus.CONFIRMED.countsTowardActiveCap()).isFalse();
        assertThat(BookingStatus.CONFIRMED.isTerminal()).isTrue();
        assertThat(BookingStatus.CONFLICT.isTerminal()).isFalse();
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.entity.FacilityBookingTest"`
Expected: 컴파일 실패(클래스 없음)

- [ ] **Step 3: 구현**

`BookingStatus.java`:

```java
package com.duing.domain.facilitybooking.entity;

/**
 * 대관 신청 상태 머신(설계 §4). PENDING → APPROVED → CONFIRMED 이 정상 경로,
 * 승인 후 학교 데이터 충돌만 CONFLICT 를 쓴다. CONFIRMED 는 완전 터미널(관리자 포함 변경 불가).
 */
public enum BookingStatus {
    PENDING,
    APPROVED,
    CONFIRMED,
    REJECTED,
    CONFLICT,
    CANCELLED;

    /** 가용성 계산에서 슬롯을 하드 차단하는 상태 — BLOCKED(INTERNAL) 대상(설계 §3.1). */
    public boolean blocksSlot() {
        return this == APPROVED || this == CONFIRMED;
    }

    /** 동아리당 활성 신청 상한 집계 대상(설계 §3.3). */
    public boolean countsTowardActiveCap() {
        return this == PENDING || this == APPROVED;
    }

    public boolean isTerminal() {
        return this == CONFIRMED || this == REJECTED || this == CANCELLED;
    }
}
```

`FacilityBookingException.java`:

```java
package com.duing.domain.facilitybooking.exception;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class FacilityBookingException extends ApplicationException {

    protected FacilityBookingException(String message, HttpStatus status) {
        super(message, status);
    }

    protected FacilityBookingException(String message, HttpStatus status, String code) {
        super(message, status, code);
    }

    public static class BookingNotFoundException extends FacilityBookingException {
        public BookingNotFoundException() {
            super("예약 신청을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static class MonthOutOfBookingRangeException extends FacilityBookingException {
        public MonthOutOfBookingRangeException() {
            super("예약 가능 기간이 아닙니다. 이번 달과 다음 달만 조회할 수 있습니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class InvalidSlotRangeException extends FacilityBookingException {
        public InvalidSlotRangeException() {
            super("예약 시간은 09:00~22:00 사이의 정시 단위(1시간 슬롯)로 선택해야 합니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class OutOfBookingWindowException extends FacilityBookingException {
        public OutOfBookingWindowException() {
            super("오늘부터 다음 달 말일까지의 미래 시간만 신청할 수 있습니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class ActiveBookingLimitExceededException extends FacilityBookingException {
        public ActiveBookingLimitExceededException(int limit) {
            super("동아리당 진행 중인 예약 신청은 최대 " + limit + "건까지만 가능합니다.", HttpStatus.CONFLICT);
        }
    }

    public static class SlotUnavailableException extends FacilityBookingException {
        public SlotUnavailableException() {
            super("이미 예약된 시간이 포함되어 있어 신청할 수 없습니다.",
                    HttpStatus.CONFLICT, "FACILITY_BOOKING_SLOT_UNAVAILABLE");
        }
    }

    public static class DuplicateClubBookingException extends FacilityBookingException {
        public DuplicateClubBookingException() {
            super("같은 시간에 이미 우리 동아리의 예약 신청이 있습니다.", HttpStatus.CONFLICT);
        }
    }

    public static class InvalidStatusTransitionException extends FacilityBookingException {
        public InvalidStatusTransitionException(BookingStatus from, BookingStatus to) {
            super("현재 상태(" + from + ")에서는 " + to + " 로 변경할 수 없습니다.", HttpStatus.CONFLICT);
        }
    }

    public static class ArchivedFacilityException extends FacilityBookingException {
        public ArchivedFacilityException() {
            super("현재 예약 신청을 받을 수 없는 시설입니다.", HttpStatus.BAD_REQUEST);
        }
    }
}
```

`FacilityBooking.java`:

```java
package com.duing.domain.facilitybooking.entity;

import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

/**
 * 시설 대관 신청. 크롤 미러(facility_reservation)와 분리된 쓰기 도메인이며,
 * 시설·동아리·사용자는 ID 스칼라로만 참조한다(facility 도메인 컨벤션).
 */
@Getter
@Entity
@Table(name = "facility_booking")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
// @Version 도입으로 Hibernate 가 두 번째 바인드 파라미터로 version 을 전달하므로 WHERE 절에 version 조건을 명시한다.
@SQLDelete(sql = "UPDATE facility_booking SET deleted_at = NOW() WHERE id = ? AND version = ?")
@SQLRestriction("deleted_at IS NULL")
public class FacilityBooking extends BaseEntity {

    @Column(name = "facility_id", nullable = false)
    private Long facilityId;

    @Column(name = "club_id", nullable = false)
    private Long clubId;

    @Column(name = "applicant_id", nullable = false)
    private Long applicantId;

    @Column(name = "reservation_date", nullable = false)
    private LocalDate reservationDate;

    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;

    @Column(nullable = false, length = 200)
    private String purpose;

    @Column(name = "attendee_count")
    private Integer attendeeCount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BookingStatus status;

    @Column(name = "reject_reason", length = 500)
    private String rejectReason;

    @Column(name = "conflict_detail", length = 500)
    private String conflictDetail;

    @Column(name = "matched_schedule_seq")
    private Long matchedScheduleSeq;

    @Column(name = "crawl_basis_at")
    private LocalDateTime crawlBasisAt;

    @Column(name = "decided_by")
    private Long decidedById;

    @Column(name = "decided_at")
    private LocalDateTime decidedAt;

    @Column(name = "confirmed_at")
    private LocalDateTime confirmedAt;

    // 두 요청이 같은 신청을 동시에 전이시키면 후행 UPDATE 가 0 row →
    // ObjectOptimisticLockingFailureException 으로 차단된다(GlobalExceptionHandler 가 409 변환).
    @Version
    @Column(nullable = false)
    private Long version;

    @Builder(access = AccessLevel.PRIVATE)
    private FacilityBooking(Long facilityId, Long clubId, Long applicantId, LocalDate reservationDate,
                            LocalTime startTime, LocalTime endTime, String purpose, Integer attendeeCount) {
        this.facilityId = facilityId;
        this.clubId = clubId;
        this.applicantId = applicantId;
        this.reservationDate = reservationDate;
        this.startTime = startTime;
        this.endTime = endTime;
        this.purpose = purpose;
        this.attendeeCount = attendeeCount;
        this.status = BookingStatus.PENDING;
    }

    public static FacilityBooking request(Long facilityId, Long clubId, Long applicantId,
                                          LocalDate reservationDate, LocalTime startTime, LocalTime endTime,
                                          String purpose, Integer attendeeCount) {
        return FacilityBooking.builder()
                .facilityId(facilityId)
                .clubId(clubId)
                .applicantId(applicantId)
                .reservationDate(reservationDate)
                .startTime(startTime)
                .endTime(endTime)
                .purpose(purpose)
                .attendeeCount(attendeeCount)
                .build();
    }

    /** 신청 동아리의 취소 — PENDING 에서만 허용(설계 §4.3). APPROVED 이후 취소는 관리자 전용(PR2). */
    public void cancelByClub() {
        if (this.status != BookingStatus.PENDING) {
            throw new FacilityBookingException.InvalidStatusTransitionException(this.status, BookingStatus.CANCELLED);
        }
        this.status = BookingStatus.CANCELLED;
    }

    /** 반개구간 [start, end) 겹침 — 경계 접촉(끝==시작)은 겹침이 아니다. */
    public boolean overlaps(LocalTime otherStart, LocalTime otherEnd) {
        return this.startTime.isBefore(otherEnd) && this.endTime.isAfter(otherStart);
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.entity.FacilityBookingTest"`
Expected: 5개 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking backend/src/test/java/com/duing/domain/facilitybooking
git commit -m "feat(backend): FacilityBooking 엔티티·상태 머신·도메인 예외 추가"
```

---

### Task 3: 이력·Preset 엔티티 + 리포지토리 3종 + 영속 통합 테스트

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/entity/FacilityBookingStatusHistory.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/entity/FacilityBookingPurposePreset.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/repository/FacilityBookingRepository.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/repository/FacilityBookingStatusHistoryRepository.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/repository/FacilityBookingPurposePresetRepository.java`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/repository/FacilityBookingPersistenceTest.java`

**Interfaces:**
- Consumes: Task 2 의 `FacilityBooking`/`BookingStatus`
- Produces: `FacilityBookingStatusHistory.record(bookingId, previousStatus, newStatus, changedById, reason, crawlBasisAt)`; 리포지토리 메서드 — `findOverlapping(facilityId, date, statuses, startTime, endTime)`, `findClubOverlapping(clubId, date, statuses, startTime, endTime)`, `findByFacilityIdAndReservationDateBetweenAndStatusIn(...)`, `countByClubIdAndStatusIn(...)`, `findByClubIdOrderByCreatedAtDesc(...)`, `findByClubIdAndStatusOrderByCreatedAtDesc(...)`, `findByIdAndClubId(...)`, `findByBookingIdOrderByCreatedAtDesc(...)`, `findByActiveTrueOrderBySortOrderAsc()`

- [ ] **Step 1: 실패하는 테스트 작성**

```java
package com.duing.domain.facilitybooking.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.entity.FacilityBookingStatusHistory;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FacilityBookingPersistenceTest extends IntegrationTestBase {

    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired FacilityBookingStatusHistoryRepository historyRepository;
    @Autowired FacilityBookingPurposePresetRepository presetRepository;
    @Autowired FacilityRepository facilityRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private FacilityBooking saveBooking(Long facilityId, Long clubId, Long applicantId,
                                        LocalDate date, int startHour, int endHour) {
        return bookingRepository.save(FacilityBooking.request(facilityId, clubId, applicantId,
                date, LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), "정기 연습", null));
    }

    private Long saveFixtures() {
        // 반환: facilityId. club/user 는 테스트에서 getId 로 재사용.
        Facility facility = facilityRepository.save(
                Facility.create((int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(1)", "1503호", 0));
        return facility.getId();
    }

    private User saveUser() {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L), "부원" + unique, "hashed",
                UserRole.STUDENT, Grade.FRESHMAN, College.IT_ENGINEERING, "미설정",
                "010-0000-0000", LocalDateTime.now()));
    }

    private Club saveClub() {
        return clubRepository.save(Club.create("동아리-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null));
    }

    @Test
    @DisplayName("겹침 조회는 시간이 교차하는 지정 상태의 신청만 반환하고 경계 접촉은 제외한다")
    void findOverlappingReturnsIntersectingBookingsOnly() {
        Long facilityId = saveFixtures();
        Club club = saveClub();
        User applicant = saveUser();
        LocalDate date = LocalDate.now().plusDays(3);

        FacilityBooking target = saveBooking(facilityId, club.getId(), applicant.getId(), date, 18, 20);
        saveBooking(facilityId, club.getId(), applicant.getId(), date, 20, 21); // 경계 접촉 — 제외
        saveBooking(facilityId, club.getId(), applicant.getId(), date.plusDays(1), 18, 20); // 다른 날짜 — 제외

        List<FacilityBooking> overlapping = bookingRepository.findOverlapping(
                facilityId, date, List.of(BookingStatus.PENDING), LocalTime.of(19, 0), LocalTime.of(21, 0));

        assertThat(overlapping).extracting(FacilityBooking::getId).containsExactly(target.getId());
    }

    @Test
    @DisplayName("이력은 booking_id 로 최신순 조회되고 changedBy·previousStatus 가 null 인 행(시스템/생성)도 저장된다")
    void historyRoundTrip() {
        Long facilityId = saveFixtures();
        Club club = saveClub();
        User applicant = saveUser();
        FacilityBooking booking = saveBooking(facilityId, club.getId(), applicant.getId(),
                LocalDate.now().plusDays(3), 18, 20);

        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), null, BookingStatus.PENDING, applicant.getId(), null, null));
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), BookingStatus.PENDING, BookingStatus.CANCELLED, null, "시스템 처리", null));

        List<FacilityBookingStatusHistory> histories =
                historyRepository.findByBookingIdOrderByCreatedAtDesc(booking.getId());

        assertThat(histories).hasSize(2);
        assertThat(histories.get(0).getNewStatus()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(histories.get(0).getChangedById()).isNull();
        assertThat(histories.get(1).getPreviousStatus()).isNull();
    }

    @Test
    @DisplayName("Preset 시드 9종이 active·sort_order 순으로 조회된다")
    void presetSeedIsServedInOrder() {
        var presets = presetRepository.findByActiveTrueOrderBySortOrderAsc();
        assertThat(presets).hasSize(9);
        assertThat(presets.get(0).getLabel()).isEqualTo("동아리 정기 모임");
        assertThat(presets.get(8).getLabel()).isEqualTo("촬영");
    }

    @Test
    @DisplayName("동아리 활성 상태 집계는 지정 상태만 센다")
    void countByClubIdAndStatusIn() {
        Long facilityId = saveFixtures();
        Club club = saveClub();
        User applicant = saveUser();
        LocalDate date = LocalDate.now().plusDays(3);
        saveBooking(facilityId, club.getId(), applicant.getId(), date, 9, 10);
        FacilityBooking cancelled = saveBooking(facilityId, club.getId(), applicant.getId(), date, 10, 11);
        cancelled.cancelByClub();
        bookingRepository.save(cancelled);

        long active = bookingRepository.countByClubIdAndStatusIn(club.getId(),
                List.of(BookingStatus.PENDING, BookingStatus.APPROVED));

        assertThat(active).isEqualTo(1);
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.repository.FacilityBookingPersistenceTest"`
Expected: 컴파일 실패

- [ ] **Step 3: 구현**

`FacilityBookingStatusHistory.java`:

```java
package com.duing.domain.facilitybooking.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 예약 상태 전이 audit log. append-only — application_status_history 와 동일 원칙으로
 * 수정·삭제 API 를 노출하지 않는다.
 *
 * <p>ApplicationStatusHistory 와 달리 changedBy 를 스칼라 ID 로 둔다: 시스템 자동 전이(매칭 잡)는
 * 행위자가 없어 null 이어야 하고, P1 응답은 행위자 신원을 노출하지 않으므로 연관관계가 필요 없다.
 */
@Entity
@Table(name = "facility_booking_status_history")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FacilityBookingStatusHistory extends BaseEntity {

    @Column(name = "booking_id", nullable = false)
    private Long bookingId;

    /** 생성(신청) 기록은 null. */
    @Enumerated(EnumType.STRING)
    @Column(name = "previous_status", length = 20)
    private BookingStatus previousStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "new_status", nullable = false, length = 20)
    private BookingStatus newStatus;

    /** 시스템 자동 전이는 null. */
    @Column(name = "changed_by")
    private Long changedById;

    @Column(length = 500)
    private String reason;

    /** 전이 판단에 사용한 크롤 스냅샷 시각(승인·매칭 시). */
    @Column(name = "crawl_basis_at")
    private LocalDateTime crawlBasisAt;

    @Builder(access = AccessLevel.PRIVATE)
    private FacilityBookingStatusHistory(Long bookingId, BookingStatus previousStatus, BookingStatus newStatus,
                                         Long changedById, String reason, LocalDateTime crawlBasisAt) {
        this.bookingId = bookingId;
        this.previousStatus = previousStatus;
        this.newStatus = newStatus;
        this.changedById = changedById;
        this.reason = reason;
        this.crawlBasisAt = crawlBasisAt;
    }

    public static FacilityBookingStatusHistory record(Long bookingId, BookingStatus previousStatus,
                                                      BookingStatus newStatus, Long changedById,
                                                      String reason, LocalDateTime crawlBasisAt) {
        return FacilityBookingStatusHistory.builder()
                .bookingId(bookingId)
                .previousStatus(previousStatus)
                .newStatus(newStatus)
                .changedById(changedById)
                .reason(reason)
                .crawlBasisAt(crawlBasisAt)
                .build();
    }
}
```

`FacilityBookingPurposePreset.java`:

```java
package com.duing.domain.facilitybooking.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 사용 목적 Preset — 신청 폼 입력 보조 UX(설계 §6.3). P1 은 시드 데이터 + 조회 전용,
 * 관리자 CRUD 는 P2 에서 추가한다. "기타(직접 입력)"는 DB 행이 아니라 FE 고정 칩이다.
 */
@Entity
@Table(name = "facility_booking_purpose_preset")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FacilityBookingPurposePreset extends BaseEntity {

    @Column(nullable = false, length = 50, unique = true)
    private String label;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(nullable = false)
    private boolean active;
}
```

`FacilityBookingRepository.java`:

```java
package com.duing.domain.facilitybooking.repository;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FacilityBookingRepository extends JpaRepository<FacilityBooking, Long> {

    /** 시설·날짜·시간 겹침(반개구간) 조회 — 가용성/신청 검증용. 경계 접촉(끝==시작)은 겹침 아님. */
    @Query("SELECT b FROM FacilityBooking b "
            + "WHERE b.facilityId = :facilityId AND b.reservationDate = :date "
            + "AND b.status IN :statuses "
            + "AND b.startTime < :endTime AND b.endTime > :startTime")
    List<FacilityBooking> findOverlapping(@Param("facilityId") Long facilityId,
                                          @Param("date") LocalDate date,
                                          @Param("statuses") Collection<BookingStatus> statuses,
                                          @Param("startTime") LocalTime startTime,
                                          @Param("endTime") LocalTime endTime);

    /** 같은 동아리의 시간 겹침 신청(중복 신청 차단용). */
    @Query("SELECT b FROM FacilityBooking b "
            + "WHERE b.clubId = :clubId AND b.reservationDate = :date "
            + "AND b.status IN :statuses "
            + "AND b.startTime < :endTime AND b.endTime > :startTime")
    List<FacilityBooking> findClubOverlapping(@Param("clubId") Long clubId,
                                              @Param("date") LocalDate date,
                                              @Param("statuses") Collection<BookingStatus> statuses,
                                              @Param("startTime") LocalTime startTime,
                                              @Param("endTime") LocalTime endTime);

    List<FacilityBooking> findByFacilityIdAndReservationDateBetweenAndStatusIn(
            Long facilityId, LocalDate startDate, LocalDate endDate, Collection<BookingStatus> statuses);

    long countByClubIdAndStatusIn(Long clubId, Collection<BookingStatus> statuses);

    List<FacilityBooking> findByClubIdOrderByCreatedAtDesc(Long clubId);

    List<FacilityBooking> findByClubIdAndStatusOrderByCreatedAtDesc(Long clubId, BookingStatus status);

    Optional<FacilityBooking> findByIdAndClubId(Long id, Long clubId);
}
```

`FacilityBookingStatusHistoryRepository.java`:

```java
package com.duing.domain.facilitybooking.repository;

import com.duing.domain.facilitybooking.entity.FacilityBookingStatusHistory;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** append-only — 삭제/수정 API 를 노출하지 않는다. */
public interface FacilityBookingStatusHistoryRepository
        extends JpaRepository<FacilityBookingStatusHistory, Long> {

    List<FacilityBookingStatusHistory> findByBookingIdOrderByCreatedAtDesc(Long bookingId);
}
```

`FacilityBookingPurposePresetRepository.java`:

```java
package com.duing.domain.facilitybooking.repository;

import com.duing.domain.facilitybooking.entity.FacilityBookingPurposePreset;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FacilityBookingPurposePresetRepository
        extends JpaRepository<FacilityBookingPurposePreset, Long> {

    List<FacilityBookingPurposePreset> findByActiveTrueOrderBySortOrderAsc();
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.repository.FacilityBookingPersistenceTest"`
Expected: 4개 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking backend/src/test/java/com/duing/domain/facilitybooking
git commit -m "feat(backend): 예약 이력·목적 preset 엔티티와 리포지토리 추가"
```

---

### Task 4: FacilityAvailabilityPolicy + BookingPolicyValidator

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/service/CrawlRowType.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/service/FacilityAvailabilityPolicy.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/service/BookingPolicyValidator.java`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/FacilityAvailabilityPolicyTest.java`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/BookingPolicyValidatorTest.java`

**Interfaces:**
- Consumes: `FacilityReservation`(크롤 엔티티, 읽기), Task 2 예외
- Produces: `policy.classify(FacilityReservation) → CrawlRowType(OCCUPIED|OPERATING)`; `validator.validateSlotRange(date, start, end)`, `validator.validateActiveCap(long)`. 상수 `BookingPolicyValidator.OPEN_TIME/CLOSE_TIME/MAX_ACTIVE_BOOKINGS_PER_CLUB`. Task 5~7 이 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`FacilityAvailabilityPolicyTest.java`:

```java
package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.facility.entity.FacilityReservation;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FacilityAvailabilityPolicyTest {

    private final FacilityAvailabilityPolicy policy = new FacilityAvailabilityPolicy();

    private FacilityReservation row(LocalTime reservedStart, LocalTime reservedEnd) {
        LocalDate date = LocalDate.of(2026, 1, 15);
        return FacilityReservation.create(1L, 100L, YearMonth.from(date), date,
                LocalTime.of(9, 0), LocalTime.of(10, 0), "고정관념",
                reservedStart, reservedEnd, LocalDateTime.of(2026, 1, 15, 8, 0));
    }

    @Test
    @DisplayName("운영시간 꼬리가 없는 행은 점유행(OCCUPIED)이다")
    void rowWithoutOperatingHoursIsOccupied() {
        assertThat(policy.classify(row(null, null))).isEqualTo(CrawlRowType.OCCUPIED);
    }

    @Test
    @DisplayName("운영시간 꼬리가 있는 행은 운영행(OPERATING)이다 — 슬롯을 차단하지 않는다")
    void rowWithOperatingHoursIsOperating() {
        assertThat(policy.classify(row(LocalTime.of(9, 0), LocalTime.of(20, 0))))
                .isEqualTo(CrawlRowType.OPERATING);
    }
}
```

`BookingPolicyValidatorTest.java` — 고정 Clock 기준 상대 날짜만 사용(절대 미래날짜 금지):

```java
package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BookingPolicyValidatorTest {

    // KST 2026-01-15 12:30 고정 — 테스트 날짜는 전부 이 시점 기준 상대값이라 만료되지 않는다.
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Clock FIXED = Clock.fixed(
            Instant.parse("2026-01-15T03:30:00Z"), SEOUL);

    private final BookingPolicyValidator validator = new BookingPolicyValidator(FIXED);

    private final LocalDate today = LocalDate.now(FIXED);

    @Test
    @DisplayName("정시가 아닌 시각·운영시간 밖·역전 범위는 InvalidSlotRange")
    void rejectsInvalidGrid() {
        assertThatThrownBy(() -> validator.validateSlotRange(today.plusDays(1), LocalTime.of(18, 30), LocalTime.of(20, 0)))
                .isInstanceOf(FacilityBookingException.InvalidSlotRangeException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(today.plusDays(1), LocalTime.of(8, 0), LocalTime.of(10, 0)))
                .isInstanceOf(FacilityBookingException.InvalidSlotRangeException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(today.plusDays(1), LocalTime.of(21, 0), LocalTime.of(23, 0)))
                .isInstanceOf(FacilityBookingException.InvalidSlotRangeException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(today.plusDays(1), LocalTime.of(20, 0), LocalTime.of(18, 0)))
                .isInstanceOf(FacilityBookingException.InvalidSlotRangeException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(today.plusDays(1), LocalTime.of(13, 0, 30), LocalTime.of(15, 0)))
                .isInstanceOf(FacilityBookingException.InvalidSlotRangeException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(today.plusDays(1), LocalTime.of(13, 0), LocalTime.of(15, 0, 0, 1)))
                .isInstanceOf(FacilityBookingException.InvalidSlotRangeException.class);
    }

    @Test
    @DisplayName("어제·다음 달 말일 이후는 OutOfBookingWindow")
    void rejectsOutOfWindowDates() {
        assertThatThrownBy(() -> validator.validateSlotRange(today.minusDays(1), LocalTime.of(18, 0), LocalTime.of(20, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
        LocalDate beyond = YearMonth.from(today).plusMonths(1).atEndOfMonth().plusDays(1);
        assertThatThrownBy(() -> validator.validateSlotRange(beyond, LocalTime.of(18, 0), LocalTime.of(20, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
    }

    @Test
    @DisplayName("오늘의 이미 끝난 슬롯은 거부하고, 진행 중·미래 슬롯은 허용한다 (now=12:30)")
    void todayPastSlotRejected() {
        assertThatThrownBy(() -> validator.validateSlotRange(today, LocalTime.of(10, 0), LocalTime.of(11, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
        // 12~13 슬롯은 end(13:00) > now(12:30) 라 아직 유효(진행 중 슬롯)
        assertThatCode(() -> validator.validateSlotRange(today, LocalTime.of(12, 0), LocalTime.of(13, 0)))
                .doesNotThrowAnyException();
        assertThatCode(() -> validator.validateSlotRange(today, LocalTime.of(13, 0), LocalTime.of(15, 0)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("다음 달 말일까지는 허용한다")
    void allowsUpToEndOfNextMonth() {
        LocalDate lastBookable = YearMonth.from(today).plusMonths(1).atEndOfMonth();
        assertThatCode(() -> validator.validateSlotRange(lastBookable, LocalTime.of(9, 0), LocalTime.of(22, 0)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("활성 신청 10건 이상이면 ActiveBookingLimitExceeded")
    void rejectsWhenActiveCapReached() {
        assertThatCode(() -> validator.validateActiveCap(9)).doesNotThrowAnyException();
        assertThatThrownBy(() -> validator.validateActiveCap(10))
                .isInstanceOf(FacilityBookingException.ActiveBookingLimitExceededException.class);
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.service.*"`
Expected: 컴파일 실패

- [ ] **Step 3: 구현**

`CrawlRowType.java`:

```java
package com.duing.domain.facilitybooking.service;

/**
 * 크롤 행 분류(설계 §3.1 0단계). 확장 가능 — 향후 학교 데이터에 별도 "예약 불가 행" 유형이
 * 생기면 새 타입을 추가하고 FacilityAvailabilityPolicy 만 수정한다.
 */
public enum CrawlRowType {
    /** 실제 예약(점유) — 겹치는 슬롯 신청 불가. */
    OCCUPIED,
    /** 상시 운영 단체의 개방 시간 — 어떤 슬롯도 막지 않고 정보 라벨로만 노출. */
    OPERATING
}
```

`FacilityAvailabilityPolicy.java`:

```java
package com.duing.domain.facilitybooking.service;

import com.duing.domain.facility.entity.FacilityReservation;
import org.springframework.stereotype.Component;

/**
 * 크롤 행 판별 정책 — 판별 규칙은 이 컴포넌트 한 곳에만 존재한다(설계 §3.1 0단계).
 * 가용성 계산·API·UI 는 분류 결과(CrawlRowType)만 소비하며 컬럼 구조를 알지 못한다.
 * 학교 데이터 형식이나 파서가 바뀌면 이 클래스 내부만 교체한다.
 */
@Component
public class FacilityAvailabilityPolicy {

    /** 현재 구현: 운영시간 꼬리(reservedStartTime)가 파싱된 행 = 운영행, 없는 행 = 점유행. */
    public CrawlRowType classify(FacilityReservation reservation) {
        return reservation.getReservedStartTime() != null ? CrawlRowType.OPERATING : CrawlRowType.OCCUPIED;
    }
}
```

`BookingPolicyValidator.java`:

```java
package com.duing.domain.facilitybooking.service;

import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import org.springframework.stereotype.Component;

/**
 * 신청 규칙 검증(설계 §3.3). P1 은 상수 정책 — P2 에서 시설별·동아리별 설정값(정책 테이블)으로
 * 교체할 때 이 컴포넌트 내부만 바뀌고 호출부는 유지된다.
 */
@Component
public class BookingPolicyValidator {

    public static final LocalTime OPEN_TIME = LocalTime.of(9, 0);
    public static final LocalTime CLOSE_TIME = LocalTime.of(22, 0);
    public static final int MAX_ACTIVE_BOOKINGS_PER_CLUB = 10;

    private final Clock clock;

    public BookingPolicyValidator(Clock clock) {
        this.clock = clock;
    }

    /** 슬롯 그리드(정시·09~22·정방향) + 신청 가능 기간(오늘~다음 달 말일, 지난 슬롯 제외) 검증. */
    public void validateSlotRange(LocalDate date, LocalTime startTime, LocalTime endTime) {
        if (!startTime.equals(startTime.truncatedTo(ChronoUnit.HOURS))
                || !endTime.equals(endTime.truncatedTo(ChronoUnit.HOURS))
                || startTime.isBefore(OPEN_TIME) || endTime.isAfter(CLOSE_TIME)
                || !startTime.isBefore(endTime)) {
            throw new FacilityBookingException.InvalidSlotRangeException();
        }
        LocalDateTime currentDateTime = LocalDateTime.now(clock);
        LocalDate today = currentDateTime.toLocalDate();
        LocalDate lastBookableDate = YearMonth.from(today).plusMonths(1).atEndOfMonth();
        if (date.isBefore(today) || date.isAfter(lastBookableDate)) {
            throw new FacilityBookingException.OutOfBookingWindowException();
        }
        // 오늘이면 이미 끝난 슬롯(PAST: end ≤ now)이 포함되면 안 된다 — 첫 슬롯의 end 가 미래여야 한다(설계 §3.1).
        if (date.isEqual(today) && !startTime.plusHours(1).isAfter(currentDateTime.toLocalTime())) {
            throw new FacilityBookingException.OutOfBookingWindowException();
        }
    }

    public void validateActiveCap(long activeCount) {
        if (activeCount >= MAX_ACTIVE_BOOKINGS_PER_CLUB) {
            throw new FacilityBookingException.ActiveBookingLimitExceededException(MAX_ACTIVE_BOOKINGS_PER_CLUB);
        }
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.service.*"`
Expected: 7개 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking backend/src/test/java/com/duing/domain/facilitybooking
git commit -m "feat(backend): 크롤 행 분류 정책과 신청 규칙 검증기 추가"
```

---

### Task 5: 슬롯 어셈블러 (가용성 계산 순수 로직)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/service/FacilitySlotAssembler.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/controller/dto/response/FacilityAvailabilityResponse.java` (중첩 record 포함)
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/FacilitySlotAssemblerTest.java`

**Interfaces:**
- Consumes: `CrawlRowType`(Task 4), `BookingStatus`(Task 2)
- Produces:
  - `FacilitySlotAssembler.CrawlSlice(date, start, end, organization, type, operatingStart, operatingEnd)` — 서비스가 `FacilityReservation`+policy 로 매핑해 넣는 입력 record
  - `FacilitySlotAssembler.BookingSlice(date, start, end, status, clubName)` — 내부 예약 입력 record
  - `static List<FacilityAvailabilityResponse.DayAvailability> assembleDays(YearMonth month, LocalDate today, LocalTime nowTime, List<CrawlSlice> crawlSlices, List<BookingSlice> bookingSlices)`
  - 응답 record: `FacilityAvailabilityResponse(facilityId, yearMonth, lastUpdatedAt, stale, bookableFrom, bookableUntil, days)` / 중첩 `DayAvailability(date, dayStatus, availableSlotCount, operatingNotes, slots)` / `SlotAvailability(start, end, status, blockedBy, organization)` / `OperatingNote(organization, start, end)` / enum `DayStatus{AVAILABLE, FULL, PAST}`, `SlotStatus{AVAILABLE, PENDING_HOLD, BLOCKED, PAST}`, `SlotBlockSource{SCHOOL, INTERNAL}`

- [ ] **Step 1: 응답 DTO 작성**

`FacilityAvailabilityResponse.java`:

```java
package com.duing.domain.facilitybooking.controller.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/** 월 단위 가용성(설계 §8.1). 시간은 "HH:mm", yearMonth 는 "yyyy-MM" 문자열. */
public record FacilityAvailabilityResponse(
        Long facilityId,
        String yearMonth,
        @JsonInclude(JsonInclude.Include.NON_NULL) OffsetDateTime lastUpdatedAt,
        boolean stale,
        LocalDate bookableFrom,
        LocalDate bookableUntil,
        List<DayAvailability> days
) {

    public enum DayStatus { AVAILABLE, FULL, PAST }

    public enum SlotStatus { AVAILABLE, PENDING_HOLD, BLOCKED, PAST }

    public enum SlotBlockSource { SCHOOL, INTERNAL }

    public record DayAvailability(
            LocalDate date,
            DayStatus dayStatus,
            int availableSlotCount,
            List<OperatingNote> operatingNotes,
            List<SlotAvailability> slots
    ) {}

    public record SlotAvailability(
            String start,
            String end,
            SlotStatus status,
            @JsonInclude(JsonInclude.Include.NON_NULL) SlotBlockSource blockedBy,
            @JsonInclude(JsonInclude.Include.NON_NULL) String organization
    ) {}

    public record OperatingNote(String organization, String start, String end) {}
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

```java
package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.DayAvailability;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.DayStatus;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotBlockSource;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotStatus;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.service.FacilitySlotAssembler.BookingSlice;
import com.duing.domain.facilitybooking.service.FacilitySlotAssembler.CrawlSlice;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FacilitySlotAssemblerTest {

    private static final YearMonth MONTH = YearMonth.of(2026, 1);
    private static final LocalDate TODAY = LocalDate.of(2026, 1, 15);
    private static final LocalTime NOW = LocalTime.of(12, 30);

    private DayAvailability day(List<DayAvailability> days, int dayOfMonth) {
        return days.get(dayOfMonth - 1);
    }

    private SlotStatus slotStatus(DayAvailability day, int startHour) {
        return day.slots().get(startHour - 9).status();
    }

    @Test
    @DisplayName("크롤 행이 없는 미래 날짜는 13개 슬롯 전부 AVAILABLE 이고 dayStatus=AVAILABLE 이다")
    void emptyFutureDayIsFullyAvailable() {
        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(
                MONTH, TODAY, NOW, List.of(), List.of());

        DayAvailability future = day(days, 20);
        assertThat(future.slots()).hasSize(13);
        assertThat(future.availableSlotCount()).isEqualTo(13);
        assertThat(future.dayStatus()).isEqualTo(DayStatus.AVAILABLE);
        assertThat(future.slots()).allSatisfy(slot -> assertThat(slot.status()).isEqualTo(SlotStatus.AVAILABLE));
    }

    @Test
    @DisplayName("점유행은 겹치는 슬롯만 BLOCKED(SCHOOL·단체명)로 만들고, 운영행은 어떤 슬롯도 막지 않는다")
    void occupiedBlocksButOperatingDoesNot() {
        LocalDate date = LocalDate.of(2026, 1, 20);
        List<CrawlSlice> crawl = List.of(
                // 운영행: 고정관념(09:00~20:00) — 슬롯 마커 09~10 하나만 내려온 상황
                new CrawlSlice(date, LocalTime.of(9, 0), LocalTime.of(10, 0), "고정관념",
                        CrawlRowType.OPERATING, LocalTime.of(9, 0), LocalTime.of(20, 0)),
                // 점유행: 비호응원단 17~18, 18~19
                new CrawlSlice(date, LocalTime.of(17, 0), LocalTime.of(18, 0), "비호응원단",
                        CrawlRowType.OCCUPIED, null, null),
                new CrawlSlice(date, LocalTime.of(18, 0), LocalTime.of(19, 0), "비호응원단",
                        CrawlRowType.OCCUPIED, null, null));

        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, crawl, List.of());
        DayAvailability target = day(days, 20);

        assertThat(slotStatus(target, 9)).isEqualTo(SlotStatus.AVAILABLE); // 운영행 마커는 차단 안 함
        assertThat(slotStatus(target, 17)).isEqualTo(SlotStatus.BLOCKED);
        assertThat(slotStatus(target, 18)).isEqualTo(SlotStatus.BLOCKED);
        assertThat(slotStatus(target, 19)).isEqualTo(SlotStatus.AVAILABLE);
        assertThat(target.slots().get(17 - 9).blockedBy()).isEqualTo(SlotBlockSource.SCHOOL);
        assertThat(target.slots().get(17 - 9).organization()).isEqualTo("비호응원단");
        assertThat(target.availableSlotCount()).isEqualTo(11);
        assertThat(target.operatingNotes()).singleElement().satisfies(note -> {
            assertThat(note.organization()).isEqualTo("고정관념");
            assertThat(note.start()).isEqualTo("09:00");
            assertThat(note.end()).isEqualTo("20:00");
        });
    }

    @Test
    @DisplayName("내부 APPROVED 는 BLOCKED(INTERNAL·동아리명), PENDING 은 PENDING_HOLD(동아리명 비노출)다")
    void internalBookingsBlockOrHold() {
        LocalDate date = LocalDate.of(2026, 1, 20);
        List<BookingSlice> bookings = List.of(
                new BookingSlice(date, LocalTime.of(10, 0), LocalTime.of(12, 0), BookingStatus.APPROVED, "밴드부"),
                new BookingSlice(date, LocalTime.of(20, 0), LocalTime.of(21, 0), BookingStatus.PENDING, "연극부"));

        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, List.of(), bookings);
        DayAvailability target = day(days, 20);

        assertThat(slotStatus(target, 10)).isEqualTo(SlotStatus.BLOCKED);
        assertThat(target.slots().get(10 - 9).blockedBy()).isEqualTo(SlotBlockSource.INTERNAL);
        assertThat(target.slots().get(10 - 9).organization()).isEqualTo("밴드부");
        assertThat(slotStatus(target, 20)).isEqualTo(SlotStatus.PENDING_HOLD);
        assertThat(target.slots().get(20 - 9).organization()).isNull(); // 승인 대기 동아리명 비노출(설계 §3.1)
    }

    @Test
    @DisplayName("지난 날짜는 dayStatus=PAST, 오늘은 end≤now 슬롯만 PAST 다 (now=12:30 → 9~12시 PAST)")
    void pastDatesAndSlots() {
        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, List.of(), List.of());

        assertThat(day(days, 10).dayStatus()).isEqualTo(DayStatus.PAST);
        DayAvailability today = day(days, 15);
        assertThat(slotStatus(today, 9)).isEqualTo(SlotStatus.PAST);
        assertThat(slotStatus(today, 11)).isEqualTo(SlotStatus.PAST);   // 11~12, end 12:00 ≤ 12:30
        assertThat(slotStatus(today, 12)).isEqualTo(SlotStatus.AVAILABLE); // 12~13, end 13:00 > 12:30
    }

    @Test
    @DisplayName("우선순위: 같은 슬롯에 점유행과 PENDING 이 겹치면 BLOCKED 가 이긴다")
    void blockedWinsOverPendingHold() {
        LocalDate date = LocalDate.of(2026, 1, 20);
        List<CrawlSlice> crawl = List.of(new CrawlSlice(date, LocalTime.of(14, 0), LocalTime.of(15, 0),
                "총학생회", CrawlRowType.OCCUPIED, null, null));
        List<BookingSlice> bookings = List.of(
                new BookingSlice(date, LocalTime.of(14, 0), LocalTime.of(15, 0), BookingStatus.PENDING, "연극부"));

        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, crawl, bookings);

        assertThat(slotStatus(day(days, 20), 14)).isEqualTo(SlotStatus.BLOCKED);
    }
}
```

- [ ] **Step 3: 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.service.FacilitySlotAssemblerTest"`
Expected: 컴파일 실패

- [ ] **Step 4: 구현**

`FacilitySlotAssembler.java`:

```java
package com.duing.domain.facilitybooking.service;

import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.DayAvailability;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.DayStatus;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.OperatingNote;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotAvailability;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotBlockSource;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotStatus;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;

/**
 * 가용성 슬롯 계산(설계 §3.1) — 순수 함수. 입력은 서비스가 크롤 엔티티·Booking 을 slice 로 매핑해 넣는다
 * (엔티티에 직접 의존하지 않아 단위 테스트가 쉽고, 판별 정책은 호출부의 FacilityAvailabilityPolicy 가 담당).
 *
 * <p>슬롯 판정 우선순위(공존 시 처리 순서): PAST → BLOCKED(INTERNAL) → BLOCKED(SCHOOL)
 * → PENDING_HOLD → AVAILABLE. 운영행(OPERATING)은 어떤 슬롯도 차단하지 않고 정보 라벨만 만든다.
 */
public final class FacilitySlotAssembler {

    public static final LocalTime OPEN_TIME = LocalTime.of(9, 0);
    public static final int SLOT_COUNT = 13; // 09~22시, 1시간 단위

    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm");

    private FacilitySlotAssembler() {
    }

    /** 크롤 행 slice — type 은 FacilityAvailabilityPolicy 분류 결과. */
    public record CrawlSlice(LocalDate date, LocalTime start, LocalTime end, String organization,
                             CrawlRowType type, LocalTime operatingStart, LocalTime operatingEnd) {}

    /** 내부 예약 slice. clubName 은 BLOCKED(INTERNAL) 노출용 — PENDING 표시에는 쓰지 않는다. */
    public record BookingSlice(LocalDate date, LocalTime start, LocalTime end,
                               BookingStatus status, String clubName) {}

    public static List<DayAvailability> assembleDays(YearMonth month, LocalDate today, LocalTime nowTime,
                                                     List<CrawlSlice> crawlSlices, List<BookingSlice> bookingSlices) {
        List<DayAvailability> days = new ArrayList<>(month.lengthOfMonth());
        for (int dayOfMonth = 1; dayOfMonth <= month.lengthOfMonth(); dayOfMonth++) {
            LocalDate date = month.atDay(dayOfMonth);
            days.add(assembleDay(date, today, nowTime, crawlSlices, bookingSlices));
        }
        return days;
    }

    private static DayAvailability assembleDay(LocalDate date, LocalDate today, LocalTime nowTime,
                                               List<CrawlSlice> crawlSlices, List<BookingSlice> bookingSlices) {
        List<CrawlSlice> occupied = crawlSlices.stream()
                .filter(slice -> slice.date().equals(date) && slice.type() == CrawlRowType.OCCUPIED)
                .toList();
        List<CrawlSlice> operating = crawlSlices.stream()
                .filter(slice -> slice.date().equals(date) && slice.type() == CrawlRowType.OPERATING)
                .toList();
        List<BookingSlice> blockedBookings = bookingSlices.stream()
                .filter(slice -> slice.date().equals(date) && slice.status().blocksSlot())
                .toList();
        List<BookingSlice> pendingBookings = bookingSlices.stream()
                .filter(slice -> slice.date().equals(date) && slice.status() == BookingStatus.PENDING)
                .toList();

        List<SlotAvailability> slots = new ArrayList<>(SLOT_COUNT);
        int availableCount = 0;
        for (int index = 0; index < SLOT_COUNT; index++) {
            LocalTime slotStart = OPEN_TIME.plusHours(index);
            LocalTime slotEnd = slotStart.plusHours(1);
            SlotAvailability slot = resolveSlot(date, today, nowTime, slotStart, slotEnd,
                    occupied, blockedBookings, pendingBookings);
            if (slot.status() == SlotStatus.AVAILABLE || slot.status() == SlotStatus.PENDING_HOLD) {
                availableCount++;
            }
            slots.add(slot);
        }

        DayStatus dayStatus = date.isBefore(today) ? DayStatus.PAST
                : availableCount == 0 ? DayStatus.FULL
                : DayStatus.AVAILABLE;
        return new DayAvailability(date, dayStatus, availableCount, operatingNotes(operating), slots);
    }

    private static SlotAvailability resolveSlot(LocalDate date, LocalDate today, LocalTime nowTime,
                                                LocalTime slotStart, LocalTime slotEnd,
                                                List<CrawlSlice> occupied, List<BookingSlice> blockedBookings,
                                                List<BookingSlice> pendingBookings) {
        String start = TIME_FORMAT.format(slotStart);
        String end = TIME_FORMAT.format(slotEnd);
        if (date.isBefore(today) || (date.isEqual(today) && !slotEnd.isAfter(nowTime))) {
            return new SlotAvailability(start, end, SlotStatus.PAST, null, null);
        }
        Optional<BookingSlice> internalBlock = blockedBookings.stream()
                .filter(slice -> overlaps(slice.start(), slice.end(), slotStart, slotEnd))
                .findFirst();
        if (internalBlock.isPresent()) {
            return new SlotAvailability(start, end, SlotStatus.BLOCKED,
                    SlotBlockSource.INTERNAL, internalBlock.get().clubName());
        }
        Optional<CrawlSlice> schoolBlock = occupied.stream()
                .filter(slice -> overlaps(slice.start(), slice.end(), slotStart, slotEnd))
                .findFirst();
        if (schoolBlock.isPresent()) {
            return new SlotAvailability(start, end, SlotStatus.BLOCKED,
                    SlotBlockSource.SCHOOL, schoolBlock.get().organization());
        }
        boolean pendingHold = pendingBookings.stream()
                .anyMatch(slice -> overlaps(slice.start(), slice.end(), slotStart, slotEnd));
        if (pendingHold) {
            // 승인 대기 동아리명은 비노출(설계 §3.1 — 신청 경쟁 정보 최소화)
            return new SlotAvailability(start, end, SlotStatus.PENDING_HOLD, null, null);
        }
        return new SlotAvailability(start, end, SlotStatus.AVAILABLE, null, null);
    }

    private static List<OperatingNote> operatingNotes(List<CrawlSlice> operating) {
        // (단체, 운영시간) 단위로 dedupe — 운영행은 슬롯 마커가 여러 행으로 내려올 수 있다(선행 스펙 §16.1)
        LinkedHashSet<OperatingNote> notes = new LinkedHashSet<>();
        for (CrawlSlice slice : operating) {
            LocalTime noteStart = slice.operatingStart() != null ? slice.operatingStart() : slice.start();
            LocalTime noteEnd = slice.operatingEnd() != null ? slice.operatingEnd() : slice.end();
            notes.add(new OperatingNote(slice.organization(),
                    TIME_FORMAT.format(noteStart), TIME_FORMAT.format(noteEnd)));
        }
        return List.copyOf(notes);
    }

    private static boolean overlaps(LocalTime aStart, LocalTime aEnd, LocalTime bStart, LocalTime bEnd) {
        return aStart.isBefore(bEnd) && aEnd.isAfter(bStart);
    }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.service.FacilitySlotAssemblerTest"`
Expected: 5개 전부 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking backend/src/test/java/com/duing/domain/facilitybooking
git commit -m "feat(backend): 가용성 슬롯 어셈블러와 응답 DTO 추가"
```

---

### Task 6: 가용성 서비스 + 공개 컨트롤러(가용성 GET·Preset GET)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/service/FacilityAvailabilityService.java` (인터페이스)
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/service/GeneralFacilityAvailabilityService.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/api/FacilityAvailabilityApi.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/controller/FacilityAvailabilityController.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/controller/dto/response/PurposePresetResponse.java`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/controller/FacilityAvailabilityAcceptanceTest.java`

**Interfaces:**
- Consumes: `FacilityCrawlService.ensureFresh(YearMonth) → DataSource`, `FacilityReservationRepository.findByFacilityIdAndYearMonth`, `FacilityMonthSnapshotRepository.findByYearMonth`, `FacilityRepository`, `ClubRepository.findAllById`, Task 3~5 산출물
- Produces: `FacilityAvailabilityService.getAvailability(Long facilityId, YearMonth requestedMonth) → FacilityAvailabilityResponse`; `GET /api/v1/facilities/{facilityId}/availability?yearMonth=`(no-store) / `GET /api/v1/facilities/booking-purpose-presets`(public 60s) — 둘 다 기존 `/api/v1/facilities/**` GET permitAll 에 포함되어 Security 변경 없음

- [ ] **Step 1: 서비스 인터페이스·구현 작성**

`FacilityAvailabilityService.java`:

```java
package com.duing.domain.facilitybooking.service;

import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse;
import java.time.YearMonth;

public interface FacilityAvailabilityService {

    /** 월 단위 가용성. requestedMonth null=현재월, 당월·익월 외는 400(설계 §3.3·§8.1). */
    FacilityAvailabilityResponse getAvailability(Long facilityId, YearMonth requestedMonth);
}
```

`GeneralFacilityAvailabilityService.java` — **클래스 레벨 `@Transactional` 금지**(ensureFresh 가 온디맨드 크롤 쓰기를 유발 — 선행 스펙 CRITICAL 후속과 동일 원칙):

```java
package com.duing.domain.facilitybooking.service;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.exception.FacilityException;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facility.service.FacilityCrawlService;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.service.FacilitySlotAssembler.BookingSlice;
import com.duing.domain.facilitybooking.service.FacilitySlotAssembler.CrawlSlice;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class GeneralFacilityAvailabilityService implements FacilityAvailabilityService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    // 예약 홈은 당월·익월 전용이라 TTL 은 항상 10분(선행 스펙 §5.5의 현재·다음월 TTL 과 동일 값)
    private static final Duration FRESH_TTL = Duration.ofMinutes(10);

    private final FacilityRepository facilityRepository;
    private final FacilityReservationRepository facilityReservationRepository;
    private final FacilityMonthSnapshotRepository facilityMonthSnapshotRepository;
    private final FacilityBookingRepository facilityBookingRepository;
    private final FacilityCrawlService facilityCrawlService;
    private final FacilityAvailabilityPolicy availabilityPolicy;
    private final ClubRepository clubRepository;
    private final Clock clock;

    @Override
    public FacilityAvailabilityResponse getAvailability(Long facilityId, YearMonth requestedMonth) {
        YearMonth currentMonth = YearMonth.now(clock);
        YearMonth targetMonth = requestedMonth != null ? requestedMonth : currentMonth;
        if (!targetMonth.equals(currentMonth) && !targetMonth.equals(currentMonth.plusMonths(1))) {
            throw new FacilityBookingException.MonthOutOfBookingRangeException();
        }
        Facility facility = facilityRepository.findById(facilityId)
                .filter(found -> !found.isArchived())
                .orElseThrow(FacilityException.FacilityNotFoundException::new);

        DataSource source = facilityCrawlService.ensureFresh(targetMonth);

        List<CrawlSlice> crawlSlices = facilityReservationRepository
                .findByFacilityIdAndYearMonth(facility.getId(), targetMonth).stream()
                .map(reservation -> new CrawlSlice(
                        reservation.getReservationDate(), reservation.getStartTime(), reservation.getEndTime(),
                        reservation.getOrganizationName(), availabilityPolicy.classify(reservation),
                        reservation.getReservedStartTime(), reservation.getReservedEndTime()))
                .toList();

        List<BookingSlice> bookingSlices = toBookingSlices(facility.getId(), targetMonth);

        LocalDateTime currentDateTime = LocalDateTime.now(clock);
        LocalDate today = currentDateTime.toLocalDate();
        LocalTime nowTime = currentDateTime.toLocalTime();
        FacilityMonthSnapshot snapshot = facilityMonthSnapshotRepository.findByYearMonth(targetMonth).orElse(null);
        LocalDateTime crawledAt = snapshot != null ? snapshot.getCrawledAt() : null;
        boolean stale = isStale(crawledAt, snapshot != null ? snapshot.getFetchStatus() : null, source);

        return new FacilityAvailabilityResponse(
                facility.getId(),
                targetMonth.toString(),
                toKstOffset(crawledAt),
                stale,
                today,
                currentMonth.plusMonths(1).atEndOfMonth(),
                FacilitySlotAssembler.assembleDays(targetMonth, today, nowTime, crawlSlices, bookingSlices));
    }

    private List<BookingSlice> toBookingSlices(Long facilityId, YearMonth targetMonth) {
        List<FacilityBooking> bookings =
                facilityBookingRepository.findByFacilityIdAndReservationDateBetweenAndStatusIn(
                        facilityId, targetMonth.atDay(1), targetMonth.atEndOfMonth(),
                        List.of(BookingStatus.PENDING, BookingStatus.APPROVED, BookingStatus.CONFIRMED));
        Map<Long, String> clubNames = clubRepository.findAllById(
                        bookings.stream().map(booking -> booking.getClubId()).distinct().toList()).stream()
                .collect(Collectors.toMap(club -> club.getId(), club -> club.getName(), (first, second) -> first));
        return bookings.stream()
                .map(booking -> new BookingSlice(booking.getReservationDate(), booking.getStartTime(),
                        booking.getEndTime(), booking.getStatus(),
                        clubNames.getOrDefault(booking.getClubId(), "동아리")))
                .toList();
    }

    private boolean isStale(LocalDateTime crawledAt, FetchStatus fetchStatus, DataSource source) {
        if (source == DataSource.STALE_CACHE || crawledAt == null || fetchStatus != FetchStatus.SUCCESS) {
            return true;
        }
        return Duration.between(crawledAt, LocalDateTime.now(clock)).compareTo(FRESH_TTL) > 0;
    }

    private OffsetDateTime toKstOffset(LocalDateTime crawledAt) {
        // crawled_at 은 seoulClock 기준 KST wall-clock LocalDateTime 으로 저장된다 —
        // 기존 FacilityUsageResponse.toKst 와 동일한 변환(임의로 다른 변환을 만들면 +9h 오차).
        return crawledAt == null ? null : crawledAt.atZone(KST).toOffsetDateTime();
    }
}
```

(`KST` 상수와 `java.time.OffsetDateTime`/`java.time.ZoneId` import 는 위 코드에 이미 포함돼 있다 — `toKstOffset` 컴파일 필수. `FetchStatus`/`DataSource` 는 `com.duing.domain.facility.entity` 패키지에 있음을 확인했다.)

- [ ] **Step 2: Api 인터페이스·컨트롤러 작성**

`FacilityAvailabilityApi.java` (Api 인터페이스는 전 도메인 컨벤션대로 `domain/facilitybooking/api/` 에 둔다):

```java
package com.duing.domain.facilitybooking.api;

import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse;
import com.duing.domain.facilitybooking.controller.dto.response.PurposePresetResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.YearMonth;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "시설 대관 가용성", description = "시설 예약 신청용 슬롯 가용성 조회 (비로그인 포함)")
public interface FacilityAvailabilityApi {

    @Operation(summary = "월 단위 슬롯 가용성 (비로그인)",
            description = "yearMonth 생략 시 현재월. 이번 달·다음 달만 조회 가능(예약 가능 기간).")
    @GetMapping("/facilities/{facilityId}/availability")
    ResponseEntity<ApiResponse<FacilityAvailabilityResponse>> getAvailability(
            @PathVariable Long facilityId,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM") YearMonth yearMonth);

    @Operation(summary = "사용 목적 Preset 목록 (비로그인)")
    @GetMapping("/facilities/booking-purpose-presets")
    ResponseEntity<ApiResponse<List<PurposePresetResponse>>> listPurposePresets();
}
```

`PurposePresetResponse.java`:

```java
package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.entity.FacilityBookingPurposePreset;

public record PurposePresetResponse(Long id, String label) {
    public static PurposePresetResponse from(FacilityBookingPurposePreset preset) {
        return new PurposePresetResponse(preset.getId(), preset.getLabel());
    }
}
```

`FacilityAvailabilityController.java`:

```java
package com.duing.domain.facilitybooking.controller;

import com.duing.domain.facilitybooking.api.FacilityAvailabilityApi;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse;
import com.duing.domain.facilitybooking.controller.dto.response.PurposePresetResponse;
import com.duing.domain.facilitybooking.repository.FacilityBookingPurposePresetRepository;
import com.duing.domain.facilitybooking.service.FacilityAvailabilityService;
import com.duing.global.response.ApiResponse;
import java.time.Duration;
import java.time.YearMonth;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class FacilityAvailabilityController implements FacilityAvailabilityApi {

    private final FacilityAvailabilityService facilityAvailabilityService;
    private final FacilityBookingPurposePresetRepository presetRepository;

    @Override
    public ResponseEntity<ApiResponse<FacilityAvailabilityResponse>> getAvailability(
            @PathVariable Long facilityId,
            @RequestParam(required = false) YearMonth yearMonth) {
        FacilityAvailabilityResponse availability =
                facilityAvailabilityService.getAvailability(facilityId, yearMonth);
        // PENDING_HOLD·BLOCKED 가 신청/승인 직후 즉시 반영돼야 하므로 캐시 금지(설계 §10)
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(availability));
    }

    @Override
    public ResponseEntity<ApiResponse<List<PurposePresetResponse>>> listPurposePresets() {
        List<PurposePresetResponse> presets = presetRepository.findByActiveTrueOrderBySortOrderAsc().stream()
                .map(PurposePresetResponse::from)
                .toList();
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
                .body(ApiResponse.success(presets));
    }
}
```

- [ ] **Step 3: 인수 테스트 작성**

`FacilityAvailabilityAcceptanceTest.java` — 서비스 레벨 + HTTP 레벨(비로그인 200·헤더). **`@MockitoBean FacilityCrawlService`** 로 온디맨드 크롤을 차단한다(모킹하지 않으면 `ensureFresh` 가 테스트/CI 에서 실제 학교 서버로 HTTP 를 시도한다 — 모킹 전례: `FacilityOnDemandCrawlIntegrationTest` 의 `@MockitoBean SchoolFacilityClient`). HTTP 요청 방식은 기존 `AdminUrlLayerAuthorizationAcceptanceTest` 의 RestAssured 셋업을 그대로 따른다:

```java
package com.duing.domain.facilitybooking.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.service.FacilityCrawlService;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.service.FacilityAvailabilityService;
import io.restassured.RestAssured;
import java.time.Clock;
import java.time.YearMonth;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FacilityAvailabilityAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired FacilityAvailabilityService availabilityService;
    @Autowired FacilityRepository facilityRepository;

    // 서비스가 seoulClock(KST) 기준으로 당월을 계산하므로 테스트도 같은 Clock 을 써야
    // UTC CI 러너의 월 경계(매월 1일 00:00~09:00 KST)에서 결정적 실패를 피할 수 있다.
    @Autowired Clock clock;

    // 온디맨드 크롤 차단 — 실제 학교 서버 HTTP 시도를 막는다. 스냅샷이 없으므로 stale=true 로 내려간다.
    @MockitoBean FacilityCrawlService facilityCrawlService;

    @BeforeEach
    void stubCrawl() {
        RestAssured.port = port;
        given(facilityCrawlService.ensureFresh(any())).willReturn(DataSource.STALE_CACHE);
    }

    @Test
    @DisplayName("크롤 데이터가 없는 시설의 당월 가용성은 미래 날짜가 종일 AVAILABLE 이다")
    void availabilityForEmptyMonth() {
        Facility facility = facilityRepository.save(Facility.create(90001, "커뮤니티룸(T)", null, 0));

        FacilityAvailabilityResponse response =
                availabilityService.getAvailability(facility.getId(), YearMonth.now(clock));

        assertThat(response.days()).hasSize(YearMonth.now(clock).lengthOfMonth());
        assertThat(response.bookableUntil()).isEqualTo(YearMonth.now(clock).plusMonths(1).atEndOfMonth());
        assertThat(response.stale()).isTrue();
        assertThat(response.days().get(response.days().size() - 1).slots()).hasSize(13);

        FacilityAvailabilityResponse nextMonth =
                availabilityService.getAvailability(facility.getId(), YearMonth.now(clock).plusMonths(1));
        // 익월은 전 날짜가 미래이므로 크롤·예약이 없으면 매일 13슬롯 전부 신청 가능해야 한다
        assertThat(nextMonth.days()).allSatisfy(dayAvailability -> {
            assertThat(dayAvailability.availableSlotCount()).isEqualTo(13);
            assertThat(dayAvailability.slots().get(0).status())
                    .isEqualTo(FacilityAvailabilityResponse.SlotStatus.AVAILABLE);
        });
    }

    @Test
    @DisplayName("당월·익월 밖의 월 조회는 400 도메인 예외다")
    void rejectsMonthOutOfBookingRange() {
        Facility facility = facilityRepository.save(Facility.create(90002, "커뮤니티룸(T2)", null, 0));

        assertThatThrownBy(() -> availabilityService.getAvailability(facility.getId(), YearMonth.now(clock).plusMonths(2)))
                .isInstanceOf(FacilityBookingException.MonthOutOfBookingRangeException.class);
        assertThatThrownBy(() -> availabilityService.getAvailability(facility.getId(), YearMonth.now(clock).minusMonths(1)))
                .isInstanceOf(FacilityBookingException.MonthOutOfBookingRangeException.class);
    }

    @Test
    @DisplayName("가용성 GET 은 비로그인 200 + Cache-Control no-store, Preset GET 은 시드 9종을 반환한다")
    void publicEndpointsAreAccessible() {
        Facility facility = facilityRepository.save(Facility.create(90003, "커뮤니티룸(T3)", null, 0));

        // 비로그인(인증 헤더 없음) 가용성 GET → 200 + Cache-Control: no-store
        RestAssured.given()
                .when().get("/api/v1/facilities/" + facility.getId() + "/availability")
                .then()
                .statusCode(HttpStatus.OK.value())
                .header("Cache-Control", "no-store");

        // 비로그인 Preset GET → 200 + 시드 9종, 첫 라벨 "동아리 정기 모임"
        RestAssured.given()
                .when().get("/api/v1/facilities/booking-purpose-presets")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.size()", equalTo(9))
                .body("data[0].label", equalTo("동아리 정기 모임"));
    }
}
```

**존 일관성 주의:** 서비스는 `YearMonth.now(clock)`(seoulClock=KST) 로 당월을 계산하므로, 인수 테스트도 반드시 주입된 `Clock` 을 써야 한다(`YearMonth.now()` 시스템존 사용 시 UTC CI 러너의 월 경계 자정~09:00 KST 에서 결정적 실패). 세 번째 테스트의 RestAssured 검증은 `AdminUrlLayerAuthorizationAcceptanceTest` 의 포트 주입 방식을 그대로 따른다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.controller.FacilityAvailabilityAcceptanceTest"`
Expected: 3개 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking backend/src/test/java/com/duing/domain/facilitybooking
git commit -m "feat(backend): 시설 가용성·목적 preset 공개 API 추가"
```

---

### Task 7: 신청·취소 서비스 + 동아리 컨트롤러 + SecurityConfig

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/service/FacilityBookingService.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/service/GeneralFacilityBookingService.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/service/dto/command/CreateFacilityBookingCommand.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/api/ClubFacilityBookingApi.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/controller/ClubFacilityBookingController.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/controller/dto/request/CreateFacilityBookingRequest.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/controller/dto/response/CreateFacilityBookingResponse.java`
- Modify: `backend/src/main/java/com/duing/global/config/SecurityConfig.java`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/FacilityBookingServiceIntegrationTest.java`

**Interfaces:**
- Consumes: `clubAuthService.requireManager(userId, clubId)`, Task 3~5 산출물, `FacilityReservationRepository`
- Produces: `FacilityBookingService.create(CreateFacilityBookingCommand) → CreateFacilityBookingResponse 재료(record CreateResult)`, `cancel(clubId, actorId, bookingId)`; `POST /api/v1/clubs/{clubId}/facility-bookings`(201), `POST /api/v1/clubs/{clubId}/facility-bookings/{bookingId}/cancel`(204). Task 8 이 같은 서비스에 조회를 추가.

- [ ] **Step 1: 실패하는 통합 테스트 작성**

```java
package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingStatusHistoryRepository;
import com.duing.domain.facilitybooking.service.dto.command.CreateFacilityBookingCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.access.AccessDeniedException;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FacilityBookingServiceIntegrationTest extends IntegrationTestBase {

    @Autowired FacilityBookingService bookingService;
    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired FacilityBookingStatusHistoryRepository historyRepository;
    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityReservationRepository facilityReservationRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // ---------- fixtures (ApplicationStatusConcurrencyTest 패턴) ----------

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L), name + unique, "hashed",
                UserRole.STUDENT, Grade.FRESHMAN, College.IT_ENGINEERING, "미설정",
                "010-0000-0000", LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) throws Exception {
        Club club = Club.create(name + "-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Facility saveFacility() {
        return facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(1)", "1503호", 0));
    }

    private record Fixture(User leader, Club club, Facility facility) {}

    private Fixture fixture() throws Exception {
        User leader = saveUser("리더");
        Club club = saveActiveClub("대관동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        return new Fixture(leader, club, saveFacility());
    }

    private CreateFacilityBookingCommand command(Fixture fixture, LocalDate date, int startHour, int endHour) {
        return new CreateFacilityBookingCommand(fixture.club().getId(), fixture.leader().getId(),
                fixture.facility().getId(), date, LocalTime.of(startHour, 0), LocalTime.of(endHour, 0),
                "정기 합주", 15);
    }

    private LocalDate bookableDate() {
        // 오늘+3 은 항상 미래이면서 다음 달 말일 이내다(현재월의 어느 날이든 다음 달 말일까지 최소 4주 여유)
        return LocalDate.now().plusDays(3);
    }

    private void forceStatus(FacilityBooking booking, BookingStatus status) throws Exception {
        Field statusField = FacilityBooking.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(booking, status);
    }

    // ---------- tests ----------

    @Test
    @DisplayName("운영진 신청은 PENDING 으로 생성되고 생성 이력이 남는다")
    void createPendingBookingWithHistory() throws Exception {
        Fixture fixture = fixture();

        var result = bookingService.create(command(fixture, bookableDate(), 18, 20));

        FacilityBooking saved = bookingRepository.findById(result.bookingId()).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(BookingStatus.PENDING);
        assertThat(result.overlappingPendingCount()).isZero();
        var histories = historyRepository.findByBookingIdOrderByCreatedAtDesc(saved.getId());
        assertThat(histories).hasSize(1);
        assertThat(histories.get(0).getNewStatus()).isEqualTo(BookingStatus.PENDING);
        assertThat(histories.get(0).getChangedById()).isEqualTo(fixture.leader().getId());
    }

    @Test
    @DisplayName("일반 멤버(비운영진)의 신청은 AccessDenied 다")
    void rejectNonManagerApplicant() throws Exception {
        Fixture fixture = fixture();
        User member = saveUser("일반부원");
        clubMemberRepository.save(ClubMember.asMember(fixture.club(), member));

        CreateFacilityBookingCommand byMember = new CreateFacilityBookingCommand(
                fixture.club().getId(), member.getId(), fixture.facility().getId(),
                bookableDate(), LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 합주", null);

        assertThatThrownBy(() -> bookingService.create(byMember))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("크롤 점유행과 겹치면 409, 운영행과 겹치는 것은 허용된다")
    void schoolOccupiedBlocksButOperatingAllows() throws Exception {
        Fixture fixture = fixture();
        LocalDate date = bookableDate();
        // 점유행(꼬리 없음): 18~19 — schedule_seq 는 전역 UNIQUE 라 증가 시퀀스로 발급
        facilityReservationRepository.save(FacilityReservation.create(
                fixture.facility().getId(), sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(19, 0), "비호응원단", null, null, LocalDateTime.now()));
        // 운영행(꼬리 있음): 마커 9~10, 운영 09~20
        facilityReservationRepository.save(FacilityReservation.create(
                fixture.facility().getId(), sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(9, 0), LocalTime.of(10, 0), "고정관념",
                LocalTime.of(9, 0), LocalTime.of(20, 0), LocalDateTime.now()));

        assertThatThrownBy(() -> bookingService.create(command(fixture, date, 18, 20)))
                .isInstanceOf(FacilityBookingException.SlotUnavailableException.class);

        var allowed = bookingService.create(command(fixture, date, 9, 11)); // 운영행 마커 시간과 겹쳐도 OK
        assertThat(allowed.bookingId()).isNotNull();
    }

    @Test
    @DisplayName("타 동아리 PENDING 과 겹치는 신청은 허용되고 overlappingPendingCount 가 잡힌다")
    void pendingOverlapIsAllowedWithWarningCount() throws Exception {
        Fixture first = fixture();
        LocalDate date = bookableDate();
        bookingService.create(command(first, date, 18, 20));

        User otherLeader = saveUser("리더B");
        Club otherClub = saveActiveClub("다른동아리");
        clubMemberRepository.save(ClubMember.asLeader(otherClub, otherLeader));
        CreateFacilityBookingCommand overlapping = new CreateFacilityBookingCommand(
                otherClub.getId(), otherLeader.getId(), first.facility().getId(),
                date, LocalTime.of(19, 0), LocalTime.of(21, 0), "회의", null);

        var result = bookingService.create(overlapping);

        assertThat(result.overlappingPendingCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("내부 APPROVED 와 겹치면 409, 같은 동아리 중복 신청도 409 다")
    void internalBlockAndClubDuplicate() throws Exception {
        Fixture fixture = fixture();
        LocalDate date = bookableDate();
        var firstResult = bookingService.create(command(fixture, date, 18, 20));
        FacilityBooking first = bookingRepository.findById(firstResult.bookingId()).orElseThrow();

        // 같은 동아리가 겹치는 시간 재신청 → DuplicateClubBooking
        assertThatThrownBy(() -> bookingService.create(command(fixture, date, 19, 21)))
                .isInstanceOf(FacilityBookingException.DuplicateClubBookingException.class);

        // 다른 동아리는 first 가 APPROVED 가 되면 차단된다
        forceStatus(first, BookingStatus.APPROVED);
        bookingRepository.save(first);
        User otherLeader = saveUser("리더C");
        Club otherClub = saveActiveClub("차단동아리");
        clubMemberRepository.save(ClubMember.asLeader(otherClub, otherLeader));
        CreateFacilityBookingCommand blocked = new CreateFacilityBookingCommand(
                otherClub.getId(), otherLeader.getId(), fixture.facility().getId(),
                date, LocalTime.of(19, 0), LocalTime.of(21, 0), "회의", null);

        assertThatThrownBy(() -> bookingService.create(blocked))
                .isInstanceOf(FacilityBookingException.SlotUnavailableException.class);
    }

    @Test
    @DisplayName("활성 신청 10건 상한을 넘는 신청은 거부된다")
    void activeCapIsEnforced() throws Exception {
        Fixture fixture = fixture();
        LocalDate date = bookableDate();
        for (int index = 0; index < 10; index++) {
            // 같은 동아리 겹침 차단을 피해 날짜 2일 × 시간 5칸(9·11·13·15·17시)으로 분산해 상한 10건을 채운다
            LocalDate slotDate = index < 5 ? date : date.plusDays(1);
            LocalTime slotStart = LocalTime.of(9 + (index % 5) * 2, 0);
            bookingService.create(new CreateFacilityBookingCommand(
                    fixture.club().getId(), fixture.leader().getId(), fixture.facility().getId(),
                    slotDate, slotStart, slotStart.plusHours(1), "연습 " + index, null));
        }

        assertThatThrownBy(() -> bookingService.create(new CreateFacilityBookingCommand(
                fixture.club().getId(), fixture.leader().getId(), fixture.facility().getId(),
                date.plusDays(2), LocalTime.of(9, 0), LocalTime.of(10, 0), "초과 신청", null)))
                .isInstanceOf(FacilityBookingException.ActiveBookingLimitExceededException.class);
    }

    @Test
    @DisplayName("PENDING 취소는 CANCELLED + 이력, PENDING 이 아니면 409 다")
    void cancelPendingOnly() throws Exception {
        Fixture fixture = fixture();
        var result = bookingService.create(command(fixture, bookableDate(), 18, 20));

        bookingService.cancel(fixture.club().getId(), fixture.leader().getId(), result.bookingId());

        FacilityBooking cancelled = bookingRepository.findById(result.bookingId()).orElseThrow();
        assertThat(cancelled.getStatus()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(historyRepository.findByBookingIdOrderByCreatedAtDesc(result.bookingId())).hasSize(2);

        assertThatThrownBy(() -> bookingService.cancel(
                fixture.club().getId(), fixture.leader().getId(), result.bookingId()))
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);
    }

    @Test
    @DisplayName("EXCLUDE 제약 — 겹치는 두 APPROVED 는 DB 가 직접 거부한다 (승인 로직 우회 백스톱)")
    void excludeConstraintBlocksOverlappingApproved() throws Exception {
        Fixture fixture = fixture();
        LocalDate date = bookableDate();
        FacilityBooking first = FacilityBooking.request(fixture.facility().getId(), fixture.club().getId(),
                fixture.leader().getId(), date, LocalTime.of(18, 0), LocalTime.of(20, 0), "연습", null);
        forceStatus(first, BookingStatus.APPROVED);
        bookingRepository.saveAndFlush(first);

        FacilityBooking second = FacilityBooking.request(fixture.facility().getId(), fixture.club().getId(),
                fixture.leader().getId(), date, LocalTime.of(19, 0), LocalTime.of(21, 0), "연습2", null);
        forceStatus(second, BookingStatus.APPROVED);

        assertThatThrownBy(() -> bookingRepository.saveAndFlush(second))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.service.FacilityBookingServiceIntegrationTest"`
Expected: 컴파일 실패

- [ ] **Step 3: 서비스·DTO 구현**

`CreateFacilityBookingCommand.java`:

```java
package com.duing.domain.facilitybooking.service.dto.command;

import java.time.LocalDate;
import java.time.LocalTime;

public record CreateFacilityBookingCommand(
        Long clubId,
        Long actorId,
        Long facilityId,
        LocalDate date,
        LocalTime startTime,
        LocalTime endTime,
        String purpose,
        Integer attendeeCount
) {}
```

`FacilityBookingService.java`:

```java
package com.duing.domain.facilitybooking.service;

import com.duing.domain.facilitybooking.service.dto.command.CreateFacilityBookingCommand;

public interface FacilityBookingService {

    record CreateResult(Long bookingId, long overlappingPendingCount) {}

    /** 대관 신청 생성(설계 §5.1) — PENDING 겹침은 허용하고 개수만 알린다. */
    CreateResult create(CreateFacilityBookingCommand command);

    /** 신청 동아리의 PENDING 취소(설계 §5.4). */
    void cancel(Long clubId, Long actorId, Long bookingId);
}
```

`GeneralFacilityBookingService.java`:

```java
package com.duing.domain.facilitybooking.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.exception.FacilityException;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.entity.FacilityBookingStatusHistory;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingStatusHistoryRepository;
import com.duing.domain.facilitybooking.service.dto.command.CreateFacilityBookingCommand;
import java.time.YearMonth;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFacilityBookingService implements FacilityBookingService {

    private final FacilityBookingRepository facilityBookingRepository;
    private final FacilityBookingStatusHistoryRepository historyRepository;
    private final FacilityRepository facilityRepository;
    private final FacilityReservationRepository facilityReservationRepository;
    private final FacilityAvailabilityPolicy availabilityPolicy;
    private final BookingPolicyValidator bookingPolicyValidator;
    private final ClubAuthService clubAuthService;

    @Override
    @Transactional
    public CreateResult create(CreateFacilityBookingCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());
        Facility facility = facilityRepository.findById(command.facilityId())
                .orElseThrow(FacilityException.FacilityNotFoundException::new);
        if (facility.isArchived()) {
            throw new FacilityBookingException.ArchivedFacilityException();
        }

        bookingPolicyValidator.validateSlotRange(command.date(), command.startTime(), command.endTime());
        bookingPolicyValidator.validateActiveCap(facilityBookingRepository.countByClubIdAndStatusIn(
                command.clubId(), List.of(BookingStatus.PENDING, BookingStatus.APPROVED)));

        rejectIfBlockedBySchool(command);
        rejectIfBlockedInternally(command);
        rejectIfClubDuplicate(command);

        FacilityBooking booking = facilityBookingRepository.save(FacilityBooking.request(
                command.facilityId(), command.clubId(), command.actorId(),
                command.date(), command.startTime(), command.endTime(),
                command.purpose(), command.attendeeCount()));
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), null, BookingStatus.PENDING, command.actorId(), null, null));

        long overlappingPending = facilityBookingRepository.findOverlapping(
                        command.facilityId(), command.date(), List.of(BookingStatus.PENDING),
                        command.startTime(), command.endTime()).stream()
                .filter(other -> !other.getId().equals(booking.getId()))
                .count();
        return new CreateResult(booking.getId(), overlappingPending);
    }

    @Override
    @Transactional
    public void cancel(Long clubId, Long actorId, Long bookingId) {
        clubAuthService.requireManager(actorId, clubId);
        FacilityBooking booking = facilityBookingRepository.findByIdAndClubId(bookingId, clubId)
                .orElseThrow(FacilityBookingException.BookingNotFoundException::new);
        BookingStatus previousStatus = booking.getStatus();
        booking.cancelByClub();
        historyRepository.save(FacilityBookingStatusHistory.record(
                booking.getId(), previousStatus, BookingStatus.CANCELLED, actorId, null, null));
    }

    /**
     * 크롤 점유행과의 겹침 차단. 신청 시점 검증은 저장된 스냅샷 기준(온디맨드 재크롤 없음) —
     * 명백히 불가능한 신청만 거르는 1차 게이트이고, 정합성의 최종 게이트는 승인 재검증(PR2)이다(설계 §5.1).
     */
    private void rejectIfBlockedBySchool(CreateFacilityBookingCommand command) {
        boolean blocked = facilityReservationRepository
                .findByFacilityIdAndYearMonth(command.facilityId(), YearMonth.from(command.date())).stream()
                .filter(reservation -> reservation.getReservationDate().equals(command.date()))
                .filter(reservation -> availabilityPolicy.classify(reservation) == CrawlRowType.OCCUPIED)
                .anyMatch(reservation -> reservation.getStartTime().isBefore(command.endTime())
                        && reservation.getEndTime().isAfter(command.startTime()));
        if (blocked) {
            throw new FacilityBookingException.SlotUnavailableException();
        }
    }

    private void rejectIfBlockedInternally(CreateFacilityBookingCommand command) {
        boolean blocked = !facilityBookingRepository.findOverlapping(
                command.facilityId(), command.date(),
                List.of(BookingStatus.APPROVED, BookingStatus.CONFIRMED),
                command.startTime(), command.endTime()).isEmpty();
        if (blocked) {
            throw new FacilityBookingException.SlotUnavailableException();
        }
    }

    private void rejectIfClubDuplicate(CreateFacilityBookingCommand command) {
        boolean duplicate = !facilityBookingRepository.findClubOverlapping(
                command.clubId(), command.date(),
                List.of(BookingStatus.PENDING, BookingStatus.APPROVED, BookingStatus.CONFIRMED),
                command.startTime(), command.endTime()).isEmpty();
        if (duplicate) {
            throw new FacilityBookingException.DuplicateClubBookingException();
        }
    }
}
```

- [ ] **Step 4: 컨트롤러·Request DTO 구현**

`CreateFacilityBookingRequest.java`:

```java
package com.duing.domain.facilitybooking.controller.dto.request;

import com.duing.domain.facilitybooking.service.dto.command.CreateFacilityBookingCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.LocalTime;

public record CreateFacilityBookingRequest(
        @NotNull(message = "시설은 필수 입력값입니다.") Long facilityId,
        @NotNull(message = "예약 날짜는 필수 입력값입니다.") LocalDate date,
        @NotNull(message = "시작 시간은 필수 입력값입니다.") LocalTime startTime,
        @NotNull(message = "종료 시간은 필수 입력값입니다.") LocalTime endTime,
        @NotBlank(message = "사용 목적은 필수 입력값입니다.")
        @Size(max = 200, message = "사용 목적은 200자 이하로 입력해주세요.") String purpose,
        @Positive(message = "사용 인원은 1명 이상이어야 합니다.") Integer attendeeCount
) {
    public CreateFacilityBookingCommand toCommand(Long clubId, Long currentUserId) {
        return new CreateFacilityBookingCommand(clubId, currentUserId, facilityId,
                date, startTime, endTime, purpose, attendeeCount);
    }
}
```

`CreateFacilityBookingResponse.java`:

```java
package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.service.FacilityBookingService.CreateResult;

public record CreateFacilityBookingResponse(Long bookingId, BookingStatus status, long overlappingPendingCount) {
    public static CreateFacilityBookingResponse from(CreateResult result) {
        return new CreateFacilityBookingResponse(result.bookingId(), BookingStatus.PENDING,
                result.overlappingPendingCount());
    }
}
```

`ClubFacilityBookingApi.java` (Api 인터페이스는 전 도메인 컨벤션대로 `domain/facilitybooking/api/` 에 둔다):

```java
package com.duing.domain.facilitybooking.api;

import com.duing.domain.facilitybooking.controller.dto.request.CreateFacilityBookingRequest;
import com.duing.domain.facilitybooking.controller.dto.response.CreateFacilityBookingResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "시설 대관 신청(동아리)", description = "동아리 운영진(LEADER/OFFICER) 전용 대관 신청")
@SecurityRequirement(name = "BearerAuth")
public interface ClubFacilityBookingApi {

    @Operation(summary = "대관 신청 생성",
            description = "운영진 전용. PENDING 겹침은 허용되며 overlappingPendingCount 로 경고 표시용 개수를 내린다.")
    @PostMapping("/clubs/{clubId}/facility-bookings")
    ResponseEntity<ApiResponse<CreateFacilityBookingResponse>> create(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateFacilityBookingRequest createFacilityBookingRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "대관 신청 취소", description = "PENDING 상태에서만 신청 동아리가 취소할 수 있다.")
    @PostMapping("/clubs/{clubId}/facility-bookings/{bookingId}/cancel")
    ResponseEntity<ApiResponse<Void>> cancel(
            @PathVariable Long clubId,
            @PathVariable Long bookingId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);
}
```

`ClubFacilityBookingController.java`:

```java
package com.duing.domain.facilitybooking.controller;

import com.duing.domain.facilitybooking.api.ClubFacilityBookingApi;
import com.duing.domain.facilitybooking.controller.dto.request.CreateFacilityBookingRequest;
import com.duing.domain.facilitybooking.controller.dto.response.CreateFacilityBookingResponse;
import com.duing.domain.facilitybooking.service.FacilityBookingService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ClubFacilityBookingController implements ClubFacilityBookingApi {

    private final FacilityBookingService facilityBookingService;

    @Override
    public ResponseEntity<ApiResponse<CreateFacilityBookingResponse>> create(
            @PathVariable Long clubId,
            @RequestBody CreateFacilityBookingRequest createFacilityBookingRequest,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        FacilityBookingService.CreateResult result = facilityBookingService.create(
                createFacilityBookingRequest.toCommand(clubId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(CreateFacilityBookingResponse.from(result)));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> cancel(
            @PathVariable Long clubId,
            @PathVariable Long bookingId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        facilityBookingService.cancel(clubId, currentUser.id(), bookingId);
        return ResponseEntity.noContent().build();
    }
}
```

- [ ] **Step 5: SecurityConfig 매처 추가**

`SecurityConfig.java` 의 `.requestMatchers(HttpMethod.GET, "/api/v1/clubs", "/api/v1/clubs/**").permitAll()` 라인 **바로 앞**에 추가 (first-match — clubs GET permitAll 이 새 경로를 삼키지 않게):

```java
// 시설 대관 신청 — 운영진 전용 데이터이므로 GET 도 인증 필수(아래 clubs GET permitAll 보다 먼저 매칭)
.requestMatchers(HttpMethod.GET, "/api/v1/clubs/*/facility-bookings").authenticated()
.requestMatchers("/api/v1/clubs/*/facility-bookings/**").authenticated()
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.service.FacilityBookingServiceIntegrationTest"`
Expected: 8개 전부 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/duing backend/src/test/java/com/duing
git commit -m "feat(backend): 대관 신청 생성·취소 API 추가 — 운영진 권한·겹침 검증·EXCLUDE 백스톱"
```

---

### Task 8: 동아리 예약 목록·상세 API

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/FacilityBookingService.java` (+`GeneralFacilityBookingService.java`)
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/api/ClubFacilityBookingApi.java` (+`ClubFacilityBookingController.java`)
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/controller/dto/response/FacilityBookingSummaryResponse.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/controller/dto/response/FacilityBookingDetailResponse.java`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/FacilityBookingQueryIntegrationTest.java`

**Interfaces:**
- Consumes: Task 7 서비스, `FacilityRepository.findAllById`
- Produces: `GET /api/v1/clubs/{clubId}/facility-bookings?status=`(200, 최신순 — P1 미페이징: 동아리당 활성 상한 10건 + 이력 규모상 충분, 페이징은 관리자 큐와 함께 P2), `GET /api/v1/clubs/{clubId}/facility-bookings/{bookingId}`(200, 이력 포함)

- [ ] **Step 1: 실패하는 테스트 작성**

```java
package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.service.dto.command.CreateFacilityBookingCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FacilityBookingQueryIntegrationTest extends IntegrationTestBase {

    @Autowired FacilityBookingService bookingService;
    @Autowired FacilityRepository facilityRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leader;
    private Club club;
    private Facility facility;

    @BeforeEach
    void setUpFixture() throws Exception {
        long unique = sequence.getAndIncrement();
        leader = userRepository.save(User.create(String.format("%010d", unique % 10_000_000_000L),
                "리더" + unique, "hashed", UserRole.STUDENT, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
        Club created = Club.create("조회동아리-" + unique, ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        club = clubRepository.save(created);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        facility = facilityRepository.save(Facility.create((int) (unique % 100_000), "커뮤니티룸(Q)", null, 0));
    }

    private Long createBooking(int startHour, int endHour) {
        return bookingService.create(new CreateFacilityBookingCommand(club.getId(), leader.getId(),
                facility.getId(), LocalDate.now().plusDays(2), LocalTime.of(startHour, 0),
                LocalTime.of(endHour, 0), "정기 연습", null)).bookingId();
    }

    @Test
    @DisplayName("목록은 최신순으로 내려오고 status 필터·시설명이 반영된다")
    void listBookingsWithFilter() {
        Long first = createBooking(9, 10);
        Long second = createBooking(11, 12);
        bookingService.cancel(club.getId(), leader.getId(), first);

        var all = bookingService.getBookings(club.getId(), leader.getId(), null);
        assertThat(all).hasSize(2);
        assertThat(all.get(0).bookingId()).isEqualTo(second);
        assertThat(all.get(0).roomName()).isEqualTo("커뮤니티룸(Q)");

        var cancelled = bookingService.getBookings(club.getId(), leader.getId(), BookingStatus.CANCELLED);
        assertThat(cancelled).singleElement()
                .satisfies(summary -> assertThat(summary.bookingId()).isEqualTo(first));
    }

    @Test
    @DisplayName("상세는 이력을 최신순으로 포함하고, 남의 동아리 신청 조회는 NotFound 다")
    void detailIncludesHistoryAndIsClubScoped() throws Exception {
        Long bookingId = createBooking(14, 16);
        bookingService.cancel(club.getId(), leader.getId(), bookingId);

        var detail = bookingService.getBooking(club.getId(), leader.getId(), bookingId);
        assertThat(detail.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(detail.history()).hasSize(2);
        assertThat(detail.history().get(0).newStatus()).isEqualTo(BookingStatus.CANCELLED);

        // 다른 동아리 운영진이 이 신청을 조회하면 NotFound (club 스코프)
        long unique = sequence.getAndIncrement();
        User otherLeader = userRepository.save(User.create(String.format("%010d", unique % 10_000_000_000L),
                "타리더" + unique, "hashed", UserRole.STUDENT, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
        Club otherCreated = Club.create("타동아리-" + unique, ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(otherCreated, ClubStatus.ACTIVE);
        Club otherClub = clubRepository.save(otherCreated);
        clubMemberRepository.save(ClubMember.asLeader(otherClub, otherLeader));

        assertThatThrownBy(() -> bookingService.getBooking(otherClub.getId(), otherLeader.getId(), bookingId))
                .isInstanceOf(FacilityBookingException.BookingNotFoundException.class);
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.service.FacilityBookingQueryIntegrationTest"`
Expected: 컴파일 실패

- [ ] **Step 3: 구현**

`FacilityBookingService.java` 에 추가:

```java
    record BookingSummaryResult(Long bookingId, Long facilityId, String roomName,
                                java.time.LocalDate date, java.time.LocalTime startTime, java.time.LocalTime endTime,
                                BookingStatus status, String purpose, java.time.LocalDateTime createdAt) {}

    record HistoryEntry(BookingStatus previousStatus, BookingStatus newStatus,
                        String reason, java.time.LocalDateTime changedAt) {}

    record BookingDetailResult(Long bookingId, Long facilityId, String roomName,
                               java.time.LocalDate date, java.time.LocalTime startTime, java.time.LocalTime endTime,
                               BookingStatus status, String purpose, Integer attendeeCount,
                               String rejectReason, String conflictDetail,
                               java.util.List<HistoryEntry> history) {}

    /** 동아리 신청 목록(최신순). status null=전체. */
    java.util.List<BookingSummaryResult> getBookings(Long clubId, Long actorId, BookingStatus status);

    /** 신청 상세 + 상태 이력(최신순). club 스코프 밖이면 NotFound. */
    BookingDetailResult getBooking(Long clubId, Long actorId, Long bookingId);
```

(import 는 파일 상단으로 정리한다 — `BookingStatus`, `LocalDate`, `LocalTime`, `LocalDateTime`, `List`.)

`GeneralFacilityBookingService.java` 에 추가:

```java
    @Override
    public List<BookingSummaryResult> getBookings(Long clubId, Long actorId, BookingStatus status) {
        clubAuthService.requireManager(actorId, clubId);
        List<FacilityBooking> bookings = status != null
                ? facilityBookingRepository.findByClubIdAndStatusOrderByCreatedAtDesc(clubId, status)
                : facilityBookingRepository.findByClubIdOrderByCreatedAtDesc(clubId);
        Map<Long, String> roomNames = roomNames(bookings);
        return bookings.stream()
                .map(booking -> new BookingSummaryResult(booking.getId(), booking.getFacilityId(),
                        roomNames.getOrDefault(booking.getFacilityId(), ""), booking.getReservationDate(),
                        booking.getStartTime(), booking.getEndTime(), booking.getStatus(),
                        booking.getPurpose(), booking.getCreatedAt()))
                .toList();
    }

    @Override
    public BookingDetailResult getBooking(Long clubId, Long actorId, Long bookingId) {
        clubAuthService.requireManager(actorId, clubId);
        FacilityBooking booking = facilityBookingRepository.findByIdAndClubId(bookingId, clubId)
                .orElseThrow(FacilityBookingException.BookingNotFoundException::new);
        String roomName = facilityRepository.findById(booking.getFacilityId())
                .map(Facility::getRoomName).orElse("");
        List<HistoryEntry> history = historyRepository.findByBookingIdOrderByCreatedAtDesc(bookingId).stream()
                .map(entry -> new HistoryEntry(entry.getPreviousStatus(), entry.getNewStatus(),
                        entry.getReason(), entry.getCreatedAt()))
                .toList();
        return new BookingDetailResult(booking.getId(), booking.getFacilityId(), roomName,
                booking.getReservationDate(), booking.getStartTime(), booking.getEndTime(),
                booking.getStatus(), booking.getPurpose(), booking.getAttendeeCount(),
                booking.getRejectReason(), booking.getConflictDetail(), history);
    }

    private Map<Long, String> roomNames(List<FacilityBooking> bookings) {
        return facilityRepository.findAllById(
                        bookings.stream().map(FacilityBooking::getFacilityId).distinct().toList()).stream()
                .collect(Collectors.toMap(Facility::getId, Facility::getRoomName, (first, second) -> first));
    }
```

(추가 import: `java.util.Map`, `java.util.stream.Collectors`.)

Response DTO 2종 — `FacilityBookingSummaryResponse.java`:

```java
package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.service.FacilityBookingService.BookingSummaryResult;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

public record FacilityBookingSummaryResponse(
        Long bookingId, Long facilityId, String roomName,
        LocalDate date, LocalTime startTime, LocalTime endTime,
        BookingStatus status, String purpose, LocalDateTime createdAt
) {
    public static FacilityBookingSummaryResponse from(BookingSummaryResult result) {
        return new FacilityBookingSummaryResponse(result.bookingId(), result.facilityId(), result.roomName(),
                result.date(), result.startTime(), result.endTime(), result.status(),
                result.purpose(), result.createdAt());
    }
}
```

`FacilityBookingDetailResponse.java`:

```java
package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.service.FacilityBookingService.BookingDetailResult;
import com.duing.domain.facilitybooking.service.FacilityBookingService.HistoryEntry;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

public record FacilityBookingDetailResponse(
        Long bookingId, Long facilityId, String roomName,
        LocalDate date, LocalTime startTime, LocalTime endTime,
        BookingStatus status, String purpose,
        @JsonInclude(JsonInclude.Include.NON_NULL) Integer attendeeCount,
        @JsonInclude(JsonInclude.Include.NON_NULL) String rejectReason,
        @JsonInclude(JsonInclude.Include.NON_NULL) String conflictDetail,
        List<HistoryItem> history
) {
    public record HistoryItem(BookingStatus previousStatus, BookingStatus newStatus,
                              String reason, LocalDateTime changedAt) {
        static HistoryItem from(HistoryEntry entry) {
            return new HistoryItem(entry.previousStatus(), entry.newStatus(), entry.reason(), entry.changedAt());
        }
    }

    public static FacilityBookingDetailResponse from(BookingDetailResult result) {
        return new FacilityBookingDetailResponse(result.bookingId(), result.facilityId(), result.roomName(),
                result.date(), result.startTime(), result.endTime(), result.status(), result.purpose(),
                result.attendeeCount(), result.rejectReason(), result.conflictDetail(),
                result.history().stream().map(HistoryItem::from).toList());
    }
}
```

`ClubFacilityBookingApi.java` 에 추가:

```java
    @Operation(summary = "동아리 대관 신청 목록", description = "운영진 전용. 최신순, status 로 필터 가능.")
    @GetMapping("/clubs/{clubId}/facility-bookings")
    ResponseEntity<ApiResponse<List<FacilityBookingSummaryResponse>>> getBookings(
            @PathVariable Long clubId,
            @RequestParam(required = false) BookingStatus status,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "대관 신청 상세", description = "운영진 전용. 상태 이력(최신순) 포함.")
    @GetMapping("/clubs/{clubId}/facility-bookings/{bookingId}")
    ResponseEntity<ApiResponse<FacilityBookingDetailResponse>> getBooking(
            @PathVariable Long clubId,
            @PathVariable Long bookingId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);
```

(import 추가: `GetMapping`, `RequestParam`, `List`, `BookingStatus`, 두 Response.)

`ClubFacilityBookingController.java` 에 추가:

```java
    @Override
    public ResponseEntity<ApiResponse<List<FacilityBookingSummaryResponse>>> getBookings(
            @PathVariable Long clubId,
            @RequestParam(required = false) BookingStatus status,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        List<FacilityBookingSummaryResponse> bookings =
                facilityBookingService.getBookings(clubId, currentUser.id(), status).stream()
                        .map(FacilityBookingSummaryResponse::from)
                        .toList();
        return ResponseEntity.ok(ApiResponse.success(bookings));
    }

    @Override
    public ResponseEntity<ApiResponse<FacilityBookingDetailResponse>> getBooking(
            @PathVariable Long clubId,
            @PathVariable Long bookingId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        return ResponseEntity.ok(ApiResponse.success(FacilityBookingDetailResponse.from(
                facilityBookingService.getBooking(clubId, currentUser.id(), bookingId))));
    }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facilitybooking.service.FacilityBookingQueryIntegrationTest"`
Expected: 2개 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking backend/src/test/java/com/duing/domain/facilitybooking
git commit -m "feat(backend): 동아리 대관 신청 목록·상세 API 추가"
```

---

### Task 9: 전체 검증

- [ ] **Step 1: 전체 빌드 + 전체 테스트**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew build`
Expected: `BUILD SUCCESSFUL` (출력 끝 확인 — 파이프로 가리지 말 것). 실패 시 해당 테스트를 열어 수정하고 재실행.

- [ ] **Step 2: 회귀 확인 포인트**

- `RowLevelSecurityMigrationTest` PASS (3개 신규 테이블 RLS)
- 기존 facility 도메인 테스트 전부 PASS (크롤 인프라 무변경 확인)
- SecurityConfig 관련 기존 인수 테스트 PASS (매처 추가가 기존 규칙을 깨지 않음)

- [ ] **Step 3: 미커밋 변경 확인 후 마무리**

Run: `git status --short`
Expected: clean. 남은 변경이 있으면 해당 Task 의 커밋에 포함시킨다.

---

## Out of Scope (PR2 이후)

- 관리자 승인·거절·수동확정·충돌·취소 API + 승인 재검증(시설 행 잠금) — PR2
- CONFIRMED 매칭 잡(`FacilityBookingMatchingScheduler`) + `OrganizationNameNormalizer` — PR2
- 관리자 큐·Summary API(#6·7·13) — PR2
- 인앱 알림, 겹침 PENDING 자동 거절 — P2
- 프론트엔드 전체 — PR3~
