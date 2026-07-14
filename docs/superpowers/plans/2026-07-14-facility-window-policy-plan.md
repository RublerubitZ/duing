# 예약 오픈 구간 정책(반월) 백엔드 구현 계획 (PR-0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 예약 가능 창을 "오늘~익월 말일"에서 **반월 오픈 정책**(오늘 1~15일→당월 16~말일 / 16~말일→익월 1~15일)으로 교체하되, `BookingWindowPolicy` 계층으로 격리해 모드(HALF_MONTH/MONTHLY/FREE)·기준일(pivotDay)을 설정값으로 관리한다. `bookableFrom/bookableUntil`이 정책 산출값을 반환하고, 신규 공개 API `GET /api/v1/facilities/booking-window`를 추가한다.

**Architecture:** 정책은 Clock 없는 **순수 함수 계층**(`windowFor(today)`) — Clock 보유는 소비처(Validator/AvailabilityService) 몫. 현재 두 곳에 중복된 창 정의를 단일 정책 빈 위임으로 통합. 설정은 record `@ConfigurationProperties` + 빈 구성에서 미구현 모드 fail-fast.

**Tech Stack:** Spring Boot 3.4 / Java 21 / JUnit5(Clock.fixed 관례) / RestAssured acceptance

**Spec:** [`2026-07-14-facility-ux-refresh-design.md`](../specs/2026-07-14-facility-ux-refresh-design.md) §1.5

## Global Constraints

- 브랜치 `feat/facility-booking-window-policy`(develop 기반, 스펙 커밋 d2991813 존재). 명령은 `backend/`에서(`./gradlew`), `| tail`로 exit code 가리지 말 것.
- 백엔드 컨벤션: DDD 패키지(정책 클래스=`facilitybooking/service/`, 설정=`facilitybooking/config/`), record DTO, `@DisplayName`은 요구사항 문장, 한국어 검증 메시지, Flyway 변경 없음(이 PR은 스키마 무관).
- **정책 규칙(HALF_MONTH)**: `today.day ≤ pivotDay` → `[당월 (pivotDay+1)일, 당월 말일]` / `today.day > pivotDay` → `[익월 1일, 익월 pivotDay일]`. pivotDay 검증 1~27(→ `pivotDay+1 ≤ 28`이라 2월 포함 모든 월에서 안전).
- **창 정의 단일화**: 기존 중복 2곳(BookingPolicyValidator L39-40, GeneralFacilityAvailabilityService L90)을 전부 정책 위임으로 교체 — 창 산식이 정책 클래스 밖에 남으면 안 된다.
- 설정 키: `duing.facility.booking.window.mode`(enum `HALF_MONTH|MONTHLY|FREE`, 기본 HALF_MONTH), `duing.facility.booking.window.pivot-day`(기본 15). MONTHLY/FREE는 **키만 예약** — 선택 시 부팅 실패(명확한 메시지)로 fail-fast.
- 월 파라미터 검증(당월·익월만 조회 가능)은 유지 — 반월 창은 항상 당월 또는 익월 내부다. `FacilitySlotAssembler`(days 배열=월 전체)도 무변경 — 창 밖 표시는 FE가 `bookableFrom/Until` 메타로 처리한다(PR-A).
- `OutOfBookingWindowException` 메시지는 **창을 포함한 동적 문구**로: `"지금은 M월 d일부터 M월 d일까지만 신청할 수 있어요."` — FE 토스트가 그대로 노출 가능해야 한다.
- Clock: `seoulClock` 생성자 주입 관례 유지. 단위 테스트는 `Clock.fixed(...KST)` 관례, 통합 테스트는 실클록+상대 계산 관례(테스트 하드코딩 절대날짜 금지 — CI 타임밤).
- **기존 테스트 날짜 전수 정합화 필수**: `LocalDate.now().plusDays(3)`류는 반월 창에서 대부분 창 밖이다(예: 오늘 1일→+3=4일은 창 밖). 공용 테스트 헬퍼로 교체한다.
- 커밋 한국어 Conventional Commits(`feat(backend): ...`), Co-Authored-By/🤖 금지, push·PR 금지(컨트롤러 몫). TestContainers 필요(Docker 기동 상태).

---

## File Structure

