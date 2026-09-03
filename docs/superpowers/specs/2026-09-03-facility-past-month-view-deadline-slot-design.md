# 시설 예약 — 직전 월 기록 열람 + 신청 마감 슬롯(DEADLINE_PASSED) 표시 (확정 스펙)

develop `d9ea5e3d` 기준. 사용자 요청(2026-09-03) 2건을 최소 변경으로 반영한다. 사용자 확정 사항(같은 날 2차 지시)을 §0 에 그대로 옮기고, 본문은 그 범위 안에서만 결정한다.

## 0. 사용자 확정 사항 (변경 불가 전제)

1. **직전 월 열람 범위**
   - 대상은 공개 예약 캘린더 `/facilities` 만. 관리자 크롤 현황 탭은 제외.
   - 현재 월 + 직전 월까지 조회 가능. 직전 월의 기존 예약 점유 정보가 PAST 에 묻히지 않게 보존.
   - 직전 월 조회로 온디맨드 재크롤을 하지 않는다. 저장된 스냅샷을 그대로 조회한다.
   - 기존 미래 예약/신청 정책은 변경하지 않는다.
2. **마감 슬롯**
   - `DEADLINE_PASSED` 상태 추가. `BookingDeadlinePolicy` 의 순수 판정을 신청 생성 검증과 슬롯 조립이 공유.
   - 실제 예약이 존재하는 슬롯(BLOCKED·PENDING_HOLD)은 점유 정보가 최우선. 비어 있는 슬롯에만 DEADLINE_PASSED 를 적용.
3. **FE**
   - DEADLINE_PASSED 는 "신청 마감" 으로 명확히 표시하고 disabled.
   - 폼 단계 안내·서버 검증은 이중 방어로 유지. `isSelectableSlot` 의 fail-closed 동작 유지.
4. 테스트에서 **기존 예약 점유 정보 보존** 과 **KST 기준 전날 12:00 마감 경계값** 을 반드시 검증.

## 1. 현 상태 (조사 결과 요약)

| 항목 | 위치 | 현 동작 |
|---|---|---|
| 월 범위 400 | `GeneralFacilityAvailabilityService.getAvailability` | 당월·익월 외 `MonthOutOfBookingRangeException`(400). 이 메시지는 관리자 크롤 탭(`FacilityCrawlAdminQueryService`)과 공유 |
| 온디맨드 크롤 | 같은 메서드 | 조회 월마다 `FacilityCrawlService.ensureFresh(targetMonth)` 호출 |
| stale 판정 | 같은 메서드 `isStale` | 고정 10분 TTL(`SnapshotFreshnessPolicy.CURRENT_NEXT_TTL`) |
| 슬롯 우선순위 | `FacilitySlotAssembler.resolveSlot` | PAST → BLOCKED(INTERNAL) → BLOCKED(SCHOOL) → PENDING_HOLD → AVAILABLE. **PAST 가 점유 정보를 덮는다** |
| 마감 판정 | `BookingDeadlinePolicy.validate`(생성 시점만) | D-1 12:01 KST 부터 거부. 슬롯 조립에 미반영 |
| FE 월 이동 | `FacilityBookingPage.tsx` | `canPrev = yearMonth !== currentMonth`, `canNext = yearMonth === currentMonth`. 딥링크 월·인접월 병합도 당월·익월 고정 |
| FE 과거 셀 | `BookingCalendar.tsx` | `dayStatus === 'PAST' \|\| iso < todayIso` 면 `disabled` |
| FE 주간 격자 | `WeekTimetable.tsx` | 창 밖 날짜는 블록 없이 "예약 기간 아님" 셀만. 헤더 날짜 버튼도 창 밖이면 disabled |
| FE 창 밖 선택 정리 | `FacilityBookingPage.tsx` `selectedDateOutOfWindow` | `selectedDate` 가 창 밖이면(과거 포함) 선택을 지우고 토스트 |
| FE 마감 안내 | `BookingForm.tsx` | 폼 진입 후에만 `isApplicationDeadlinePassed` 로 안내 |
| 스냅샷 보존 | `FacilitySnapshotWriter` | 크롤은 당월·익월만 reconcile. 창 밖 과거 월 행·월 메타는 삭제하지 않는다 → 직전 월 스냅샷은 DB 에 그대로 남는다 |

