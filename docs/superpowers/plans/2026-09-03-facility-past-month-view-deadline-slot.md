# 시설 예약 — 직전 월 기록 열람 + 신청 마감 슬롯(DEADLINE_PASSED) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 예약 캘린더(`/facilities`)에서 직전 월 예약 기록을 저장 스냅샷 그대로 열람하게 하고, 사용일 전날 12:00(KST) 이 지난 빈 슬롯을 서버가 `DEADLINE_PASSED` 로 내려 FE 가 "신청 마감" 으로 비활성 표시하게 한다.

**Architecture:** BE 는 `BookingDeadlinePolicy` 의 순수 판정 `isPassed` 를 신청 생성 검증과 `FacilitySlotAssembler` 가 공유하고, 슬롯 우선순위를 BLOCKED → PAST → PENDING_HOLD → DEADLINE_PASSED → AVAILABLE 로 재배열해 점유 정보를 보존한다. `GeneralFacilityAvailabilityService` 는 직전 월을 허용하되 `ensureFresh` 를 건너뛰고 스냅샷 완결성으로만 stale 을 판정한다. FE 는 `isSelectableSlot` fail-closed 를 그대로 두고 `isDayApplicationClosed`/`hasApplicableSlot` 두 파생만 추가해 행·CTA 를 게이팅하며, 월 이동·주 이동·셀 파생을 열람 범위(직전 월·당월·익월)로 넓힌다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / JUnit 5 + Mockito + Testcontainers(인수) · Next.js 15 / React 19 / vitest + testing-library + msw.

**Spec:** `docs/superpowers/specs/2026-09-03-facility-past-month-view-deadline-slot-design.md` (§ 번호는 이 문서 기준)

## Global Constraints

- 사용자 확정(스펙 §0): 관리자 크롤 탭 무변경 · 직전 월 온디맨드 재크롤 금지 · 점유(BLOCKED·PENDING_HOLD) 슬롯을 DEADLINE_PASSED 로 덮지 않음 · `isSelectableSlot` 무변경 · 폼 힌트·서버 검증 유지.
- 신청 정책(`BookingApplicationPolicy`·`BookingPolicyValidator`·`GeneralFacilityBookingService.create`)·DB·크롤러 무변경.
- 커밋 메시지: Conventional Commits + 한국어 `{type}({scope}): 대상 — 변경점`. **Co-Authored-By / 🤖 Generated 라인 금지.**
- **구현자는 push · PR 생성 · 머지를 절대 하지 않는다** — 컨트롤러가 리뷰 후 수행한다.
- 모든 "완료" 보고는 실제 명령 출력 근거. 미검증 결과 보고 금지.
- BE 명령은 `backend/` 에서 `./gradlew`, FE 명령은 `frontend/` 에서 `pnpm`. 파일은 EOF newline 으로 끝낸다.
- 인수 테스트에서 `AVAILABLE` 을 단언하는 날짜는 `LocalDate.now(clock).plusDays(2)` 이상(마감 정책상 D+1 은 KST 12:01 이후 `DEADLINE_PASSED`).
- 브랜치: BE = `feat/facility-past-month-deadline-slot-be`(현재 체크아웃, 스펙·플랜 커밋 포함), FE = `feat/facility-past-month-deadline-slot-fe`(develop `d9ea5e3d` 에서 분기, Task F1 Step 0).

---

## Part A — Backend (`feat/facility-past-month-deadline-slot-be`)

### Task 1 (B1): `BookingDeadlinePolicy.isPassed` 순수 판정 분리

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/BookingDeadlinePolicy.java`
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/BookingDeadlinePolicyTest.java`

**Interfaces:**
- Produces: `public static boolean isPassed(LocalDate reservationDate, LocalDateTime now)` — `now` 는 KST 벽시계. D-1 12:01:00 부터 true. Task B2 의 어셈블러가 호출한다.
- `validate(LocalDate, LocalDateTime)` 시그니처·예외 불변.

- [ ] **Step 1: 실패하는 테스트 추가**

`BookingDeadlinePolicyTest.java` 상단 import 에 `import static org.assertj.core.api.Assertions.assertThat;` 를 추가하고, 클래스 끝(마지막 `}` 앞)에 추가:

```java
    @Test
    @DisplayName("isPassed — 전날 12:00:59 까지 false, 12:01:00 부터 true, 당일은 항상 true, 이틀 전은 false")
    void isPassedSharesTheSameBoundaryAsValidate() {
        assertThat(BookingDeadlinePolicy.isPassed(USE_DATE, LocalDateTime.of(2026, 7, 19, 11, 59, 0))).isFalse();
        assertThat(BookingDeadlinePolicy.isPassed(USE_DATE, LocalDateTime.of(2026, 7, 19, 12, 0, 59))).isFalse();
        assertThat(BookingDeadlinePolicy.isPassed(USE_DATE, LocalDateTime.of(2026, 7, 19, 12, 1, 0))).isTrue();
        assertThat(BookingDeadlinePolicy.isPassed(USE_DATE, LocalDateTime.of(2026, 7, 20, 0, 0, 1))).isTrue();
        assertThat(BookingDeadlinePolicy.isPassed(USE_DATE, LocalDateTime.of(2026, 7, 18, 23, 59, 59))).isFalse();
    }
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.facilitybooking.service.BookingDeadlinePolicyTest'`
Expected: 컴파일 실패 — `isPassed` 없음.

- [ ] **Step 3: 구현**

`BookingDeadlinePolicy.java` 본문을 다음으로 교체(클래스 javadoc 은 유지하고 마지막 문장 뒤에 "순수 판정 `isPassed` 는 가용성 슬롯 조립(FacilitySlotAssembler)과 공유한다." 를 덧붙인다):

```java
public class BookingDeadlinePolicy {

    private static final LocalTime CUTOFF_EXCLUSIVE = LocalTime.of(12, 1);

    /**
     * 순수 판정 — 신청 생성 검증(validate)과 가용성 슬롯 조립(FacilitySlotAssembler)이 공유한다.
     * now 는 KST 벽시계(호출부가 seoulClock 에서 뽑는다). 사용일 전날 12:01:00 부터 true(12:00:59 는 false).
     */
    public static boolean isPassed(LocalDate reservationDate, LocalDateTime now) {
        LocalDateTime applicationDeadline = reservationDate.minusDays(1).atTime(CUTOFF_EXCLUSIVE);
        return !now.isBefore(applicationDeadline);
    }

    public void validate(LocalDate reservationDate, LocalDateTime now) {
        if (isPassed(reservationDate, now)) {
            throw new FacilityBookingException.DeadlinePassedException();
        }
    }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.facilitybooking.service.BookingDeadlinePolicyTest' --tests 'com.duing.domain.facilitybooking.service.BookingApplicationPolicyTest'`
Expected: BUILD SUCCESSFUL, 두 클래스 전부 PASS(기존 validate 경계 케이스 무회귀).

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking/service/BookingDeadlinePolicy.java backend/src/test/java/com/duing/domain/facilitybooking/service/BookingDeadlinePolicyTest.java
git commit -m "refactor(backend): 신청 마감 정책 — 순수 판정 isPassed 를 분리해 슬롯 조립과 공유 가능하게"
```

---

### Task 2 (B2): `SlotStatus.DEADLINE_PASSED` + 슬롯 우선순위 재배열(점유 보존)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/controller/dto/response/FacilityAvailabilityResponse.java:21`
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/FacilitySlotAssembler.java` (클래스 javadoc, `assembleDay`, `resolveSlot`)
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/FacilitySlotAssemblerTest.java`

**Interfaces:**
- Consumes: `BookingDeadlinePolicy.isPassed(LocalDate, LocalDateTime)` (Task B1).
- Produces: `SlotStatus.DEADLINE_PASSED`. `assembleDays(YearMonth, LocalDate today, LocalTime nowTime, List<CrawlSlice>, List<BookingSlice>)` 시그니처 불변(Task B3 가 그대로 호출).
- 우선순위(스펙 §2.3): BLOCKED(INTERNAL) → BLOCKED(SCHOOL) → PAST → PENDING_HOLD → DEADLINE_PASSED → AVAILABLE. `availableSlotCount` = AVAILABLE + (마감 전 날짜의 PENDING_HOLD).

- [ ] **Step 1: 실패하는 테스트 작성**

`FacilitySlotAssemblerTest.java` 의 기존 `pastDatesAndSlots` 를 다음으로 교체하고(당일 남은 슬롯은 당일 마감이라 `DEADLINE_PASSED`), 그 아래에 신규 4개를 추가한다. 상단 import 에 `import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotAvailability;` 를 추가한다.