```
backend/src/main/java/com/duing/domain/facilitybooking/
├── service/BookingWindow.java                       (Task 1 신규 — 값 객체)
├── service/BookingWindowPolicy.java                 (Task 1 신규 — 인터페이스)
├── service/HalfMonthBookingWindowPolicy.java        (Task 1 신규)
├── config/BookingWindowProperties.java              (Task 2 신규)
├── config/BookingWindowConfig.java                  (Task 2 신규 — 모드→빈)
├── service/BookingPolicyValidator.java              (Task 3 수정 — 창 위임)
├── service/GeneralFacilityAvailabilityService.java  (Task 3 수정 — bookableFrom/Until + Task 4 창 조회)
├── exception/FacilityBookingException.java          (Task 3 수정 — 동적 메시지)
├── api/FacilityAvailabilityApi.java                 (Task 4 수정 — booking-window)
├── controller/FacilityAvailabilityController.java   (Task 4 수정)
└── controller/dto/response/BookingWindowResponse.java (Task 4 신규)
backend/src/main/resources/application.yml           (Task 2 수정 — window 블록)

backend/src/test/java/com/duing/
├── domain/facilitybooking/service/HalfMonthBookingWindowPolicyTest.java (Task 1 신규)
├── domain/facilitybooking/config/BookingWindowConfigTest.java           (Task 2 신규)
├── domain/facilitybooking/service/BookingPolicyValidatorTest.java       (Task 3 재작성)
├── common/fixture/BookingWindowFixture.java                             (Task 5 신규 — 테스트 날짜 헬퍼)
└── (Task 4 acceptance 추가, Task 5 기존 테스트 날짜 정합화)
```

---

### Task 1: 정책 계층 — BookingWindow·인터페이스·반월 구현 (TDD)

**Files:**
- Create: `service/BookingWindow.java`, `service/BookingWindowPolicy.java`, `service/HalfMonthBookingWindowPolicy.java`
- Test: `HalfMonthBookingWindowPolicyTest.java`

**Interfaces:**
- Produces: `BookingWindow(LocalDate from, LocalDate until)` record(+`contains(LocalDate)`), `BookingWindowPolicy.windowFor(LocalDate today)`, `new HalfMonthBookingWindowPolicy(int pivotDay)`

- [ ] **Step 1: 실패하는 테스트 작성**

