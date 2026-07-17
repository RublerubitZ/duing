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

---

### Task 3: 주간 그리드 예약 블록화 + 색상 정책 (8차 요구 §8, PC 기준)

**Files:**
- Modify: `frontend/apps/web/tailwind.config.ts` (`pastel` 6색 × {bg,border,accent} 신설)
- Modify: `frontend/apps/web/app/facilities/_lib/bookingCalendar.ts` (`pastelIndexByLabel` — 주간 화면 확정 블록 라벨 첫 등장 순 팔레트 인덱스, 순수 함수)
- Modify: `frontend/apps/web/app/facilities/_components/booking/WeekTimetable.tsx` (컬럼 렌더를 dayOverviewTimeline 기반 블록(rowSpan)+AVAILABLE/PAST 셀로 재구성, §8.1 블록 내용·§8.2 색 매핑)
- Modify: `frontend/apps/web/app/facilities/_components/booking/BookingViewHeader.tsx` (주간 범례에 운영=sky 추가, 예약됨 스와치는 파스텔 대표 1색+설명 유지)
- Test: `booking-calendar-lib.test.ts`, `booking-components.test.tsx`, `facility-booking-page.test.tsx`(셀 탭 시나리오 정합)

**Interfaces:** WeekTimetable props 무변경 + `operatingNotes` 소스 필요 — `daysByIso` 의 day 가 이미 operatingNotes 를 가지므로 추가 prop 불필요. 블록은 PC 에서 disabled(§8.1), Task 4 가 모바일 탭을 연다.