```java
    @Test
    @DisplayName("지난 날짜는 dayStatus=PAST, 오늘은 end≤now 슬롯이 PAST 이고 남은 슬롯은 당일 마감이라 DEADLINE_PASSED 다 (now=12:30)")
    void pastDatesAndSlots() {
        List<DayAvailability> days = FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, List.of(), List.of());

        assertThat(day(days, 10).dayStatus()).isEqualTo(DayStatus.PAST);
        DayAvailability today = day(days, 15);
        assertThat(slotStatus(today, 9)).isEqualTo(SlotStatus.PAST);
        assertThat(slotStatus(today, 11)).isEqualTo(SlotStatus.PAST);   // 11~12, end 12:00 ≤ 12:30
        // 12~13 은 아직 지나지 않았지만 당일 사용 신청은 정의상 항상 마감(BookingDeadlinePolicy) → DEADLINE_PASSED
        assertThat(slotStatus(today, 12)).isEqualTo(SlotStatus.DEADLINE_PASSED);
        assertThat(today.availableSlotCount()).isZero();
        assertThat(today.dayStatus()).isEqualTo(DayStatus.FULL);
    }

    @Test
    @DisplayName("마감된 익일(전날 12:01 경과): 빈 슬롯만 DEADLINE_PASSED, 점유(SCHOOL·INTERNAL)·대기 슬롯은 상태를 유지하고 availableSlotCount=0·FULL 이다")
    void deadlinePassedDayKeepsOccupancyAndMarksEmptySlots() {
        LocalDate tomorrow = LocalDate.of(2026, 1, 16); // 오늘 1/15 12:30 → 1/16 은 마감(12:01 경과)
        List<CrawlSlice> crawl = List.of(new CrawlSlice(tomorrow, LocalTime.of(10, 0), LocalTime.of(11, 0),
                "총학생회", CrawlRowType.CRAWLED_RESERVATION));
        List<BookingSlice> bookings = List.of(
                new BookingSlice(tomorrow, LocalTime.of(14, 0), LocalTime.of(15, 0), BookingStatus.APPROVED, "두잉밴드"),
                new BookingSlice(tomorrow, LocalTime.of(16, 0), LocalTime.of(17, 0), BookingStatus.PENDING, null));

        DayAvailability day = day(FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, crawl, bookings), 16);

        assertThat(slotStatus(day, 9)).isEqualTo(SlotStatus.DEADLINE_PASSED);
        SlotAvailability school = day.slots().get(10 - 9);
        assertThat(school.status()).isEqualTo(SlotStatus.BLOCKED);
        assertThat(school.blockedBy()).isEqualTo(SlotBlockSource.SCHOOL);
        assertThat(school.organization()).isEqualTo("총학생회");
        SlotAvailability internal = day.slots().get(14 - 9);
        assertThat(internal.status()).isEqualTo(SlotStatus.BLOCKED);
        assertThat(internal.blockedBy()).isEqualTo(SlotBlockSource.INTERNAL);
        assertThat(internal.organization()).isEqualTo("두잉밴드");
        assertThat(slotStatus(day, 16)).isEqualTo(SlotStatus.PENDING_HOLD); // 대기 예약은 DEADLINE_PASSED 로 덮지 않는다
        assertThat(slotStatus(day, 21)).isEqualTo(SlotStatus.DEADLINE_PASSED);
        // 마감된 날의 대기 슬롯은 새 신청 대상이 아니라 세지 않는다 → 0 → FULL
        assertThat(day.availableSlotCount()).isZero();
        assertThat(day.dayStatus()).isEqualTo(DayStatus.FULL);
    }

    @Test
    @DisplayName("마감 경계(전날 12:00 KST 벽시계): now=12:00 이면 익일 빈 슬롯 AVAILABLE, now=12:01 이면 DEADLINE_PASSED, 이틀 뒤는 12:01 에도 AVAILABLE")
    void deadlineBoundaryAtNoonOfPreviousDay() {
        List<DayAvailability> atNoon = FacilitySlotAssembler.assembleDays(
                MONTH, TODAY, LocalTime.of(12, 0), List.of(), List.of());
        assertThat(slotStatus(day(atNoon, 16), 9)).isEqualTo(SlotStatus.AVAILABLE);
        assertThat(day(atNoon, 16).availableSlotCount()).isEqualTo(13);

        List<DayAvailability> afterNoon = FacilitySlotAssembler.assembleDays(
                MONTH, TODAY, LocalTime.of(12, 1), List.of(), List.of());
        assertThat(slotStatus(day(afterNoon, 16), 9)).isEqualTo(SlotStatus.DEADLINE_PASSED);
        assertThat(day(afterNoon, 16).availableSlotCount()).isZero();
        assertThat(slotStatus(day(afterNoon, 17), 9)).isEqualTo(SlotStatus.AVAILABLE);
    }

    @Test
    @DisplayName("지난 날짜(직전 월 기록 열람): 점유 슬롯은 BLOCKED 를 보존하고 빈 슬롯·대기 슬롯은 PAST 다(DEADLINE_PASSED 아님)")
    void pastDayPreservesOccupancyAndUsesPastForEmptySlots() {
        LocalDate pastDate = LocalDate.of(2026, 1, 10);
        List<CrawlSlice> crawl = List.of(new CrawlSlice(pastDate, LocalTime.of(10, 0), LocalTime.of(12, 0),
                "비호응원단", CrawlRowType.CRAWLED_RESERVATION));
        List<BookingSlice> bookings = List.of(
                new BookingSlice(pastDate, LocalTime.of(14, 0), LocalTime.of(15, 0), BookingStatus.CONFIRMED, "두잉밴드"),
                new BookingSlice(pastDate, LocalTime.of(17, 0), LocalTime.of(18, 0), BookingStatus.PENDING, null));

        DayAvailability day = day(FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, crawl, bookings), 10);

        for (int hour : new int[] {10, 11}) {
            SlotAvailability slot = day.slots().get(hour - 9);
            assertThat(slot.status()).isEqualTo(SlotStatus.BLOCKED);
            assertThat(slot.blockedBy()).isEqualTo(SlotBlockSource.SCHOOL);
            assertThat(slot.organization()).isEqualTo("비호응원단");
        }
        SlotAvailability internal = day.slots().get(14 - 9);
        assertThat(internal.status()).isEqualTo(SlotStatus.BLOCKED);
        assertThat(internal.blockedBy()).isEqualTo(SlotBlockSource.INTERNAL);
        assertThat(internal.organization()).isEqualTo("두잉밴드");
        assertThat(slotStatus(day, 9)).isEqualTo(SlotStatus.PAST);
        assertThat(slotStatus(day, 17)).isEqualTo(SlotStatus.PAST); // 지난 시간대의 대기 신청은 홀드 의미가 없다(기존 동작)
        assertThat(slotStatus(day, 21)).isEqualTo(SlotStatus.PAST);
        assertThat(day.dayStatus()).isEqualTo(DayStatus.PAST);
        assertThat(day.availableSlotCount()).isZero();
    }

    @Test
    @DisplayName("오늘: 지난 시간대의 점유 슬롯은 BLOCKED 를 보존하고, 지난 빈 슬롯은 PAST, 남은 빈 슬롯은 DEADLINE_PASSED 다")
    void todayElapsedOccupiedSlotStaysBlocked() {
        List<CrawlSlice> crawl = List.of(new CrawlSlice(TODAY, LocalTime.of(9, 0), LocalTime.of(10, 0),
                "총학생회", CrawlRowType.CRAWLED_RESERVATION));

        DayAvailability today = day(FacilitySlotAssembler.assembleDays(MONTH, TODAY, NOW, crawl, List.of()), 15);

        SlotAvailability elapsedOccupied = today.slots().get(0);
        assertThat(elapsedOccupied.status()).isEqualTo(SlotStatus.BLOCKED);
        assertThat(elapsedOccupied.organization()).isEqualTo("총학생회");
        assertThat(slotStatus(today, 10)).isEqualTo(SlotStatus.PAST);
        assertThat(slotStatus(today, 13)).isEqualTo(SlotStatus.DEADLINE_PASSED);
    }
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.facilitybooking.service.FacilitySlotAssemblerTest'`
Expected: 컴파일 실패 — `SlotStatus.DEADLINE_PASSED` 없음.

- [ ] **Step 3: enum 추가**

`FacilityAvailabilityResponse.java:21` 을 교체:

```java
    /**
     * DEADLINE_PASSED = 신청 마감(사용일 전날 12:00 KST 경과, BookingDeadlinePolicy 와 동일 경계). 빈 슬롯에만 부여하며
     * 점유 슬롯은 BLOCKED·PENDING_HOLD 를 유지한다. PAST 는 이미 지난 시간대(지난 날짜 포함)의 빈 슬롯.
     */
    public enum SlotStatus { AVAILABLE, PENDING_HOLD, BLOCKED, PAST, DEADLINE_PASSED }
```

- [ ] **Step 4: 어셈블러 우선순위 재배열**

`FacilitySlotAssembler.java` 클래스 javadoc 의 우선순위 문장을 교체:

```
 * 비차단이라 다른 동아리가 그 시간대를 신청할 수 있다(2026-08-27 비차단 전환). 슬롯 판정 우선순위(공존 시 표시 순서):
 * BLOCKED(INTERNAL) → BLOCKED(SCHOOL) → PAST → PENDING_HOLD → DEADLINE_PASSED → AVAILABLE.
 * 점유(BLOCKED)가 PAST 보다 앞이라 지난 시간대·직전 월 날짜에서도 "누가 예약했는지"가 기록으로 보존되고(2026-09-03
 * 직전 월 열람), DEADLINE_PASSED(사용일 전날 12:00 KST 경과, BookingDeadlinePolicy.isPassed 공유)는 빈 슬롯에만 붙는다.
```

`assembleDay` 의 슬롯 루프를 교체(`List<SlotAvailability> slots = ...` 부터 `for` 끝까지):

```java
        // 신청 마감(사용일 전날 12:00 KST) — 날짜당 1회 판정. 신청 생성 검증(BookingApplicationPolicy)과 같은 순수 규칙을 공유한다.
        boolean deadlinePassed = BookingDeadlinePolicy.isPassed(date, today.atTime(nowTime));

        List<SlotAvailability> slots = new ArrayList<>(SLOT_COUNT);
        int availableCount = 0;
        for (int index = 0; index < SLOT_COUNT; index++) {
            LocalTime slotStart = OPEN_TIME.plusHours(index);
            LocalTime slotEnd = slotStart.plusHours(1);
            SlotAvailability slot = resolveSlot(date, today, nowTime, deadlinePassed, slotStart, slotEnd,
                    crawledReservations, blockedBookings, pendingBookings);
            // 마감된 날의 대기 슬롯은 새 신청 대상이 아니므로 세지 않는다 — 월간 셀이 FULL("마감")로 수렴한다.
            if (slot.status() == SlotStatus.AVAILABLE
                    || (slot.status() == SlotStatus.PENDING_HOLD && !deadlinePassed)) {
                availableCount++;
            }
            slots.add(slot);
        }
```

`resolveSlot` 전체를 교체:

```java
    private static SlotAvailability resolveSlot(LocalDate date, LocalDate today, LocalTime nowTime,
                                                boolean deadlinePassed,
                                                LocalTime slotStart, LocalTime slotEnd,
                                                List<CrawlSlice> crawledReservations,
                                                List<BookingSlice> blockedBookings,
                                                List<BookingSlice> pendingBookings) {
        String start = TIME_FORMAT.format(slotStart);
        String end = TIME_FORMAT.format(slotEnd);
        // 점유 정보가 최우선 — 지난 시간대·마감된 날에도 "누가 예약했는지"는 기록으로 보존한다(직전 월 열람 스펙 §2.3).
        Optional<BookingSlice> internalBlock = blockedBookings.stream()
                .filter(slice -> overlaps(slice.start(), slice.end(), slotStart, slotEnd))
                .findFirst();
        if (internalBlock.isPresent()) {
            // 내부 예약(APPROVED/CONFIRMED)은 승인 완료 상태라 학교 반영 후 크롤 SCHOOL 행으로 어차피 실명
            // 공개되므로 동아리명을 노출한다(2026-07-17 사용자 결정 §4⁗.1 — 구 비노출 정책 부분 반전).
            // organization 은 서비스가 blocksSlot 예약에만 주입하며, soft-delete 로 이름을 못 찾으면 null
            // (FE '예약됨' 폴백). PENDING 은 신청 경쟁 정보라 아래 PENDING_HOLD 분기에서 계속 비노출.
            return new SlotAvailability(start, end, SlotStatus.BLOCKED,
                    SlotBlockSource.INTERNAL, internalBlock.get().organization());
        }
        Optional<CrawlSlice> schoolBlock = crawledReservations.stream()
                .filter(slice -> overlaps(slice.start(), slice.end(), slotStart, slotEnd))
                .findFirst();
        if (schoolBlock.isPresent()) {
            return new SlotAvailability(start, end, SlotStatus.BLOCKED,
                    SlotBlockSource.SCHOOL, schoolBlock.get().organization());
        }
        if (date.isBefore(today) || (date.isEqual(today) && !slotEnd.isAfter(nowTime))) {
            return new SlotAvailability(start, end, SlotStatus.PAST, null, null);
        }
        // 기본 확보 시간(BASIC_SECURED_TIME)은 비차단 — 여기까지 오면 확보 구간이라도 PENDING_HOLD/AVAILABLE 로 내려간다.
        boolean pendingHold = pendingBookings.stream()
                .anyMatch(slice -> overlaps(slice.start(), slice.end(), slotStart, slotEnd));
        if (pendingHold) {
            // 승인 대기 동아리명은 비노출(설계 §3.1 — 신청 경쟁 정보 최소화). 마감된 날에도 대기 상태를 유지한다(§0-2).
            return new SlotAvailability(start, end, SlotStatus.PENDING_HOLD, null, null);
        }
        // 빈 슬롯만 마감 판정 — 점유·대기 슬롯은 위에서 이미 돌아갔다.
        if (deadlinePassed) {
            return new SlotAvailability(start, end, SlotStatus.DEADLINE_PASSED, null, null);
        }
        return new SlotAvailability(start, end, SlotStatus.AVAILABLE, null, null);
    }
```

- [ ] **Step 5: 통과 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.facilitybooking.service.FacilitySlotAssemblerTest'`
Expected: BUILD SUCCESSFUL, 기존 8 + 신규 4 전부 PASS.

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking/controller/dto/response/FacilityAvailabilityResponse.java backend/src/main/java/com/duing/domain/facilitybooking/service/FacilitySlotAssembler.java backend/src/test/java/com/duing/domain/facilitybooking/service/FacilitySlotAssemblerTest.java
git commit -m "feat(backend): 가용성 슬롯 — 신청 마감 DEADLINE_PASSED 추가·점유 정보가 PAST 를 이기도록 우선순위 재배열"
```

---

### Task 3 (B3): 직전 월 열람(재크롤 없음) + 예외 메시지 + 서비스 단위·인수 테스트

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/GeneralFacilityAvailabilityService.java:59-100` (`getAvailability`), `:150-154` (`isStale` 주석)
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/FacilityAvailabilityService.java:12`
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/exception/FacilityBookingException.java:29` (메시지)
- Create: `backend/src/test/java/com/duing/domain/facilitybooking/service/GeneralFacilityAvailabilityServiceTest.java`
- Modify: `backend/src/test/java/com/duing/domain/facilitybooking/controller/FacilityAvailabilityAcceptanceTest.java` (`rejectsMonthOutOfBookingRange`, 신규 케이스, `plusDays(1)`→`plusDays(2)` 2곳)

