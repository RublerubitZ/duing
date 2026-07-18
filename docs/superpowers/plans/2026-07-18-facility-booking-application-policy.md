# 시설 예약 신청 마감·권한 정책 + BookingApplicationPolicy 통합 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시설 예약 신청에 "사용일 전날 12:00(KST) 마감"·"중앙동아리 회장/운영진만" 정책을 추가하고, 신청 비즈니스 정책을 `BookingApplicationPolicy` 단일 진입점으로 통합한다.

**Architecture:** 백엔드는 facade(`BookingApplicationPolicy`)가 반월 창(기존 `HalfMonthBookingWindowPolicy` 무수정)→마감→중앙동아리→역할 순으로 검증하고, `BookingPolicyValidator`는 기술 검증(그리드·당일·상한) 전담으로 남는다. 프론트는 서버 결과 소비 + 표시용 마감 힌트 + `ManagedClub.centralClub` 필터만 추가한다. DB 마이그레이션 없음.

**Tech Stack:** Spring Boot 3.4 / Java 21 / JUnit5 + Testcontainers, Next.js 15 / React 19 / Vitest + MSW

**Spec:** `docs/superpowers/specs/2026-07-18-facility-booking-application-policy-design.md` (필독)

## Global Constraints

- 커밋 메시지: 한국어 Conventional Commits (`feat(backend): ...` / `test(frontend): ...`). `[#이슈번호]` 형식·Co-Authored-By/🤖 Generated 라인 **절대 금지**.
- **push·PR 생성 금지** — 구현자는 로컬 커밋까지만. 리뷰 후 메인 세션이 처리한다.
- 오류 계약 (변경 금지, 그대로 사용):
  - 400 `FACILITY_BOOKING_DEADLINE_PASSED` "시설 사용일 전날 12:00까지만 신청할 수 있어요."
  - 403 `FACILITY_BOOKING_CENTRAL_CLUB_ONLY` "시설 예약은 중앙동아리만 신청할 수 있어요."
  - 403 `FACILITY_BOOKING_PERMISSION_DENIED` "회장 또는 운영진만 시설 예약을 신청할 수 있어요."
- 마감 경계: 분 단위 — `now < D-1일 12:01:00` 허용(12:00:59까지 OK), 이후 거부. 당일 신청은 항상 마감.
- 기존 반월 정책(`HalfMonthBookingWindowPolicy`·`BookingWindowPolicy`·`BookingWindowConfig`·`BookingWindow`)은 **한 줄도 수정 금지**.
- cancel/list/detail·상태머신·승인·크롤링·availability 응답 스키마 무변경.
- 변수명 역할 노출 (`dto`/`r`/`e` 금지), FE는 `any`/`as` 금지·`type` 사용.
- 백엔드 빌드는 `backend/` cwd에서 `./gradlew`, 프론트는 `frontend/` cwd에서 `pnpm`. `| tail` 파이프 금지(exit code 가림) — 출력에서 BUILD SUCCESSFUL/실패를 직접 확인.
- 테스트 날짜는 상대 날짜만(하드코딩 미래 절대 날짜 = CI 타임밤). 고정 시각이 필요하면 `Clock.fixed`(BE) / 명시적 `now` 파라미터·`vi.setSystemTime`(FE).

---