동아리 운영진 예약 목록(`/manage/clubs/{id}/facility-bookings`)은 월 제한이 없어 이번 범위 밖이다.

## 2. 백엔드 결정

### 2.1 직전 월 열람 — `GeneralFacilityAvailabilityService.getAvailability`

- 허용 월: `currentMonth.minusMonths(1)`, `currentMonth`, `currentMonth.plusMonths(1)`. 그 외는 기존과 같이 `MonthOutOfBookingRangeException`.
- `pastMonth = targetMonth.isBefore(currentMonth)` 일 때:
  - `ensureFresh` 를 **호출하지 않는다**(§0-1). `DataSource` 는 `CACHE` 로 둔다.
  - `stale = snapshot == null || snapshot.getFetchStatus() != FetchStatus.SUCCESS` — 과거 월은 "기록의 완결성" 만 본다. TTL 을 적용하면 항상 stale 이 되어 "현재 최신 캐시 데이터를 표시하고 있습니다" 배너가 기록 열람 내내 붙는다.
  - `lastUpdatedAt` 은 기존대로 스냅샷 `crawledAt`(기록의 수집 기준 시각).
- 당월·익월 경로는 한 줄도 바꾸지 않는다(ensureFresh·10분 TTL 그대로).
- `MonthOutOfBookingRangeException` 메시지: `"예약 가능 기간이 아닙니다. 이번 달과 다음 달만 조회할 수 있습니다."` → `"조회할 수 있는 기간이 아닙니다."`. 관리자 크롤 탭이 같은 예외를 쓰고 그쪽은 여전히 당월·익월이라, 두 호출부 모두에 참인 문구로 일반화한다. 클래스명·HTTP 상태(400)·코드는 유지.
- `FacilityAvailabilityService.getAvailability` javadoc 과 `isStale` 주석("예약 홈은 당월·익월 전용") 정정.

### 2.2 마감 판정 공유 — `BookingDeadlinePolicy`

- `public static boolean isPassed(LocalDate reservationDate, LocalDateTime now)` 추가: `!now.isBefore(reservationDate.minusDays(1).atTime(12, 1))`. 기존 `validate` 는 이 메서드로 판정 후 예외만 던진다(경계 12:00:59 허용·12:01:00 거부 불변).
- 슬롯 조립은 `today.atTime(nowTime)` 을 `now` 로 넘긴다. `today`·`nowTime` 은 서비스가 `seoulClock` 에서 뽑는 KST 벽시계이므로 정책과 같은 시간대다.

### 2.3 슬롯 상태 — `FacilityAvailabilityResponse.SlotStatus` + `FacilitySlotAssembler`

