# 시설 예약 마감일(booking_close_date) — 오픈일 창 상한 추가 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 총동연이 시설마다 오픈일과 **마감일**을 함께 정해 "9/1~9/15 만" 같은 창을 표현할 수 있게 한다. 마감일이 비어 있으면 현행(익월 말일까지)과 동일하다.

**Architecture:** `BookingOpenDatePolicy.windowFor(openDate, closeDate, today)` 가 `until = min(closeDate ?? 익월말, 익월말)` 로 상한을 계산한다(3줄). 관리자 PATCH 두 개의 바디가 `{ bookingOpenDate, bookingCloseDate }` 쌍으로 확장되고, 검증은 매 요청의 쌍에 대해 순서(마감 ≥ 오픈)·상한(마감 ≤ 익월 말일) 두 예외로 한다. 가용성 응답은 이미 창을 실어 오므로 FE 캘린더 게이팅은 무변경이고, 안내줄에 범위 문구 한 분기·관리자 탭에 마감일 입력 한 칸이 추가된다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / JUnit 5 + Testcontainers · Next.js 15 / React 19 / vitest + msw.

**Spec:** `docs/superpowers/specs/2026-09-05-facility-booking-close-date-design.md` (v2 확정, C1~C10·Q1~Q5). **플랜 v2** — fork 리뷰(Blocking 0·Should-fix 5·Nit 5) 반영. 부모 플랜 `docs/superpowers/plans/2026-09-03-facility-booking-open-date-plan.md`.

## Global Constraints