### Task 1: 백엔드 — 신규 예외 3종 + 개별 정책 클래스 3종 (TDD)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/exception/FacilityBookingException.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/service/BookingDeadlinePolicy.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/service/ClubEligibilityPolicy.java`
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/service/BookingRolePolicy.java`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/BookingDeadlinePolicyTest.java`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/BookingApplicationPermissionPolicyTest.java` (eligibility+role 묶음)

**Interfaces:**
- Produces: `BookingDeadlinePolicy.validate(LocalDate reservationDate, LocalDateTime now)` → throws `DeadlinePassedException`
- Produces: `ClubEligibilityPolicy.validate(Club club)` → throws `CentralClubOnlyException`
- Produces: `BookingRolePolicy.validate(ClubMember applicant)` → throws `PermissionDeniedException`
- Produces: 예외 3종 — 각각 `public static final String CODE` 상수 보유, `getCode()`로 노출(기존 `SlotUnavailableException` 패턴)

- [ ] **Step 1: 실패하는 테스트 작성**

`BookingDeadlinePolicyTest.java`:

```java
package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BookingDeadlinePolicyTest {

    private final BookingDeadlinePolicy deadlinePolicy = new BookingDeadlinePolicy();

    // 사용일 D 의 마감 = D-1 12:01(KST) 미만까지 허용 — 분 단위 경계(12:00:59 허용, 12:01:00 거부)
    private static final LocalDate USE_DATE = LocalDate.of(2026, 7, 20);

    @Test
    @DisplayName("사용일 전날 12:00:59까지는 신청할 수 있다")
    void allowsUntilNoonOfPreviousDay() {
        assertThatCode(() -> deadlinePolicy.validate(USE_DATE,
                LocalDateTime.of(2026, 7, 19, 11, 59, 0))).doesNotThrowAnyException();
        assertThatCode(() -> deadlinePolicy.validate(USE_DATE,
                LocalDateTime.of(2026, 7, 19, 12, 0, 59))).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("사용일 전날 12:01:00부터는 신청이 마감된다")
    void rejectsFromTwelveOhOne() {
        assertThatThrownBy(() -> deadlinePolicy.validate(USE_DATE,
                LocalDateTime.of(2026, 7, 19, 12, 1, 0)))
                .isInstanceOf(FacilityBookingException.DeadlinePassedException.class)
                .hasMessage("시설 사용일 전날 12:00까지만 신청할 수 있어요.");
    }

    @Test
    @DisplayName("당일 사용 신청은 시각과 무관하게 항상 마감이다")
    void sameDayIsAlwaysPastDeadline() {
        assertThatThrownBy(() -> deadlinePolicy.validate(USE_DATE,
                LocalDateTime.of(2026, 7, 20, 0, 0, 1)))
                .isInstanceOf(FacilityBookingException.DeadlinePassedException.class);
    }

    @Test
    @DisplayName("이틀 이상 남은 사용일은 언제든 신청할 수 있다")
    void twoDaysAheadIsAlwaysOpen() {
        assertThatCode(() -> deadlinePolicy.validate(USE_DATE,
                LocalDateTime.of(2026, 7, 18, 23, 59, 59))).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("마감 예외는 FACILITY_BOOKING_DEADLINE_PASSED 코드를 갖는다")
    void deadlineExceptionCarriesCode() {
        assertThatThrownBy(() -> deadlinePolicy.validate(USE_DATE,
                LocalDateTime.of(2026, 7, 20, 10, 0)))
                .isInstanceOfSatisfying(FacilityBookingException.DeadlinePassedException.class,
                        exception -> org.assertj.core.api.Assertions.assertThat(exception.getCode())
                                .isEqualTo("FACILITY_BOOKING_DEADLINE_PASSED"));
    }
}
```

`BookingApplicationPermissionPolicyTest.java`:

```java
package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BookingApplicationPermissionPolicyTest {

    private final ClubEligibilityPolicy eligibilityPolicy = new ClubEligibilityPolicy();
    private final BookingRolePolicy rolePolicy = new BookingRolePolicy();

    private static Club centralClub() {
        return Club.create("중앙동아리", ClubCategory.OTHER, "분과", "설명", null, true, null);
    }

    private static Club generalClub() {
        return Club.create("일반동아리", ClubCategory.OTHER, "분과", "설명", null);
    }

    @Test
    @DisplayName("중앙동아리는 신청 자격이 있고 일반동아리는 CENTRAL_CLUB_ONLY 로 거부된다")
    void onlyCentralClubIsEligible() {
        assertThatCode(() -> eligibilityPolicy.validate(centralClub())).doesNotThrowAnyException();
        assertThatThrownBy(() -> eligibilityPolicy.validate(generalClub()))
                .isInstanceOfSatisfying(FacilityBookingException.CentralClubOnlyException.class,
                        exception -> assertThat(exception.getCode())
                                .isEqualTo("FACILITY_BOOKING_CENTRAL_CLUB_ONLY"));
    }

    @Test
    @DisplayName("회장과 운영진은 신청할 수 있고 일반회원은 PERMISSION_DENIED 로 거부된다")
    void onlyLeaderAndOfficerCanApply() {
        Club club = centralClub();
        assertThatCode(() -> rolePolicy.validate(
                ClubMember.of(club, UserFixture.unique(), ClubMemberRole.LEADER))).doesNotThrowAnyException();
        assertThatCode(() -> rolePolicy.validate(
                ClubMember.of(club, UserFixture.unique(), ClubMemberRole.OFFICER))).doesNotThrowAnyException();
        assertThatThrownBy(() -> rolePolicy.validate(
                ClubMember.of(club, UserFixture.unique(), ClubMemberRole.MEMBER)))
                .isInstanceOfSatisfying(FacilityBookingException.PermissionDeniedException.class,
                        exception -> assertThat(exception.getCode())
                                .isEqualTo("FACILITY_BOOKING_PERMISSION_DENIED"));
    }
}
```

- [ ] **Step 2: 실패 확인**

Run(cwd `backend/`): `./gradlew test --tests "BookingDeadlinePolicyTest" --tests "BookingApplicationPermissionPolicyTest"`
Expected: 컴파일 실패 (클래스 미존재)

- [ ] **Step 3: 최소 구현**

`FacilityBookingException.java` — `ArchivedFacilityConflictException` 클래스 뒤에 추가:

```java
    /** 신청 마감(설계 spec 2026-07-18 §1) — 사용일 전날 12:01(KST)부터 거부. */
    public static class DeadlinePassedException extends FacilityBookingException {
        public static final String CODE = "FACILITY_BOOKING_DEADLINE_PASSED";

        public DeadlinePassedException() {
            super("시설 사용일 전날 12:00까지만 신청할 수 있어요.", HttpStatus.BAD_REQUEST, CODE);
        }
    }

    /** 신청 자격(설계 spec 2026-07-18 §2) — 중앙동아리만 신청 가능. */
    public static class CentralClubOnlyException extends FacilityBookingException {
        public static final String CODE = "FACILITY_BOOKING_CENTRAL_CLUB_ONLY";

        public CentralClubOnlyException() {
            super("시설 예약은 중앙동아리만 신청할 수 있어요.", HttpStatus.FORBIDDEN, CODE);
        }
    }

    /** 신청 권한(설계 spec 2026-07-18 §2) — create 한정 역할 거부. 조회·취소는 기존 AccessDenied 유지. */
    public static class PermissionDeniedException extends FacilityBookingException {
        public static final String CODE = "FACILITY_BOOKING_PERMISSION_DENIED";

        public PermissionDeniedException() {
            super("회장 또는 운영진만 시설 예약을 신청할 수 있어요.", HttpStatus.FORBIDDEN, CODE);
        }
    }
```

`BookingDeadlinePolicy.java`:

```java
package com.duing.domain.facilitybooking.service;

import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * 신청 마감 정책 — 사용일 전날 12:00(KST)까지만 신청 가능. 분 단위 경계: 12:00:59 허용,
 * 12:01:00부터 거부(설계 spec 2026-07-18 §1). 당일 사용 신청은 정의상 항상 마감이다.
 * Clock 은 조합 진입점(BookingApplicationPolicy)이 보유하고 여기는 순수 판정만 한다.
 */
public class BookingDeadlinePolicy {

    private static final LocalTime CUTOFF_EXCLUSIVE = LocalTime.of(12, 1);

    public void validate(LocalDate reservationDate, LocalDateTime now) {
        LocalDateTime applicationDeadline = reservationDate.minusDays(1).atTime(CUTOFF_EXCLUSIVE);
        if (!now.isBefore(applicationDeadline)) {
            throw new FacilityBookingException.DeadlinePassedException();
        }
    }
}
```

`ClubEligibilityPolicy.java`:

```java
package com.duing.domain.facilitybooking.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;

/** 신청 자격 정책 — 중앙동아리(Club.centralClub)만 시설 예약을 신청할 수 있다(설계 spec 2026-07-18 §2). */
public class ClubEligibilityPolicy {

    public void validate(Club club) {
        if (!club.isCentralClub()) {
            throw new FacilityBookingException.CentralClubOnlyException();
        }
    }
}
```

`BookingRolePolicy.java`:

```java
package com.duing.domain.facilitybooking.service;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;

/**
 * 신청 역할 정책 — 회장(LEADER)/운영진(OFFICER)만 신청 가능(설계 spec 2026-07-18 §2).
 * create 경로 한정 — 조회·취소의 역할 거부는 기존 ClubAuthService.requireManager(AccessDenied)를 유지한다.
 */
public class BookingRolePolicy {

    public void validate(ClubMember applicant) {
        if (!applicant.canManageClub()) {
            throw new FacilityBookingException.PermissionDeniedException();
        }
    }
}
```

- [ ] **Step 4: 통과 확인**

Run(cwd `backend/`): `./gradlew test --tests "BookingDeadlinePolicyTest" --tests "BookingApplicationPermissionPolicyTest"`
Expected: PASS (BUILD SUCCESSFUL)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking backend/src/test/java/com/duing/domain/facilitybooking
git commit -m "feat(backend): 시설 예약 신청 마감·자격·역할 정책 클래스 및 예외 3종 추가"
```

---

### Task 2: 백엔드 — BookingApplicationPolicy facade (TDD)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facilitybooking/service/BookingApplicationPolicy.java`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/BookingApplicationPolicyTest.java`

**Interfaces:**
- Consumes: Task 1 의 3개 정책 클래스 + 기존 `BookingWindowPolicy.windowFor(LocalDate)` (무수정)
- Produces: `BookingApplicationPolicy.validateApplication(Club club, ClubMember applicant, LocalDate reservationDate)` — 반월→마감→중앙→역할 순 검증, 첫 실패 예외만 throw
- Produces: `BookingApplicationPolicy.windowFor(LocalDate today)` → `BookingWindow` (내부 위임) — Task 3 의 availability 서비스가 사용

- [ ] **Step 1: 실패하는 테스트 작성**

`BookingApplicationPolicyTest.java` — 기존 `BookingPolicyValidatorTest` 의 고정 Clock 패턴 재사용. 반월 창 검증이 facade 로 이관되므로 창 케이스도 여기서 커버한다:

```java
package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BookingApplicationPolicyTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    // KST 2026-01-10 12:30 — 반월 창 = 1/10 ~ 1/31. 12:01 이후라 익일(1/11) 사용분은 마감 상태.
    private static final Clock FIRST_HALF_AFTERNOON = Clock.fixed(Instant.parse("2026-01-10T03:30:00Z"), SEOUL);
    // KST 2026-01-10 12:00:59 — 마감 경계 직전(익일 사용분 아직 신청 가능)
    private static final Clock BOUNDARY_ALLOWED = Clock.fixed(Instant.parse("2026-01-10T03:00:59Z"), SEOUL);
    // KST 2026-01-10 12:01:00 — 마감 경계 도달
    private static final Clock BOUNDARY_REJECTED = Clock.fixed(Instant.parse("2026-01-10T03:01:00Z"), SEOUL);
    // KST 2026-01-20 12:30 — 하반기 창 = 1/20 ~ 2/15
    private static final Clock SECOND_HALF = Clock.fixed(Instant.parse("2026-01-20T03:30:00Z"), SEOUL);

    private final BookingWindowPolicy windowPolicy = new HalfMonthBookingWindowPolicy(15);

    private BookingApplicationPolicy policyAt(Clock clock) {
        return new BookingApplicationPolicy(clock, windowPolicy);
    }

    private static Club centralClub() {
        return Club.create("중앙동아리", ClubCategory.OTHER, "분과", "설명", null, true, null);
    }

    private static Club generalClub() {
        return Club.create("일반동아리", ClubCategory.OTHER, "분과", "설명", null);
    }

    private static ClubMember memberOf(Club club, ClubMemberRole role) {
        return ClubMember.of(club, UserFixture.unique(), role);
    }

    @Test
    @DisplayName("중앙동아리 회장·운영진은 마감 전 창 내부 날짜를 신청할 수 있다")
    void centralManagerWithinWindowBeforeDeadlinePasses() {
        BookingApplicationPolicy policy = policyAt(FIRST_HALF_AFTERNOON);
        Club club = centralClub();
        assertThatCode(() -> policy.validateApplication(club,
                memberOf(club, ClubMemberRole.LEADER), LocalDate.of(2026, 1, 12)))
                .doesNotThrowAnyException();
        assertThatCode(() -> policy.validateApplication(club,
                memberOf(club, ClubMemberRole.OFFICER), LocalDate.of(2026, 1, 31)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("상반기에는 창(오늘~당월 말일) 밖 날짜가 거부되고 메시지에 구간이 담긴다")
    void firstHalfWindowBoundsAreEnforced() {
        BookingApplicationPolicy policy = policyAt(FIRST_HALF_AFTERNOON);
        Club club = centralClub();
        ClubMember leader = memberOf(club, ClubMemberRole.LEADER);
        assertThatThrownBy(() -> policy.validateApplication(club, leader, LocalDate.of(2026, 1, 9)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
        assertThatThrownBy(() -> policy.validateApplication(club, leader, LocalDate.of(2026, 2, 1)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class)
                .hasMessageContaining("1월 10일")
                .hasMessageContaining("1월 31일");
    }

    @Test
    @DisplayName("하반기에는 익월 상반기 말일(15일)까지 신청할 수 있고 그 이후는 거부된다")
    void secondHalfWindowBoundsAreEnforced() {
        BookingApplicationPolicy policy = policyAt(SECOND_HALF);
        Club club = centralClub();
        ClubMember leader = memberOf(club, ClubMemberRole.LEADER);
        assertThatCode(() -> policy.validateApplication(club, leader, LocalDate.of(2026, 2, 15)))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> policy.validateApplication(club, leader, LocalDate.of(2026, 2, 16)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
    }

    @Test
    @DisplayName("당일과 마감 지난 익일 사용분은 DEADLINE_PASSED 로 거부된다")
    void sameDayAndPastDeadlineTomorrowAreRejected() {
        BookingApplicationPolicy policy = policyAt(FIRST_HALF_AFTERNOON); // 12:30
        Club club = centralClub();
        ClubMember leader = memberOf(club, ClubMemberRole.LEADER);
        assertThatThrownBy(() -> policy.validateApplication(club, leader, LocalDate.of(2026, 1, 10)))
                .isInstanceOf(FacilityBookingException.DeadlinePassedException.class);
        assertThatThrownBy(() -> policy.validateApplication(club, leader, LocalDate.of(2026, 1, 11)))
                .isInstanceOf(FacilityBookingException.DeadlinePassedException.class);
    }

    @Test
    @DisplayName("마감 경계 — 전날 12:00:59에는 신청되고 12:01:00에는 거부된다")
    void deadlineBoundaryIsMinutePrecise() {
        Club club = centralClub();
        ClubMember leader = memberOf(club, ClubMemberRole.LEADER);
        LocalDate tomorrow = LocalDate.of(2026, 1, 11);
        assertThatCode(() -> policyAt(BOUNDARY_ALLOWED).validateApplication(club, leader, tomorrow))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> policyAt(BOUNDARY_REJECTED).validateApplication(club, leader, tomorrow))
                .isInstanceOf(FacilityBookingException.DeadlinePassedException.class);
    }

    @Test
    @DisplayName("오류 우선순위 — 창 밖이면 자격·권한 문제보다 창 오류가 먼저다")
    void windowErrorPrecedesPermissionErrors() {
        BookingApplicationPolicy policy = policyAt(FIRST_HALF_AFTERNOON);
        Club general = generalClub();
        assertThatThrownBy(() -> policy.validateApplication(general,
                memberOf(general, ClubMemberRole.MEMBER), LocalDate.of(2026, 2, 1)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
    }

    @Test
    @DisplayName("오류 우선순위 — 마감된 날짜면 자격·권한 문제보다 마감 오류가 먼저다")
    void deadlineErrorPrecedesPermissionErrors() {
        BookingApplicationPolicy policy = policyAt(FIRST_HALF_AFTERNOON);
        Club general = generalClub();
        assertThatThrownBy(() -> policy.validateApplication(general,
                memberOf(general, ClubMemberRole.MEMBER), LocalDate.of(2026, 1, 10)))
                .isInstanceOf(FacilityBookingException.DeadlinePassedException.class);
    }

    @Test
    @DisplayName("오류 우선순위 — 날짜가 유효하면 중앙동아리 자격이 역할보다 먼저다")
    void eligibilityErrorPrecedesRoleError() {
        BookingApplicationPolicy policy = policyAt(FIRST_HALF_AFTERNOON);
        Club general = generalClub();
        assertThatThrownBy(() -> policy.validateApplication(general,
                memberOf(general, ClubMemberRole.MEMBER), LocalDate.of(2026, 1, 12)))
                .isInstanceOf(FacilityBookingException.CentralClubOnlyException.class);
    }

    @Test
    @DisplayName("날짜·자격이 유효한 중앙동아리 일반회원은 PERMISSION_DENIED 로 거부된다")
    void centralClubMemberIsRejectedByRole() {
        BookingApplicationPolicy policy = policyAt(FIRST_HALF_AFTERNOON);
        Club club = centralClub();
        assertThatThrownBy(() -> policy.validateApplication(club,
                memberOf(club, ClubMemberRole.MEMBER), LocalDate.of(2026, 1, 12)))
                .isInstanceOf(FacilityBookingException.PermissionDeniedException.class);
    }

    @Test
    @DisplayName("windowFor 는 반월 정책 계산을 그대로 위임한다")
    void windowForDelegatesToWindowPolicy() {
        BookingApplicationPolicy policy = policyAt(FIRST_HALF_AFTERNOON);
        org.assertj.core.api.Assertions.assertThat(policy.windowFor(LocalDate.of(2026, 1, 10)))
                .isEqualTo(windowPolicy.windowFor(LocalDate.of(2026, 1, 10)));
    }
}
```

- [ ] **Step 2: 실패 확인**

Run(cwd `backend/`): `./gradlew test --tests "BookingApplicationPolicyTest"`
Expected: 컴파일 실패 (BookingApplicationPolicy 미존재)

- [ ] **Step 3: 최소 구현**

`BookingApplicationPolicy.java`:

```java
package com.duing.domain.facilitybooking.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.springframework.stereotype.Component;

/**
 * 예약 신청 비즈니스 정책의 단일 진입점(Facade/Orchestrator, 설계 spec 2026-07-18) —
 * 정책을 직접 구현하지 않고 조합·검증 순서만 관리한다. 순서 = 오류 우선순위:
 * ① 반월 창 → ② 신청 마감 → ③ 중앙동아리 → ④ 역할. 첫 실패의 예외만 던진다(다중 오류 미반환).
 * 날짜 정책이 권한보다 먼저다 — 사용자에게 먼저 알릴 것은 "신청 가능한 날짜인지"이기 때문.
 *
 * <p>새 정책(시험기간·시설별·관리자 예외 등)은 내부 정책 클래스를 추가하고 이 조합만 확장한다 —
 * 호출부(Service·Availability)는 불변. 기술적 검증(슬롯 그리드·당일·활성 상한)은
 * BookingPolicyValidator 소관으로 여기 두지 않는다. 엔티티 로드는 호출부 책임(정책은 순수 판정).
 */
@Component
public class BookingApplicationPolicy {

    private final Clock clock;
    private final BookingWindowPolicy bookingWindowPolicy;
    private final BookingDeadlinePolicy deadlinePolicy = new BookingDeadlinePolicy();
    private final ClubEligibilityPolicy eligibilityPolicy = new ClubEligibilityPolicy();
    private final BookingRolePolicy rolePolicy = new BookingRolePolicy();

    public BookingApplicationPolicy(Clock clock, BookingWindowPolicy bookingWindowPolicy) {
        this.clock = clock;
        this.bookingWindowPolicy = bookingWindowPolicy;
    }

    public void validateApplication(Club club, ClubMember applicant, LocalDate reservationDate) {
        LocalDateTime now = LocalDateTime.now(clock);
        BookingWindow window = bookingWindowPolicy.windowFor(now.toLocalDate());
        if (!window.contains(reservationDate)) {
            throw new FacilityBookingException.OutOfBookingWindowException(window);
        }
        deadlinePolicy.validate(reservationDate, now);
        eligibilityPolicy.validate(club);
        rolePolicy.validate(applicant);
    }

    /** 반월 창 계산 접근자 — 가용성·윈도우 API 도 이 진입점만 사용한다(BookingWindowPolicy 직접 주입 금지). */
    public BookingWindow windowFor(LocalDate today) {
        return bookingWindowPolicy.windowFor(today);
    }
}
```

- [ ] **Step 4: 통과 확인**

Run(cwd `backend/`): `./gradlew test --tests "BookingApplicationPolicyTest"`
Expected: PASS (BUILD SUCCESSFUL)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking backend/src/test/java/com/duing/domain/facilitybooking
git commit -m "feat(backend): 예약 신청 정책 단일 진입점 BookingApplicationPolicy 추가"
```

---

### Task 3: 백엔드 — 서비스·검증기·가용성 배선 전환 + 기존 테스트 회귀 수정

이 태스크는 "스위치 전환"이다 — 배선과 기존 테스트 수정을 한 번에 해야 태스크 종료 시점에 전체 그린이 된다.

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/BookingPolicyValidator.java:38-43`
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/GeneralFacilityBookingService.java:45-68`
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/GeneralFacilityAvailabilityService.java:58,91,105`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/service/ClubAuthService.java:96-104` (javadoc만)
- Modify: `backend/src/test/java/com/duing/common/fixture/BookingWindowFixture.java:27-34`
- Modify: `backend/src/test/java/com/duing/domain/facilitybooking/service/BookingPolicyValidatorTest.java` (창 케이스 삭제)
- Modify: `backend/src/test/java/com/duing/domain/facilitybooking/service/FacilityBookingServiceIntegrationTest.java`
- Modify(중앙동아리 플래그만): `FacilityBookingQueryIntegrationTest.java`, `FacilityBookingAdminServiceIntegrationTest.java`, `FacilityBookingAdminQueryIntegrationTest.java`, `FacilityBookingNotificationIntegrationTest.java`, `AdminFacilityBookingAcceptanceTest.java`(controller/), `FacilityBookingMatchingSchedulerIntegrationTest.java`(scheduler/), `FacilityBookingMatchingFailureIsolationTest.java`(scheduler/)

**Interfaces:**
- Consumes: `BookingApplicationPolicy.validateApplication(Club, ClubMember, LocalDate)` / `.windowFor(LocalDate)` (Task 2)
- Consumes: 기존 `ClubAuthService.resolveMembership(Long userId, Long clubId)` → `ClubMember` (비회원 시 `ClubMemberException.NotAMember`)
- Produces: create 검증 순서 = 잠금 → 멤버십 → ACTIVE → **정책 facade** → 시설/아카이브 → 기술 검증(validator) → 충돌 검사

- [ ] **Step 1: BookingWindowFixture.bookableDate() 를 오늘+2 로 변경 (타임밤 제거 선행)**

기존 `내일`은 CI 가 KST 12:01 이후 실행되면 마감 정책에 걸려 전멸한다. javadoc 포함 교체:

```java
    /**
     * 시각 무관 항상 신청 가능한 날짜 = 모레(오늘+2).
     * 내일은 신청 마감 정책(사용일 전날 12:01 KST 마감)에 의해 실행 시각이 12:01 이후면 거부되는
     * 타임밤이다. 모레의 마감은 내일 12:00 — 언제 실행해도 미래라 항상 신청 가능하다.
     * 반월 창 내부 보장: until(다음 반월 말일)은 최솟값이 매월 13~15일 이상 남는 구조라 오늘+2 를 항상 포함한다.
     */
    public static LocalDate bookableDate() {
        return LocalDate.now(KST).plusDays(2);
    }
```

- [ ] **Step 2: BookingPolicyValidator 에서 반월 창 검증 제거 (기술 검증 전담화)**

`validateSlotRange` 의 `if (!window.contains(date))` 블록(41~43행)만 삭제. `window` 조회는 당일 가드 예외 인자로 여전히 필요하므로 유지. 메서드 주석 교체:

```java
    /**
     * 기술적 검증 전담 — 슬롯 그리드(정시·09~22·정방향) + 당일 경과 슬롯 거부.
     * 반월 창·마감·자격·역할 등 비즈니스 정책은 BookingApplicationPolicy 가 담당한다(설계 spec 2026-07-18).
     * 당일 가드는 마감 정책(당일 항상 마감)이 선행되어 create 경로에서는 도달하지 않지만,
     * 기술 검증의 자기완결성을 위해 유지한다.
     */
    public void validateSlotRange(LocalDate date, LocalTime startTime, LocalTime endTime) {
        if (!startTime.equals(startTime.truncatedTo(ChronoUnit.HOURS))
                || !endTime.equals(endTime.truncatedTo(ChronoUnit.HOURS))
                || startTime.isBefore(OPEN_TIME) || endTime.isAfter(CLOSE_TIME)
                || !startTime.isBefore(endTime)) {
            throw new FacilityBookingException.InvalidSlotRangeException();
        }
        LocalDateTime currentDateTime = LocalDateTime.now(clock);
        LocalDate today = currentDateTime.toLocalDate();
        BookingWindow window = bookingWindowPolicy.windowFor(today);
        // 당일 신청 중 첫 1시간이 완전히 지난 슬롯은 거부(어셈블러 PAST 판정과 동일 기준).
        if (date.isEqual(today) && !startTime.plusHours(1).isAfter(currentDateTime.toLocalTime())) {
            throw new FacilityBookingException.OutOfBookingWindowException(window);
        }
    }
```

`BookingPolicyValidatorTest` 에서 창 이관으로 무효가 된 3개 테스트 삭제: `firstHalfAllowsTodayThroughEndOfMonth`, `secondHalfAllowsTodayThroughNextMonthFirstHalf`, `rejectionMessageCarriesWindow` (동일 시나리오가 Task 2 의 `BookingApplicationPolicyTest` 에 존재). `rejectsInvalidGrid`·`sameDaySlotWithinFirstHourIsAllowed`·`sameDaySlotPastFirstHourIsRejected`·`rejectsWhenActiveCapReached` 는 유지 — 이 중 grid 테스트의 `bookable` 날짜(1/20)는 창 검증 삭제 후에도 유효하므로 무수정.

- [ ] **Step 3: GeneralFacilityBookingService.create 배선 전환**

필드에 `private final BookingApplicationPolicy bookingApplicationPolicy;` 추가(import 포함: `com.duing.domain.clubmember.entity.ClubMember`). create 상단(56~68행)을 다음으로 교체 — 잠금 선행 순서는 감사 결정이므로 유지, 주석의 `requireManager` 언급은 `resolveMembership` 으로 수정:

```java
        // 같은 동아리의 생성을 직렬화한다. …(기존 주석 유지)…
        // 잠금 선행 시 resolveMembership/ACTIVE 재검사는 1차 캐시의 잠긴 엔티티를 재사용한다.
        Club club = clubRepository.findByIdForUpdate(command.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);
        // 역할 거부를 정책 예외(PERMISSION_DENIED)로 매핑하기 위해 requireManager 대신 멤버십만 조회한다.
        // 비회원은 기존과 동일하게 NotAMember. 조회·취소 경로는 requireManager 유지(설계 spec Out of Scope).
        ClubMember applicant = clubAuthService.resolveMembership(command.actorId(), command.clubId());
        requireActiveClubUnderLock(club);
        // 신청 비즈니스 정책 4종(반월→마감→중앙→역할) — 단일 진입점. 첫 실패만 반환한다.
        bookingApplicationPolicy.validateApplication(club, applicant, command.date());
        Facility facility = facilityRepository.findById(command.facilityId())
                .orElseThrow(FacilityException.FacilityNotFoundException::new);
        if (facility.isArchived()) {
            throw new FacilityBookingException.ArchivedFacilityException();
        }

        bookingPolicyValidator.validateSlotRange(command.date(), command.startTime(), command.endTime());
        bookingPolicyValidator.validateActiveCap(facilityBookingRepository.countByClubIdAndStatusIn(
                command.clubId(), List.of(BookingStatus.PENDING, BookingStatus.APPROVED)));
```

동작 변화 노트(의도됨, PR 본문에 기재): ① MEMBER 역할 거부가 `AccessDeniedException` → `PermissionDeniedException`(403 유지, code 추가) ② 비ACTIVE 동아리 오류가 역할 오류보다 먼저 발생(기존은 역할 먼저) ③ 시설 아카이브 검사가 정책 뒤로 이동(창 밖+아카이브 동시엔 창 오류 우선).

`ClubAuthService.resolveMembership` javadoc 에서 "현재 프로덕션 호출처 없음 —" 문장을 "시설 예약 신청(create)이 역할 판정을 정책 계층에서 하기 위해 사용한다." 로 교체.

- [ ] **Step 4: GeneralFacilityAvailabilityService 를 facade 경유로 전환**

필드 `private final BookingWindowPolicy bookingWindowPolicy;` → `private final BookingApplicationPolicy bookingApplicationPolicy;` (import 교체). 91행·105행의 `bookingWindowPolicy.windowFor(today)` → `bookingApplicationPolicy.windowFor(today)`. 계산·응답 무변경.

- [ ] **Step 5: 기존 통합 테스트 중앙동아리 플래그 회귀 수정**

중앙동아리 게이트로 create 를 쓰는 모든 테스트의 클럽이 403 나므로, **Files 목록의 8개 테스트 파일** 각각에서 클럽 생성 헬퍼(`saveActiveClub` 류 — `Club.create(...)` 후 status 를 ACTIVE 로 만드는 지점)를 찾아 저장 직전에 한 줄 추가:

```java
        club.changeCentralClub(true); // 시설 예약 신청은 중앙동아리만 가능(설계 spec 2026-07-18)
```

파일마다 헬퍼 위치는 `grep -n "Club.create" <파일>` 로 확인한다. `FacilityBookingServiceIntegrationTest.saveActiveClub`(77~83행)이 대표 패턴이다. 클럽을 헬퍼 없이 인라인 생성하는 테스트도 동일 처리.

- [ ] **Step 6: MEMBER 거부 테스트 기대 예외 교체**

`FacilityBookingServiceIntegrationTest.rejectNonManagerApplicant`(156~170행):

```java
    @Test
    @DisplayName("일반 멤버(비운영진)의 신청은 PERMISSION_DENIED 로 거부된다")
    void rejectNonManagerApplicant() throws Exception {
        Fixture fixture = fixture();
        User member = saveUser("일반부원");
        clubMemberRepository.save(ClubMember.asMember(fixture.club(), member));

        CreateFacilityBookingCommand byMember = new CreateFacilityBookingCommand(
                fixture.club().getId(), member.getId(), fixture.facility().getId(),
                bookableDate(), LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE);

        assertThatThrownBy(() -> bookingService.create(byMember))
                .isInstanceOf(FacilityBookingException.PermissionDeniedException.class);
    }
```

`AccessDeniedException` import 가 다른 곳에서 안 쓰이면 제거.

- [ ] **Step 7: facilitybooking 전체 테스트 통과 확인**

Run(cwd `backend/`): `./gradlew test --tests "com.duing.domain.facilitybooking.*"`
Expected: PASS (BUILD SUCCESSFUL). 실패 시 남은 픽스처(중앙 플래그/날짜)를 실패 메시지 기준으로 마저 수정 — 단, main 코드 로직 수정으로 우회하지 말 것.

- [ ] **Step 8: 커밋**

```bash
git add backend/src
git commit -m "feat(backend): 예약 신청 경로를 BookingApplicationPolicy 로 통합하고 기존 테스트 회귀 반영"
```

---

### Task 4: 백엔드 — 신규 통합 테스트(권한 매트릭스·마감) + Swagger 설명

**Files:**
- Modify: `backend/src/test/java/com/duing/domain/facilitybooking/service/FacilityBookingServiceIntegrationTest.java`
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/api/ClubFacilityBookingApi.java:28-` (create @Operation)

**Interfaces:**
- Consumes: Task 3 까지의 create 흐름, `BookingWindowFixture.bookableDate()`(오늘+2)

- [ ] **Step 1: 실패하는(신규) 통합 테스트 추가**

`FacilityBookingServiceIntegrationTest` 에 추가 — 당일 날짜는 시각 무관 항상 마감이므로 결정적이다:

```java
    @Test
    @DisplayName("운영진(OFFICER)도 예약을 신청할 수 있다")
    void officerCanCreateBooking() throws Exception {
        Fixture fixture = fixture();
        User officer = saveUser("운영진");
        clubMemberRepository.save(ClubMember.of(fixture.club(), officer, ClubMemberRole.OFFICER));

        var result = bookingService.create(new CreateFacilityBookingCommand(
                fixture.club().getId(), officer.getId(), fixture.facility().getId(),
                bookableDate(), LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 회의", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE));

        assertThat(result.bookingId()).isNotNull();
    }

    @Test
    @DisplayName("일반동아리는 회장이어도 CENTRAL_CLUB_ONLY 로 신청이 거부된다")
    void generalClubIsRejectedByEligibility() throws Exception {
        User leader = saveUser("일반동아리장");
        Club generalClub = saveActiveClub("일반동아리");
        generalClub.changeCentralClub(false);
        clubRepository.save(generalClub);
        clubMemberRepository.save(ClubMember.asLeader(generalClub, leader));
        Facility facility = saveFacility();

        assertThatThrownBy(() -> bookingService.create(new CreateFacilityBookingCommand(
                generalClub.getId(), leader.getId(), facility.getId(), bookableDate(),
                LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE)))
                .isInstanceOfSatisfying(FacilityBookingException.CentralClubOnlyException.class,
                        exception -> assertThat(exception.getCode())
                                .isEqualTo("FACILITY_BOOKING_CENTRAL_CLUB_ONLY"));
        assertThat(bookingRepository.findByClubIdOrderByCreatedAtDesc(generalClub.getId())).isEmpty();
    }

    @Test
    @DisplayName("당일 사용 신청은 DEADLINE_PASSED 로 거부된다 — 마감은 사용일 전날 12:00")
    void sameDayBookingIsRejectedByDeadline() throws Exception {
        Fixture fixture = fixture();
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));

        assertThatThrownBy(() -> bookingService.create(new CreateFacilityBookingCommand(
                fixture.club().getId(), fixture.leader().getId(), fixture.facility().getId(),
                today, LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE)))
                .isInstanceOfSatisfying(FacilityBookingException.DeadlinePassedException.class,
                        exception -> assertThat(exception.getCode())
                                .isEqualTo("FACILITY_BOOKING_DEADLINE_PASSED"));
    }
```

필요 import: `ClubMemberRole`, `ZoneId` (기존 import 확인 후 추가).

- [ ] **Step 2: 통과 확인**

Run(cwd `backend/`): `./gradlew test --tests "FacilityBookingServiceIntegrationTest"`
Expected: PASS (BUILD SUCCESSFUL)

- [ ] **Step 3: Swagger create 설명 갱신**

`ClubFacilityBookingApi.java` 의 create `@Operation`(28행~) description 에 정책 문구를 반영한다. 기존 description 을 읽고 다음 내용이 담기게 확장(기존 문구 삭제 금지, 이어붙임):

```
중앙동아리의 회장/운영진만 신청 가능. 신청 마감은 사용일 전날 12:00(KST) —
마감 후 400(FACILITY_BOOKING_DEADLINE_PASSED), 일반동아리 403(FACILITY_BOOKING_CENTRAL_CLUB_ONLY),
일반회원 403(FACILITY_BOOKING_PERMISSION_DENIED).
```

- [ ] **Step 4: 커밋**

```bash
git add backend/src
git commit -m "test(backend): 예약 신청 권한 매트릭스·마감 통합 테스트 및 API 문서 보강"
```

---

### Task 5: 백엔드 — ManagedClub 응답에 centralClub 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/clubmember/service/dto/query/ManagedClubQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/ManagedClubResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepositoryImpl.java:26-51`
- Test: `backend/src/test/java/com/duing/domain/clubmember/service/ManagedClubsQueryTest.java`

**Interfaces:**
- Produces: `GET /api/v1/leader/clubs/me/managed` 응답 항목에 `centralClub: boolean` 추가 (하위호환 additive). **목록 필터링은 하지 않는다** — 이 엔드포인트는 운영 콘솔 전반이 쓰므로 전체 운영 동아리를 유지하고, 시설 예약용 필터는 FE 가 한다.

- [ ] **Step 1: 실패하는 테스트 — ManagedClubsQueryTest 에 centralClub 반영 케이스 추가**

파일을 읽고 기존 픽스처 패턴에 맞춰, 중앙 1개(true)·일반 1개(false) 운영 동아리를 가진 사용자의 조회 결과에서 두 건 모두 반환되고 각 `centralClub()` 값이 클럽 플래그와 일치함을 단언하는 테스트를 추가한다(레코드 접근자 `query.centralClub()`). 기존 단언과 컴파일이 함께 깨지는 것이 정상.

- [ ] **Step 2: 실패 확인**

Run(cwd `backend/`): `./gradlew test --tests "ManagedClubsQueryTest"`
Expected: 컴파일 실패 (record 에 centralClub 없음)

- [ ] **Step 3: 구현 — record 2곳 + 프로젝션 (positional 동기화 주의)**

`ManagedClubQuery`:

```java
public record ManagedClubQuery(
        Long clubId,
        String clubName,
        String logoUrl,
        ClubMemberRole myRole,
        boolean centralClub,
        long activeRecruitmentCount
) {
}
```

`ManagedClubResponse` — 동일 위치(myRole 다음)에 `boolean centralClub` 추가, `from()` 에 `query.centralClub()` 전달.

`ClubMemberRepositoryImpl.findActiveManagedClubsByUser` — `Projections.constructor` 인자 순서를 record 와 동일하게 `clubMember.role` 다음에 `club.centralClub` 추가, `groupBy` 에도 `club.centralClub` 추가. **record 선언 순서와 프로젝션 인자 순서가 positional 로 일치해야 한다** — 다섯 계층(record 2·프로젝션·groupBy·from) 동기화.

- [ ] **Step 4: 통과 확인**

Run(cwd `backend/`): `./gradlew test --tests "ManagedClubsQueryTest"`
Expected: PASS (BUILD SUCCESSFUL)

- [ ] **Step 5: 커밋**

```bash
git add backend/src
git commit -m "feat(backend): 운영 동아리 목록 응답에 centralClub 필드 추가"
```

---

### Task 6: 프론트 — 타입·마감 판정 헬퍼 + 픽스처 동기화 (TDD)

**Files:**
- Modify: `frontend/packages/types/src/club.ts:136-142` (ManagedClub)
- Modify: `frontend/apps/web/app/facilities/_lib/facilityTimeline.ts` (seoulTimeHHmm 추가)
- Modify: `frontend/apps/web/app/facilities/_lib/bookingCalendar.ts` (isApplicationDeadlinePassed 추가)
- Modify: ManagedClub 객체 리터럴을 만드는 모든 테스트/MSW 픽스처 (`grep -rn "myRole" frontend/apps/web/test frontend/packages | grep -v node_modules` 로 전수 확인 — 최소 `apps/web/test/facilities/facility-booking-page.test.tsx:228`)
- Test: `frontend/apps/web/test/facilities/booking-calendar-lib.test.ts`

**Interfaces:**
- Produces: `ManagedClub.centralClub: boolean` (required)
- Produces: `seoulTimeHHmm(now: Date): string` — KST 'HH:mm'
- Produces: `isApplicationDeadlinePassed(dateIso: string, now: Date): boolean` — Task 7 의 BookingForm 이 사용

- [ ] **Step 1: 실패하는 헬퍼 단위 테스트 작성**

`booking-calendar-lib.test.ts` 에 추가:

```ts
import { isApplicationDeadlinePassed } from '@/app/facilities/_lib/bookingCalendar';

describe('isApplicationDeadlinePassed', () => {
  // 사용일 7/20 의 마감 = 7/19 12:01(KST)부터 — 서버 BookingDeadlinePolicy 와 동일 경계(분 단위)
  const useDate = '2026-07-20';

  it('전날 12:00분대(12:00:59)까지는 마감이 아니다', () => {
    expect(isApplicationDeadlinePassed(useDate, new Date('2026-07-19T11:59:00+09:00'))).toBe(false);
    expect(isApplicationDeadlinePassed(useDate, new Date('2026-07-19T12:00:59+09:00'))).toBe(false);
  });

  it('전날 12:01부터는 마감이다', () => {
    expect(isApplicationDeadlinePassed(useDate, new Date('2026-07-19T12:01:00+09:00'))).toBe(true);
  });

  it('당일과 과거 날짜는 항상 마감이다', () => {
    expect(isApplicationDeadlinePassed(useDate, new Date('2026-07-20T00:00:01+09:00'))).toBe(true);
    expect(isApplicationDeadlinePassed('2026-07-18', new Date('2026-07-19T09:00:00+09:00'))).toBe(true);
  });

  it('이틀 이상 남은 날짜는 마감이 아니다', () => {
    expect(isApplicationDeadlinePassed(useDate, new Date('2026-07-18T23:59:59+09:00'))).toBe(false);
  });

  it('KST 자정 경계 — UTC 기준 전날 밤이라도 KST 날짜로 판정한다', () => {
    // UTC 7/19 02:59 = KST 7/19 11:59 → 미마감, UTC 7/19 03:01 = KST 7/19 12:01 → 마감
    expect(isApplicationDeadlinePassed(useDate, new Date('2026-07-19T02:59:00Z'))).toBe(false);
    expect(isApplicationDeadlinePassed(useDate, new Date('2026-07-19T03:01:00Z'))).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run(cwd `frontend/`): `pnpm --filter web test booking-calendar-lib`
Expected: FAIL (isApplicationDeadlinePassed export 없음)

- [ ] **Step 3: 구현**

`facilityTimeline.ts` 에 추가 (`seoulDateIso` 아래):

```ts
// KST 현재 시각 'HH:mm' — hourCycle h23 로 '24:00' 표기 함정을 피한다. 마감 힌트 판정 전용.
export function seoulTimeHHmm(now: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
}
```

`bookingCalendar.ts` 에 추가 — 상단 import 에 `seoulDateIso, seoulTimeHHmm` 를 `./facilityTimeline` 에서 가져온다(순환 import 아님 — facilityTimeline 은 bookingCalendar 를 import 하지 않음을 확인):

```ts
/**
 * 신청 마감 사전 판정 — 사용일 전날 12:01(KST)부터 마감(서버 BookingDeadlinePolicy 와 동일 경계, 분 단위).
 * 표시용 힌트 전용: 최종 판단은 서버(FACILITY_BOOKING_DEADLINE_PASSED)가 한다 — 클라 시계를 신뢰하지 않는다.
 */
export function isApplicationDeadlinePassed(dateIso: string, now: Date): boolean {
  const deadlineDateIso = shiftDateByDays(dateIso, -1);
  const seoulTodayIso = seoulDateIso(now);
  if (seoulTodayIso !== deadlineDateIso) return seoulTodayIso > deadlineDateIso;
  return seoulTimeHHmm(now) > '12:00';
}
```

`packages/types/src/club.ts` — `ManagedClub` 에 `myRole` 다음 줄로 `centralClub: boolean;` 추가.

- [ ] **Step 4: ManagedClub 픽스처 전수 동기화**

`grep -rn "myRole" frontend/apps/web/test frontend/packages --include="*.ts*" | grep -v node_modules` 결과에서 ManagedClub 객체 리터럴마다 `centralClub: true,` 추가 (기본은 true — 기존 테스트 동작 보존). `facility-booking-page.test.tsx:228` 기본 핸들러 포함.

- [ ] **Step 5: 통과 확인**

Run(cwd `frontend/`): `pnpm --filter web test booking-calendar-lib && pnpm typecheck`
Expected: 테스트 PASS + typecheck 무오류 (리터럴 누락이 있으면 typecheck 가 파일을 알려준다 — 마저 수정)

- [ ] **Step 6: 커밋**

```bash
git add frontend/packages/types frontend/apps/web
git commit -m "feat(frontend): ManagedClub centralClub 타입·신청 마감 판정 헬퍼 추가"
```

---

### Task 7: 프론트 — BookingForm 마감·중앙동아리 게이트 + 테스트 시계 고정

**Files:**
- Modify: `frontend/apps/web/app/facilities/_components/booking/BookingForm.tsx`
- Modify: `frontend/apps/web/test/facilities/facility-booking-page.test.tsx`

**Interfaces:**
- Consumes: `isApplicationDeadlinePassed(dateIso, now)`, `ManagedClub.centralClub` (Task 6)
- Produces: BookingForm 분기 순서 = 로그인 → **마감 안내** → 로딩/에러 → 운영동아리 없음(기존 문구) → **중앙동아리 없음(신규 문구)** → 폼

- [ ] **Step 1: BookingForm 게이트 구현**

import 에 `isApplicationDeadlinePassed` 추가(`../../_lib/bookingCalendar` — `rangeLabel` 과 동일 소스). 로그인 분기(53~65행) 바로 뒤에 마감 분기 추가:

```tsx
  // 신청 마감 사전 안내 — 표시용 힌트(클라 시계). 최종 판단은 서버가 한다(정책 spec 2026-07-18).
  if (isApplicationDeadlinePassed(date, new Date())) {
    return (
      <div className="space-y-3 text-sm text-charcoal-2">
        <p role="alert">이 날짜는 신청이 마감됐어요. 시설 사용일 전날 12:00까지만 신청할 수 있어요.</p>
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          시간 다시 선택
        </button>
      </div>
    );
  }
```

`managedClubs` 계산부(85~92행)를 다음으로 교체:

```tsx
  const managedClubs = managedClubsQuery.data ?? [];
  // 시설 예약은 중앙동아리만(정책 spec 2026-07-18). centralClub 미탑재 구버전 응답은 숨기지 않는다
  // (배포 전환기 fail-open — 알려진 false 만 제외). 최종 차단은 서버 403 이 한다.
  const centralClubs = managedClubs.filter((club) => club.centralClub !== false);
  if (managedClubsQuery.isSuccess && managedClubs.length === 0) {
    return (
      <p className="text-sm text-charcoal-2">
        운영진(회장·운영진)으로 소속된 동아리가 없어 신청할 수 없어요. 시설 예약은 동아리 단위로 신청됩니다.
      </p>
    );
  }
  if (managedClubsQuery.isSuccess && centralClubs.length === 0) {
    return (
      <p className="text-sm text-charcoal-2">
        시설 예약은 중앙동아리만 신청할 수 있어요. 운영 중인 중앙동아리가 없어 신청할 수 없어요.
      </p>
    );
  }
```

이후 본문에서 `managedClubs` 사용처 4곳을 `centralClubs` 로 교체: `effectiveClubId`(94행), `selectedClub`(95행), 셀렉터 분기·옵션(174~188행), 단일 동아리 라벨(189~191행).

- [ ] **Step 2: 페이지 테스트 시계 고정 (기존 타임밤 동시 제거)**

`facility-booking-page.test.tsx` 는 `WINDOW_FROM_CELL`(= 오늘 셀) 클릭으로 폼에 진입한다 — 마감 게이트 후 당일은 항상 마감이라 폼 도달 테스트가 전멸하고, 날짜를 내일로 바꾸면 12:01 이후 CI 타임밤이다. **Date 만 고정**하는 fake timer 로 해결한다:

1. 파일 상단(모듈 스코프) `TODAY_ISO` 정의를 교체:

```ts
// 실행 시각 무관 결정성 — Date 만 고정한다(타이머는 실제: MSW·waitFor 호환).
// 7/8(수) 10:00 KST: 반월 창 7/8~7/31 중앙, 정오 이전, 월 경계 여유.
const FIXED_NOW = new Date('2026-07-08T10:00:00+09:00');
vi.useFakeTimers({ toFake: ['Date'], now: FIXED_NOW });
const TODAY_ISO = seoulDateIso(FIXED_NOW);
```

`afterAll` 에 `vi.useRealTimers()` 추가. 기존 `beforeEach`/`afterEach` 의 타이머 관련 코드가 있으면 충돌 여부를 확인한다.

2. 폼 도달 플로우용 날짜 상수 추가:

```ts
// 신청 플로우용 마감-안전 날짜: 오늘+2 (마감 = 내일 12:00 → 고정 now 10:00 기준 항상 미래)
const APPLY_DATE_ISO = shiftDateByDays(TODAY_ISO, 2);
```

3. 데이 제너레이터(120행대 — "창 첫날에만 혼합 슬롯" 주석 참조)를 읽고, 혼합 슬롯 레이아웃 조건을 `iso === WINDOW.from` 에서 `iso === WINDOW.from || iso === APPLY_DATE_ISO` 로 확장한다(창 첫날 셀 단언은 유지되도록 기존 조건 삭제 금지).

4. 폼 도달(신청 폼 렌더·POST 발사) 테스트의 셀 클릭을 `WINDOW_FROM_CELL` → `APPLY_DATE_ISO` 기반 셀 라벨 상수(`APPLY_CELL` — 제너레이터 슬롯 수에서 파생, `WINDOW_FROM_CELL` 정의부와 같은 방식)로 교체. **캘린더 상호작용만 하는 테스트(셀 존재·선택 해제 등)는 기존 상수 유지.** 폼까지 가는 테스트 판별: `18:00~19:00 예약 신청` 버튼 클릭 이후 폼 요소(사용 목적 입력 등)를 조회하는 케이스.

- [ ] **Step 3: 신규 테스트 3건 추가**

같은 파일의 기존 패턴(authenticated setState + server.use override)으로:

```tsx
  it('오늘 날짜는 신청이 마감되어 폼 대신 마감 안내가 보인다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: WINDOW_FROM_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('시설 사용일 전날 12:00까지만 신청할 수 있어요.');
    expect(screen.queryByLabelText('사용 목적')).not.toBeInTheDocument();
  });

  it('중앙동아리가 아닌 운영 동아리만 있으면 중앙동아리 안내가 보이고 폼이 숨는다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    server.use(
      http.get('*/leader/clubs/me/managed', () =>
        ok([{ clubId: 7, clubName: '밴드부', logoUrl: null, myRole: 'LEADER', centralClub: false, activeRecruitmentCount: 0 }]),
      ),
    );
    renderPage();
    // APPLY_CELL 로 폼 스텝 진입 (마감 게이트 통과용 날짜)
    fireEvent.click(await screen.findByRole('button', { name: APPLY_CELL }));
    fireEvent.click(await screen.findByRole('button', { name: /18:00~19:00/ }));
    fireEvent.click(screen.getByRole('button', { name: '18:00~19:00 예약 신청' }));

    expect(await screen.findByText(/시설 예약은 중앙동아리만 신청할 수 있어요/)).toBeInTheDocument();
    expect(screen.queryByLabelText('사용 목적')).not.toBeInTheDocument();
  });

  it('서버가 마감 코드로 거부하면 서버 메시지가 토스트로 보인다', async () => {
    useAuthStore.setState({ status: 'authenticated', user: AUTH_USER });
    server.use(
      http.post('*/clubs/7/facility-bookings', () =>
        HttpResponse.json(
          { ok: false, data: null, message: '시설 사용일 전날 12:00까지만 신청할 수 있어요.', code: 'FACILITY_BOOKING_DEADLINE_PASSED' },
          { status: 400 },
        ),
      ),
    );
    renderPage();
    // APPLY_CELL 경유로 폼 작성·확인 다이얼로그까지 기존 성공 플로우 테스트와 동일 절차로 진행한 뒤 제출
    // (기존 제출 성공 테스트의 절차를 이 케이스에 복제하고 마지막 단언만 교체)
    expect(await screen.findByText('시설 사용일 전날 12:00까지만 신청할 수 있어요.')).toBeInTheDocument();
  });