- enum 에 `DEADLINE_PASSED` 추가(가산적 변경). javadoc: "신청 마감(사용일 전날 12:00 KST 경과). 빈 슬롯에만 부여되며 점유 슬롯은 BLOCKED·PENDING_HOLD 를 유지한다."
- `resolveSlot` 우선순위(최종):

  | 순서 | 조건 | 상태 |
  |---|---|---|
  | 1 | 내부 APPROVED/CONFIRMED 겹침 | `BLOCKED(INTERNAL)` + 동아리명 |
  | 2 | 크롤 실예약 겹침 | `BLOCKED(SCHOOL)` + 단체명 |
  | 3 | 지난 시간대(날짜 < 오늘, 또는 오늘이고 slotEnd ≤ now) | `PAST` |
  | 4 | 내부 PENDING 겹침 | `PENDING_HOLD` |
  | 5 | `BookingDeadlinePolicy.isPassed(date, now)` | `DEADLINE_PASSED` |
  | 6 | 그 외 | `AVAILABLE` |

  사용자 권고 순서(BLOCKED → DEADLINE_PASSED → PAST → PENDING_HOLD → AVAILABLE)에서 두 곳을 조정했고 근거는 다음과 같다.
  - **PAST 를 DEADLINE_PASSED 앞에**: 지난 날짜는 정의상 마감도 지났으므로, 문자 그대로 두면 PAST 가 도달 불가 상태가 되어 8월 기록의 빈 칸이 전부 "신청 마감" 으로 보인다. 지난 시간은 "지난 시간" 으로 남기고, 아직 오지 않았지만 신청이 닫힌 칸만 "신청 마감" 으로 구분한다(§0-2 "왜 마감됐는지 명확히").
  - **PENDING_HOLD 를 DEADLINE_PASSED 앞에**: §0-2 명시 규칙(승인 대기 예약도 상태 유지, 빈 슬롯에만 DEADLINE_PASSED).
  - PAST 가 PENDING_HOLD 를 이기는 3↔4 순서는 기존 동작 그대로다(지난 시간대의 대기 신청은 홀드 의미가 없다).
- BLOCKED 를 PAST 앞에 두는 것이 §0-1 "점유 정보 보존" 의 실체다. 오늘의 지난 시간대·직전 월 날짜 모두 점유 슬롯은 BLOCKED(단체명 포함) 로 내려간다.
- `availableSlotCount`: `AVAILABLE` 은 항상, `PENDING_HOLD` 는 **그 날짜가 마감 전일 때만** 센다. 마감된 날의 대기 슬롯은 새 신청 대상이 아니므로 세면 월간 셀이 "혼잡 1칸" 으로 보인다. `dayStatus` 산식(`PAST` / `FULL` / `AVAILABLE`)은 무변경 — 마감된 날은 자연히 `FULL` 이 되고 FE 월간 셀은 기존 `FULL` 라벨 "마감" 을 쓴다.
- `assembleDay` 는 날짜당 1회 `isPassed` 를 계산해 슬롯 루프에 넘긴다.

### 2.4 무변경 확인

- `BookingApplicationPolicy.validateApplication`(반월 창 → 마감 → 중앙 → 역할)·`BookingPolicyValidator`·`GeneralFacilityBookingService.create` 는 손대지 않는다. 서버 거부는 기존 `DeadlinePassedException`(400, `FACILITY_BOOKING_DEADLINE_PASSED`) 그대로.
- DB 마이그레이션 없음. 관리자 콘솔·제출 도메인·크롤러 무변경.

## 3. 프론트엔드 결정 (`frontend/apps/web/app/facilities/**`, `packages/types`, `packages/api` 주석)

### 3.1 타입·계약 주석

- `packages/types/src/facility.ts`: `BookingSlotStatus` 에 `'DEADLINE_PASSED'` 추가. `FacilityAvailabilityResponse` 주석에 "직전 월은 저장 스냅샷 열람" 명시. `packages/api/src/client.ts` 의 `availability` 주석("당월·익월만 허용") 정정.

### 3.2 순수 파생 — `_lib/bookingCalendar.ts`

- `isSelectableSlot` 무변경(AVAILABLE·PENDING_HOLD 만 true. DEADLINE_PASSED 는 자동으로 false).
- 추가 `isDayApplicationClosed(slots)`: `slots.some(status === 'DEADLINE_PASSED')`. 서버 상태만으로 "이 날은 신청이 닫혔다" 를 파생한다(클라 시계 미사용).
- 추가 `hasApplicableSlot(slots)`: `!isDayApplicationClosed(slots) && slots.some(isSelectableSlot)`. CTA 문구·행 게이팅 공용.
- 잔여 한계(문서화): 마감된 날의 비어 있지 않은 칸이 전부 BLOCKED·PENDING_HOLD·PAST 라 DEADLINE_PASSED 슬롯이 하나도 없으면 대기 칸이 선택 가능하게 남는다. 그 경로는 기존 폼 힌트(`isApplicationDeadlinePassed`)와 서버 400 이 막는다(§0-3 이중 방어).