**Interfaces:**
- Consumes: Task B2 의 `SlotStatus.DEADLINE_PASSED`·`assembleDays`.
- Produces: `GET /facilities/{id}/availability?yearMonth=` 가 직전 월 200(재크롤 없음), 두 달 전/두 달 뒤 400. 응답 필드 무변경.

- [ ] **Step 1: 단위 테스트 신규 작성(실패)**

`GeneralFacilityAvailabilityServiceTest.java`:

```java
package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.never;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facility.service.FacilityCrawlService;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotAvailability;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotBlockSource;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse.SlotStatus;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.domain.facilitybooking.repository.FacilityBookingPurposePresetRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 가용성 서비스의 시간대·월 범위 판정 단위 테스트 — Clock.fixed(Asia/Seoul) 로 UTC 인스턴트를 KST 벽시계에 대응시켜
 * 마감 경계(전날 12:00 KST)와 직전 월 열람(재크롤 없음·스냅샷 완결성 stale)을 결정적으로 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class GeneralFacilityAvailabilityServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final long FACILITY_ID = 1L;

    @Mock FacilityRepository facilityRepository;
    @Mock FacilityReservationRepository facilityReservationRepository;
    @Mock FacilityMonthSnapshotRepository facilityMonthSnapshotRepository;
    @Mock FacilityBookingRepository facilityBookingRepository;
    @Mock FacilityBookingPurposePresetRepository purposePresetRepository;
    @Mock ClubRepository clubRepository;
    @Mock FacilityCrawlService facilityCrawlService;
    @Mock FacilityAvailabilityPolicy availabilityPolicy;

    private GeneralFacilityAvailabilityService serviceAt(String utcInstant) {
        Clock clock = Clock.fixed(Instant.parse(utcInstant), SEOUL);
        BookingApplicationPolicy applicationPolicy =
                new BookingApplicationPolicy(clock, new HalfMonthBookingWindowPolicy(15));
        return new GeneralFacilityAvailabilityService(facilityRepository, facilityReservationRepository,
                facilityMonthSnapshotRepository, facilityBookingRepository, purposePresetRepository,
                clubRepository, facilityCrawlService, availabilityPolicy, applicationPolicy, clock);
    }

    private void stubFacility() {
        Facility facility = Facility.create(90001, "커뮤니티룸(T)", null, 0);
        ReflectionTestUtils.setField(facility, "id", FACILITY_ID);
        given(facilityRepository.findById(FACILITY_ID)).willReturn(Optional.of(facility));
    }

    private static SlotAvailability slotAt(FacilityAvailabilityResponse response, LocalDate date, int startHour) {
        return response.days().get(date.getDayOfMonth() - 1).slots().get(startHour - 9);
    }

    @Test
    @DisplayName("KST 마감 경계: UTC 03:00:59(=KST 12:00:59)엔 익일 빈 슬롯 AVAILABLE, UTC 03:01:00(=KST 12:01:00)엔 DEADLINE_PASSED, 이틀 뒤는 AVAILABLE")
    void kstDeadlineBoundaryDrivesSlotStatus() {
        YearMonth january = YearMonth.of(2026, 1);
        LocalDate tomorrow = LocalDate.of(2026, 1, 16);
        given(facilityCrawlService.ensureFresh(january)).willReturn(DataSource.CACHE);
        stubFacility();

        FacilityAvailabilityResponse beforeCutoff =
                serviceAt("2026-01-15T03:00:59Z").getAvailability(FACILITY_ID, january);
        assertThat(slotAt(beforeCutoff, tomorrow, 9).status()).isEqualTo(SlotStatus.AVAILABLE);

        FacilityAvailabilityResponse afterCutoff =
                serviceAt("2026-01-15T03:01:00Z").getAvailability(FACILITY_ID, january);
        assertThat(slotAt(afterCutoff, tomorrow, 9).status()).isEqualTo(SlotStatus.DEADLINE_PASSED);
        assertThat(slotAt(afterCutoff, tomorrow.plusDays(1), 9).status()).isEqualTo(SlotStatus.AVAILABLE);
    }

    @Test
    @DisplayName("직전 월 조회는 온디맨드 재크롤 없이 저장 스냅샷을 그대로 내리고, 크롤 점유 행은 지난 날짜에서도 BLOCKED(SCHOOL)로 보존된다")
    void previousMonthServesStoredSnapshotWithoutRecrawl() {
        YearMonth january = YearMonth.of(2026, 1);
        LocalDate recordDate = LocalDate.of(2026, 1, 20);
        LocalDateTime crawledAt = LocalDateTime.of(2026, 1, 31, 23, 50);
        stubFacility();
        given(facilityReservationRepository.findByFacilityIdAndYearMonth(FACILITY_ID, january)).willReturn(List.of(
                FacilityReservation.create(FACILITY_ID, 5001L, january, recordDate,
                        LocalTime.of(10, 0), LocalTime.of(12, 0), "비호응원단", false, crawledAt)));
        given(availabilityPolicy.classify(any(), any())).willReturn(CrawlRowType.CRAWLED_RESERVATION);
        given(facilityMonthSnapshotRepository.findByYearMonth(january)).willReturn(Optional.of(
                FacilityMonthSnapshot.create(january, crawledAt, CrawlSource.SCHEDULER, FetchStatus.SUCCESS, null)));

        // 2026-02-10 12:00 KST — 1월은 직전 월
        FacilityAvailabilityResponse response =
                serviceAt("2026-02-10T03:00:00Z").getAvailability(FACILITY_ID, january);

        then(facilityCrawlService).should(never()).ensureFresh(any());
        assertThat(response.yearMonth()).isEqualTo("2026-01");
        assertThat(response.days()).hasSize(31);
        assertThat(response.stale()).isFalse();
        assertThat(response.lastUpdatedAt()).isEqualTo(crawledAt.atZone(SEOUL).toInstant());
        for (int hour : new int[] {10, 11}) {
            SlotAvailability slot = slotAt(response, recordDate, hour);
            assertThat(slot.status()).isEqualTo(SlotStatus.BLOCKED);
            assertThat(slot.blockedBy()).isEqualTo(SlotBlockSource.SCHOOL);
            assertThat(slot.organization()).isEqualTo("비호응원단");
        }
        assertThat(slotAt(response, recordDate, 9).status()).isEqualTo(SlotStatus.PAST);
        assertThat(response.days().get(recordDate.getDayOfMonth() - 1).dayStatus())
                .isEqualTo(FacilityAvailabilityResponse.DayStatus.PAST);
    }

    @Test
    @DisplayName("직전 월 스냅샷이 없거나 SUCCESS 가 아니면 stale=true 다(TTL 아닌 기록 완결성 판정) — 역시 재크롤은 없다")
    void previousMonthWithoutSuccessfulSnapshotIsStale() {
        YearMonth january = YearMonth.of(2026, 1);
        stubFacility();

        FacilityAvailabilityResponse missing =
                serviceAt("2026-02-10T03:00:00Z").getAvailability(FACILITY_ID, january);
        assertThat(missing.stale()).isTrue();
        assertThat(missing.lastUpdatedAt()).isNull();

        given(facilityMonthSnapshotRepository.findByYearMonth(january)).willReturn(Optional.of(
                FacilityMonthSnapshot.create(january, LocalDateTime.of(2026, 1, 31, 23, 50),
                        CrawlSource.SCHEDULER, FetchStatus.PARTIAL, "일부 실패")));
        FacilityAvailabilityResponse partial =
                serviceAt("2026-02-10T03:00:00Z").getAvailability(FACILITY_ID, january);
        assertThat(partial.stale()).isTrue();

        then(facilityCrawlService).should(never()).ensureFresh(any());
    }

    @Test
    @DisplayName("열람 범위는 직전 월·당월·익월 — 두 달 전·두 달 뒤는 400 예외이고, 당월·익월은 기존대로 ensureFresh 를 탄다")
    void viewableRangeIsPreviousCurrentAndNextMonth() {
        GeneralFacilityAvailabilityService service = serviceAt("2026-02-10T03:00:00Z");

        assertThatThrownBy(() -> service.getAvailability(FACILITY_ID, YearMonth.of(2025, 12)))
                .isInstanceOf(FacilityBookingException.MonthOutOfBookingRangeException.class);
        assertThatThrownBy(() -> service.getAvailability(FACILITY_ID, YearMonth.of(2026, 4)))
                .isInstanceOf(FacilityBookingException.MonthOutOfBookingRangeException.class);

        stubFacility();
        given(facilityCrawlService.ensureFresh(any())).willReturn(DataSource.CACHE);
        service.getAvailability(FACILITY_ID, YearMonth.of(2026, 2));
        service.getAvailability(FACILITY_ID, YearMonth.of(2026, 3));
        then(facilityCrawlService).should().ensureFresh(YearMonth.of(2026, 2));
        then(facilityCrawlService).should().ensureFresh(YearMonth.of(2026, 3));
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.facilitybooking.service.GeneralFacilityAvailabilityServiceTest'`
Expected: `previousMonth*` 2건이 `MonthOutOfBookingRangeException` 으로 FAIL(직전 월이 아직 400). `viewableRange*`(두 달 전·뒤는 구 코드도 400, 당월·익월은 구 코드도 ensureFresh)와 `kstDeadlineBoundary*`(Task 2 완료 상태)는 구 코드에서도 PASS 하는 것이 정상이다 — 없는 실패를 쫓지 말 것.

- [ ] **Step 3: 서비스 구현**

`GeneralFacilityAvailabilityService.getAvailability` 를 교체:

```java
    @Override
    public FacilityAvailabilityResponse getAvailability(Long facilityId, YearMonth requestedMonth) {
        YearMonth currentMonth = YearMonth.now(clock);
        YearMonth targetMonth = requestedMonth != null ? requestedMonth : currentMonth;
        // 열람 범위 = 직전 월·당월·익월. 직전 월은 기록 열람 전용(저장 스냅샷 그대로, 재크롤 없음 — 2026-09-03 스펙 §2.1).
        // 신청 가능 범위는 별개로 BookingApplicationPolicy(반월 창·마감)가 판정한다.
        if (targetMonth.isBefore(currentMonth.minusMonths(1)) || targetMonth.isAfter(currentMonth.plusMonths(1))) {
            throw new FacilityBookingException.MonthOutOfBookingRangeException();
        }
        boolean pastMonth = targetMonth.isBefore(currentMonth);
        Facility facility = facilityRepository.findById(facilityId)
                .filter(found -> !found.isArchived())
                .orElseThrow(FacilityException.FacilityNotFoundException::new);

        // 직전 월은 크롤 윈도우(당월·익월) 밖이라 온디맨드 재크롤을 걸지 않는다 — 저장된 행을 그대로 보여주는 기록 열람.
        DataSource source = pastMonth ? DataSource.CACHE : facilityCrawlService.ensureFresh(targetMonth);

        // 분류가 차단 여부를 가른다(실예약만 차단·확보 시간 비차단) — 기본 확보 시간 대상 키는 크롤 행이 있을 때만 요청당 1회 조회한다.
        List<FacilityReservation> crawlRows =
                facilityReservationRepository.findByFacilityIdAndYearMonth(facility.getId(), targetMonth);
        Set<String> securedOrganizationKeys =
                crawlRows.isEmpty() ? Set.of() : availabilityPolicy.securedOrganizationKeys();
        List<CrawlSlice> crawlSlices = crawlRows.stream()
                .map(reservation -> new CrawlSlice(
                        reservation.getReservationDate(), reservation.getStartTime(), reservation.getEndTime(),
                        reservation.getOrganizationName(),
                        availabilityPolicy.classify(reservation, securedOrganizationKeys)))
                .toList();

        List<BookingSlice> bookingSlices = toBookingSlices(facility.getId(), targetMonth);

        LocalDateTime currentDateTime = LocalDateTime.now(clock);
        LocalDate today = currentDateTime.toLocalDate();
        LocalTime nowTime = currentDateTime.toLocalTime();
        FacilityMonthSnapshot snapshot = facilityMonthSnapshotRepository.findByYearMonth(targetMonth).orElse(null);
        LocalDateTime crawledAt = snapshot != null ? snapshot.getCrawledAt() : null;
        // 과거 월 기록은 신선도(TTL)가 아니라 완결성만 본다 — TTL 을 적용하면 항상 stale 이 되어 기록 열람 내내 배너가 붙는다.
        boolean stale = pastMonth
                ? isIncompleteRecord(snapshot)
                : isStale(crawledAt, snapshot != null ? snapshot.getFetchStatus() : null, source);

        BookingWindow window = bookingApplicationPolicy.windowFor(today);
        return new FacilityAvailabilityResponse(
                facility.getId(),
                targetMonth.toString(),
                // crawled_at 은 seoulClock 기준 KST wall-clock LocalDateTime 저장값 — TimeMapper 로 절대시각 환산.
                TimeMapper.seoulWallClockToInstant(crawledAt),
                stale,
                window.from(),
                window.until(),
                FacilitySlotAssembler.assembleDays(targetMonth, today, nowTime, crawlSlices, bookingSlices));
    }
```