```java
package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class HalfMonthBookingWindowPolicyTest {

    private final HalfMonthBookingWindowPolicy policy = new HalfMonthBookingWindowPolicy(15);

    @Test
    @DisplayName("오늘이 1일~15일이면 당월 16일부터 말일까지가 예약 가능 구간이 된다")
    void firstHalfOpensSecondHalfOfThisMonth() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 7, 10));
        assertThat(window.from()).isEqualTo(LocalDate.of(2026, 7, 16));
        assertThat(window.until()).isEqualTo(LocalDate.of(2026, 7, 31));
    }

    @Test
    @DisplayName("기준일 당일(15일)은 아직 상반기로 취급되어 당월 하반기가 열린다")
    void pivotDayItselfBelongsToFirstHalf() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 7, 15));
        assertThat(window.from()).isEqualTo(LocalDate.of(2026, 7, 16));
        assertThat(window.until()).isEqualTo(LocalDate.of(2026, 7, 31));
    }

    @Test
    @DisplayName("오늘이 16일~말일이면 다음 달 1일부터 15일까지가 예약 가능 구간이 된다")
    void secondHalfOpensFirstHalfOfNextMonth() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 7, 16));
        assertThat(window.from()).isEqualTo(LocalDate.of(2026, 8, 1));
        assertThat(window.until()).isEqualTo(LocalDate.of(2026, 8, 15));

        BookingWindow endOfMonth = policy.windowFor(LocalDate.of(2026, 7, 31));
        assertThat(endOfMonth.from()).isEqualTo(LocalDate.of(2026, 8, 1));
        assertThat(endOfMonth.until()).isEqualTo(LocalDate.of(2026, 8, 15));
    }

    @Test
    @DisplayName("12월 하반기에는 다음 해 1월 상반기가 열린다 — 연 경계를 넘는다")
    void crossesYearBoundary() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 12, 20));
        assertThat(window.from()).isEqualTo(LocalDate.of(2027, 1, 1));
        assertThat(window.until()).isEqualTo(LocalDate.of(2027, 1, 15));
    }

    @Test
    @DisplayName("2월에도 안전하다 — 평년은 16~28일, 윤년은 16~29일이 열린다")
    void handlesFebruary() {
        assertThat(policy.windowFor(LocalDate.of(2026, 2, 10)).until()).isEqualTo(LocalDate.of(2026, 2, 28));
        assertThat(policy.windowFor(LocalDate.of(2028, 2, 10)).until()).isEqualTo(LocalDate.of(2028, 2, 29));
    }

    @Test
    @DisplayName("기준일을 바꾸면(예: 10일) 구간 경계가 함께 이동한다")
    void customPivotDayShiftsWindow() {
        HalfMonthBookingWindowPolicy tenDayPolicy = new HalfMonthBookingWindowPolicy(10);
        assertThat(tenDayPolicy.windowFor(LocalDate.of(2026, 7, 10)).from()).isEqualTo(LocalDate.of(2026, 7, 11));
        assertThat(tenDayPolicy.windowFor(LocalDate.of(2026, 7, 11)).from()).isEqualTo(LocalDate.of(2026, 8, 1));
        assertThat(tenDayPolicy.windowFor(LocalDate.of(2026, 7, 11)).until()).isEqualTo(LocalDate.of(2026, 8, 10));
    }

    @Test
    @DisplayName("기준일이 1~27 범위를 벗어나면 생성 시점에 거부된다")
    void rejectsInvalidPivotDay() {
        assertThatThrownBy(() -> new HalfMonthBookingWindowPolicy(0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new HalfMonthBookingWindowPolicy(28)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("BookingWindow.contains 는 경계 포함으로 판정한다")
    void windowContainsIsInclusive() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 7, 10)); // 7.16 ~ 7.31
        assertThat(window.contains(LocalDate.of(2026, 7, 16))).isTrue();
        assertThat(window.contains(LocalDate.of(2026, 7, 31))).isTrue();
        assertThat(window.contains(LocalDate.of(2026, 7, 15))).isFalse();
        assertThat(window.contains(LocalDate.of(2026, 8, 1))).isFalse();
    }
}
```

(고정 날짜는 "입력→출력" 형식 검증이라 타임밤 아님.)

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "*HalfMonthBookingWindowPolicyTest"`
Expected: 컴파일 실패(클래스 없음)

- [ ] **Step 3: 구현**

`BookingWindow.java`:

```java
package com.duing.domain.facilitybooking.service;

import java.time.LocalDate;

/** 예약 가능 구간 값 객체 — 경계 포함([from, until]). */
public record BookingWindow(LocalDate from, LocalDate until) {

    public boolean contains(LocalDate date) {
        return !date.isBefore(from) && !date.isAfter(until);
    }
}
```

`BookingWindowPolicy.java`:

```java
package com.duing.domain.facilitybooking.service;

import java.time.LocalDate;

/**
 * 예약 오픈 구간 정책(설계 §1.5). 오늘 날짜를 받아 "지금 신청 가능한 구간"을 계산하는 순수 전략 —
 * Clock 은 소비처(검증기·가용성 서비스)가 보유한다. 구간 산식은 이 계층 밖에 중복 정의하지 않는다.
 * 모드 추가(MONTHLY·FREE)는 구현체를 늘리고 BookingWindowConfig 에 매핑만 추가한다.
 */
public interface BookingWindowPolicy {

    BookingWindow windowFor(LocalDate today);
}
```

`HalfMonthBookingWindowPolicy.java`:

```java
package com.duing.domain.facilitybooking.service;

import java.time.LocalDate;
import java.time.YearMonth;

/**
 * 반월(半月) 오픈 정책 — 항상 "다음 오픈 구간"만 신청 가능하다.
 * 오늘이 1~pivotDay 일이면 당월 (pivotDay+1)일~말일, (pivotDay+1)~말일이면 익월 1일~pivotDay 일.
 * pivotDay 는 1~27 로 제한해 2월을 포함한 모든 달에서 구간이 성립한다.
 */
public class HalfMonthBookingWindowPolicy implements BookingWindowPolicy {

    private final int pivotDay;

    public HalfMonthBookingWindowPolicy(int pivotDay) {
        if (pivotDay < 1 || pivotDay > 27) {
            throw new IllegalArgumentException("pivotDay 는 1~27 사이여야 합니다: " + pivotDay);
        }
        this.pivotDay = pivotDay;
    }