### 3.3 `DaySlotList.tsx` (패널·모바일 시트 공용)

- `SLOT_ROW_CLASS` 에 `DEADLINE_PASSED: 'border-transparent bg-graysoft/60 text-charcoal-3'`(PAST·BLOCKED 와 같은 muted 톤. `Record` 타입이라 누락은 컴파일 오류).
- `slotStatusLabel`: `DEADLINE_PASSED` → `'신청 마감'`.
- 행 `disabled = !isSelectableSlot(slot) || dayClosed` (`dayClosed = isDayApplicationClosed(day.slots)`). 마감된 날의 `PENDING_HOLD` 행은 라벨 "승인 대기" 를 유지한 채 비활성.
- `dayClosed` 이면 목록 위에 `<p role="note">신청이 마감된 날짜예요. 시설 사용일 전날 12:00까지만 신청할 수 있어요.</p>` 1줄(폼 힌트와 같은 문장 계열). 기본 확보 시간 아코디언보다 아래, 목록 바로 위.

### 3.4 `WeekTimetable.tsx`

- `cellStateOf` 판정 순서를 `isPast → !withinWindow → DEADLINE_PASSED → AVAILABLE → 폴백('예약됨')` 으로 바꾼다. 현재는 `!withinWindow` 가 `isPast` 보다 앞이라(`WeekTimetable.tsx:413-414`), 운영에서 `bookableFrom` 이 오늘인 이상 지난 날짜는 항상 창 밖이 되어 직전 월의 빈 셀이 전부 "예약 기간 아님" 으로 읽힌다. 지난 빈 셀은 "지난" 이 맞다. `DEADLINE_PASSED` 분기는 `{ statusText: '신청 마감', toneClass: 'border-line/60 bg-graysoft/40', selectable: false }`. 창 밖 미래 셀("예약 기간 아님")·폴백은 그대로.
- 셀 버튼 내용: `DEADLINE_PASSED` 셀은 `<span class="text-[9px] text-charcoal-3">마감</span>` 을 렌더(선택 ✓ 와 같은 자리). 빈 회색 칸(지난·창 밖)과 눈으로 구분되게 셀 자체에 표기한다. 범례는 추가하지 않는다(셀이 스스로 라벨을 가진다).
- `buildColumnPlan`: `if (!withinWindow) return HOURS.map(cellAt)` 조기 반환을 제거해 **데이터가 있는 날은 창 안팎과 무관하게 블록(BLOCKED·PENDING 병합)을 그린다**. 빈 칸의 게이팅(`cellStateOf` 의 `!withinWindow` → "예약 기간 아님", `isPast` → "지난")은 그대로라 선택 가능 범위는 변하지 않는다. 결과적으로 직전 월·당월 지난 날짜·창 이후 익월 날짜 모두 "누가 예약했는지" 가 보인다(§0-1 열람 원칙의 일관 적용. 익월 창 밖 날짜에도 블록이 보이는 것은 의도된 귀결이며 PR 본문에 명시).
- 헤더 날짜 버튼 `dayEnabled = daysByIso.has(iso) && (iso < todayIso || isWithinBookable(...))` — 지난 날짜는 열람용으로 선택 가능, 창 이후 미래 날짜는 기존대로 비활성.

### 3.5 `BookingCalendar.tsx`

