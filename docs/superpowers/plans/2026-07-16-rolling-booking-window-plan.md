# Rolling Window 예약 오픈 정책 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) 구문.

**Goal:** 반월 잠금 정책을 Rolling Window(현재 반월 잔여 + 다음 반월)로 전환하고, booking-window API에 라벨링된 구간 배열을 추가하며, 캘린더가 구간 칩·"오픈" 마커를 표시하게 한다.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-16-rolling-booking-window-design.md` §1~§3. 정책 산식은 `HalfMonthBookingWindowPolicy` 한 곳만 바뀌고, `BookingWindow`가 openRanges를 실어 나르며, 소비처(검증기·가용성)는 from/until/contains 무변경.

**Tech Stack:** Spring Boot 3.4/Java 21(백엔드), Next.js 15/React 19 + vitest/msw(프론트).

## Global Constraints

- 스펙 §1 결정 사항 1~5를 구속 조건으로 그대로 따른다(현재 구간 시작=오늘 클립, 당일 신청 허용, 모드명 HALF_MONTH 유지, 라벨은 응답 계층, 예외 메시지 형식 유지).
- 라벨 문자열 정확히: `"현재 예약 가능"`, `"다음 예약 가능"` (응답 계층 매핑).
- 테스트에 하드코딩 절대 날짜 금지(타임밤). 픽스처 기준 시각은 KST 고정(`ZoneId.of("Asia/Seoul")`).
- `BookingWindowFixture`가 오늘을 반환하면 당일 가드 타임밤 — 반드시 내일 기반 `bookableDate()`로 교체(스펙 §2 테스트 정합).
- FE: `any`/`as` 금지(`as const` 예외), `type`만, 두잉 토큰만, `availableBookingRanges`는 옵셔널 + 부재 폴백(스펙 §3).
- 커밋: 한국어 Conventional Commits(`feat(backend): ...` / `feat(frontend): ...`), Co-Authored-By/🤖 라인 금지.
- push·PR 생성은 컨트롤러 몫 — 구현 subagent는 로컬 커밋까지만.
- 빌드 cwd: gradle은 `backend/`, pnpm은 `frontend/`.

---

### Task 1: 백엔드 — Rolling 정책 + openRanges + API 구간 배열

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/BookingWindow.java`
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/HalfMonthBookingWindowPolicy.java`
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/BookingWindowPolicy.java` (javadoc만 — "다음 오픈 구간만" 서술을 롤링 서술로)
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/BookingPolicyValidator.java` (당일 가드 주석 현행화만)
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/controller/dto/response/BookingWindowResponse.java`
- Modify: `backend/src/test/java/com/duing/common/fixture/BookingWindowFixture.java` (+ 호출부 6개 테스트 파일의 `firstBookableDate()` → `bookableDate()` 일괄 교체)
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/HalfMonthBookingWindowPolicyTest.java` (재작성), `BookingPolicyValidatorTest.java` (당일 케이스 추가)

**Interfaces (Produces — Task 2가 의존):**
- `GET /api/v1/facilities/booking-window` 응답: `{ bookableFrom, bookableUntil, availableBookingRanges: [{ startDate, endDate, label }] }` (스펙 §2 JSON 예시와 정확히 일치)

- [ ] **Step 1: 정책 단위 테스트 재작성 (RED)**

`HalfMonthBookingWindowPolicyTest`를 롤링 기대값으로 재작성. 최소 케이스(모두 임의 연월 상수 사용 가능 — 정책 단위 테스트는 `windowFor(고정 입력)` 순수 함수 검증이라 타임밤이 아니다):

```java
// pivot=15 기준
// 1) 1일: window [7/1, 7/31], CURRENT [7/1, 7/15], NEXT [7/16, 7/31]
// 2) 10일(반월 중간): window [7/10, 7/31], CURRENT [7/10, 7/15], NEXT [7/16, 7/31]
// 3) pivot일(15일): window [7/15, 7/31], CURRENT [7/15, 7/15], NEXT [7/16, 7/31]
// 4) pivot+1일(16일): window [7/16, 8/15], CURRENT [7/16, 7/31], NEXT [8/1, 8/15]
// 5) 말일(7/31): window [7/31, 8/15], CURRENT [7/31, 7/31], NEXT [8/1, 8/15]
// 6) 2월(평년 2/20, pivot=15): window [2/20, 3/15], CURRENT [2/20, 2/28], NEXT [3/1, 3/15]
// 7) 12월 하반(12/20): NEXT 가 연도를 넘어 [1/1, 1/15]
// 8) 불변식(대표 케이스에 단언): openRanges 연속(CURRENT.until.plusDays(1) == NEXT.from),
//    window.from == CURRENT.from, window.until == NEXT.until
// 9) pivotDay 경계 생성자 검증 기존 유지(1~27)
```

- [ ] **Step 2: 실패 확인** — `cd backend && ./gradlew test --tests HalfMonthBookingWindowPolicyTest` → FAIL(구 산식)

- [ ] **Step 3: 도메인 구현**

`BookingWindow.java`:

```java
package com.duing.domain.facilitybooking.service;