    @Override
    public BookingWindow windowFor(LocalDate today) {
        YearMonth currentMonth = YearMonth.from(today);
        if (today.getDayOfMonth() <= pivotDay) {
            return new BookingWindow(currentMonth.atDay(pivotDay + 1), currentMonth.atEndOfMonth());
        }
        YearMonth nextMonth = currentMonth.plusMonths(1);
        return new BookingWindow(nextMonth.atDay(1), nextMonth.atDay(pivotDay));
    }
}
```

- [ ] **Step 4: 통과 확인 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "*HalfMonthBookingWindowPolicyTest"`
Expected: 8건 PASS

```bash
git add backend
git commit -m "feat(backend): 예약 오픈 구간 정책 계층 — BookingWindowPolicy·반월 구현"
```

---

### Task 2: 설정 바인딩 + 빈 구성 (모드·기준일)

**Files:**
- Create: `config/BookingWindowProperties.java`, `config/BookingWindowConfig.java`
- Modify: `backend/src/main/resources/application.yml`
- Test: `config/BookingWindowConfigTest.java`

**Interfaces:**
- Produces: `BookingWindowProperties(BookingWindowMode mode, int pivotDay)`, enum `BookingWindowMode { HALF_MONTH, MONTHLY, FREE }`, `BookingWindowConfig` → `@Bean BookingWindowPolicy`

- [ ] **Step 1: 구현** — `BookingWindowProperties.java`(crawler 설정 record 관례):

```java
package com.duing.domain.facilitybooking.config;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * 예약 오픈 구간 정책 설정(설계 §1.5). mode 로 정책 전략을, pivot-day 로 반월 기준일을 바꾼다 —
 * "10일 기준" 같은 운영 요구는 설정만으로 대응한다. MONTHLY·FREE 는 키만 예약(선택 시 부팅 실패).
 */
@Validated
@ConfigurationProperties(prefix = "duing.facility.booking.window")
public record BookingWindowProperties(
        @NotNull BookingWindowMode mode,
        @Min(1) @Max(27) int pivotDay
) {

    public enum BookingWindowMode { HALF_MONTH, MONTHLY, FREE }
}
```

`BookingWindowConfig.java`:

```java
package com.duing.domain.facilitybooking.config;

import com.duing.domain.facilitybooking.service.BookingWindowPolicy;
import com.duing.domain.facilitybooking.service.HalfMonthBookingWindowPolicy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class BookingWindowConfig {

    @Bean
    public BookingWindowPolicy bookingWindowPolicy(BookingWindowProperties properties) {
        return switch (properties.mode()) {
            case HALF_MONTH -> new HalfMonthBookingWindowPolicy(properties.pivotDay());
            // 키만 예약된 모드 — 구현 전 선택은 설정 실수이므로 부팅 단계에서 명확히 실패시킨다.
            case MONTHLY, FREE -> throw new IllegalStateException(
                    "duing.facility.booking.window.mode=" + properties.mode() + " 는 아직 구현되지 않았습니다.");
        };
    }
}
```

`application.yml`의 `duing.facility.booking:` 블록에 `matching:`과 형제로 추가:

```yaml
      window:
        # 예약 오픈 구간 정책(설계 §1.5) — HALF_MONTH: 오늘 1~pivot일이면 당월 (pivot+1)~말일,
        # (pivot+1)~말일이면 익월 1~pivot일. MONTHLY/FREE 는 키만 예약(미구현 — 선택 시 부팅 실패).
        mode: ${DUING_FACILITY_BOOKING_WINDOW_MODE:HALF_MONTH}
        pivot-day: ${DUING_FACILITY_BOOKING_WINDOW_PIVOT_DAY:15}
```

(prod 블록 추가 불필요 — base 기본값이 그대로 적용된다.)

- [ ] **Step 2: 테스트** — `BookingWindowConfigTest.java`(스프링 컨텍스트 없이 구성 로직만):