- 셀 파생을 아래 표로 고정한다(`day = daysByIso.get(iso)`, `withinRange = isWithinBookable(iso, bookableFrom, bookableUntil)`). 기존 `isPastOrUnknown = day === undefined || dayStatus === 'PAST' || iso < todayIso` 는 `viewablePast` 와 `unknown` 으로 갈라진다.

  | 파생 | 식 |
  |---|---|
  | `unknown` | `day === undefined` |
  | `viewablePast` | `day !== undefined && iso < todayIso` |
  | `selectable` | `withinRange && !unknown && !viewablePast` (기존과 동일 집합) |
  | `outOfWindow` | `!withinRange && !unknown && !viewablePast` (창 이후 미래만. 지난 날짜를 창 밖으로 오분류하지 않는다) |
  | `disabled` | `unknown` |
  | `onClick` | `selectable → onSelectDate`, `viewablePast → onSelectDate`, `outOfWindow → onOutOfWindowSelect`, 그 외 없음 |
  | `aria-label` | `selectable → "N일 {레벨}, 남은 K칸"`, `viewablePast → "N일 지난 날짜"`, `outOfWindow → "N일 예약 기간 아님"`, 그 외 `"N일"` |
  | 혼잡도 게이지·라벨 | `selectable` 만 |

  - `viewablePast` 스타일: `cursor-pointer border border-line bg-paper opacity-60 hover:border-sage`(기존 disabled 과거 셀의 `opacity-40` 보다 한 단계 진하게 "열 수 있다" 를 암시). 날짜 숫자는 `text-charcoal-3`.
- 창 안 날짜·창 밖 미래 날짜 분기는 결과가 무변경이다.

### 3.6 `FacilityBookingPage.tsx`

- 파생 상수: `prevMonth = shiftYearMonth(currentMonth, -1)`, `nextMonth = shiftYearMonth(currentMonth, 1)`, `viewableMonths = [prevMonth, currentMonth, nextMonth]`, `viewFromIso = \`${prevMonth}-01\``.
- 딥링크 월 채택 가드: `viewableMonths.includes(deepLinkMonth)`.
- 인접월 병합: `adjacentMonthToFetch(selectedDate, yearMonth, viewableMonths)`.
- 월 이동: `goToMonth(target)`(기존 `changeMonth` 본문을 대상 월 인자로 일반화) + `changeMonth(delta) = goToMonth(shiftYearMonth(yearMonth, delta))`. 헤더 `canPrev = yearMonth !== prevMonth`, `canNext = yearMonth !== nextMonth`. 에러 박스의 "이번 달로 돌아가기" 는 `goToMonth(currentMonth)`(직전 월에서 `changeMonth(-1)` 을 부르면 두 달 전으로 가는 버그 방지).
- `selectedDateOutOfWindow` 조건을 **열람 범위 밖**으로 바꾼다: `selectedDate > bookableUntil || selectedDate < viewFromIso`. 직전 월 이후의 지난 날짜 선택은 정상 열람이라 정리·토스트 대상이 아니지만, 두 달 이상 전 딥링크(`?date=2026-05-10`, 현재 7월)는 월 가드가 그 월을 거부해 `yearMonth` 가 창 월로 남는데 `selectedDate` 만 살아 있으면 초기 뷰가 주간이라 빈 격자에 갇힌다(`secondMonth` 도 범위 밖이라 undefined, 패널 없음). 이 경우는 기존처럼 선택 정리·월간 복귀·토스트("현재 예약 가능한 기간이 아니에요 …")로 회복한다. 이름을 `selectedDateOutOfViewable` 로 바꾸고 주석 정정.
- 주 이동 클램프 하한 `bookableFrom` → `viewFromIso`, `canPrevWeek` 하한 `mondayOf(bookableFrom)` → `mondayOf(viewFromIso)`. 상한(`bookableUntil`)·`showWeekView` 기준일·`canNextWeek` 무변경.
- 직전 월 1일이 속한 주의 앞쪽 날짜(두 달 전)는 `viewableMonths` 밖이라 조회하지 않고 "데이터 없음" 셀로 남는다(기존 창 밖 인접월 처리와 동일).

### 3.7 CTA 문구 — `BookingPanel.tsx`·`MobileDaySheet.tsx`