import java.time.LocalDate;
import java.util.List;

/** 예약 가능 구간 값 객체 — 경계 포함([from, until]). openRanges 는 라벨링용 세부 구간(롤링: 현재+다음 반월). */
public record BookingWindow(LocalDate from, LocalDate until, List<OpenRange> openRanges) {

    public enum OpenRangeKind { CURRENT, NEXT }

    /** 세부 오픈 구간 — kind 는 응답 계층이 라벨로 매핑한다(도메인은 한글 문자열을 모른다). */
    public record OpenRange(LocalDate from, LocalDate until, OpenRangeKind kind) {}

    public boolean contains(LocalDate date) {
        return !date.isBefore(from) && !date.isAfter(until);
    }
}
```

`HalfMonthBookingWindowPolicy.java` — javadoc을 롤링 서술로 교체하고 산식 구현:

```java
@Override
public BookingWindow windowFor(LocalDate today) {
    YearMonth currentMonth = YearMonth.from(today);
    if (today.getDayOfMonth() <= pivotDay) {
        return rolling(today, currentMonth.atDay(pivotDay),
                currentMonth.atDay(pivotDay + 1), currentMonth.atEndOfMonth());
    }
    YearMonth nextMonth = currentMonth.plusMonths(1);
    return rolling(today, currentMonth.atEndOfMonth(),
            nextMonth.atDay(1), nextMonth.atDay(pivotDay));
}

private BookingWindow rolling(LocalDate today, LocalDate currentHalfEnd,
                              LocalDate nextHalfStart, LocalDate nextHalfEnd) {
    return new BookingWindow(today, nextHalfEnd, List.of(
            new BookingWindow.OpenRange(today, currentHalfEnd, BookingWindow.OpenRangeKind.CURRENT),
            new BookingWindow.OpenRange(nextHalfStart, nextHalfEnd, BookingWindow.OpenRangeKind.NEXT)));
}
```

`BookingPolicyValidator.java` 당일 가드 주석(L44)을 현행화 — 예:
`// 롤링 창은 오늘을 포함한다 — 당일 신청 중 첫 1시간이 완전히 지난 슬롯은 거부(어셈블러 PAST 판정과 동일 기준).`

- [ ] **Step 4: 정책 테스트 GREEN 확인** — 동일 명령 PASS

- [ ] **Step 5: 응답 DTO + 검증기 당일 케이스**

`BookingWindowResponse.java`:

```java
package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.service.BookingWindow;
import java.time.LocalDate;
import java.util.List;

/** 현재 예약 오픈 구간(설계 §1.5 → 2026-07-16 롤링 전환) — 단일 창(하위호환) + 라벨링된 세부 구간. */
public record BookingWindowResponse(LocalDate bookableFrom, LocalDate bookableUntil,
                                    List<BookingRangeResponse> availableBookingRanges) {

    public record BookingRangeResponse(LocalDate startDate, LocalDate endDate, String label) {}

    public static BookingWindowResponse from(BookingWindow window) {
        List<BookingRangeResponse> ranges = window.openRanges().stream()
                .map(range -> new BookingRangeResponse(range.from(), range.until(), labelOf(range.kind())))
                .toList();
        return new BookingWindowResponse(window.from(), window.until(), ranges);
    }

    private static String labelOf(BookingWindow.OpenRangeKind kind) {
        return switch (kind) {
            case CURRENT -> "현재 예약 가능";
            case NEXT -> "다음 예약 가능";
        };
    }
}
```

`BookingPolicyValidatorTest`에 Clock 고정 당일 케이스 2개 추가: (a) 당일 + 시작 시각의 첫 1시간이 아직 안 지난 슬롯 → 통과, (b) 당일 + 첫 1시간이 완전히 지난 슬롯 → `OutOfBookingWindowException`. 기존 "오늘은 창 밖" 류 단언이 있으면 롤링 기대값으로 갱신.

- [ ] **Step 6: 픽스처 교체 + 전체 스위트**

`BookingWindowFixture`: `firstBookableDate()` 삭제, 아래로 교체 + 호출부 6개 파일 일괄 rename:

```java
/**
 * 시각 무관 항상 신청 가능한 날짜 = 내일. 롤링 창은 오늘을 포함하지만, 오늘을 쓰면 고정 슬롯
 * 시각(10:00 등)이 KST 실행 시각에 따라 당일 가드에 걸리는 타임밤이 된다.
 * 내일은 항상 창 내부다: until(다음 반월 말일) > 다음 반월 시작일 > 오늘 ⇒ until ≥ 오늘+1.
 */
public static LocalDate bookableDate() {
    return LocalDate.now(KST).plusDays(1);
}
```