```java
package com.duing.domain.facilitybooking.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.facilitybooking.config.BookingWindowProperties.BookingWindowMode;
import com.duing.domain.facilitybooking.service.HalfMonthBookingWindowPolicy;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BookingWindowConfigTest {

    private final BookingWindowConfig config = new BookingWindowConfig();

    @Test
    @DisplayName("HALF_MONTH 모드는 설정된 기준일로 반월 정책 빈을 만든다")
    void halfMonthModeCreatesPolicy() {
        var policy = config.bookingWindowPolicy(new BookingWindowProperties(BookingWindowMode.HALF_MONTH, 15));
        assertThat(policy).isInstanceOf(HalfMonthBookingWindowPolicy.class);
    }

    @Test
    @DisplayName("아직 구현되지 않은 모드(MONTHLY·FREE)를 선택하면 부팅 단계에서 명확히 실패한다")
    void unimplementedModesFailFast() {
        assertThatThrownBy(() -> config.bookingWindowPolicy(new BookingWindowProperties(BookingWindowMode.MONTHLY, 15)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MONTHLY");
        assertThatThrownBy(() -> config.bookingWindowPolicy(new BookingWindowProperties(BookingWindowMode.FREE, 15)))
                .isInstanceOf(IllegalStateException.class);
    }
}
```

- [ ] **Step 3: 검증 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "*BookingWindow*"`
Expected: PASS (+ `@ConfigurationPropertiesScan` 자동 바인딩은 기존 crawler 설정과 동일 — 부팅 검증은 Task 6 bootRun)

```bash
git add backend
git commit -m "feat(backend): 예약 오픈 구간 설정 바인딩 — mode·pivot-day, 미구현 모드 fail-fast"
```

---

### Task 3: 소비처 위임 — 검증기·가용성 서비스 창 교체

**Files:**
- Modify: `service/BookingPolicyValidator.java`, `service/GeneralFacilityAvailabilityService.java`, `exception/FacilityBookingException.java`
- Test: `BookingPolicyValidatorTest.java` 재작성

**Interfaces:**
- Consumes: Task 1 `BookingWindowPolicy`
- Produces: `BookingPolicyValidator(Clock, BookingWindowPolicy)` 생성자 변경, `OutOfBookingWindowException(BookingWindow)` 동적 메시지, availability 응답의 `bookableFrom/bookableUntil` = 정책 산출값

- [ ] **Step 1: 예외 동적 메시지** — `FacilityBookingException.java`의 `OutOfBookingWindowException`을 교체(기존 기본 생성자 삭제, 사용처는 이 태스크에서 전부 갱신):

```java
public static class OutOfBookingWindowException extends FacilityBookingException {
    public OutOfBookingWindowException(BookingWindow window) {
        super("지금은 %d월 %d일부터 %d월 %d일까지만 신청할 수 있어요.".formatted(
                        window.from().getMonthValue(), window.from().getDayOfMonth(),
                        window.until().getMonthValue(), window.until().getDayOfMonth()),
                HttpStatus.BAD_REQUEST);
    }
}
```

(import `com.duing.domain.facilitybooking.service.BookingWindow` 추가. 메시지는 FE 토스트로 그대로 노출된다.)

- [ ] **Step 2: BookingPolicyValidator 위임** — 창 검증부 교체:

```java
private final Clock clock;
private final BookingWindowPolicy bookingWindowPolicy;

public BookingPolicyValidator(Clock clock, BookingWindowPolicy bookingWindowPolicy) {
    this.clock = clock;
    this.bookingWindowPolicy = bookingWindowPolicy;
}

/** 슬롯 그리드(정시·09~22·정방향) + 예약 오픈 구간(BookingWindowPolicy, 지난 슬롯 제외) 검증. */
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
    if (!window.contains(date)) {
        throw new FacilityBookingException.OutOfBookingWindowException(window);
    }
    // 오늘이 창에 포함되는 정책(향후 FREE 등)을 대비한 정책 불변 가드 — 반월 창은 항상 미래라 실행되지 않는다.
    if (date.isEqual(today) && !startTime.plusHours(1).isAfter(currentDateTime.toLocalTime())) {
        throw new FacilityBookingException.OutOfBookingWindowException(window);
    }
}
```

(클래스 주석의 "오늘~다음 달 말일" 문구도 갱신. `validateActiveCap`·상수는 무변경.)

- [ ] **Step 3: GeneralFacilityAvailabilityService 위임** — `BookingWindowPolicy` 필드 추가(`@RequiredArgsConstructor`가 생성자 반영), 응답 조립부 교체:

```java
BookingWindow window = bookingWindowPolicy.windowFor(today);
return new FacilityAvailabilityResponse(
        facility.getId(),
        targetMonth.toString(),
        toKstOffset(crawledAt),
        stale,
        window.from(),
        window.until(),
        FacilitySlotAssembler.assembleDays(targetMonth, today, nowTime, crawlSlices, bookingSlices));