- `hasApplicableSlot(day.slots)` 가 false 이고 `selection === null` 이면 CTA 라벨 `'신청 가능한 시간이 없어요'`(disabled 유지). 그 외 기존 `'시간을 선택해주세요'` / `'{범위} 예약 신청'`.

### 3.8 무변경 확인

- `BookingForm.tsx` 의 마감 힌트·`FACILITY_BOOKING_DEADLINE_PASSED` 처리·`BookingConfirmDialog` 무변경. `toggleSlotSelection`·`isSelectableSlot` 무변경. `MyBookingsChip`·홈 카드·운영진 목록 무변경.

## 4. API 계약 변경 요약

| 항목 | 변경 | 호환 |
|---|---|---|
| `SlotStatus` | `DEADLINE_PASSED` 추가 | 가산. 구 FE 는 `isSelectableSlot` fail-closed 로 비활성 처리. 단 구 `DaySlotList.slotStatusLabel` 은 미지 상태에 `'예약 가능'` 을 돌려주고 행 클래스는 undefined 라(`DaySlotList.tsx:23-27`), 스큐 창 동안 비활성 행에 오표기 라벨이 붙는다(신청은 불가) |
| `GET /facilities/{id}/availability?yearMonth=` | 직전 월 200(저장 스냅샷), 두 달 전 400 | 구 FE 는 직전 월을 요청하지 않음 |
| 슬롯 우선순위 | 점유가 PAST 를 이김 | 지난 시간대 점유 슬롯이 PAST → BLOCKED 로. `dayStatus`·`availableSlotCount`(지난 날짜 0) 불변 |
| `availableSlotCount` | 마감된 날의 PENDING_HOLD 미집계 | 마감된 날은 FULL 로 수렴 |
| 400 메시지 | 일반화 | 코드·상태 불변 |

## 5. 테스트 매트릭스 (필수 항목 ★)

### 백엔드
- `BookingDeadlinePolicyTest`: `isPassed` 경계 — D-1 11:59 false / 12:00:59 false / 12:01:00 true ★ / 당일 00:00:01 true / D-2 23:59:59 false. `validate` 기존 케이스 유지.
- `FacilitySlotAssemblerTest`(오늘 1/15 12:30 고정):
  - ★ 마감된 익일(1/16): 빈 칸 `DEADLINE_PASSED`, 크롤 실예약 칸 `BLOCKED(SCHOOL)`+단체명, APPROVED 칸 `BLOCKED(INTERNAL)`+동아리명, PENDING 칸 `PENDING_HOLD`, `availableSlotCount=0`, `dayStatus=FULL`.
  - ★ 경계: `NOW=12:00` 이면 1/16 빈 칸 `AVAILABLE`, `NOW=12:01` 이면 `DEADLINE_PASSED`.
  - ★ 지난 날짜(1/10): 점유 칸 `BLOCKED` 유지·빈 칸 `PAST`(`DEADLINE_PASSED` 아님)·`dayStatus=PAST`·`availableSlotCount=0`.
  - ★ 오늘(1/15): 지난 시간대 점유 칸 `BLOCKED`, 지난 빈 칸 `PAST`, 남은 빈 칸 `DEADLINE_PASSED`(당일 마감). 기존 `pastDatesAndSlots` 의 "12~13 AVAILABLE" 단언은 정책상 `DEADLINE_PASSED` 로 갱신.
  - 이틀 뒤(1/17) 빈 칸 `AVAILABLE`(회귀 가드).
- 신규 `GeneralFacilityAvailabilityServiceTest`(Mockito, `Clock.fixed` Asia/Seoul):
  - ★ KST 경계: `Instant` 2026-01-15T03:00:59Z(=KST 12:00:59) 에서 익일 빈 칸 `AVAILABLE`, 03:01:00Z(=KST 12:01:00) 에서 `DEADLINE_PASSED`.
  - 직전 월 요청: `ensureFresh` **미호출**(`verify(never())`), 스냅샷 SUCCESS 면 `stale=false`, 스냅샷 없음이면 `stale=true`, 응답 `days` 길이 = 직전 월 일수, 직전 월 크롤 실예약 행이 `BLOCKED(SCHOOL)` 로 보존 ★.
  - 두 달 전·두 달 뒤 → `MonthOutOfBookingRangeException`. 당월·익월은 `ensureFresh` 호출(기존 경로 회귀 가드).
