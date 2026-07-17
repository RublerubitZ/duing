# 시설 예약 월↔주 뷰 아키텍처 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) 구문.

**Goal:** 월간=날짜 탐색 / 주간=시간 선택·신청으로 역할 분리(Google Calendar 방식). 헤더 [월][주] 토글, 날짜 탭 시 주간 자동 전환, 주간 그리드 셀 시간 선택, 모바일 바텀시트 제거.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-17-facility-month-week-views-design.md` §1~§7. FE 단독(백엔드 무변경).

**Tech Stack:** Next.js 15 / React 19, vitest + testing-library(msw 패턴 — facilities 페이지 테스트 관례).

## Global Constraints

- 스펙 §1~§5 규칙 그대로. 특히 §6 "유지되는 것(무변경 계약)" 목록은 전부 회귀 없이 보존한다.
- 기존 디자인 토큰·컴포넌트·타이포만 사용(신규 색·라운드 금지, 레포 rounded-xl=28px 주의).
- `any`/`as` 금지(`as const` 예외), `type`만, useEffect 데이터 패칭 금지, URL은 replaceState만(view는 URL에 안 씀), 테스트 절대 날짜 타임밤 금지.
- 커밋: 한국어 Conventional Commits, Co-Authored-By/🤖 금지. push·PR 금지(컨트롤러 몫).
- pnpm 명령은 `frontend/`에서.

---

### Task 1: 페이지 아키텍처 — 뷰 상태 머신·헤더 토글·사이드바 재배선·시트 제거

**Files:**
- Modify: `frontend/apps/web/app/facilities/_pages/FacilityBookingPage.tsx`
- Create: `frontend/apps/web/app/facilities/_components/booking/BookingViewHeader.tsx` ([월|주] 토글 + 기간 라벨 + 이동 화살표 + 범례 — 월/주 공용, 스펙 §2)
- Modify: `frontend/apps/web/app/facilities/_components/booking/BookingCalendar.tsx` (내부 헤더 행 제거 — 공용 헤더로 흡수. 창 칩 행·그리드·셀 로직 무변경)
- Modify: `frontend/apps/web/app/facilities/_components/booking/BookingPanel.tsx` (view/onChangeView/daysByIso/bookableFrom/Until/onSelectDate props·tablist·WeekTimetable 렌더 제거 — 일간 콘텐츠 전용으로 단순화)
- Modify: `frontend/apps/web/app/facilities/_lib/bookingCalendar.ts` (`weekRangeLabel(mondayIso)` — "7월 20일 – 26일"/"7월 28일 – 8월 3일", `shiftDateByDays(iso, delta)` 유틸)
- Test: `facility-booking-page.test.tsx`(플로우 재작성: 날짜 탭→주간 전환·[월] 복귀·[주] 기본 선택일·시트 부재), `booking-components.test.tsx`(BookingViewHeader·BookingPanel 정합)

**Interfaces (Produces — Task 2가 의존):**
- 페이지 상태 `calendarView: 'month' | 'week'`(기본 month), `selectDate(iso)`가 view='week' 전환까지 수행.
- `tapWeekSlot(iso: string, slotStart: string)`: iso===selectedDate 면 기존 toggleSlot, 아니면 selectDate(iso) 후 해당 슬롯 단일 선택(`{start: slotStart, end: +1h}`). Task 1에서 페이지에 구현해 두고 WeekTimetable 에는 Task 2에서 연결.
- 주 이동: `changeWeek(delta: 1|-1)` — selectedDate ±7일, 이동 후 주의 월요일이 창 주 범위 밖이면 비활성(canPrevWeek/canNextWeek), 월요일 소속 월로 yearMonthOverride 스위칭(당월·익월 캡 내).

- [ ] **Step 1: 실패 테스트 (RED)** — 페이지 플로우: (a) 초기 진입=월간(주간 그리드 부재), (b) 월간 날짜 탭→주간 전환+해당 주 라벨+사이드바(시간 리스트) 노출, (c) [월] 탭→월간 복귀+선택 유지(셀 강조), (d) 선택 없이 [주] 탭→오늘(창 내) 기준 주, (e) 딥링크 date→주간 진입, (f) 모바일 뷰포트에서도 시트 없이 본문 스택(dialog 부재), (g) 주 이동 화살표·캡. lib: weekRangeLabel 동월/월경계.
- [ ] **Step 2: 실패 확인** — `pnpm --filter web test facility-booking-page booking-calendar-lib` FAIL
- [ ] **Step 3: 구현** — 스펙 §1(상태 머신)·§2(공용 헤더)·§3(월간 탐색 전용)·§5(사이드바 주간 전용·모바일 스택·시트 제거) 그대로. Sheet/useIsMobileViewport 사용처가 사라지면 import·관련 코드 정리(훅 파일 자체는 타 사용처 grep 후 판단).
- [ ] **Step 4: GREEN + 전체 검증** — `pnpm lint && pnpm typecheck && pnpm --filter web test` 전건 PASS(수치 보고)
- [ ] **Step 5: 커밋** — `feat(frontend): 시설 예약 월↔주 뷰 전환 — 헤더 토글·주간 사이드바·시트 제거`

---

### Task 2: 주간 그리드 전면 개편 (목업 F3) — 셀 시간 선택·선택일 강조

**Files:**
- Modify: `frontend/apps/web/app/facilities/_components/booking/WeekTimetable.tsx` (전면 개편)
- Modify: `frontend/apps/web/app/facilities/_pages/FacilityBookingPage.tsx` (tapWeekSlot 연결만)
- Test: `booking-components.test.tsx`(그리드 단위), `facility-booking-page.test.tsx`(셀 탭 통합)

**Interfaces (Consumes):** Task 1의 `tapWeekSlot(iso, slotStart)`·주간 뷰 컨테이너. Props: `{ selectedDate, daysByIso, bookableFrom, bookableUntil, todayIso, selection, onSelectDate, onTapSlot }`.

- [ ] **Step 1: 실패 테스트 (RED)** — (a) 선택일 컬럼 강조(헤더 "· 선택"+ink 원형·컬럼 tint), (b) 가능 셀 탭→onTapSlot(iso, start) 호출, (c) 차단·지난·창 밖·데이터 없음 셀 비활성, (d) 대기 셀 "대기" 라벨+탭 가능, (e) 선택 범위 셀 ink+✓, (f) 행 높이·시간 라벨(mono HH:00) 구조.
- [ ] **Step 2: 실패 확인** — `pnpm --filter web test booking-components` FAIL
- [ ] **Step 3: 구현** — 스펙 §4 그대로: 40px 행(모바일 36px)·상태색 셀·선택일 컬럼 ink 프레임+tint·"대기" 소형 라벨·셀 버튼화(aria-label "요일 N일 HH:MM 상태")·요일 헤더 탭 유지·창/데이터 게이팅 유지. 주 이동·라벨은 Task 1 헤더가 담당(이 컴포넌트는 그리드만).
- [ ] **Step 4: GREEN + 전체 검증** — `pnpm lint && pnpm typecheck && pnpm --filter web test` 전건 PASS(수치 보고)
- [ ] **Step 5: 커밋** — `feat(frontend): 주간 그리드 개편 — 셀 시간 선택·선택일 컬럼 강조 (목업 F3)`