```

(월 파라미터 검증(당월·익월 400)과 assembleDays 호출은 무변경.)

- [ ] **Step 4: BookingPolicyValidatorTest 재작성** — 반월 창 기준(고정 Clock 2개로 상·하반기 모두):

```java
package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BookingPolicyValidatorTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    // KST 2026-01-10 12:30 — 상반기(1~15일): 창 = 1/16 ~ 1/31
    private static final Clock FIRST_HALF = Clock.fixed(Instant.parse("2026-01-10T03:30:00Z"), SEOUL);
    // KST 2026-01-20 12:30 — 하반기(16~말일): 창 = 2/1 ~ 2/15
    private static final Clock SECOND_HALF = Clock.fixed(Instant.parse("2026-01-20T03:30:00Z"), SEOUL);

    private final BookingWindowPolicy policy = new HalfMonthBookingWindowPolicy(15);

    private BookingPolicyValidator validatorAt(Clock clock) {
        return new BookingPolicyValidator(clock, policy);
    }

    @Test
    @DisplayName("정시가 아니거나 09~22시 밖이거나 역방향인 슬롯은 거부된다")
    void rejectsInvalidGrid() {
        BookingPolicyValidator validator = validatorAt(FIRST_HALF);
        LocalDate bookable = LocalDate.of(2026, 1, 20);
        assertThatThrownBy(() -> validator.validateSlotRange(bookable, LocalTime.of(10, 30), LocalTime.of(12, 0)))
                .isInstanceOf(FacilityBookingException.InvalidSlotRangeException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(bookable, LocalTime.of(8, 0), LocalTime.of(10, 0)))
                .isInstanceOf(FacilityBookingException.InvalidSlotRangeException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(bookable, LocalTime.of(21, 0), LocalTime.of(23, 0)))
                .isInstanceOf(FacilityBookingException.InvalidSlotRangeException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(bookable, LocalTime.of(14, 0), LocalTime.of(13, 0)))
                .isInstanceOf(FacilityBookingException.InvalidSlotRangeException.class);
    }

    @Test
    @DisplayName("상반기에는 당월 하반기(16일~말일)만 신청할 수 있다 — 오늘·창 이전·익월은 거부된다")
    void firstHalfAllowsOnlySecondHalfOfMonth() {
        BookingPolicyValidator validator = validatorAt(FIRST_HALF);
        assertThatCode(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 16), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .doesNotThrowAnyException();
        assertThatCode(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 31), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 10), LocalTime.of(18, 0), LocalTime.of(20, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 15), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 2, 1), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
    }

    @Test
    @DisplayName("하반기에는 익월 상반기(1일~15일)만 신청할 수 있다")
    void secondHalfAllowsOnlyFirstHalfOfNextMonth() {
        BookingPolicyValidator validator = validatorAt(SECOND_HALF);
        assertThatCode(() -> validator.validateSlotRange(LocalDate.of(2026, 2, 1), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .doesNotThrowAnyException();
        assertThatCode(() -> validator.validateSlotRange(LocalDate.of(2026, 2, 15), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 25), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 2, 16), LocalTime.of(10, 0), LocalTime.of(12, 0)))
                .isInstanceOf(FacilityBookingException.OutOfBookingWindowException.class);
    }

    @Test
    @DisplayName("창 밖 거부 메시지에 현재 예약 가능한 구간이 담긴다")
    void rejectionMessageCarriesWindow() {
        BookingPolicyValidator validator = validatorAt(FIRST_HALF);
        assertThatThrownBy(() -> validator.validateSlotRange(LocalDate.of(2026, 1, 10), LocalTime.of(18, 0), LocalTime.of(20, 0)))
                .hasMessageContaining("1월 16일")
                .hasMessageContaining("1월 31일");
    }

    @Test
    @DisplayName("동아리의 활성 신청이 상한에 도달하면 새 신청이 거부된다")
    void rejectsWhenActiveCapReached() {
        BookingPolicyValidator validator = validatorAt(FIRST_HALF);
        assertThatCode(() -> validator.validateActiveCap(9)).doesNotThrowAnyException();
        assertThatThrownBy(() -> validator.validateActiveCap(10))
                .isInstanceOf(FacilityBookingException.ActiveBookingLimitExceededException.class);
    }
}
```

(기존 `todayPastSlotRejected`는 반월 창에서 오늘이 항상 창 밖이라 창 예외에 흡수 — 별도 케이스 삭제, 방어 가드는 코드에 유지.)

- [ ] **Step 5: 검증 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "*BookingPolicyValidatorTest" --tests "*HalfMonthBookingWindowPolicyTest"`
Expected: PASS (전체 스위트는 Task 5에서 정합화 — 이 시점에 acceptance 일부 실패는 예상됨)