- `FacilityAvailabilityAcceptanceTest`: `rejectsMonthOutOfBookingRange` 를 두 달 전·두 달 뒤로 갱신, 직전 월 200 + 저장 행 `BLOCKED(SCHOOL)` 보존 + `ensureFresh(직전 월)` 미호출 케이스 추가. **시각 의존 회귀 정리**: 확보 시간 케이스 2건(`:230`, `:289`)이 `crawlDate = LocalDate.now(clock).plusDays(1)` 의 빈/확보 슬롯에 `AVAILABLE` 을 단언하는데, 마감 정책상 KST 12:01 이후 실행하면 `DEADLINE_PASSED` 가 되어 실행 시각에 따라 깨진다. 두 케이스의 `crawlDate` 를 `plusDays(2)` 로 옮긴다(규칙: **AVAILABLE 을 단언하는 인수 테스트 날짜는 D+2 이상**). `:173` 의 `plusDays(1)` 은 BLOCKED 단언이라 그대로 둔다.
- 기존 `BookingApplicationPolicyTest`·`FacilityBookingServiceIntegrationTest` 의 마감 거부 케이스는 그대로 통과해야 한다(서버 우회 불가 ★).

### 프론트엔드
- `booking-calendar-lib.test.ts`: `isDayApplicationClosed`·`hasApplicableSlot`(마감 날·대기만 있는 마감 날·지난 날·정상 날), `adjacentMonthToFetch` 에 직전 월 허용 케이스.
- `booking-components.test.tsx`:
  - `DaySlotList`: `DEADLINE_PASSED` 행 "신청 마감"·disabled ★, 마감된 날의 `PENDING_HOLD` 행 "승인 대기" 유지·disabled, 안내 note 노출, 마감 아닌 날은 note 없음.
  - `WeekTimetable`: `DEADLINE_PASSED` 셀 aria "… 신청 마감"·"마감" 텍스트·disabled ★, 지난 날짜의 BLOCKED 가 블록으로 렌더 ★(단체명), 지난 날짜의 빈 셀 aria "… 지난"(창 밖이어도 "예약 기간 아님" 이 아님), 창 밖 익월 날짜 블록 렌더 + 빈 셀 "예약 기간 아님" 유지, 지난 날짜 헤더 버튼 enabled·창 이후 헤더 disabled. 기존 `:694` 케이스(20일 지난·25일 창 밖)는 순서 변경 후에도 그대로 통과해야 한다.
  - `BookingCalendar`: 데이터 있는 지난 셀 enabled·클릭 시 `onSelectDate`·레벨 라벨 없음·aria "N일 지난 날짜"; 데이터 없는 셀 disabled(기존 12일 케이스는 fixture 상 `day === undefined` 라 유지).
  - 패널·시트 CTA "신청 가능한 시간이 없어요".