- [ ] **Step 1: 실패 테스트 (RED)** — (a) lib: pastelIndexByLabel(같은 라벨=같은 인덱스·첫 등장 순 순환·7번째 라벨=0 재순환), (b) 그리드: 연속 BLOCKED 2칸=블록 1개(rowSpan·이름 Bold·시간 secondary·accent 클래스), 운영 블록=sky 계열+단체명 "(운영)", PENDING 블록="승인 대기"(이름 없음)·warm, AVAILABLE 셀 탭 선택 유지, 같은 주 두 동아리=서로 다른 pastel 클래스·같은 동아리 두 블록=같은 클래스, (c) 페이지: 기존 셀 탭 시나리오(23~25) 무회귀.
- [ ] **Step 2: 실패 확인** — `pnpm --filter web test booking-components booking-calendar-lib` FAIL
- [ ] **Step 3: 구현** — 스펙 §8 그대로. 파스텔 hex 는 cream(#F6F3EC) 위에서 조화로운 저채도(§8.3 가이드: lemon 은 warm 과 구분, sky 제외). rowSpan 테이블 유지(선택일 컬럼 프레임 로직과 병존). 블록 aria-label "요일 N일 HH:MM~HH:MM 라벨 상태".
- [ ] **Step 4: GREEN + 전체 검증** — `pnpm lint && pnpm typecheck && pnpm --filter web test` 전건 PASS(수치 보고)
- [ ] **Step 5: 커밋** — `feat(frontend): 주간 그리드 예약 블록화 — 상태 고정색·확정 예약 파스텔 순환`

---

### Task 4: 모바일 주간 압축 + 블록 상세 Bottom Sheet (8차 요구 §9)

**Files:**
- Modify: `frontend/apps/web/app/facilities/_components/booking/WeekTimetable.tsx` (<sm 압축: table-fixed·시간열 w-8·행 h-6~7·블록 약칭·선택일 헤더만 강조)
- Create: `frontend/apps/web/app/facilities/_components/booking/WeekBlockSheet.tsx` (블록 상세 바텀시트 — 라벨·시간·상태 배지·운영 정책 문구)
- Modify: `frontend/apps/web/app/facilities/_pages/FacilityBookingPage.tsx` (시트 상태·뷰포트 훅 복원 배선)
- Test: `booking-components.test.tsx`, `facility-booking-page.test.tsx`(모바일 시나리오)

**Interfaces (Consumes):** Task 3 의 블록 렌더. 뷰포트 판정은 Task 1 에서 제거된 `useIsMobileViewport` 패턴(useSyncExternalStore+matchMedia) 을 공용 훅으로 복원(`_lib/useIsMobileViewport.ts`) — 블록 disabled(PC) ↔ 시트 트리거(모바일) 게이트.

- [ ] **Step 1: 실패 테스트 (RED)** — (a) 모바일(matchMedia true): 그리드 가로 스크롤 래퍼 없음(또는 min-w 미적용)·블록 약칭(예: "비호")·풀네임 부재·확정 블록 탭→시트(라벨·HH:MM~HH:MM·상태 배지)·운영 블록 탭→정책 문구·AVAILABLE 셀 탭=선택(시트 아님)·선택일 컬럼 프레임 부재(헤더 강조만), (b) PC(matchMedia false): 블록 disabled·시트 부재·기존 단언 무회귀.
- [ ] **Step 2: 실패 확인** — `pnpm --filter web test booking-components facility-booking-page` FAIL
- [ ] **Step 3: 구현** — 스펙 §9 그대로. 시트는 기존 ui/sheet 재사용(duing 스코프 bg-transparent 함정·sr-only Description 전례 준수). 시나리오 20 의 matchMedia 오버라이드/원복 패턴 재사용.
- [ ] **Step 4: GREEN + 전체 검증** — `pnpm lint && pnpm typecheck && pnpm --filter web test` 전건 PASS(수치 보고)
- [ ] **Step 5: 커밋** — `feat(frontend): 모바일 주간 압축 — 7일 한 화면·블록 약칭·상세 바텀시트`

---

### Task 5: 운영행 Guide Layer + 문구 교체 (9차 요구 §10)

**Files:**
- Modify: `frontend/apps/web/app/facilities/_components/booking/WeekTimetable.tsx` (운영 셀 가이드 시각·aria)
- Modify: `frontend/apps/web/app/facilities/_components/booking/BookingViewHeader.tsx` (주간 범례 "기본 확보 시간"+점선 스와치)
- Modify: `frontend/apps/web/app/facilities/_components/booking/DaySlotList.tsx` (안내 박스 제목·§10.2 고정 문구)
- Modify: `frontend/apps/web/app/facilities/_components/booking/DayBookingOverview.tsx` ("(기본 확보)" 접미)
- Modify: `frontend/apps/web/app/facilities/_components/booking/PanelSummaryCard.tsx` ("이용 가능 시간"으로)
- Test: `booking-components.test.tsx`, `facility-booking-page.test.tsx` 관련 단언 전수 갱신

**Interfaces:** 동작·props·구조 전부 무변경 — 시각 클래스와 문자열만. 스펙 §10.2 고정 문구는 한 글자도 다르면 안 된다.

- [ ] **Step 1: 실패 테스트 (RED)** — (a) 운영 셀 aria "기본 확보 시간 · 예약 신청 가능"+`border-dashed` 클래스+탭 선택 유지, (b) 범례 "기본 확보 시간", (c) 안내 박스 제목 "기본 확보 시간"+§10.2 고정 문구 정확 일치, (d) 현황 카드 "(기본 확보)", (e) 요약 카드 "이용 가능 시간 …", (f) 금지어 부정 단언: facilities 컴포넌트 렌더 출력에 "운영 시간"/"운영 중" 부재.
- [ ] **Step 2: 실패 확인** — `pnpm --filter web test booking-components facility-booking-page` FAIL
- [ ] **Step 3: 구현** — 스펙 §10 그대로. 동작 코드(탭·선택·블록 plan) 무변경 확인.
- [ ] **Step 4: GREEN + 전체 검증** — `pnpm lint && pnpm typecheck && pnpm --filter web test` 전건 PASS(수치 보고)
- [ ] **Step 5: 커밋** — `feat(frontend): 운영행을 가이드 레이어로 — 점선 시각·기본 확보 시간 문구 전환`

---

### Task 6: 모바일 빠른 예약 Bottom Sheet (10차 요구 §11)

**Files:**
- Create: `frontend/apps/web/app/facilities/_components/booking/MobileDaySheet.tsx` (§11.1 구성 — 기존 PanelStepIndicator·DaySlotList·BookingForm·BookingSuccess 조립 + "시간표로 보기")
- Modify: `frontend/apps/web/app/facilities/_pages/FacilityBookingPage.tsx` (모바일 날짜 탭 분기·시트 상태·뷰포트 승계 이펙트)
- Test: `facility-booking-page.test.tsx`(모바일 플로우 시나리오), `booking-components.test.tsx`(시트 단위)

**Interfaces:** PC 경로(`selectDate`→week 전환)는 무변경. 모바일 분기는 페이지에서 `isMobileViewport && calendarView==='month'`일 때 날짜 탭 → 시트 오픈(주간 전환 생략). 시트는 기존 panel 스텝 상태(step·selection·submitted*)를 그대로 공유 — 새 상태 머신을 만들지 않는다.

- [ ] **Step 1: 실패 테스트 (RED)** — 모바일(matchMedia true): (a) 월간 날짜 탭 → dialog(시트) 열림 + 월간 유지(주간 그리드 부재) + 시트에 날짜 제목·슬롯 리스트, (b) 시트에서 슬롯 탭 → 선택 요약·CTA 활성, (c) "시간표로 보기" 탭 → 시트 닫힘 + 주간 전환 + 선택 유지, (d) 시트 닫기 → 월간 유지 + 선택 정리, (e) 딥링크 date → 월간 + 시트. PC(false): (f) 날짜 탭 → 기존 주간 전환·시트 부재(무회귀).
- [ ] **Step 2: 실패 확인** — `pnpm --filter web test facility-booking-page booking-components` FAIL
- [ ] **Step 3: 구현** — 스펙 §11 그대로. 시트 전례(duing 스코프·bg-cream·sr-only Description·hideClose·핸들 바) 준수. WeekBlockSheet 와 상태 분리(동시 열림 불가 — 월간에선 블록 시트 트리거 자체가 없음).
- [ ] **Step 4: GREEN + 전체 검증** — `pnpm lint && pnpm typecheck && pnpm --filter web test` 전건 PASS(수치 보고)
- [ ] **Step 5: 커밋** — `feat(frontend): 모바일 빠른 예약 시트 — 월간 날짜 탭 즉시 시간 선택·시간표는 보조`

---

### Task 7: 주간 이월 게이팅 버그 수정 — 인접월 가용성 병합 (11차 요구 §12)

**Files:**
- Modify: `frontend/apps/web/app/facilities/_pages/FacilityBookingPage.tsx` (주간 이월 시 두 번째 월 조회·daysByIso 병합)
- Modify(필요 시): `frontend/apps/web/app/facilities/_lib/bookingCalendar.ts` (주의 걸친 월 파생 헬퍼)
- Test: `facility-booking-page.test.tsx`(§12.2 케이스 — msw 두 월 핸들러), `booking-calendar-lib.test.ts`(헬퍼)

**Interfaces:** `useFacilityAvailabilityQuery` 를 두 번째 월에 대해 조건부 활성(enabled)으로 추가 호출 — 훅 시그니처 무변경. 병합은 useMemo 에서 두 응답의 days 를 합친다(중복 날짜 없음 — 월이 다르므로). 나머지 소비처는 무변경.

- [ ] **Step 1: 실패 테스트 (RED)** — §12.2의 4케이스를 msw 로: 창·오늘을 상대 날짜로 구성해 주가 두 달/두 해에 걸치게 만들고, (a) 인접월 창 내 날짜 셀·헤더 활성+탭 선택 동작, (b) 인접월 창 밖 날짜는 여전히 비활성, (c) 인접월이 {당월,익월} 밖이면 추가 조회 없음(msw 핸들러 미호출 단언), (d) 연 경계 주 정상. 절대 날짜 타임밤 금지 — 기존 WINDOW 파생 상수 패턴 재사용.
- [ ] **Step 2: 실패 확인** — `pnpm --filter web test facility-booking-page` FAIL
- [ ] **Step 3: 구현** — 스펙 §12.1 그대로. "표시 월/주 시작 월 기준 판정" 잔존 여부 grep 전수(§12.1 말미).
- [ ] **Step 4: GREEN + 전체 검증** — `pnpm lint && pnpm typecheck && pnpm --filter web test` 전건 PASS(수치 보고)
- [ ] **Step 5: 커밋** — `fix(frontend): 주간 이월 시 인접월 가용성 병합 — 날짜 기준 예약 가능 판정 완성`