```

세 번째 케이스의 폼 작성 절차(목적 입력→연락처→확인 다이얼로그→최종 신청 클릭)는 기존 제출 성공 테스트에서 그대로 복제한다 — 파일 내 실제 셀렉터를 따를 것.

- [ ] **Step 4: 통과 확인**

Run(cwd `frontend/`): `pnpm --filter web test facility-booking-page && pnpm --filter web test booking-components`
Expected: PASS. `booking-components.test.tsx` 가 BookingForm 을 오늘 날짜로 직접 렌더해 실패하면, 해당 케이스의 `date` prop 을 `shiftDateByDays(seoulDateIso(new Date()), 2)` 로 조정(컴포넌트 테스트는 시계 고정이 없어도 오늘+2 는 항상 안전).

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web
git commit -m "feat(frontend): 시설 예약 신청 마감·중앙동아리 게이트 및 안내 문구 추가"
```

---

### Task 8: 전체 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 백엔드 전체 테스트**

Run(cwd `backend/`): `./gradlew test`
Expected: BUILD SUCCESSFUL — 출력에서 직접 확인(`| tail` 금지). 실패 시 실패 테스트만 원인 수정(반월 정책 파일 무수정 원칙 유지).

- [ ] **Step 2: 프론트 lint/typecheck/test**