`isStale` 위 주석과 함께 헬퍼 추가(기존 `isStale` 바로 아래):

```java
    /** 당월·익월은 고정 10분 TTL(선행 스펙 §5.5의 현재·다음월 TTL 정책 파라미터). 직전 월은 isIncompleteRecord 가 대신한다. */
    private boolean isStale(LocalDateTime crawledAt, FetchStatus fetchStatus, DataSource source) {
        return SnapshotFreshnessPolicy.isStale(source, fetchStatus, crawledAt,
                SnapshotFreshnessPolicy.CURRENT_NEXT_TTL, LocalDateTime.now(clock));
    }

    /** 과거 월 기록의 stale — 스냅샷이 없거나 SUCCESS 가 아니면(PARTIAL·FAILED) 불완전한 기록이다. */
    private static boolean isIncompleteRecord(FacilityMonthSnapshot snapshot) {
        return snapshot == null || snapshot.getFetchStatus() != FetchStatus.SUCCESS;
    }
```

`FacilityAvailabilityService.java:12` javadoc 교체:

```java
    /** 월 단위 가용성. requestedMonth null=현재월. 직전 월·당월·익월 외는 400(설계 §3.3·§8.1). 직전 월은 저장 스냅샷 기록 열람(재크롤 없음). */
```

`FacilityBookingException.MonthOutOfBookingRangeException` 메시지 교체(관리자 크롤 탭도 같은 예외를 쓰고 그쪽은 당월·익월이라 두 호출부에 참인 문구):

```java
    public static class MonthOutOfBookingRangeException extends FacilityBookingException {
        public MonthOutOfBookingRangeException() {
            super("조회할 수 있는 기간이 아닙니다.", HttpStatus.BAD_REQUEST);
        }
    }
```

- [ ] **Step 4: 단위 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.facilitybooking.service.GeneralFacilityAvailabilityServiceTest'`
Expected: 4건 PASS.

- [ ] **Step 5: 인수 테스트 갱신**

`FacilityAvailabilityAcceptanceTest.java`:

(a) import 추가: `import static org.mockito.BDDMockito.then;` `import static org.mockito.Mockito.never;`

(b) `rejectsMonthOutOfBookingRange` 교체:

```java
    @Test
    @DisplayName("직전 월·당월·익월 밖의 월 조회는 400 도메인 예외다")
    void rejectsMonthOutOfBookingRange() {
        Facility facility = facilityRepository.save(Facility.create(90002, "커뮤니티룸(T2)", null, 0));

        assertThatThrownBy(() -> availabilityService.getAvailability(facility.getId(), YearMonth.now(clock).plusMonths(2)))
                .isInstanceOf(FacilityBookingException.MonthOutOfBookingRangeException.class);
        assertThatThrownBy(() -> availabilityService.getAvailability(facility.getId(), YearMonth.now(clock).minusMonths(2)))
                .isInstanceOf(FacilityBookingException.MonthOutOfBookingRangeException.class);
    }

    @Test
    @DisplayName("직전 월은 온디맨드 재크롤 없이 저장 행을 그대로 내리고, 지난 날짜의 크롤 점유 행이 BLOCKED(SCHOOL)로 보존된다")
    void previousMonthReturnsStoredRecordsWithoutRecrawl() {
        Facility facility = facilityRepository.save(Facility.create(90008, "커뮤니티룸(T8)", null, 0));
        YearMonth previousMonth = YearMonth.now(clock).minusMonths(1);
        LocalDate recordDate = previousMonth.atDay(10);
        facilityReservationRepository.save(FacilityReservation.create(facility.getId(), 91021L,
                previousMonth, recordDate, LocalTime.of(10, 0), LocalTime.of(12, 0), "비호응원단", false,
                LocalDateTime.now(clock)));

        FacilityAvailabilityResponse response =
                availabilityService.getAvailability(facility.getId(), previousMonth);

        then(facilityCrawlService).should(never()).ensureFresh(previousMonth);
        assertThat(response.days()).hasSize(previousMonth.lengthOfMonth());
        for (String start : new String[] {"10:00", "11:00"}) {
            SlotAvailability slot = slotAt(response, recordDate, start);
            assertThat(slot.status()).isEqualTo(SlotStatus.BLOCKED);
            assertThat(slot.blockedBy()).isEqualTo(SlotBlockSource.SCHOOL);
            assertThat(slot.organization()).isEqualTo("비호응원단");
        }
        assertThat(slotAt(response, recordDate, "09:00").status()).isEqualTo(SlotStatus.PAST);
        FacilityAvailabilityResponse.DayAvailability recordDay = response.days().stream()
                .filter(dayAvailability -> dayAvailability.date().equals(recordDate))
                .findFirst().orElseThrow();
        assertThat(recordDay.dayStatus()).isEqualTo(FacilityAvailabilityResponse.DayStatus.PAST);
        assertThat(recordDay.availableSlotCount()).isZero();
    }
```

(c) `securedTargetRowsDoNotBlockWhileCrawledRowsDo`(`:237` 부근)와 `securedClubRealReservationRowBlocksSlots`(`:295` 부근)의 `LocalDate crawlDate = LocalDate.now(clock).plusDays(1);` 두 곳을 모두 다음으로 교체:

```java
        // AVAILABLE 을 단언하므로 D+2 — D+1 은 KST 12:01 이후 실행 시 마감(DEADLINE_PASSED)이라 시각 의존 실패가 난다.
        LocalDate crawlDate = LocalDate.now(clock).plusDays(2);
```

- [ ] **Step 6: 인수 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests 'com.duing.domain.facilitybooking.controller.FacilityAvailabilityAcceptanceTest' --tests 'com.duing.domain.facilitybooking.controller.AdminFacilityCrawlAcceptanceTest'`
Expected: BUILD SUCCESSFUL(Docker/Testcontainers 필요). 관리자 크롤 탭의 `monthOutOfCrawlWindowIs400` 은 그대로 400.

- [ ] **Step 7: 백엔드 전체 스위트**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL, 실패 0. 결과 요약(테스트 수)을 보고에 적는다.

- [ ] **Step 8: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking/service/GeneralFacilityAvailabilityService.java backend/src/main/java/com/duing/domain/facilitybooking/service/FacilityAvailabilityService.java backend/src/main/java/com/duing/domain/facilitybooking/exception/FacilityBookingException.java backend/src/test/java/com/duing/domain/facilitybooking/service/GeneralFacilityAvailabilityServiceTest.java backend/src/test/java/com/duing/domain/facilitybooking/controller/FacilityAvailabilityAcceptanceTest.java
git commit -m "feat(backend): 시설 가용성 — 직전 월을 저장 스냅샷 그대로 열람 허용(재크롤 없음)·KST 마감 경계 단위 테스트"
```

---

## Part B — Frontend (`feat/facility-past-month-deadline-slot-fe`)

### Task 4 (F1): 타입·계약 주석·순수 파생(`isDayApplicationClosed`/`hasApplicableSlot`)

**Files:**
- Modify: `frontend/packages/types/src/facility.ts:55-60`, `:81-89`
- Modify: `frontend/packages/api/src/client.ts:433`
- Modify: `frontend/apps/web/app/facilities/_lib/bookingCalendar.ts` (`isSelectableSlot` 아래)
- Modify: `frontend/apps/web/app/facilities/_components/booking/DaySlotList.tsx:15-20` (`SLOT_ROW_CLASS` 키 1줄 — typecheck 를 이 태스크에서 초록으로 유지하기 위해. 라벨·게이팅·안내는 Task 5)
- Test: `frontend/apps/web/test/facilities/booking-calendar-lib.test.ts`

**Interfaces:**
- Produces: `BookingSlotStatus` 에 `'DEADLINE_PASSED'`; `isDayApplicationClosed(slots: BookingAvailabilitySlot[]): boolean`; `hasApplicableSlot(slots: BookingAvailabilitySlot[]): boolean`. Task F2·F3·F4 가 소비.
- `isSelectableSlot` 무변경.

- [ ] **Step 0: FE 브랜치 생성**

```bash
git checkout develop && git checkout -b feat/facility-past-month-deadline-slot-fe
```
(`git log --oneline -1` 이 `d9ea5e3d` 인지 확인.)

- [ ] **Step 1: 실패하는 테스트 추가**

`booking-calendar-lib.test.ts` import 목록에 `hasApplicableSlot,` `isDayApplicationClosed,` 를 알파벳 순서 자리에 추가하고, `adjacentMonthToFetch` describe 안에 케이스 1개, 파일 끝에 describe 1개 추가:

```ts
  it('직전 월이 허용 범위에 있으면 지난 주의 인접 전월도 반환한다(기록 열람 — 2026-09-03)', () => {
    // 7/27~8/2 주에서 조회 월=8월이고 허용 범위가 [6,7,8]월이면 7월을 조회한다.
    expect(adjacentMonthToFetch('2026-08-01', '2026-08', ['2026-06', '2026-07', '2026-08'])).toBe('2026-07');
    // 6/29~7/5 주에서 조회 월=7월이면 직전 월 6월도 허용 범위라 조회한다.
    expect(adjacentMonthToFetch('2026-07-01', '2026-07', ['2026-06', '2026-07', '2026-08'])).toBe('2026-06');
  });
```

```ts
describe('isDayApplicationClosed / hasApplicableSlot (신청 마감 날 파생 — 서버 DEADLINE_PASSED 만 본다)', () => {
  it('빈 슬롯이 DEADLINE_PASSED 로 내려온 날은 마감이고, 대기 슬롯이 남아도 신청 가능한 슬롯이 없다', () => {
    const closed = [slot(9, 'DEADLINE_PASSED'), slot(10, 'BLOCKED'), slot(11, 'PENDING_HOLD')];
    expect(isDayApplicationClosed(closed)).toBe(true);
    expect(hasApplicableSlot(closed)).toBe(false);
  });

  it('DEADLINE_PASSED 가 없는 날은 마감이 아니고, AVAILABLE·PENDING_HOLD 가 하나라도 있으면 신청 가능하다', () => {
    const open = [slot(9, 'BLOCKED'), slot(10, 'PENDING_HOLD'), slot(11, 'AVAILABLE')];
    expect(isDayApplicationClosed(open)).toBe(false);
    expect(hasApplicableSlot(open)).toBe(true);
    expect(hasApplicableSlot([slot(9, 'BLOCKED'), slot(10, 'PENDING_HOLD')])).toBe(true);
  });

  it('지난 날짜(PAST·BLOCKED 만)는 마감 표시가 아니지만 신청 가능한 슬롯도 없다', () => {
    const past = [slot(9, 'PAST'), slot(10, 'BLOCKED'), slot(11, 'PAST')];
    expect(isDayApplicationClosed(past)).toBe(false);
    expect(hasApplicableSlot(past)).toBe(false);
  });

  it('isSelectableSlot 은 DEADLINE_PASSED 를 선택 불가로 본다(fail-closed 무변경)', () => {
    expect(isSelectableSlot(slot(9, 'DEADLINE_PASSED'))).toBe(false);
    expect(isSelectableSlot(slot(9, 'PENDING_HOLD'))).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web exec vitest run test/facilities/booking-calendar-lib.test.ts`
Expected: FAIL — `isDayApplicationClosed`/`hasApplicableSlot` export 없음, `'DEADLINE_PASSED'` 타입 오류.

- [ ] **Step 3: 타입·주석·파생 구현**

`packages/types/src/facility.ts:55` 교체:

```ts
// DEADLINE_PASSED = 신청 마감(사용일 전날 12:00 KST 경과, 2026-09-03). 서버가 빈 슬롯에만 부여하고 점유(BLOCKED)·대기(PENDING_HOLD)는 유지한다.
export type BookingSlotStatus = 'AVAILABLE' | 'PENDING_HOLD' | 'BLOCKED' | 'PAST' | 'DEADLINE_PASSED';
```

`packages/types/src/facility.ts` 의 `FacilityAvailabilityResponse` 타입 위 주석(`export type FacilityAvailabilityResponse = {` 바로 위)에 한 줄 추가:

```ts
// 조회 월은 직전 월·당월·익월(2026-09-03). 직전 월은 저장 스냅샷 기록 열람이라 지난 날짜에도 BLOCKED 점유 정보가 보존된다.
```

`packages/api/src/client.ts:433` 주석 교체:

```ts
    // GET /api/v1/facilities/{facilityId}/availability?yearMonth= — 공개. 직전 월·당월·익월만 허용(400). 직전 월은 저장 스냅샷 열람.
```

`bookingCalendar.ts` 의 `isSelectableSlot` 함수 바로 아래에 추가:

```ts
/**
 * 신청이 닫힌 날 파생 — 서버가 빈 슬롯에 DEADLINE_PASSED 를 내린 날(사용일 전날 12:00 KST 경과). 클라 시계를 쓰지 않는다.
 * 점유·대기 슬롯은 상태를 유지하므로 마감 슬롯이 하나라도 있으면 그 날 전체가 마감이다. 잔여 한계: 마감된 날의 빈 칸이
 * 하나도 없으면(전부 점유·대기) 파생이 false 라 대기 행이 선택 가능하게 남는다 — 그 경로는 폼 힌트와 서버 400 이 막는다.
 */
export function isDayApplicationClosed(slots: BookingAvailabilitySlot[]): boolean {
  return slots.some((slot) => slot.status === 'DEADLINE_PASSED');
}

/** 이 날에 새 신청을 시작할 수 있는 슬롯이 있는가 — 마감된 날은 대기 슬롯이 있어도 false. CTA 문구·행 게이팅 공용. */
export function hasApplicableSlot(slots: BookingAvailabilitySlot[]): boolean {
  return !isDayApplicationClosed(slots) && slots.some(isSelectableSlot);
}
```

`DaySlotList.tsx:15-20` 의 `SLOT_ROW_CLASS` 에 키 1줄 추가(PAST 줄 아래) — `Record<BookingAvailabilitySlot['status'], string>` 이라 유니온 확장 즉시 컴파일 오류가 나므로 이 태스크에서 함께 닫는다. 라벨·행 게이팅·안내는 Task 5 가 한다:

```tsx
  DEADLINE_PASSED: 'border-transparent bg-graysoft/60 text-charcoal-3',
```

- [ ] **Step 4: 통과·타입 확인**

Run: `cd frontend && pnpm --filter @duing/web exec vitest run test/facilities/booking-calendar-lib.test.ts && pnpm -r typecheck`
Expected: 테스트 PASS, typecheck 통과(EXIT 0).

- [ ] **Step 5: 커밋**

```bash
git add frontend/packages/types/src/facility.ts frontend/packages/api/src/client.ts frontend/apps/web/app/facilities/_lib/bookingCalendar.ts frontend/apps/web/app/facilities/_components/booking/DaySlotList.tsx frontend/apps/web/test/facilities/booking-calendar-lib.test.ts
git commit -m "feat(frontend): 시설 가용성 타입 — DEADLINE_PASSED 상태·마감 날 파생(isDayApplicationClosed·hasApplicableSlot) 추가"
```

---

### Task 5 (F2): `DaySlotList` 마감 행·안내 + 패널·시트 CTA 문구

**Files:**
- Modify: `frontend/apps/web/app/facilities/_components/booking/DaySlotList.tsx`
- Modify: `frontend/apps/web/app/facilities/_components/booking/BookingPanel.tsx:113-122`
- Modify: `frontend/apps/web/app/facilities/_components/booking/MobileDaySheet.tsx:145-152`
- Test: `frontend/apps/web/test/facilities/booking-components.test.tsx`

**Interfaces:**
- Consumes: `isDayApplicationClosed`, `hasApplicableSlot` (Task F1), `BookingSlotStatus` 확장.
- Produces: 컴포넌트 props 무변경. 마감된 날 `<p role="note">` 문구 `신청이 마감된 날짜예요. 시설 사용일 전날 12:00까지만 신청할 수 있어요.`; CTA 문구 `신청 가능한 시간이 없어요`.

- [ ] **Step 1: 실패하는 테스트 추가**

`booking-components.test.tsx` 의 `it('차단 슬롯 버튼은 비활성이다', …)` 바로 아래에 추가:

```tsx
// 신청 마감(2026-09-03): 서버가 빈 슬롯을 DEADLINE_PASSED 로 내린 날 — 점유·대기 슬롯은 상태를 유지한다.
function makeClosedDay(): BookingDayAvailability {
  return makeDay({
    availableSlotCount: 0,
    dayStatus: 'FULL',
    slots: makeDay().slots.map((slot) => (slot.status === 'AVAILABLE' ? { ...slot, status: 'DEADLINE_PASSED' as const } : slot)),
  });
}

it('마감된 날의 슬롯 리스트: 빈 슬롯은 "신청 마감" muted 행으로 비활성이고 점유 슬롯의 단체명은 그대로 보인다', () => {
  render(<DaySlotList day={makeClosedDay()} selection={null} onToggleSlot={vi.fn()} />);
  const closedRow = screen.getByRole('button', { name: /09:00~10:00.*신청 마감/ });
  expect(closedRow).toBeDisabled();
  expect(closedRow).toHaveClass('bg-graysoft/60');
  expect(screen.queryByText('예약 가능')).not.toBeInTheDocument();
  // 점유 정보 보존 — SCHOOL 단체명·INTERNAL 폴백은 마감 표시로 덮이지 않는다.
  expect(screen.getByRole('button', { name: /17:00~18:00.*비호응원단/ })).toBeDisabled();
  expect(screen.getByText('예약됨')).toBeInTheDocument();
  // 날짜 단위 안내 1줄(role=note).
  expect(screen.getByRole('note')).toHaveTextContent('신청이 마감된 날짜예요. 시설 사용일 전날 12:00까지만 신청할 수 있어요.');
});

it('마감된 날의 승인 대기 행은 "승인 대기" 라벨을 유지하되 비활성이라 탭해도 onToggleSlot 을 부르지 않는다', () => {
  const onToggleSlot = vi.fn();
  render(<DaySlotList day={makeClosedDay()} selection={null} onToggleSlot={onToggleSlot} />);
  const pendingRow = screen.getByRole('button', { name: /20:00~21:00.*승인 대기/ });
  expect(pendingRow).toBeDisabled();
  fireEvent.click(pendingRow);
  expect(onToggleSlot).not.toHaveBeenCalled();
});

it('마감이 아닌 날은 안내 note 가 없고 승인 대기 행이 여전히 활성이다(무회귀)', () => {
  render(<DaySlotList day={makeDay()} selection={null} onToggleSlot={vi.fn()} />);
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /20:00~21:00.*승인 대기/ })).toBeEnabled();
});

it('예약 패널 CTA 는 신청 가능한 슬롯이 없는 날(마감·지난 날)엔 "신청 가능한 시간이 없어요" 로 비활성이다', () => {
  render(
    <BookingPanel
      facility={{ id: 1, roomName: '커뮤니티룸(1)' }}
      day={makeClosedDay()}
      selection={null}
      onToggleSlot={vi.fn()}
      step="slots"
      onProceedToForm={vi.fn()}
      onBackToSlots={vi.fn()}
      submittedResult={null}
      submittedClubId={null}
      submittedAt={null}
      onSubmitted={vi.fn()}
      onExploreOther={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: '신청 가능한 시간이 없어요' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: '시간을 선택해주세요' })).not.toBeInTheDocument();
});
```

그리고 `renderMobileSheet` 헬퍼가 정의된 뒤(시트 테스트 블록 끝)에 추가:

```tsx
it('빠른 예약 시트: 신청 가능한 슬롯이 없는 날은 CTA 가 "신청 가능한 시간이 없어요" 로 비활성이다', () => {
  renderMobileSheet({ day: makeClosedDay() });
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('button', { name: '신청 가능한 시간이 없어요' })).toBeDisabled();
  expect(within(dialog).getByRole('note')).toBeInTheDocument();
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web exec vitest run test/facilities/booking-components.test.tsx`
Expected: 신규 5건 FAIL(라벨 "예약 가능"·note 없음·CTA 문구 불일치).

- [ ] **Step 3: `DaySlotList` 구현**

import 줄 교체:

```tsx
import { bookingEntryOf, isDayApplicationClosed, isSelectableSlot, slotInRange } from '../../_lib/bookingCalendar';
```

(`SLOT_ROW_CLASS` 의 `DEADLINE_PASSED` 키는 Task 4 에서 이미 추가됐다 — 값 `'border-transparent bg-graysoft/60 text-charcoal-3'` 인지 확인만 한다.)

`slotStatusLabel` 교체:

```tsx
// 라벨 규칙은 bookingEntryOf(단일 지점) 재사용. DEADLINE_PASSED 는 빈 슬롯의 신청 마감(사용일 전날 12:00 KST 경과).
function slotStatusLabel(slot: BookingAvailabilitySlot): string {
  const entry = bookingEntryOf(slot);
  if (entry !== null) return entry.label;
  if (slot.status === 'PAST') return '지난 시간';
  if (slot.status === 'DEADLINE_PASSED') return '신청 마감';
  return '예약 가능';
}
```

컴포넌트 본문 — `return (` 앞에 파생 추가, `<ul>` 앞에 note 삽입, 행의 `selectable` 식 교체:

```tsx
export function DaySlotList({ day, selection, onToggleSlot }: Props) {
  // 서버가 빈 슬롯을 DEADLINE_PASSED 로 내린 날 — 대기 슬롯도 새 신청 대상이 아니라 행 전체를 잠근다(스펙 §3.3).
  // 최종 판단은 서버(신청 400)이며 폼 단계 힌트도 그대로 남는다(이중 방어).
  const dayClosed = isDayApplicationClosed(day.slots);
  return (
    <div>
      {day.operatingNotes.length > 0 && (
        … 기존 details 블록 그대로 …
      )}
      {dayClosed && (
        <p role="note" className="mb-2 rounded-lg bg-graysoft/60 px-3 py-2 text-xs text-charcoal-2">
          신청이 마감된 날짜예요. 시설 사용일 전날 12:00까지만 신청할 수 있어요.
        </p>
      )}
      <ul className="flex flex-col gap-1" aria-label="시간대 선택">
        {day.slots.map((slot) => {
          const selectable = isSelectableSlot(slot) && !dayClosed;
          … 나머지 기존 그대로 …
```

- [ ] **Step 4: 패널·시트 CTA**

`BookingPanel.tsx` import 교체:

```tsx
import { hasApplicableSlot, rangeContainsPendingHold, rangeLabel } from '../../_lib/bookingCalendar';
```

`BookingPanel` 의 마지막 `return (` 앞에 추가하고 CTA 텍스트를 교체:

```tsx
  // 선택 가능한 슬롯이 없는 날(마감·지난 날 기록 열람)은 "시간을 선택해주세요" 대신 사실을 말한다.
  const applicable = hasApplicableSlot(day.slots);
```

```tsx
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={!selection}
          onClick={onProceedToForm}
        >
          {selection ? `${rangeLabel(selection)} 예약 신청` : applicable ? '시간을 선택해주세요' : '신청 가능한 시간이 없어요'}
        </button>
```

`MobileDaySheet.tsx` import 교체:

```tsx
import { hasApplicableSlot, rangeContainsPendingHold, rangeLabel } from '../../_lib/bookingCalendar';
```

slots 스텝 분기의 CTA 교체(`shownDay` 는 이 분기에서 non-null):

```tsx
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={selection === null}
                onClick={onProceedToForm}
              >
                {selection !== null
                  ? `${rangeLabel(selection)} 예약 신청`
                  : hasApplicableSlot(shownDay.slots)
                    ? '시간을 선택해주세요'
                    : '신청 가능한 시간이 없어요'}
              </button>
```