```bash
git add backend
git commit -m "feat(backend): 예약 창 검증·가용성 응답을 BookingWindowPolicy 위임으로 교체"
```

---

### Task 4: 공개 API — GET /facilities/booking-window

**Files:**
- Create: `controller/dto/response/BookingWindowResponse.java`
- Modify: `api/FacilityAvailabilityApi.java`, `controller/FacilityAvailabilityController.java`, `service/GeneralFacilityAvailabilityService.java`(+인터페이스 `FacilityAvailabilityService`가 있으면 그쪽에도 — 실파일 확인)
- Test: `FacilityAvailabilityAcceptanceTest.java`에 케이스 추가

**Interfaces:**
- Produces: `GET /api/v1/facilities/booking-window` → `ApiResponse<BookingWindowResponse{bookableFrom, bookableUntil}>` (LocalDate → ISO 직렬화, permitAll — `facilities/**` 매처가 커버)

- [ ] **Step 1: DTO**

```java
package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.service.BookingWindow;
import java.time.LocalDate;

/** 현재 예약 오픈 구간(설계 §1.5) — 시설 카드 화면이 시설 선택 전에 구간을 표시하기 위한 전 시설 공통 값. */
public record BookingWindowResponse(LocalDate bookableFrom, LocalDate bookableUntil) {

    public static BookingWindowResponse from(BookingWindow window) {
        return new BookingWindowResponse(window.from(), window.until());
    }
}
```

- [ ] **Step 2: API 인터페이스·컨트롤러·서비스** — `FacilityAvailabilityApi`에 추가(기존 스타일):

```java
@Operation(summary = "현재 예약 오픈 구간 (비로그인)",
        description = "반월 오픈 정책 등 현재 신청 가능한 날짜 구간. 전 시설 공통.")
@GetMapping("/facilities/booking-window")
ResponseEntity<ApiResponse<BookingWindowResponse>> getBookingWindow();
```

컨트롤러 구현은 기존 메서드들의 `ResponseEntity.ok().cacheControl(...)` 스타일을 그대로 따르고(파일을 열어 확인), 서비스에 위임:

```java
public BookingWindowResponse getBookingWindow() {
    LocalDate today = LocalDate.now(clock);
    return BookingWindowResponse.from(bookingWindowPolicy.windowFor(today));
}
```

(availability 서비스에 인터페이스(`FacilityAvailabilityService`)가 존재하면 시그니처를 인터페이스에 추가하고 구현 — 파일 구조를 열어 관례대로.)

- [ ] **Step 3: acceptance 테스트 추가** — `FacilityAvailabilityAcceptanceTest`에(기존 스타일·실클록+상대 계산):

```java
@Test
@DisplayName("예약 오픈 구간 API 는 비로그인으로 현재 구간을 반환하고 가용성 응답의 창과 일치한다")
void bookingWindowMatchesAvailabilityWindow() {
    BookingWindow expected = bookingWindowPolicy.windowFor(LocalDate.now(clock));

    BookingWindowResponse response = RestAssured.given()
            .when().get("/api/v1/facilities/booking-window")
            .then().statusCode(200)
            .extract().jsonPath().getObject("data", BookingWindowResponse.class);

    assertThat(response.bookableFrom()).isEqualTo(expected.from());
    assertThat(response.bookableUntil()).isEqualTo(expected.until());
}
```