- **선행 조건:** PR #1145(BE)·#1146(FE) 가 develop 에 머지된 뒤 develop 에서 분기. BE 브랜치 `feat/facility-booking-close-date-be`, FE 브랜치 `feat/facility-booking-close-date-fe`.
- 스펙 C1~C10 과 확정 결정(Q1 과거 허용 · Q2 문구 통일 · Q3 카드 미노출 · Q5 상한 익월 말일)을 뒤집지 않는다. 크롤 월·TTL·가용성 월 가드·슬롯 상태·승인 경로·booking-window 참조 창 무변경.
- 마이그레이션 번호 **V123**(#1143 이 V122 로 올려 선점 — 2026-09-05 최종 리뷰 정정. 머지 직전 `git ls-tree` 로 원격 전수 재확인).
- 커밋 메시지 Conventional Commits 한국어 `{type}({scope}): 대상 — 변경점`, **Co-Authored-By / 🤖 Generated / Claude-Session 트레일러 금지**. 구현자는 push·PR·머지 금지. 모든 완료 보고는 실제 명령 출력 근거. EOF newline.
- BE 는 `backend/` 에서 `./gradlew`, FE 는 `frontend/` 에서 `pnpm test`+`pnpm typecheck`+`pnpm lint` 셋 다 GREEN.
- 테스트 날짜는 `Clock.fixed(…, Asia/Seoul)` 또는 `LocalDate.now(ZoneId.of("Asia/Seoul"))` 상대값. 과거 고정일 허용. 하드코딩 미래 절대날짜 금지.
- "오늘" 은 정책·관리자 검증 모두 KST `Clock` 빈(`seoulClock`).

---

## Part A — Backend

### Task 1: V123 + `Facility.bookingCloseDate` + 정책 상한

**Files:**
- Create: `backend/src/main/resources/db/migration/V123__facility_booking_close_date.sql`
- Modify: `backend/src/main/java/com/duing/domain/facility/entity/Facility.java`
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/BookingOpenDatePolicy.java`
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/BookingApplicationPolicy.java`(`windowFor(Facility, today)` 인자 전달)
- Test: `backend/src/test/java/com/duing/domain/facilitybooking/service/BookingOpenDatePolicyTest.java`, `backend/src/test/java/com/duing/domain/facility/service/FacilitySyncServiceTest.java`

**Interfaces:**
- Produces `Facility.getBookingCloseDate(): LocalDate`(nullable), `Facility.changeBookingCloseDate(LocalDate)`; 기존 `changeBookingOpenDate` 유지.
- Produces `BookingOpenDatePolicy.windowFor(LocalDate bookingOpenDate, LocalDate bookingCloseDate, LocalDate today)`. 기존 2-인자 오버로드는 삭제. 호출처 전수: main `BookingApplicationPolicy.java:49` 1곳, test `BookingOpenDatePolicyTest` 9곳(`:22,35,36,37,44,46,48,58,68`) + **`FacilityAvailabilityAcceptanceTest.java:95`**(`OPEN_DATE_POLICY.windowFor(open, today)` → `(open, facility.getBookingCloseDate(), today)`).

- [ ] **Step 1: 실패 테스트** — `BookingOpenDatePolicyTest` 에 추가:

```java
    @Test
    @DisplayName("마감일이 익월 말일 안이면 상한이 마감일이 된다")
    void closeDateInsideNextMonthBecomesUntil() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 15), LocalDate.of(2026, 9, 4));
        assertThat(window.from()).isEqualTo(LocalDate.of(2026, 9, 4));
        assertThat(window.until()).isEqualTo(LocalDate.of(2026, 9, 15));
        assertThat(window.contains(LocalDate.of(2026, 9, 15))).isTrue();
        assertThat(window.contains(LocalDate.of(2026, 9, 16))).isFalse();
    }

    @Test
    @DisplayName("오픈일과 마감일이 같으면 하루짜리 창이 성립한다")
    void sameOpenAndCloseIsOneDayWindow() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 9, 10), LocalDate.of(2026, 9, 10), LocalDate.of(2026, 9, 4));
        assertThat(window.isEmpty()).isFalse();
        assertThat(window.contains(LocalDate.of(2026, 9, 10))).isTrue();
        assertThat(window.contains(LocalDate.of(2026, 9, 9))).isFalse();
        assertThat(window.contains(LocalDate.of(2026, 9, 11))).isFalse();
    }

    @Test
    @DisplayName("마감일이 익월 말일을 넘으면 방어적으로 익월 말일로 잘린다")
    void closeDateBeyondNextMonthEndIsClamped() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 12, 31), LocalDate.of(2026, 9, 4));
        assertThat(window.until()).isEqualTo(LocalDate.of(2026, 10, 31));
    }

    @Test
    @DisplayName("마감일이 오늘보다 과거면 빈 창(닫힘)이다")
    void closeDateInPastIsEmpty() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31), LocalDate.of(2026, 9, 4));
        assertThat(window.isEmpty()).isTrue();
    }

    @Test
    @DisplayName("오픈일 없이 마감일만 있으면 여전히 닫힘이다")
    void closeDateWithoutOpenDateIsClosed() {
        BookingWindow window = policy.windowFor(null, LocalDate.of(2026, 9, 15), LocalDate.of(2026, 9, 4));
        assertThat(window.isEmpty()).isTrue();
    }

    @Test
    @DisplayName("마감일이 null 이면 상한은 현행처럼 익월 말일이다")
    void nullCloseDateKeepsNextMonthEnd() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 9, 1), null, LocalDate.of(2026, 9, 4));
        assertThat(window.until()).isEqualTo(LocalDate.of(2026, 10, 31));
    }
```

기존 2-인자 호출은 전부 3-인자(`…, null, today`)로 바꾼다. `FacilitySyncServiceTest` 의 오픈일 보존 3건 옆에 "마감일도 동기화가 보존한다" 1건 추가(오픈일 케이스 복제, `changeBookingCloseDate(D+9)` 후 `sync()` → 보존).

- [ ] **Step 2: RED 확인** — `cd backend && ./gradlew test --tests '*BookingOpenDatePolicyTest' --tests '*FacilitySyncServiceTest'` → 컴파일 실패(메서드 없음).

- [ ] **Step 3: 구현**

`V123__facility_booking_close_date.sql`:
```sql
-- 시설별 예약 마감일(총동연 설정). NULL = 상한 없음(익월 말일까지). 신청 창 [max(오픈일, 오늘), min(마감일, 익월 말일)] 은
-- 저장하지 않고 조회 시점에 파생한다(BookingOpenDatePolicy). 학교 목록 동기화는 이 값을 건드리지 않는다(@DynamicUpdate).
ALTER TABLE facility ADD COLUMN booking_close_date DATE NULL;
```

`Facility.java`(오픈일 필드·메서드 바로 아래):
```java
    /** 총동연이 정한 예약 마감일. NULL = 상한 없음(익월 말일). 오픈일과 함께 BookingOpenDatePolicy 가 창을 계산한다. */
    @Column(name = "booking_close_date")
    private LocalDate bookingCloseDate;

    /** updateDetails(학교 동기화)는 이 값을 건드리지 않는다. null = 상한 해제. */
    public void changeBookingCloseDate(LocalDate newBookingCloseDate) {
        this.bookingCloseDate = newBookingCloseDate;
    }
```

`BookingOpenDatePolicy.windowFor`:
```java
    public BookingWindow windowFor(LocalDate bookingOpenDate, LocalDate bookingCloseDate, LocalDate today) {
        LocalDate nextMonthEnd = YearMonth.from(today).plusMonths(1).atEndOfMonth();
        // 마감일 상한은 관리자 검증(익월 말일)이 막지만, 조회 시점 클램프를 방어선으로 둔다(크롤·열람 범위 불변).
        LocalDate until = (bookingCloseDate == null || bookingCloseDate.isAfter(nextMonthEnd)) ? nextMonthEnd : bookingCloseDate;
        if (bookingOpenDate == null) {
            return BookingWindow.closed(until);
        }
        LocalDate from = bookingOpenDate.isBefore(today) ? today : bookingOpenDate;
        return new BookingWindow(from, until);
    }
```
클래스 javadoc 을 "신청 창 = [max(오픈일, 오늘), min(마감일, 익월 말일)]. 오픈일 NULL = 닫힘, 마감일 NULL = 상한 없음" 으로 갱신. `BookingApplicationPolicy.windowFor(Facility, today)` 는 `openDatePolicy.windowFor(facility.getBookingOpenDate(), facility.getBookingCloseDate(), today)`.

- [ ] **Step 4: GREEN** — 같은 명령 통과. `./gradlew compileJava compileTestJava` 클린.
- [ ] **Step 5: 커밋** — `feat(backend): 시설 예약 마감일 — facility.booking_close_date(V123)·창 상한 min(마감일, 익월 말일)`

### Task 2: 관리자 API 바디 확장 + 검증 2예외 + 응답 가산

**Files:**
- Modify: `facility/controller/dto/request/UpdateFacilityBookingOpenDateRequest.java`, `facility/service/dto/command/UpdateFacilityBookingOpenDateCommand.java`, `facility/service/FacilityAdminService.java`, `facility/service/GeneralFacilityAdminService.java`, `facility/exception/FacilityException.java`, `facility/api/AdminFacilityApi.java`(설명문), `facility/controller/dto/response/AdminFacilityResponse.java`, `FacilitySummaryResponse.java`, `FacilityUsageResponse.java`, `facility/service/dto/query/FacilityUsageItem.java`, `facility/service/GeneralFacilityUsageService.java`
- Test: `facility/controller/AdminFacilityAcceptanceTest.java`, `facility/FacilityUsageAcceptanceTest.java`, `facilitybooking/service/FacilityBookingServiceIntegrationTest.java`, `facilitybooking/controller/FacilityAvailabilityAcceptanceTest.java`, **`facility/service/FacilityBookingOpenDateSyncRaceTest.java:71`**(Command 생성자 3-인자 `…, null` 로 컴파일 정리)

**Interfaces:**
- Request `UpdateFacilityBookingOpenDateRequest(LocalDate bookingOpenDate, LocalDate bookingCloseDate)`(둘 다 nullable, 제약 없음). Command 동형. `FacilityAdminService.updateAllBookingOpenDate(LocalDate bookingOpenDate, LocalDate bookingCloseDate)`.
- 예외: `FacilityException.BookingCloseBeforeOpenException`("예약 마감일은 오픈일보다 빠를 수 없습니다.", 400), `FacilityException.InvalidBookingCloseDateException`("예약 마감일은 다음 달 말일까지만 설정할 수 있습니다.", 400) — 기존 `InvalidBookingOpenDateException` 과 같은 형식(고정 MESSAGE, inner static class).
- 응답: `AdminFacilityResponse(id, roomName, location, bookingOpenDate, bookingCloseDate)`, `FacilitySummaryResponse(…, bookingCloseDate)`, `FacilityUsage(…, bookingCloseDate)`, `FacilityUsageItem(…, bookingCloseDate)` — 전부 맨 뒤.

- [ ] **Step 1: 실패 테스트** — `AdminFacilityAcceptanceTest` 추가(기존 헬퍼·토큰 재사용):
  - 시설별 `{open: D+1, close: D+10}` → 204, GET 에 `bookingCloseDate == D+10`.
  - 시설별 `{open: D+10, close: D+1}` → 400 메시지 "예약 마감일은 오픈일보다 빠를 수 없습니다.".
  - 시설별 `{open: D+1, close: 익월 말일 + 1}` → 400 "예약 마감일은 다음 달 말일까지만 설정할 수 있습니다."; `close = 익월 말일` → 204.
  - 시설별 `{open: null, close: D+10}` → 204(닫힘 유지), GET 반영.
  - 전체 `{open: D+10, close: D+1}` → 400 + 어떤 행도 안 바뀜(사전 값 시드 후 재조회).
  - 전체 `{open: D+1, close: D+15}` → 활성 시설 전부 두 값 반영, 아카이브 제외.
  - 전체 `{open: null, close: null}` → 전부 닫힘.
  `FacilityUsageAcceptanceTest`: 이용현황 `bookingOpenDate` 단언 옆에 `bookingCloseDate` 1건 + **공개 `GET /facilities` 목록 응답에 `bookingCloseDate` 가산 단언 1건**(`changeBookingCloseDate` 시드). 기존 `AdminFacilityAcceptanceTest` 8건의 단일 키 바디 `{bookingOpenDate}` 는 새 record 에서 마감일 null(해제) 의미로 그대로 통과 — 주석 1줄로 명시.
  검증 순서 테스트: `{open: 익월 말일 + 10, close: 익월 말일 + 1}`(순서·상한 둘 다 위반, 오픈일은 1년 상한 안) → 400 **"예약 마감일은 오픈일보다 빠를 수 없습니다."**(스펙 C4 ① 순서가 먼저). (구현 시 정정: `open=D+10, close=익월말+1` 은 순서 위반이 아님.) `FacilityBookingServiceIntegrationTest`: 오픈일 D-30·마감일 D+3 시설에 D+3 신청 → 201, D+4 신청 → 400 "지금은 M월 d일부터 M월 d일까지만…"(until 이 마감일). `FacilityAvailabilityAcceptanceTest`: 마감일 D+5 시설 → `bookableUntil == D+5`.

- [ ] **Step 2: RED 확인** — `./gradlew test --tests '*AdminFacilityAcceptanceTest' --tests '*FacilityUsageAcceptanceTest' --tests '*FacilityBookingServiceIntegrationTest' --tests '*FacilityAvailabilityAcceptanceTest'` → 컴파일 실패.

- [ ] **Step 3: 구현**

`GeneralFacilityAdminService`:
```java
    @Override
    @Transactional
    public void updateBookingOpenDate(UpdateFacilityBookingOpenDateCommand command) {
        assertWindowValid(command.bookingOpenDate(), command.bookingCloseDate());
        Facility facility = facilityRepository.findById(command.facilityId())
                .orElseThrow(FacilityException.FacilityNotFoundException::new);
        if (Objects.equals(facility.getBookingOpenDate(), command.bookingOpenDate())
                && Objects.equals(facility.getBookingCloseDate(), command.bookingCloseDate())) {
            return;
        }
        facility.changeBookingOpenDate(command.bookingOpenDate());
        facility.changeBookingCloseDate(command.bookingCloseDate());
    }

    @Override
    @Transactional
    public void updateAllBookingOpenDate(LocalDate bookingOpenDate, LocalDate bookingCloseDate) {
        assertWindowValid(bookingOpenDate, bookingCloseDate);
        for (Facility facility : facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()) {
            if (Objects.equals(facility.getBookingOpenDate(), bookingOpenDate)
                    && Objects.equals(facility.getBookingCloseDate(), bookingCloseDate)) {
                continue; // 스펙 C6 "그대로" — no-op 행은 건드리지 않는다(@DynamicUpdate 라 더티도 없음)
            }
            facility.changeBookingOpenDate(bookingOpenDate);
            facility.changeBookingCloseDate(bookingCloseDate);
        }
    }

    /** 바디의 (오픈일, 마감일) 쌍만 검증한다 — 시설의 기존값과 비교하지 않는다(전체 적용 포함). 순서 = 스펙 C4: ① 순서 ② 상한. */
    private void assertWindowValid(LocalDate bookingOpenDate, LocalDate bookingCloseDate) {
        assertWithinHorizon(bookingOpenDate);
        if (bookingCloseDate == null) {
            return;
        }
        if (bookingOpenDate != null && bookingCloseDate.isBefore(bookingOpenDate)) {
            throw new FacilityException.BookingCloseBeforeOpenException();
        }
        LocalDate nextMonthEnd = YearMonth.from(LocalDate.now(clock)).plusMonths(1).atEndOfMonth();
        if (bookingCloseDate.isAfter(nextMonthEnd)) {
            throw new FacilityException.InvalidBookingCloseDateException();
        }
    }
```
`GeneralFacilityAdminService` 에 `import java.time.YearMonth;` 추가. Request `toCommand` 에 마감일 전달, `AdminFacilityController.java:49` 전체 적용 호출부 인자 2개(`request.bookingOpenDate(), request.bookingCloseDate()`). 공개·관리자 응답 4곳 맨 뒤 가산, `GeneralFacilityUsageService:118` 전달. `AdminFacilityApi` 설명문에 "bookingCloseDate null = 상한 없음(익월 말일), 마감일 ≥ 오픈일, 익월 말일 이내".

- [ ] **Step 4: GREEN** — 위 4클래스 통과 → `./gradlew test` 전체 통과(기준선 3267+).
- [ ] **Step 5: 커밋** — `feat(backend): 시설 관리 — 오픈일 API 바디에 마감일 추가·순서/상한 검증·공개 응답 bookingCloseDate 가산`

## Part B — Frontend (BE 머지 후 develop 에서 분기)

### Task 3: 계약·안내줄

**Files:**
- Modify: `frontend/packages/types/src/admin.ts`(`AdminFacility.bookingCloseDate: string | null`, `UpdateFacilityBookingOpenDatePayload.bookingCloseDate: string | null`), `frontend/packages/types/src/facility.ts`(`FacilitySummary.bookingCloseDate?: string | null`, `FacilityItem.bookingCloseDate?: string | null` — optional, 구 BE 폴백), `frontend/apps/web/app/facilities/_lib/bookingHome.ts`
- Test: `frontend/apps/web/test/facilities/booking-home-lib.test.ts`, `frontend/apps/web/test/facilities/facility-booking-page.test.tsx`

**Interfaces:** `bookingWindowNote(bookableFrom, bookableUntil, todayIso, nextMonthEndIso)` — 4번째 인자 추가. 페이지(`FacilityBookingPage.tsx:129` 호출부)는 이미 있는 `nextMonth`(`:60`)와 `facilityTimeline.ts:25` 의 `daysInMonth(yearMonth)` 로 한 줄 파생한다 — 새 유틸 없음:

```ts
const nextMonthEndIso = `${nextMonth}-${String(daysInMonth(nextMonth)).padStart(2, '0')}`;
```

- [ ] **Step 1: 실패 테스트** — `booking-home-lib.test.ts`: 닫힘·오픈일 미래 기존 2케이스에 4번째 인자 추가; 신규 `bookingWindowNote('2026-09-04','2026-09-15','2026-09-04','2026-10-31')` → `'9.4 ~ 9.15 신청 가능'`; `bookingWindowNote('2026-09-10','2026-09-15','2026-09-04','2026-10-31')` → `'9.10 ~ 9.15 신청 가능'`(오픈일 미래 + 마감 결합); `bookingWindowNote('2026-09-04','2026-10-31','2026-09-04','2026-10-31')` → `null`. 페이지 테스트: 시설 4 = `{from: TODAY, until: TODAY+7}` 픽스처 → 안내줄 "M.d ~ M.d 신청 가능", TODAY+8 셀 "예약 기간 아님".
- [ ] **Step 2: RED** — `cd frontend/apps/web && pnpm vitest --run test/facilities/booking-home-lib.test.ts test/facilities/facility-booking-page.test.tsx` (vitest 는 초과 인자를 무시하므로 RED 사유는 런타임 단언 실패; typecheck 는 Step 4 에서).
- [ ] **Step 3: 구현**

```ts
/** 캘린더 상단 안내줄. 닫힘 → 시설 문구, 마감일이 익월 말일보다 앞이면 범위 문구, 오픈일만 미래면 시작 문구, 그 외 null. */
export function bookingWindowNote(
  bookableFrom: string,
  bookableUntil: string,
  todayIso: string,
  nextMonthEndIso: string,
): string | null {
  if (bookableFrom > bookableUntil) return '아직 예약 신청을 받지 않는 시설이에요';
  if (bookableUntil < nextMonthEndIso) return `${rangeDatesLabel(bookableFrom, bookableUntil)} 신청 가능`;
  if (bookableFrom > todayIso) return `${monthDayLabel(bookableFrom)}부터 신청할 수 있어요`;
  return null;
}
```
- [ ] **Step 4: GREEN** + 루트 `pnpm typecheck`(페이지 호출부 인자 추가 후).
- [ ] **Step 5: 커밋** — `feat(frontend): 시설 예약 계약 — bookingCloseDate 타입 가산·캘린더 안내줄 범위 문구`

### Task 4: 관리자 탭 마감일 입력

**Files:**
- Modify: `frontend/apps/web/app/admin/facility-bookings/_tabs/FacilityOpenDateTab.tsx`, `frontend/apps/web/app/admin/facility-bookings/_components/FacilityOpenDateConfirmDialog.tsx`
- Test: `frontend/apps/web/test/admin/facility-bookings/facility-open-date-tab.test.tsx`

**Interfaces:**
- `drafts: Record<number, { open: string; close: string }>`, `bulkDraft: { open: string; close: string }`.
- `PendingChange` 의 `before`/`after` 를 `{ open: string | null; close: string | null }` 로. 다이얼로그 props `before`/`after` 는 문자열 유지 — **탭 파일 내부 함수** `windowLabel({open, close})` 가 `"M.d ~ M.d"`(마감 없음 `"M.d ~"`, 닫힘 `"닫힘"`) 문자열을 만들어 넘긴다(`bookingHome.ts` 에 두지 않는다 — 홈 카드는 창 산식을 모른다는 D7 유지, `monthDayLabel` 은 export 해서 재사용). 다이얼로그 본문 "예약 오픈일을 A → B 로 바꿀까요?" 는 "예약 창을 A → B 로 바꿀까요?" 로.
- 행: 현재값 셀 `"오픈일 ~ 마감일"`/`"오픈일 ~"`/`"닫힘"`, date input 2칸(`aria-label` `${roomName} 오픈일`·`${roomName} 마감일`), 저장 활성 = `open !== currentOpen || close !== currentClose`(둘 다 빈 문자열이면 비활성), 닫기 = `{open: null, close: null}`. 전체 적용 행: date input 2칸(`전체 적용 오픈일`·`전체 적용 마감일`), 적용 활성 = open 입력됨(마감은 선택), 전체 닫기 = 둘 다 null.
- PATCH 바디는 항상 `{ bookingOpenDate, bookingCloseDate }` 두 키(빈 문자열 → null).

- [ ] **Step 1: 실패 테스트** — 기존 8케이스의 바디 단언을 두 키로 확장(`bookingCloseDate: null` 기대). MSW 핸들러 2곳이 `bookingCloseDate` 도 복사. 신규 5건: 마감일만 입력 후 저장 → 바디 `{open: 현재값, close: '…'}` · 오픈일만 바꿔도 저장 활성 · 순서 400 메시지가 다이얼로그에 표시 · 전체 적용 바디에 마감일 포함 · 닫기 → 둘 다 null. 기존 픽스처 시설에 `bookingCloseDate: null` 필드 추가(타입 필수).
- [ ] **Step 2: RED** — `pnpm vitest --run test/admin/facility-bookings/facility-open-date-tab.test.tsx`.
- [ ] **Step 3: 구현** — 위 인터페이스대로. `draftOf` 는 `{ open: drafts[id]?.open ?? facility.bookingOpenDate ?? '', close: drafts[id]?.close ?? facility.bookingCloseDate ?? '' }`. 입력 클래스는 기존 것 재사용. 전체 적용 실패 문구·성공 후 초안 폐기 로직 유지.
- [ ] **Step 4: GREEN** — 포커스 → `pnpm test` + `pnpm typecheck` + `pnpm lint` 셋 다.
- [ ] **Step 5: 커밋** — `feat(frontend): 시설 관리 — 오픈일 설정 탭에 마감일 입력·창 범위 다이얼로그`

---

## 리뷰·QA·릴리스

- 태스크마다 spec + quality 리뷰(fork), 파트별 whole-branch 최종 리뷰. 브라우저 QA 4건: ① 9/1~9/15 창 설정 → 캘린더 안내줄 "9.1 ~ 9.15 신청 가능"·9/16 셀 비활성·9/15 신청 201·9/16 신청 400 ② 마감 < 오픈 400 문구 ③ 마감 > 익월 말일 400 문구 ④ 전체 적용에 마감 포함 → 전 행 "M.d ~ M.d".
- 배포: BE 먼저. 구 FE 가 마감일 없이 PATCH 하면 마감일 해제(안전 방향). PR 본문에 명시.
- 부모 플랜 D1 정의 갱신(빈 창 = 닫힘·오픈 전·마감 후): Task 1 커밋에 부모 플랜 `docs/superpowers/plans/2026-09-03-facility-booking-open-date-plan.md` D1 행 끝에 각주 한 줄("2026-09-05 마감일 스펙으로 '마감 후' 추가")을 함께 넣는다.

## Self-review
- 스펙 C1~C10 ↔ Task 1(C1·C2·C3)·Task 2(C4·C5·C6·C7)·Task 3(C8)·Task 4(C9), C10 범위 밖 — 누락 없음.
- 시그니처 일관: `windowFor(open, close, today)` Task 1↔`BookingApplicationPolicy`; `updateAllBookingOpenDate(open, close)` Task 2↔컨트롤러; `bookingWindowNote(…, nextMonthEndIso)` Task 3↔페이지; 바디 두 키 Task 2↔Task 4.
- 플레이스홀더 없음.