- [ ] **Step 5: 통과·타입 확인**

Run: `cd frontend && pnpm --filter @duing/web exec vitest run test/facilities/booking-components.test.tsx && pnpm -r typecheck`
Expected: 컴포넌트 테스트 전부 PASS, typecheck 통과(Task F1 의 Record 누락 해소).

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/facilities/_components/booking/DaySlotList.tsx frontend/apps/web/app/facilities/_components/booking/BookingPanel.tsx frontend/apps/web/app/facilities/_components/booking/MobileDaySheet.tsx frontend/apps/web/test/facilities/booking-components.test.tsx
git commit -m "feat(frontend): 시설 슬롯 리스트 — 신청 마감 행 표시·마감 날 대기 행 잠금·안내 1줄, CTA 무신청 문구"
```

---

### Task 6 (F3): `WeekTimetable`(마감 셀·창 무관 블록·지난 헤더) + `BookingCalendar`(지난 날짜 열람 셀)

**Files:**
- Modify: `frontend/apps/web/app/facilities/_components/booking/WeekTimetable.tsx` (`buildColumnPlan`, 컬럼 계산, 헤더 `dayEnabled`, 셀 내용, `cellStateOf`)
- Modify: `frontend/apps/web/app/facilities/_components/booking/BookingCalendar.tsx` (셀 파생 전체)
- Test: `frontend/apps/web/test/facilities/booking-components.test.tsx`

**Interfaces:**
- Consumes: `BookingSlotStatus` 확장(Task F1).
- Produces: props 무변경. 셀 aria: `… 신청 마감`(DEADLINE_PASSED), 지난 빈 셀 `… 지난`(창 밖이어도), 창 이후 미래 빈 셀 `… 예약 기간 아님`. 월간 셀 aria `N일 지난 날짜`(데이터 있는 지난 날).

- [ ] **Step 1: 실패하는 테스트 추가**

`booking-components.test.tsx` 의 주간 테스트 블록(`renderWeek` 정의 뒤, `it('주간 그리드는 선택일 컬럼을 …')` 앞)에 추가:

```tsx
it('주간 그리드: DEADLINE_PASSED 셀은 "신청 마감" aria·"마감" 텍스트로 비활성이고, 점유 블록은 그대로다(2026-09-03)', () => {
  const daysByIso = makeWeekDaysByIso();
  daysByIso.set('2026-07-21', {
    date: '2026-07-21',
    dayStatus: 'AVAILABLE',
    availableSlotCount: 11,
    operatingNotes: [],
    slots: makeWeekSlots({ 3: { status: 'DEADLINE_PASSED' }, 4: { status: 'BLOCKED', blockedBy: 'SCHOOL', organization: '총학생회' } }),
  });
  const { onTapSlot } = renderWeek({ daysByIso });
  const closedCell = screen.getByRole('button', { name: '화요일 21일 12:00 신청 마감' });
  expect(closedCell).toBeDisabled();
  expect(within(closedCell).getByText('마감')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '화요일 21일 13:00~14:00 총학생회 예약됨' })).toBeDisabled();
  // 마감 셀은 선택 가능 셀이 아니다 — 탭해도 onTapSlot 이 불리지 않는다.
  fireEvent.click(closedCell);
  expect(onTapSlot).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '화요일 21일 14:00 가능' })).toBeEnabled();
});

it('주간 그리드: 지난 날짜는 창 밖이어도 빈 셀이 "지난" 이고 점유 블록이 렌더되며 헤더가 열람용으로 활성이다(직전 월 기록 열람)', () => {
  // 오늘=7/22, 창=[7/22..7/24] → 월20·화21 은 지난 날짜(창 밖). 월20 의 10시 BLOCKED 블록이 보여야 한다.
  renderWeek({ todayIso: '2026-07-22', bookableFrom: '2026-07-22', bookableUntil: '2026-07-24' });
  expect(screen.getByRole('button', { name: '월요일 20일 10:00~11:00 예약됨' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '월요일 20일 12:00 지난' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: '월요일 20일 12:00 예약 기간 아님' })).toBeNull();
  expect(screen.getByRole('button', { name: '월요일 20일 · 선택' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '화요일 21일' })).toBeEnabled();
  // 창 이후 미래(토25)는 기존대로 헤더·빈 셀 비활성.
  expect(screen.getByRole('button', { name: '토요일 25일' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '토요일 25일 09:00 예약 기간 아님' })).toBeDisabled();
});