`window()`는 유지(정책 재사용 산출). 창 밖 날짜를 만들던 테스트(`window().until().plusDays(1)` 패턴)는 롤링에서도 창 밖이므로 유지 — 단, "오늘 = 창 밖" 가정 테스트는 롤링 기대값으로 수정.

실행: `cd backend && ./gradlew test` (TestContainers — Docker 필요). 출력에서 BUILD SUCCESSFUL 확인(`| tail` 금지).

- [ ] **Step 7: 커밋** — 논리 단위 분할 커밋(정책+도메인 / 응답+픽스처·테스트 정합 등), 메시지 예: `feat(backend): 예약 오픈 정책을 Rolling Window(현재+다음 반월)로 전환`

---

### Task 2: 프론트엔드 — 구간 칩·오픈 마커·폴백 (브랜치 feat/facility-calendar-refactor)

**Files:**
- Modify: `frontend/packages/types/src/facility.ts`
- Modify: `frontend/apps/web/app/facilities/_lib/bookingHome.ts`
- Modify: `frontend/apps/web/app/facilities/_components/booking/BookingCalendar.tsx`
- Modify: `frontend/apps/web/app/facilities/_pages/FacilityBookingPage.tsx`
- Test: `frontend/apps/web/test/facilities/facility-booking-page.test.tsx`, `frontend/apps/web/test/facilities/booking-components.test.tsx`

**Interfaces (Consumes):** Task 1의 booking-window 응답(스펙 §2 JSON). 라벨은 API `label`을 그대로 렌더(FE에서 재정의 금지).

- [ ] **Step 1: 타입 + 라벨 유틸 (RED 테스트 먼저)**

`packages/types/src/facility.ts`:

```ts
export type FacilityBookingRange = {
  startDate: string; // yyyy-MM-dd
  endDate: string; // yyyy-MM-dd
  label: string; // 서버 산출 표시 문자열("현재 예약 가능" 등) — FE 재정의 금지
};

export type FacilityBookingWindow = {
  bookableFrom: string; // yyyy-MM-dd
  bookableUntil: string;
  // BE(Lightsail) 배포 전 FE(Vercel) 선배포 전환기에 구 응답으로도 동작해야 한다 — 부재 시 단일 배지 폴백
  availableBookingRanges?: FacilityBookingRange[];
};
```

`bookingHome.ts`에 구간 라벨 헬퍼 추가(기존 `windowRangeLabel` 유지):

```ts
export function rangeDatesLabel(startIso: string, endIso: string): string {
  const label = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;
  return `${label(startIso)} ~ ${label(endIso)}`;
}
```

(기존 `windowRangeLabel` 내부가 동일 포맷이면 `rangeDatesLabel`을 재사용하도록 정리 — 중복 산식 금지.)

테스트 추가(RED): 페이지 msw 핸들러(`facility-booking-page.test.tsx` L185 부근)의 booking-window 응답에 `availableBookingRanges` 2건(WINDOW 상수 기반, 절대 날짜 금지)을 추가하고,
(a) 구간 칩 2개(`현재 예약 가능 …` / `다음 예약 가능 …`) 렌더, (b) 다음 구간 시작일 셀에 "오픈" 마커, (c) ranges 부재 응답이면 기존 단일 배지(`예약 가능 기간 …`) 폴백 — 3개 단언 작성.

- [ ] **Step 2: 실패 확인** — `cd frontend && pnpm --filter web test facility-booking-page` → 신규 단언 FAIL

- [ ] **Step 3: 캘린더 구현**

`BookingCalendar.tsx` props에 `ranges?: FacilityBookingRange[] | null` 추가(기존 `windowLabel` 유지 — 폴백용).

- 배지 행: `ranges?.length`이면 칩 나열(각 칩: `{range.label} {rangeDatesLabel(range.startDate, range.endDate)}`, 현재=기존 `bg-sage-mist`, 다음=`bg-graysoft` 계열 두잉 토큰으로 위계 구분), 아니면 기존 단일 배지.
- 오픈 마커: `openStartIso = ranges?.[ranges.length - 1]?.startDate`(마지막=다음 구간)이 해당 월 셀과 일치하고 `>= todayIso`이면 셀 우상단(오늘 도트와 겹치지 않게 좌측 인접 또는 날짜 옆)에 `text-[9px]` "오픈" 칩. `aria-label`에 `예약 오픈일` 추가.
- 기존 셀 게이팅·선택·기간 외 로직 무변경.

`FacilityBookingPage.tsx`: `<BookingCalendar … ranges={windowQuery.data?.availableBookingRanges ?? null} />` 전달. 나머지 로직 무변경(스펙 §3 — 기본 월·클램프·토스트·딥링크 정리 구조 유지).

- [ ] **Step 4: GREEN + 전체 검증**

```
cd frontend && pnpm lint && pnpm typecheck && pnpm --filter web test
```

전건 PASS 확인(수치 보고).

- [ ] **Step 5: 커밋** — `feat(frontend): 캘린더에 Rolling Window 구간 칩·예약 오픈 마커 표시`