- `facility-booking-page.test.tsx`(7/31 12:30 KST 고정, 창 8/1~8/15, 기본 월 8월):
  - 월 이동: 8월 → 7월 → 6월까지 "이전 달" 활성, 6월에서 비활성; 6월 → "다음 달" 로 7월; 8월에서 "다음 달" 비활성.
  - 지난 날짜(7월) 셀 클릭 → 주간 전환·토스트 없음·해당 날 BLOCKED 블록 표시(단체명)·빈 셀 aria "… 지난"·CTA "신청 가능한 시간이 없어요". fixture 의 지난 날짜에 BLOCKED+PAST 혼합 슬롯 추가.
  - 시나리오 14(`:851-871`, "지난달 딥링크는 창 월로 클램프·요청 없음")는 스펙과 정면 충돌하므로 둘로 교체한다: (a) 직전 월 딥링크 `?date=2026-06-15` → 정리되지 않고 주간으로 열리며 `2026-06` availability 를 요청한다, (b) 두 달 전 딥링크 `?date=2026-05-15` → 선택 정리·월간 복귀·토스트·`2026-05` 요청 없음(§3.6 열람 범위 밖 경로).
  - 6월에서 availability 500 → "이번 달로 돌아가기" 클릭 시 7월(현재 월)로 간다.
  - 기존 "창 첫날은 폼 대신 마감 안내" 케이스는 fixture 슬롯이 AVAILABLE 이라 그대로 폼 힌트 경로를 검증한다(이중 방어 회귀 가드 ★).
- 전체 스위트: `backend/ ./gradlew test`, `frontend/ pnpm -r typecheck && pnpm -r test`.

## 6. Out of Scope

- 관리자 크롤 현황 탭·관리자 큐의 월 범위(§0-1).
- 두 달 이상 과거 월 열람, 직전 월 온디맨드 재크롤, 스냅샷 보존 정책.
- 날짜 단위 `applicationClosed` 응답 필드(파생 §3.2 로 대체. 잔여 한계는 폼 힌트+서버가 방어).
- 주간 범례에 "마감" 항목 추가, `DayBookingOverview` 의 마감 표기(현황 카드는 예약 건만 다룬다).
- `MonthOutOfBookingRangeException` 클래스명 변경·관리자 탭 전용 예외 분리.
- `BookingForm` 마감 힌트 문구·서버 400 처리 변경.
- 운영진 예약 목록·홈 카드·크롤러·제출 도메인.

## 7. PR 분리·순서

- **PR-BE** `feat(backend): 시설 가용성 — 직전 월 스냅샷 열람 허용·신청 마감 슬롯 DEADLINE_PASSED 추가` (브랜치 `feat/facility-past-month-deadline-slot-be`, 이 스펙·플랜 문서 포함).
- **PR-FE** `feat(frontend): 시설 예약 캘린더 — 직전 월 기록 열람·신청 마감 슬롯 표시` (브랜치 `feat/facility-past-month-deadline-slot-fe`, develop 분기·독립).
- 둘 다 develop 으로, 머지는 사용자 지시 대기. prod 는 같은 릴리스로 함께 나가므로 스큐는 배포 시차(수 분)뿐이다. 스큐 창 동작: BE 만 반영되면 구 FE 는 DEADLINE_PASSED 행을 비활성 처리하되 라벨이 "예약 가능" 으로 오표기된다(§4). FE 만 반영되면 직전 월 이동이 400 에러 박스("이번 달로 돌아가기")로 회복되고 마감 표시는 아직 없다. 신청 우회는 어느 쪽도 없다. 스큐 안전성만 보면 FE 선반영이 낫고, 계약 선행 관례로는 BE 선반영이다 — 동시 릴리스라 어느 순서든 허용하며 PR 본문에 이 사실을 적는다.

## 8. 리스크·주의

- 지난 시간대 점유 슬롯이 PAST → BLOCKED 로 바뀌는 것은 응답 의미 변화다. 소비처는 `/facilities` 뿐이고(관리자 콘솔은 별도 API), `isSelectableSlot` 이 BLOCKED 를 거부하므로 신청 경로 영향은 없다.
- 직전 월 스냅샷이 아예 없는 배포 초기(예: 이달 도입)에는 `stale=true` 로 배너가 뜨고 슬롯은 내부 예약만 반영된 채 나머지가 PAST 다. 이는 "저장된 것을 그대로" 원칙의 귀결이며 오표기가 아니다.
- `availableSlotCount` 의 PENDING_HOLD 조건부 집계로 마감된 날 월간 셀이 "마감" 으로 수렴한다. 대기 신청 자체는 슬롯 상태로 보존된다.