it('주간 그리드: 창 이후 미래 날짜도 점유 블록은 렌더하되 빈 셀은 "예약 기간 아님" 으로 남는다', () => {
  const daysByIso = makeWeekDaysByIso();
  daysByIso.set('2026-07-25', {
    date: '2026-07-25',
    dayStatus: 'AVAILABLE',
    availableSlotCount: 12,
    operatingNotes: [],
    slots: makeWeekSlots({ 2: { status: 'BLOCKED', blockedBy: 'SCHOOL', organization: '총학생회' } }),
  });
  renderWeek({ daysByIso });
  expect(screen.getByRole('button', { name: '토요일 25일 11:00~12:00 총학생회 예약됨' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '토요일 25일 09:00 예약 기간 아님' })).toBeDisabled();
});
```

`it('캘린더 셀은 레벨 라벨(여유/마감)을 표시하고 창 이전 과거는 비활성이다', …)` 바로 아래에 추가:

```tsx
it('캘린더의 데이터 있는 지난 날짜 셀은 열람용으로 활성이고(레벨 라벨 없음) 클릭 시 onSelectDate 를 부르며, 데이터 없는 셀은 비활성이다', () => {
  const onSelectDate = vi.fn();
  const pastDay = makeDay({
    date: '2026-07-10',
    dayStatus: 'PAST',
    availableSlotCount: 0,
    slots: makeDay().slots.map((slot) => (slot.status === 'AVAILABLE' ? { ...slot, status: 'PAST' as const } : slot)),
  });
  render(
    <BookingCalendar
      yearMonth="2026-07"
      daysByIso={new Map([[pastDay.date, pastDay], ['2026-07-20', makeDay()]])}
      bookableFrom="2026-07-13"
      bookableUntil="2026-08-31"
      todayIso="2026-07-13"
      selectedDate={null}
      onSelectDate={onSelectDate}
      onOutOfWindowSelect={vi.fn()}
    />,
  );
  const pastCell = screen.getByRole('button', { name: '10일 지난 날짜' });
  expect(pastCell).toBeEnabled();
  expect(pastCell).not.toHaveAttribute('aria-disabled');
  expect(within(pastCell).queryByText(/여유|보통|혼잡|마감/)).toBeNull();
  fireEvent.click(pastCell);
  expect(onSelectDate).toHaveBeenCalledWith('2026-07-10');
  // 데이터 없는 지난 날짜(12일)는 여전히 비활성 — 열람할 기록이 없다.
  expect(screen.getByRole('button', { name: '12일' })).toBeDisabled();
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web exec vitest run test/facilities/booking-components.test.tsx`
Expected: 신규 4건 FAIL("예약됨" 폴백 aria·"예약 기간 아님"·헤더 disabled·"10일" 셀 disabled).

- [ ] **Step 3: `WeekTimetable` 구현**

`buildColumnPlan` 의 시그니처·본문 교체(창 밖 조기 반환 제거):

```tsx
/**
 * 한 요일 컬럼의 렌더 계획(§8.1) — 예약 건(dayBookingEntries: BLOCKED·PENDING 병합)을
 * rowSpan 블록으로, 나머지(AVAILABLE·PAST·DEADLINE_PASSED)를 1시간 셀로 배치한다. 확보 구간은 블록이 아니라
 * 셀의 operating 플래그(비차단 정보 표시 — 점선 장식, 스펙 §3 복원).
 * 데이터가 있는 날은 창 안팎과 무관하게 블록을 그린다(2026-09-03 기록 열람 — 지난 날짜·창 이후 익월 날짜의
 * "누가 예약했는지"). 빈 셀의 선택 가능 여부는 cellStateOf 가 창·지난·마감으로 게이팅한다. 데이터 없는 날은 empty. 길이 13(09~21시).
 */
function buildColumnPlan(day: BookingDayAvailability | undefined): PlanEntry[] {
  if (day === undefined) {
    return HOURS.map<PlanEntry>(() => ({ type: 'empty' }));
  }
  const cellAt = (hour: number, index: number): PlanEntry => {
    const slot = day.slots[index];
    if (slot === undefined) return { type: 'empty' };
    return { type: 'cell', slot, operating: isWithinOperating(slot, day.operatingNotes) };
  };
  const plan: (PlanEntry | undefined)[] = new Array<PlanEntry | undefined>(HOURS.length).fill(undefined);
  for (const entry of dayBookingEntries(day.slots)) {
    const start = Math.max(0, hourIndexOf(entry.start));
    const end = Math.min(HOURS.length, hourIndexOf(entry.end));
    if (end <= start) continue;
    plan[start] = {
      type: 'block',
      kind: entry.kind === 'PENDING' ? 'PENDING' : 'BLOCKED',
      label: entry.label,
      start: entry.start,
      end: entry.end,
      rowSpan: end - start,
      reachesBottom: end >= HOURS.length,
    };
    for (let index = start + 1; index < end; index += 1) plan[index] = { type: 'covered' };
  }
  return HOURS.map<PlanEntry>((hour, index) => plan[index] ?? cellAt(hour, index));
}
```

컬럼 계산과 헤더 `dayEnabled` 교체:

```tsx
  const columns = weekDates.map((iso) => {
    const withinWindow = daysByIso.has(iso) && isWithinBookable(iso, bookableFrom, bookableUntil);
    return { iso, withinWindow, plan: buildColumnPlan(daysByIso.get(iso)) };
  });
```

```tsx
              // 지난 날짜는 열람용(기록)으로 선택 가능, 창 이후 미래 날짜는 기존대로 비활성(2026-09-03).
              const dayEnabled =
                daysByIso.has(iso) && (iso < todayIso || isWithinBookable(iso, bookableFrom, bookableUntil));
```

셀 버튼 내용 교체:

```tsx
                        {selected ? '✓' : slot.status === 'DEADLINE_PASSED' ? '마감' : null}
```

`cellStateOf` 교체:

```tsx
// 셀 상태 파생 — 지난 > 창 밖(게이팅) > 신청 마감 > 가능(확보 구간=점선 sage·밖=sage) 순. AVAILABLE 만 탭 가능(§4).
// 지난 판정이 창 밖보다 앞이다 — bookableFrom 이 오늘이라 지난 날짜는 항상 창 밖인데, 기록 열람에서는 "지난"이 맞다(2026-09-03).
// BLOCKED/PENDING 은 블록으로 승격돼 미도달.
function cellStateOf(
  status: BookingAvailabilitySlot['status'],
  withinWindow: boolean,
  isPast: boolean,
  operating: boolean,
): CellState {
  if (isPast) return { statusText: '지난', toneClass: 'border-line/60 bg-graysoft/40', selectable: false };
  if (!withinWindow) return { statusText: '예약 기간 아님', toneClass: 'border-line/60 bg-graysoft/40', selectable: false };
  // 신청 마감(서버 DEADLINE_PASSED — 사용일 전날 12:00 KST 경과) — 셀 안에 "마감" 텍스트로 자기 라벨을 가진다.
  if (status === 'DEADLINE_PASSED') {
    return { statusText: '신청 마감', toneClass: 'border-line/60 bg-graysoft/40 text-charcoal-3', selectable: false };
  }
  if (status === 'AVAILABLE') {
    // 확보 노트 구간의 가용 셀 = 기본 확보 시간 가이드 레이어(스펙 §3 복원) — 색은 일반 가용 셀과 동일(sage),
    // 점선 보더만 "안내" 신호(장식). 동작(탭 선택·토글·선택 ink+✓)은 일반 가용 셀과 완전 동일 — status 단독 판정.
    // hover 는 가용 셀만: 배경 한 톤 진하게 + 보더 sage(선택 가능 어포던스, transition 은 버튼 공통 클래스).
    if (operating) return { statusText: '기본 확보 시간 · 예약 신청 가능', toneClass: 'border-dashed border-sage-soft bg-sage-mist hover:border-sage hover:bg-sage-soft/60', selectable: true };
    return { statusText: '가능', toneClass: 'border-sage-soft bg-sage-mist hover:border-sage hover:bg-sage-soft/60', selectable: true };
  }
  // 방어적 폴백 — BLOCKED·PENDING_HOLD 는 블록으로 렌더되어 셀 경로에 도달하지 않지만, 도달해도
  // 선택 불가(차단 유지)다. AVAILABLE 은 명시 status 로만 판정한다(fail-closed, 수정 7).
  return { statusText: '예약됨', toneClass: 'border-line bg-graysoft', selectable: false };
}
```

`WeekTimetable` 함수 위 doc 의 "차단·지난·창 밖·데이터 없음은 비활성." 문장을 "차단·지난·창 밖·신청 마감·데이터 없음은 비활성. 지난 날짜·창 밖 날짜도 점유 블록은 그린다(기록 열람)." 로 교체.

- [ ] **Step 4: `BookingCalendar` 구현**

`cells.map` 콜백 안의 `const day = …` 부터 `return (` 직전까지를 교체:

```tsx
          const day = daysByIso.get(cell.iso);
          const withinRange = isWithinBookable(cell.iso, bookableFrom, bookableUntil);
          const unknown = day === undefined;
          // 데이터가 있는 지난 날짜는 열람용(기록) — 클릭해 주간/시트로 열 수 있고 혼잡도 라벨은 없다(2026-09-03 스펙 §3.5).
          const viewablePast = day !== undefined && cell.iso < todayIso;
          const selectable = withinRange && !unknown && !viewablePast;
          // 창 이후 미래만 창 밖이다 — 지난 날짜를 창 밖으로 오분류하지 않는다.
          const outOfWindow = !withinRange && !unknown && !viewablePast;
          const selected = cell.iso === selectedDate;
          const isToday = cell.iso === todayIso;
          const level = selectable && day ? dayLevelOf(day.availableSlotCount) : null;
          const levelMeta = level !== null ? DAY_LEVEL_META[level] : null;
          const ariaLabel = selectable && day && levelMeta
            ? `${cell.day}일 ${levelMeta.label}, 남은 ${day.availableSlotCount}칸`
            : viewablePast
              ? `${cell.day}일 지난 날짜`
              : outOfWindow
                ? `${cell.day}일 예약 기간 아님`
                : `${cell.day}일`;
```

`<button …>` 의 속성·클래스 교체:

```tsx
            <button
              key={cell.iso}
              type="button"
              disabled={unknown}
              aria-disabled={outOfWindow || undefined}
              onClick={
                selectable || viewablePast
                  ? () => onSelectDate(cell.iso)
                  : outOfWindow
                    ? () => onOutOfWindowSelect(cell.iso)
                    : undefined
              }
              aria-pressed={selected}
              aria-label={ariaLabel}
              title={selectable && day ? `남은 ${day.availableSlotCount}칸` : undefined}
              // max-sm:overflow-hidden — 폰트 확대(안드로이드 텍스트 크기 조절 등)로 nowrap 라벨이 커져도
              // 옆 칸을 침범하지 않게 셀 안에서 잘린다. 7열 정렬이 무너지는 쪽이 잘리는 쪽보다 나쁘다.
              className={`relative flex min-h-[58px] flex-col items-center justify-center gap-[4px] rounded-md p-1 text-left motion-safe:transition-colors max-sm:overflow-hidden sm:min-h-[92px] sm:items-stretch sm:justify-start sm:gap-0 sm:p-2 ${
                selected
                  ? 'border-2 border-ink bg-ink shadow-md'
                  : outOfWindow
                    ? 'border border-line bg-graysoft'
                    : selectable
                      ? 'cursor-pointer border border-line bg-paper hover:border-sage'
                      : viewablePast
                        ? 'cursor-pointer border border-line bg-paper opacity-60 hover:border-sage'
                        : 'border border-line bg-paper opacity-40'
              }`}
            >
              <span
                className={`tabular-nums text-[13px] font-bold sm:text-sm ${
                  selected ? 'text-cream' : selectable ? 'text-charcoal' : 'text-charcoal-3'
                }`}
              >
                {cell.day}
              </span>
```

컴포넌트 위 doc 주석의 "창 밖 미래 날짜는 문구 없이 비활성 배경으로만 구분한다." 뒤에 " 데이터가 있는 지난 날짜는 열람용으로 클릭 가능(muted, 레벨 없음)이고, 데이터 없는 날짜만 disabled 다(2026-09-03)." 를 추가.

- [ ] **Step 5: 통과·타입 확인**

Run: `cd frontend && pnpm --filter @duing/web exec vitest run test/facilities/booking-components.test.tsx && pnpm -r typecheck`
Expected: 전부 PASS(기존 `:694` 20일 지난·25일 창 밖 단언 포함).

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/facilities/_components/booking/WeekTimetable.tsx frontend/apps/web/app/facilities/_components/booking/BookingCalendar.tsx frontend/apps/web/test/facilities/booking-components.test.tsx
git commit -m "feat(frontend): 시설 캘린더·주간 격자 — 신청 마감 셀 표시, 지난 날짜 열람 셀·창 무관 점유 블록으로 기록 보존"
```

---

### Task 7 (F4): `FacilityBookingPage` 열람 범위(직전 월) + 페이지 테스트

**Files:**
- Modify: `frontend/apps/web/app/facilities/_pages/FacilityBookingPage.tsx`
- Test: `frontend/apps/web/test/facilities/facility-booking-page.test.tsx`

**Interfaces:**
- Consumes: Task F1~F3.
- Produces: 월 이동 범위 `[prevMonth, nextMonth]`, 주 이동 하한 `prevMonth-01`, 딥링크 월 채택·인접월 병합 범위 `viewableMonths`, 창 밖 정리 effect 는 `selectedDate > bookableUntil || selectedDate < viewFromIso`.

- [ ] **Step 1: 실패하는 테스트 작성**

(a) fixture — `makeMixedSlots` 아래에 추가하고 `makeAvailability` 의 지난 날짜 분기를 교체:

```ts
// 지난 날짜(기록 열람, 2026-09-03): 10시 SCHOOL(총학생회)·13시 INTERNAL(두잉밴드)만 점유, 나머지는 PAST — BE 우선순위(점유 > PAST) 미러.
function makePastSlots(): BookingAvailabilitySlot[] {
  return Array.from({ length: 13 }, (_, index) => {
    const start = `${pad2(9 + index)}:00`;
    const end = `${pad2(10 + index)}:00`;
    if (index === 1) return { start, end, status: 'BLOCKED' as const, blockedBy: 'SCHOOL' as const, organization: '총학생회' };
    if (index === 4) return { start, end, status: 'BLOCKED' as const, blockedBy: 'INTERNAL' as const, organization: '두잉밴드' };
    return { start, end, status: 'PAST' as const };
  });
}
```

```ts
      if (iso < TODAY_ISO) {
        return { date: iso, dayStatus: 'PAST' as const, availableSlotCount: 0, operatingNotes: [], slots: makePastSlots() };
      }
```

(b) 시나리오 14(`:851-871`) 를 다음 두 개로 교체:

```tsx
  it('시나리오 14-a: 직전 월 딥링크는 정리되지 않고 주간(기록 열람)으로 열리며 직전 월 availability 를 요청한다', async () => {
    const lastMonth = shiftYearMonth(CURRENT_MONTH, -1);
    const deepLinkDate = `${lastMonth}-15`;
    mockSearchParams.value = `facilityId=1&date=${deepLinkDate}`;

    const requestedYearMonths: string[] = [];
    server.use(
      http.get('*/facilities/1/availability', ({ request }) => {
        const yearMonth = new URL(request.url).searchParams.get('yearMonth');
        if (yearMonth !== null) requestedYearMonths.push(yearMonth);
        return ok(makeAvailability(1, yearMonth ?? WINDOW_MONTH));
      }),
    );

    renderPage();

    expect(await screen.findByRole('heading', { level: 2, name: weekRangeLabel(mondayOf(deepLinkDate)) })).toBeInTheDocument();
    expect(await screen.findByText('예약 현황')).toBeInTheDocument();
    await waitFor(() => expect(requestedYearMonths).toContain(lastMonth));
    expect(screen.queryByText(/현재 예약 가능한 기간이 아니에요/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '신청 가능한 시간이 없어요' })).toBeDisabled();
  });

  it('시나리오 14-b: 두 달 전 딥링크는 열람 범위 밖이라 정리·월간 복귀·토스트로 회복하고 그 달 availability 를 요청하지 않는다', async () => {
    const twoMonthsAgo = shiftYearMonth(CURRENT_MONTH, -2);
    mockSearchParams.value = `facilityId=1&date=${twoMonthsAgo}-15`;

    const requestedYearMonths: string[] = [];
    server.use(
      http.get('*/facilities/1/availability', ({ request }) => {
        const yearMonth = new URL(request.url).searchParams.get('yearMonth');
        if (yearMonth !== null) requestedYearMonths.push(yearMonth);
        return ok(makeAvailability(1, yearMonth ?? WINDOW_MONTH));
      }),
    );

    renderPage();

    expect(await screen.findByText(`현재 예약 가능한 기간이 아니에요 (${WINDOW_LABEL})`)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: WINDOW_FROM_CELL })).toBeInTheDocument();
    expect(screen.queryByText('예약 현황')).not.toBeInTheDocument();
    await waitFor(() => expect(requestedYearMonths).toContain(WINDOW_MONTH));
    expect(requestedYearMonths).not.toContain(twoMonthsAgo);
  });
```

(c) 시나리오 21(`:992`)의 `expect(screen.getByRole('button', { name: '이전 주' })).toBeDisabled();` 를 교체:

```tsx
    // 창 시작 주에서도 이전 주는 활성이다 — 지난 주는 기록 열람 범위(직전 월 1일까지)라 막지 않는다(2026-09-03).
    expect(screen.getByRole('button', { name: '이전 주' })).toBeEnabled();
```

(d) 시나리오 15 앞(시나리오 14-b 뒤)에 신규 3개 추가:

```tsx
  it('시나리오 14-c: 월 이동은 직전 월까지 열리고 그 아래로는 닫히며, 직전 월에서 다음 달로 돌아온다', async () => {
    const lastMonth = shiftYearMonth(CURRENT_MONTH, -1);
    renderPage();

    await screen.findByRole('heading', { level: 2, name: yearMonthLabel(WINDOW_MONTH) }); // 기본 월 = 창 월(익월)
    expect(screen.getByRole('button', { name: '다음 달' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '이전 달' }));
    expect(await screen.findByRole('heading', { level: 2, name: yearMonthLabel(CURRENT_MONTH) })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '이전 달' }));
    expect(await screen.findByRole('heading', { level: 2, name: yearMonthLabel(lastMonth) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이전 달' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '다음 달' }));
    expect(await screen.findByRole('heading', { level: 2, name: yearMonthLabel(CURRENT_MONTH) })).toBeInTheDocument();
  });

  it('시나리오 14-d: 지난 날짜 셀을 열면 토스트 없이 주간 기록(점유 블록·지난 셀·슬롯 단체명)이 보이고 CTA 는 무신청 문구다', async () => {
    const { queryClient } = renderPage();
    await screen.findByRole('heading', { level: 2, name: yearMonthLabel(WINDOW_MONTH) });
    await waitForBookingWindowLoaded(queryClient);

    fireEvent.click(screen.getByRole('button', { name: '이전 달' }));
    await screen.findByRole('heading', { level: 2, name: yearMonthLabel(CURRENT_MONTH) });
    // 7/20(월) — 고정 today 7/31 이전의 지난 날짜. 헤더(periodLabel)는 데이터 로딩을 함의하지 않으므로
    // 7월 availability 가 도착해 셀이 "지난 날짜" 로 파생될 때까지 findByRole 로 기다린 뒤 클릭한다.
    const pastDate = `${CURRENT_MONTH}-20`;
    fireEvent.click(await screen.findByRole('button', { name: '20일 지난 날짜' }));

    expect(await screen.findByRole('heading', { level: 2, name: weekRangeLabel(mondayOf(pastDate)) })).toBeInTheDocument();
    expect(screen.queryByText(/현재 예약 가능한 기간이 아니에요/)).not.toBeInTheDocument();
    // 주간 격자: 점유 블록(기록)과 지난 빈 셀.
    expect(screen.getByRole('button', { name: '월요일 20일 10:00~11:00 총학생회 예약됨' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '월요일 20일 09:00 지난' })).toBeDisabled();
    // 사이드바 슬롯 리스트에도 단체명이 보존되고, 빈 행은 "지난 시간". 주간 블록 aria 도 "10:00~11:00 총학생회" 를
    // 포함하므로 시나리오 8 전례처럼 슬롯 리스트(list "시간대 선택")로 범위를 좁혀 다중 매치를 피한다.
    const slotList = await screen.findByRole('list', { name: '시간대 선택' });
    expect(within(slotList).getByRole('button', { name: /10:00~11:00.*총학생회/ })).toBeDisabled();
    expect(within(slotList).getByRole('button', { name: /13:00~14:00.*두잉밴드/ })).toBeDisabled();
    expect(within(slotList).getByRole('button', { name: /09:00~10:00.*지난 시간/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: '신청 가능한 시간이 없어요' })).toBeDisabled();
  });

  it('시나리오 14-e: 직전 월 availability 가 실패하면 "이번 달로 돌아가기" 가 현재 월(두 달 전이 아님)로 돌아간다', async () => {
    const lastMonth = shiftYearMonth(CURRENT_MONTH, -1);
    server.use(
      http.get('*/facilities/1/availability', ({ request }) => {
        const yearMonth = new URL(request.url).searchParams.get('yearMonth') ?? WINDOW_MONTH;
        if (yearMonth === lastMonth) {
          return HttpResponse.json({ ok: false, data: null, message: '일시 오류' }, { status: 500 });
        }
        return ok(makeAvailability(1, yearMonth));
      }),
    );
    renderPage();
    await screen.findByRole('heading', { level: 2, name: yearMonthLabel(WINDOW_MONTH) });

    fireEvent.click(screen.getByRole('button', { name: '이전 달' }));
    await screen.findByRole('heading', { level: 2, name: yearMonthLabel(CURRENT_MONTH) });
    fireEvent.click(screen.getByRole('button', { name: '이전 달' }));
    await screen.findByRole('heading', { level: 2, name: yearMonthLabel(lastMonth) });
    expect(await screen.findByText('가용성 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '이번 달로 돌아가기' }));
    expect(await screen.findByRole('heading', { level: 2, name: yearMonthLabel(CURRENT_MONTH) })).toBeInTheDocument();
    expect(screen.queryByText('가용성 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web exec vitest run test/facilities/facility-booking-page.test.tsx`
Expected: 14-a·c·d·e 와 시나리오 21 FAIL(이전 달 비활성·직전 월 딥링크 정리·이전 주 비활성). 14-b 는 현 코드로도 PASS 할 수 있다.

- [ ] **Step 3: 페이지 구현**

(a) 상수 — `const currentMonth = todayIso.slice(0, 7);` 바로 아래에 추가:

```tsx
  // 열람 범위(스펙 §3.6, 2026-09-03): 직전 월(기록)·당월·익월. 신청 가능 범위는 별개로 booking-window(반월 창)가 정한다.
  const prevMonth = shiftYearMonth(currentMonth, -1);
  const nextMonth = shiftYearMonth(currentMonth, 1);
  const viewableMonths = [prevMonth, currentMonth, nextMonth];
  const viewFromIso = `${prevMonth}-01`;
```

(b) 딥링크 월 가드 — `yearMonthOverride` 초기화 교체:

```tsx
  const [yearMonthOverride, setYearMonthOverride] = useState<string | null>(() => {
    // 딥링크 date 의 월은 열람 범위(직전 월·당월·익월)일 때만 채용한다. 과거·원거리 월을 그대로
    // 채용하면 availability 가 무효 월로 400 을 내고 회복이 안 되므로, 범위 밖이면 null(창 월 폴백).
    if (selectedDate === null) return null;
    const deepLinkMonth = selectedDate.slice(0, 7);
    return viewableMonths.includes(deepLinkMonth) ? deepLinkMonth : null;
  });
```

(c) 인접월 병합 — `secondMonth` 계산의 허용 목록 교체(주석도):

```tsx
  // 주간 이월(§12.1) — 표시 주가 두 달에 걸치면 조회 월(yearMonth) 밖의 인접월 가용성도 함께 조회해 병합한다.
  // 인접월은 availability 가 허용하는 열람 범위(직전 월·당월·익월) 안일 때만(밖이면 400 방지). 주간이 아니거나
  // 이월이 아니면 undefined → 훅에 facilityId undefined 를 넘겨 비활성화(기존 관례). 같은 queryKey 라 캐시 공유.
  const secondMonth =
    calendarView === 'week' && selectedDate !== null
      ? adjacentMonthToFetch(selectedDate, yearMonth, viewableMonths)
      : undefined;
```

(d) 창 밖 정리 effect — `selectedDateOutOfWindow` 블록 교체:

```tsx
  // 열람 범위 밖 선택 정리 — 창 이후 미래(딥링크) 또는 두 달 이상 전 날짜. 직전 월 이후의 지난 날짜는 기록 열람이라
  // 정상 선택이다. 두 달 전 딥링크는 월 가드가 그 월을 거부해 조회 월이 창 월로 남는데 selectedDate 만 살아 있으면
  // 빈 주간 격자에 갇히므로 기존처럼 정리·월간 복귀·토스트로 회복한다. 창 판정은 windowQuery 로 단일화.
  // 성공 화면은 이미 접수된 신청의 확인이므로 보존한다(selectionInvalid 전례 동일).
  const selectedDateOutOfViewable =
    step !== 'success' &&
    selectedDate !== null &&
    windowQuery.data !== undefined &&
    (selectedDate > windowQuery.data.bookableUntil || selectedDate < viewFromIso);
  useEffect(() => {
    if (!selectedDateOutOfViewable) return;
    setSelectedDate(null);
    setSelection(null);
    setStep('slots');
    setCalendarView('month'); // 무효 딥링크는 주간을 열지 않고 월간 탐색으로 되돌린다(§1).
    setDaySheetOpen(false); // 무효 딥링크 정리 시 빠른 예약 시트도 닫는다(§11.1).
    // 스테일 date 파라미터 제거(새로고침 재발 방지). 자동 선택 시설은 URL에 기록하지 않는다 —
    // 명시적으로 고른 facilityId(state)만 보존.
    syncUrl(facilityId, null);
    addToast(`현재 예약 가능한 기간이 아니에요${windowLabel ? ` (${windowLabel})` : ''}`, { variant: 'error' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateOutOfViewable]);
```

(e) 월 이동 — `changeMonth` 교체:

```tsx
  // 월 이동의 단일 진입점 — override 가 null 이어도 파생 yearMonth(창 월 폴백) 를 기준으로 이동한다.
  const goToMonth = (target: string) => {
    setYearMonthOverride(target);
    setSelectedDate(null);
    // 주간 뷰에서도 도달 가능(availability 에러 박스의 "이번 달로 돌아가기") —
    // selectedDate 가 null 이 되므로 월간으로 복귀하지 않으면 빈 주간 화면이 남는다.
    setCalendarView('month');
    resetSelectionFlow();
    syncUrl(effectiveFacilityId ?? null, null);
  };
  const changeMonth = (delta: 1 | -1) => goToMonth(shiftYearMonth(yearMonth, delta));
```

(f) 주 이동 — `changeWeek` 와 `canPrevWeek` 교체:

```tsx
  // 주 이동(§1·§4) — selectedDate ±7일. 열람 하한(직전 월 1일)~창 상한으로 클램프한다 — 지난 주는 기록 열람,
  // 창 이후는 신청 불가라 막는다. 새 선택일의 월로 조회 월을 스위칭한다(selectDate 경로 재사용).
  const changeWeek = (delta: 1 | -1) => {
    if (selectedDate === null || windowQuery.data === undefined) return;
    const shifted = shiftDateByDays(selectedDate, delta * 7);
    const clamped =
      shifted < viewFromIso
        ? viewFromIso
        : shifted > windowQuery.data.bookableUntil
          ? windowQuery.data.bookableUntil
          : shifted;
    selectDate(clamped);
  };
```

```tsx
  // 주간 이동 캡(§2) — 이전 주는 열람 하한(직전 월 1일)이 속한 주까지, 다음 주는 창 끝 주까지. 창 판정은 windowQuery 로 단일화.
  const weekMonday = selectedDate !== null ? mondayOf(selectedDate) : null;
  const viewFromMonday = mondayOf(viewFromIso);
  const windowUntilMonday = windowQuery.data ? mondayOf(windowQuery.data.bookableUntil) : null;
  const canPrevWeek = weekMonday !== null && shiftDateByDays(weekMonday, -7) >= viewFromMonday;
  const canNextWeek =
    weekMonday !== null && windowUntilMonday !== null && shiftDateByDays(weekMonday, 7) <= windowUntilMonday;
```

(g) 헤더·에러 박스 — `BookingViewHeader` 의 `canPrev`/`canNext` 와 "이번 달로 돌아가기" 교체:

```tsx
                    canPrev={calendarView === 'month' ? yearMonth !== prevMonth : canPrevWeek}
                    canNext={calendarView === 'month' ? yearMonth !== nextMonth : canNextWeek}
```

```tsx
                        {yearMonth !== currentMonth && (
                          <button type="button" className="btn btn-secondary" onClick={() => goToMonth(currentMonth)}>
                            이번 달로 돌아가기
                          </button>
                        )}
```

- [ ] **Step 4: 페이지 테스트 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web exec vitest run test/facilities/facility-booking-page.test.tsx`
Expected: 전부 PASS(이월 블록 (a)~(e) 포함). 실패가 있으면 스펙 §3.6 과 대조해 구현을 고치되 기존 시나리오의 단언 의미는 바꾸지 않는다(14·21 만 스펙이 명시적으로 바꾼다).

- [ ] **Step 5: FE 전체 게이트**

Run: `cd frontend && pnpm -r typecheck && pnpm --filter @duing/web lint && pnpm test`
Expected: 모두 EXIT 0. 테스트 수를 보고에 적는다.

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/facilities/_pages/FacilityBookingPage.tsx frontend/apps/web/test/facilities/facility-booking-page.test.tsx
git commit -m "feat(frontend): 시설 예약 캘린더 — 직전 월 기록 열람(월·주 이동·딥링크·인접월 범위 확장)·열람 범위 밖 선택만 정리"
```

---

## Self-Review (작성 시점)

- **Spec coverage**: §2.1 → B3 / §2.2 → B1 / §2.3 → B2 / §2.4 무변경 확인은 B3 Step 7 전체 스위트 / §3.1·§3.2 → F1 / §3.3·§3.7 → F2 / §3.4·§3.5 → F3 / §3.6 → F4 / §4 계약 → B2·F1 / §5 BE 매트릭스 → B1~B3(KST 경계 ★ B3 단위 테스트·점유 보존 ★ B2·B3) / §5 FE 매트릭스 → F1~F4(시나리오 14 교체·21 조정 포함) / §7 PR 분리 → 브랜치 2개(Global Constraints).
- **Placeholder scan**: 없음. `… 기존 그대로 …` 표기는 변경하지 않는 기존 코드를 가리키며, 변경 구간은 모두 실제 코드로 적었다.
- **Type consistency**: `isPassed(LocalDate, LocalDateTime)`(B1) ↔ B2 호출 `BookingDeadlinePolicy.isPassed(date, today.atTime(nowTime))` 일치. `resolveSlot` 9-인자 시그니처 ↔ 호출 일치. FE `isDayApplicationClosed(slots)`/`hasApplicableSlot(slots)` 인자 타입 `BookingAvailabilitySlot[]` 로 F2·F4 호출 일치. `buildColumnPlan(day)` 1-인자 ↔ 컬럼 계산 호출 일치. `GeneralFacilityAvailabilityService` 생성자 인자 순서 = 필드 선언 순서(Lombok `@RequiredArgsConstructor`).