Run(cwd `frontend/`): `pnpm lint && pnpm typecheck && pnpm test`
Expected: 모두 무오류 통과.

- [ ] **Step 3: 스펙 대조 자가점검**

spec 의 오류 계약 3종(코드·메시지·상태), 검증 순서(반월→마감→중앙→역할→기술), Out of Scope 침범 여부(반월 파일·availability 스키마·cancel 경로 무변경)를 diff 로 확인: `git diff develop --stat` 에 `HalfMonthBookingWindowPolicy.java`·`BookingWindowConfig.java`·`BookingWindow.java`·`BookingWindowPolicy.java` 가 **없어야** 한다.

- [ ] **Step 4: 커밋 (잔여 변경이 있을 때만)**

```bash
git status --short
```

잔여 변경 없으면 종료. 있으면 원인 태스크 커밋 메시지 규칙으로 커밋.

---

## 실행 노트 (메인 세션용)

- 각 태스크 완료 시 spec 리뷰 + 품질 리뷰 subagent 디스패치(구현 subagent 프롬프트에 **push·PR 생성 금지** 명시).
- 전체 완료 후: `duing-code-reviewer` + `codex:review` 기본, **권한·정책 변경이므로 `codex:adversarial-review` 필수**.
- 리뷰 통과 후 PR 직전 7항목 self-check → 사용자 확인 후 push·PR(자동 머지 금지).