(`@Autowired BookingWindowPolicy bookingWindowPolicy;` 추가. RestAssured 사용 형태는 파일 내 기존 케이스 스타일을 그대로 — 서비스 직호출 스타일이면 그에 맞춘다.)

- [ ] **Step 4: 검증 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "*FacilityAvailabilityAcceptanceTest"`
Expected: 신규 케이스 PASS (기존 bookableUntil 단언 실패는 Task 5 대상 — 실패 목록을 보고서에 기록)

```bash
git add backend
git commit -m "feat(backend): 예약 오픈 구간 공개 API — GET /facilities/booking-window"
```

---

### Task 5: 기존 테스트 창 정합화 (전수)

**Files:**
- Create: `backend/src/test/java/com/duing/common/fixture/BookingWindowFixture.java`
- Modify: 창 의존 테스트 전부 — 최소: `FacilityAvailabilityAcceptanceTest`(bookableUntil·익월 단언), `AdminFacilityBookingAcceptanceTest`(`plusDays(3)` 2곳), `FacilityBookingAdminQueryIntegrationTest`(`bookableDate()` 헬퍼), 그 외 `grep -rn "plusDays" backend/src/test/java/com/duing/domain/facilitybooking`으로 전수 확인해 **서비스/API 경유로 신청을 생성하는 모든 테스트**의 날짜를 교체(리포지토리 직접 save는 검증기를 안 타므로 제외 가능하되, D+N 등 날짜 파생 단언과의 정합은 확인)

**Interfaces:**
- Produces: `BookingWindowFixture.firstBookableDate()` / `.window()` — 프로덕션 반월 정책을 재사용해 "지금 창의 첫 날짜"를 계산(산식 드리프트 방지)

- [ ] **Step 1: 픽스처 헬퍼**

```java
package com.duing.common.fixture;

import com.duing.domain.facilitybooking.service.BookingWindow;
import com.duing.domain.facilitybooking.service.HalfMonthBookingWindowPolicy;
import java.time.LocalDate;

/**
 * 테스트용 "지금 신청 가능한 날짜" — 프로덕션 반월 정책(pivot=15, 기본 설정과 동일)을 재사용해
 * 실행 시점과 무관하게 항상 창 내부 날짜를 만든다(하드코딩 날짜 = CI 타임밤 금지).
 */
public final class BookingWindowFixture {

    private static final HalfMonthBookingWindowPolicy POLICY = new HalfMonthBookingWindowPolicy(15);

    private BookingWindowFixture() {}

    public static BookingWindow window() {
        return POLICY.windowFor(LocalDate.now());
    }

    public static LocalDate firstBookableDate() {
        return window().from();
    }
}
```

- [ ] **Step 2: 전수 교체** — `LocalDate.now().plusDays(3)`류 → `BookingWindowFixture.firstBookableDate()`(같은 테스트에서 서로 다른 날짜 2개가 필요하면 `.from()`과 `.from().plusDays(1)` — 창 길이는 최소 13일이라 안전). `FacilityAvailabilityAcceptanceTest`의 창 단언은 `bookingWindowPolicy.windowFor(...)` 상대 계산으로 교체, "익월 전 날짜가 미래" 단언은 "창 내 날짜의 슬롯이 AVAILABLE"로 재작성.

- [ ] **Step 3: 전체 스위트 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test`
Expected: BUILD SUCCESSFUL (출력에서 확인 — `| tail` 금지)

```bash
git add backend
git commit -m "test(backend): 반월 오픈 창 기준으로 예약 테스트 날짜 전수 정합화"
```

---

### Task 6: 최종 검증 (컨트롤러 수행)

- [ ] `./gradlew build` green + 개발 DB 대상 `bootRun` 부팅 확인(설정 바인딩·빈 구성) + `curl /api/v1/facilities/booking-window` 스모크(오늘 날짜 기준 기대 구간).
- [ ] Fable whole-branch 리뷰 + codex 리뷰 → 픽스 웨이브 → push·PR(base develop).

---

## Out of Scope

- MONTHLY·FREE 모드 구현(키만 예약), 관리자 런타임 설정 UI(P2 — 현재는 env/yml)
- FE 반영(캘린더 기본 월·창 밖 토스트·카드 구간 라벨) — PR-A
- FacilitySlotAssembler의 창 밖 dayStatus 신설 — FE가 메타로 처리(불필요)
