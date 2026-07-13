# 시설 대관 FE 1차(PR3: 예약 홈) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/facilities` 를 조회 전용 뷰어에서 **예약 홈**(시설 칩 → 월간 캘린더 → Day View 시트/패널 → 연속 슬롯 선택 → 신청 폼 → 성공 화면)으로 전면 교체하고, 기존 상세 라우트를 redirect 처리한다.

**Architecture:** 데이터는 `packages/types → packages/api(client) → packages/hooks(RQ)` 3층 관례 그대로. 페이지는 CSR(`'use client'`) 단일 페이지 + 쿼리 파라미터 딥링크(`?facilityId=&date=`), Day View 는 단일 제어 상태(page 소유)로 데스크탑 인라인 우측 패널과 모바일 Bottom Sheet 를 동시 구동(캘린더 페이지 하이브리드 전례). 순수 계산(월 그리드·연속 슬롯 선택·주간 파생)은 `_lib/bookingCalendar.ts` 로 격리해 단위 테스트한다.

**Tech Stack:** Next.js 15 App Router / React 19 / TanStack Query / ky(@duing/api) / vitest + msw / Tailwind(두잉 토큰)

**Spec:** [`2026-07-13-facility-booking-design.md`](../specs/2026-07-13-facility-booking-design.md) §3(가용성 모델)·§8(#1·#2·#14 API)·§9.1~9.5·9.8~9.10(UX 확정안)·§16 결정 13·14·18·20

## Global Constraints

- 브랜치 `feat/facility-booking-fe-home` — develop(#638 머지 이후)에서 분기. FE 규칙: `any`/`as` 금지(`unknown`+가드), 타입은 `type`(interface 금지), 서버 상태는 TanStack Query만, 컴포넌트/훅에서 ky·fetch 직접 호출 금지(@duing/api 경유), `'use client'` 최소화, `useEffect` 데이터 패칭 금지.
- 사용자 확정 결정(§16): **단일 페이지+쿼리 파라미터**(결정 14 — `/facilities/[id]` 는 redirect), **Preset 칩+자유 입력 하이브리드**(결정 18 — 서버엔 최종 텍스트만), **INTERNAL 차단 슬롯 동아리명 비노출 → "예약됨" 문구**(결정 20), SCHOOL 차단은 단체명 표시, PENDING_HOLD="승인 대기중"(신청 가능).
- 슬롯 선택: 첫 탭=단일 선택, 둘째 탭=사이가 전부 선택 가능하면 범위 확장, 아니면 재시작, 동일 단일 슬롯 재탭=해제. 선택 가능 상태 = AVAILABLE·PENDING_HOLD.
- 월 이동은 당월⇄익월 2개월만(bookable 범위와 일치). 과거 월 열람 없음(결정 17).
- 디자인: 두잉 토큰만(slate/stone·bg-black/* 금지), 버튼 `.btn .btn-primary`, 시트 스크림 `bg-ink/35`, Bottom Sheet 는 `components/ui/sheet.tsx` 재사용. **`.duing` 이 bg-cream 을 칠하므로 포털(Sheet) 내부 래퍼는 `duing bg-transparent`**(고정 오버레이 크림 띠 함정). `motion-safe:`/`motion-reduce:` 병행.
- 시간·날짜 계산은 기존 `_lib/facilityTimeline.ts` 의 KST 유틸(`seoulDateIso`·`shiftYearMonth`·`yearMonthLabel` 등) 재사용 — `new Date('yyyy-MM-dd')` 파싱 금지(UTC 함정), 수동 파싱.
- 테스트: 페이지는 **msw + 실제 createApiClient + ApiClientProvider/QueryClientProvider(retry:false)** 패턴(TanStack Query 내부 mock 금지). msw 응답은 반드시 `ApiResponse` 봉투(`{ ok, data, message }`). 라우터는 `vi.mock('next/navigation')`. 로그인 상태는 `useAuthStore.setState(...)`.
- **로컬 production build 는 `NEXT_PUBLIC_API_BASE_URL=https://api.ci.invalid/api/v1 pnpm build`** — #634 fail-fast 가 .env.local 의 http URL 을 거부한다(CI 는 이미 env 주입됨).
- 명령은 `frontend/` 에서(pnpm). `| tail` 로 exit code 가리지 말 것. 커밋 한국어 Conventional Commits(`feat(frontend): ...`), Co-Authored-By/🤖 금지, push·PR 금지(컨트롤러 몫).
- jsdom 이 못 잡는 것(시트 포인터·캘린더 터치·포털 스타일)은 Task 7 실브라우저 QA 항목으로 넘긴다.

---

## File Structure

```
frontend/packages/types/src/facility.ts                 (Task 1 수정 — 예약 타입 추가)
frontend/packages/api/src/client.ts                     (Task 1 수정 — availability/presets/create)
frontend/packages/api/src/generated/schema.d.ts         (Task 1 재생성 — gen:api)
frontend/packages/hooks/src/facilities.ts               (Task 1 수정 — 쿼리·뮤테이션 훅)
frontend/packages/hooks/src/facilityQueryKeys.ts        (Task 1 수정)
frontend/packages/hooks/src/index.ts                    (Task 1 수정 — re-export)

frontend/apps/web/app/facilities/
├── _lib/bookingCalendar.ts                             (Task 2 신규 — 순수 계산)
├── _components/booking/
│   ├── FacilityChips.tsx                               (Task 3 신규)
│   ├── BookingCalendar.tsx                             (Task 3 신규)
│   ├── DaySlotList.tsx                                 (Task 3 신규)
│   ├── WeekTimetable.tsx                               (Task 3 신규)
│   ├── BookingForm.tsx                                 (Task 4 신규)
│   ├── BookingSuccess.tsx                              (Task 4 신규)
│   ├── BookingPanel.tsx                                (Task 4 신규 — 제어 컴포넌트)
│   └── BookingHomeSkeleton.tsx                         (Task 5 신규)
├── _pages/FacilityBookingPage.tsx                      (Task 5 신규 — 조립)
├── _pages/FacilityExplorePage.tsx                      (Task 5 삭제)
├── _components/FacilityTimeline.tsx                    (Task 5 삭제 — 구 상세 전용)
├── _components/FacilityUsageGuide.tsx                  (Task 5 수정 — 이메일 신청 문구 제거)
├── page.tsx                                            (Task 5 수정 — 새 페이지 + 스켈레톤 fallback)
└── [facilityId]/page.tsx                               (Task 5 수정 — redirect), loading.tsx 삭제

frontend/apps/web/test/facilities/
├── booking-calendar-lib.test.ts                        (Task 2)
├── booking-components.test.tsx                         (Task 3·4)
├── facility-booking-page.test.tsx                      (Task 6 신규 — msw 통합)
├── facility-detail-page.test.tsx                       (Task 5 삭제)
├── facility-timeline.test.tsx / facility-timeline-lib… (Task 5 — 구 상세 전용분 삭제·lib 테스트는 유지)
└── facility-usage-guide.test.tsx                       (Task 5 수정)
```

---

### Task 1: 타입·API 클라이언트·훅 + OpenAPI 재생성

**Files:**
- Modify: `frontend/packages/types/src/facility.ts`, `frontend/packages/api/src/client.ts`, `frontend/packages/hooks/src/facilities.ts`, `frontend/packages/hooks/src/facilityQueryKeys.ts`, `frontend/packages/hooks/src/index.ts`
- Regenerate: `frontend/packages/api/src/generated/schema.d.ts`

**Interfaces:**
- Produces: `FacilityAvailabilityResponse`/`BookingDayAvailability`/`BookingAvailabilitySlot`/`PurposePreset`/`CreateFacilityBookingPayload`/`CreateFacilityBookingResult` 타입, `client.facilities.availability/purposePresets`, `client.facilityBookings.create`, `useFacilityAvailabilityQuery`/`usePurposePresetsQuery`/`useCreateFacilityBookingMutation`

- [ ] **Step 1: 타입 추가** — `packages/types/src/facility.ts` 하단에 추가(§8 #1·#14 계약 1:1, 서버가 null 필드를 생략(NON_NULL)하므로 optional):

```ts
// ── 시설 대관 신청(P1) — 백엔드 설계 §8 계약과 1:1 ───────────────────────

export type BookingSlotStatus = 'AVAILABLE' | 'PENDING_HOLD' | 'BLOCKED' | 'PAST';
export type BookingSlotBlockSource = 'SCHOOL' | 'INTERNAL';
export type BookingDayStatus = 'AVAILABLE' | 'FULL' | 'PAST';

export type BookingAvailabilitySlot = {
  start: string; // HH:mm
  end: string; // HH:mm
  status: BookingSlotStatus;
  blockedBy?: BookingSlotBlockSource; // BLOCKED 일 때만 존재
  // SCHOOL 차단의 단체명(공개 데이터). INTERNAL·PENDING_HOLD 는 비노출 정책이라 생략된다(§16 결정 20).
  organization?: string;
};

export type BookingOperatingNote = {
  organization: string;
  start: string; // HH:mm
  end: string; // HH:mm
};

export type BookingDayAvailability = {
  date: string; // yyyy-MM-dd
  dayStatus: BookingDayStatus;
  availableSlotCount: number;
  operatingNotes: BookingOperatingNote[];
  slots: BookingAvailabilitySlot[]; // 항상 13칸(09~22시)
};

export type FacilityAvailabilityResponse = {
  facilityId: number;
  yearMonth: string; // yyyy-MM
  lastUpdatedAt?: string | null; // 서버가 NON_NULL 직렬화 — 콜드 월은 필드 자체가 생략됨
  stale: boolean;
  bookableFrom: string; // yyyy-MM-dd (오늘)
  bookableUntil: string; // yyyy-MM-dd (익월 말일)
  days: BookingDayAvailability[];
};

export type PurposePreset = {
  id: number;
  label: string;
};

export type CreateFacilityBookingPayload = {
  facilityId: number;
  date: string; // yyyy-MM-dd
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  purpose: string;
  attendeeCount?: number;
};

export type CreateFacilityBookingResult = {
  bookingId: number;
  status: 'PENDING';
  overlappingPendingCount: number;
};
```

- [ ] **Step 2: 클라이언트 메서드 추가** — `packages/api/src/client.ts`

`DuingApiClient` 의 `facilities` 블록에 추가 + `facilityBookings` 신설(선언부):

```ts
facilities: {
  // ...기존 list/usage/get 유지...
  // GET /api/v1/facilities/{facilityId}/availability?yearMonth= — 공개. 당월·익월만 허용(400).
  availability(facilityId: number, yearMonth?: string): Promise<FacilityAvailabilityResponse>;
  // GET /api/v1/facilities/booking-purpose-presets — 공개. 사용 목적 Preset(시드).
  purposePresets(): Promise<PurposePreset[]>;
};
facilityBookings: {
  // POST /api/v1/clubs/{clubId}/facility-bookings — 운영진 전용(쿠키 세션). 409=슬롯 불가/중복/상한.
  create(clubId: number, payload: CreateFacilityBookingPayload): Promise<CreateFacilityBookingResult>;
};
```

구현부(`createApiClient` 반환 객체 — 기존 facilities 구현 뒤에):

```ts
facilities: {
  // ...기존 구현 유지...
  availability: (facilityId, yearMonth) =>
    jsonOk<FacilityAvailabilityResponse>(
      http.get(`facilities/${facilityId}/availability`, {
        searchParams: yearMonth ? { yearMonth } : undefined,
      }),
    ),
  purposePresets: () => jsonOk<PurposePreset[]>(http.get('facilities/booking-purpose-presets')),
},
facilityBookings: {
  create: (clubId, payload) =>
    jsonOk<CreateFacilityBookingResult>(
      http.post(`clubs/${clubId}/facility-bookings`, { json: payload }),
    ),
},
```

(cookie transport 라 인증 헤더 작업 불필요 — `credentials: 'include'` 가 자동 처리. import 에 신규 타입 추가.)

- [ ] **Step 3: 쿼리 키·훅 추가**

`facilityQueryKeys.ts`:

```ts
export const facilityQueryKeys = {
  all: ['facilities'] as const,
  usage: (yearMonth?: string) =>
    [...facilityQueryKeys.all, 'usage', yearMonth ?? 'current'] as const,
  detail: (facilityId: number, yearMonth?: string) =>
    [...facilityQueryKeys.all, facilityId, yearMonth ?? 'current'] as const,
  availabilityAll: () => [...facilityQueryKeys.all, 'availability'] as const,
  availability: (facilityId: number, yearMonth?: string) =>
    [...facilityQueryKeys.availabilityAll(), facilityId, yearMonth ?? 'current'] as const,
  purposePresets: () => [...facilityQueryKeys.all, 'purpose-presets'] as const,
};
```

`facilities.ts` 에 추가(import 에 `useMutation, useQueryClient` 와 신규 타입 보충):

```ts
export function useFacilityAvailabilityQuery(facilityId: number | undefined, yearMonth?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      facilityId !== undefined
        ? facilityQueryKeys.availability(facilityId, yearMonth)
        : ([...facilityQueryKeys.availabilityAll(), 'none'] as const),
    queryFn: () => {
      if (facilityId === undefined) throw new Error('facilityId is required');
      return client.facilities.availability(facilityId, yearMonth);
    },
    enabled: facilityId !== undefined,
  });
}

export function usePurposePresetsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: facilityQueryKeys.purposePresets(),
    queryFn: () => client.facilities.purposePresets(),
    // 시드 데이터(P2 전까지 사실상 불변) — 세션 내 재요청 억제
    staleTime: 60 * 60 * 1000,
  });
}

export function useCreateFacilityBookingMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { clubId: number; payload: CreateFacilityBookingPayload }) =>
      client.facilityBookings.create(input.clubId, input.payload),
    onSuccess: () => {
      // 신청 직후 해당 슬롯이 "승인 대기중" 으로 즉시 보이도록 가용성 캐시 전체 무효화(no-store 계약과 합)
      queryClient.invalidateQueries({ queryKey: facilityQueryKeys.availabilityAll() });
    },
  });
}
```

`hooks/src/index.ts` 에 신규 훅 3종 re-export 추가(기존 facilities export 줄 옆).

- [ ] **Step 4: OpenAPI 타입 재생성** — 백엔드 기동 필요:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && (./gradlew bootRun &> /tmp/gen-api-boot.log &) && sleep 40
curl -sf http://localhost:8080/actuator/health   # {"status":"UP"} 확인(안 되면 로그 확인 후 재시도)
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm gen:api
# 종료: bootRun 프로세스 kill (lsof -ti :8080 | xargs kill)
```

`git diff --stat packages/api/src/generated/schema.d.ts` 로 facility-booking 경로들이 추가됐는지 확인.

- [ ] **Step 5: 패키지 검증 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm typecheck && pnpm lint`
Expected: 통과(신규 타입·훅 컴파일 확인)

```bash
git add frontend/packages docs 2>/dev/null; git add frontend/packages
git commit -m "feat(frontend): 시설 대관 타입·API 클라이언트·훅 추가 + OpenAPI 타입 재생성"
```

---

### Task 2: 예약 캘린더 순수 계산 lib (TDD)

**Files:**
- Create: `frontend/apps/web/app/facilities/_lib/bookingCalendar.ts`
- Test: `frontend/apps/web/test/facilities/booking-calendar-lib.test.ts`

**Interfaces:**
- Produces: `buildMonthCells(yearMonth) → CalendarCell[]`(6×7 일요일 시작), `isSelectableSlot(slot)`, `toggleSlotSelection(current, tapped, slots) → SlotRange|null`, `rangeContainsPendingHold(slots, range)`, `rangeLabel(range)`, `slotInRange(slot, range)`, `weekDatesOf(iso) → string[7]`, `isWithinBookable(iso, from, until)`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, expect, it } from 'vitest';
import type { BookingAvailabilitySlot } from '@duing/types';
import {
  buildMonthCells,
  isWithinBookable,
  rangeContainsPendingHold,
  rangeLabel,
  slotInRange,
  toggleSlotSelection,
  weekDatesOf,
} from '@/app/facilities/_lib/bookingCalendar';

function slot(startHour: number, status: BookingAvailabilitySlot['status']): BookingAvailabilitySlot {
  const pad = (n: number) => String(n).padStart(2, '0');
  return { start: `${pad(startHour)}:00`, end: `${pad(startHour + 1)}:00`, status };
}

const daySlots: BookingAvailabilitySlot[] = [
  slot(9, 'AVAILABLE'),
  slot(10, 'AVAILABLE'),
  slot(11, 'BLOCKED'),
  slot(12, 'PENDING_HOLD'),
  slot(13, 'AVAILABLE'),
];

describe('buildMonthCells', () => {
  it('6×7 그리드를 일요일 시작으로 만들고 해당 월 날짜 수만 inMonth 다', () => {
    const cells = buildMonthCells('2026-07'); // 2026-07-01 은 수요일(dow=3)
    expect(cells).toHaveLength(42);
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(31);
    expect(cells[3]).toMatchObject({ iso: '2026-07-01', day: 1, inMonth: true });
    expect(cells[0].inMonth).toBe(false);
  });
});

describe('toggleSlotSelection', () => {
  it('첫 탭은 단일 선택, 같은 단일 슬롯 재탭은 해제다', () => {
    const first = toggleSlotSelection(null, daySlots[0], daySlots);
    expect(first).toEqual({ start: '09:00', end: '10:00' });
    expect(toggleSlotSelection(first, daySlots[0], daySlots)).toBeNull();
  });

  it('사이가 전부 선택 가능하면 범위로 확장한다 (PENDING_HOLD 포함 가능)', () => {
    const first = toggleSlotSelection(null, daySlots[3], daySlots); // 12~13 HOLD
    const expanded = toggleSlotSelection(first, daySlots[4], daySlots); // 13~14
    expect(expanded).toEqual({ start: '12:00', end: '14:00' });
  });

  it('사이에 차단 슬롯이 있으면 탭한 슬롯으로 재시작한다', () => {
    const first = toggleSlotSelection(null, daySlots[0], daySlots); // 09~10
    const restarted = toggleSlotSelection(first, daySlots[3], daySlots); // 11시가 BLOCKED
    expect(restarted).toEqual({ start: '12:00', end: '13:00' });
  });

  it('차단·과거 슬롯 탭은 무시된다', () => {
    const current = { start: '09:00', end: '10:00' };
    expect(toggleSlotSelection(current, daySlots[2], daySlots)).toEqual(current);
  });
});

describe('range 유틸', () => {
  it('rangeContainsPendingHold 는 범위 내 승인 대기 슬롯을 감지한다', () => {
    expect(rangeContainsPendingHold(daySlots, { start: '12:00', end: '14:00' })).toBe(true);
    expect(rangeContainsPendingHold(daySlots, { start: '09:00', end: '11:00' })).toBe(false);
  });

  it('rangeLabel 과 slotInRange', () => {
    expect(rangeLabel({ start: '18:00', end: '20:00' })).toBe('18:00~20:00');
    expect(slotInRange(daySlots[0], { start: '09:00', end: '11:00' })).toBe(true);
    expect(slotInRange(daySlots[4], { start: '09:00', end: '11:00' })).toBe(false);
  });
});

describe('weekDatesOf / isWithinBookable', () => {
  it('선택일이 속한 주(일~토)를 로컬 파싱으로 만든다 — 월 경계 포함', () => {
    expect(weekDatesOf('2026-07-01')).toEqual([
      '2026-06-28', '2026-06-29', '2026-06-30', '2026-07-01',
      '2026-07-02', '2026-07-03', '2026-07-04',
    ]);
  });

  it('isWithinBookable 은 경계 포함이다', () => {
    expect(isWithinBookable('2026-07-13', '2026-07-13', '2026-08-31')).toBe(true);
    expect(isWithinBookable('2026-08-31', '2026-07-13', '2026-08-31')).toBe(true);
    expect(isWithinBookable('2026-07-12', '2026-07-13', '2026-08-31')).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- --run test/facilities/booking-calendar-lib.test.ts`
Expected: 실패(모듈 없음)

- [ ] **Step 3: 구현**

```ts
// 예약 홈의 순수 계산 — 시각/날짜 문자열('HH:mm'·'yyyy-MM-dd')은 사전순 비교가 시간순과 일치한다.
// Date 파싱은 로컬 필드 생성만 사용한다(new Date('yyyy-MM-dd') 는 UTC 자정 함정).
import type { BookingAvailabilitySlot } from '@duing/types';

export type CalendarCell = { iso: string; day: number; inMonth: boolean };
export type SlotRange = { start: string; end: string };

const pad2 = (value: number) => String(value).padStart(2, '0');

const toIso = (year: number, monthIndex: number, day: number) =>
  `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** 6×7(일요일 시작) 월 그리드 — calendar 페이지 buildMonth 전례 이식. */
export function buildMonthCells(yearMonth: string): CalendarCell[] {
  const [year, month] = yearMonth.split('-').map(Number);
  const monthIndex = (month ?? 1) - 1;
  const startCol = new Date(year ?? 1970, monthIndex, 1).getDay();
  const daysInMonth = new Date(year ?? 1970, monthIndex + 1, 0).getDate();
  const prevDays = new Date(year ?? 1970, monthIndex, 0).getDate();
  const cells: CalendarCell[] = [];
  for (let index = 0; index < 42; index += 1) {
    const offset = index - startCol;
    let day: number;
    let cellMonth = monthIndex;
    let cellYear = year ?? 1970;
    let inMonth = true;
    if (offset < 0) {
      day = prevDays + offset + 1;
      cellMonth = monthIndex - 1;
      inMonth = false;
    } else if (offset >= daysInMonth) {
      day = offset - daysInMonth + 1;
      cellMonth = monthIndex + 1;
      inMonth = false;
    } else {
      day = offset + 1;
    }
    if (cellMonth < 0) {
      cellMonth = 11;
      cellYear -= 1;
    }
    if (cellMonth > 11) {
      cellMonth = 0;
      cellYear += 1;
    }
    cells.push({ iso: toIso(cellYear, cellMonth, day), day, inMonth });
  }
  return cells;
}

export function isWithinBookable(iso: string, bookableFrom: string, bookableUntil: string): boolean {
  return iso >= bookableFrom && iso <= bookableUntil;
}

export function isSelectableSlot(slot: BookingAvailabilitySlot): boolean {
  return slot.status === 'AVAILABLE' || slot.status === 'PENDING_HOLD';
}

export function slotInRange(slot: BookingAvailabilitySlot, range: SlotRange): boolean {
  return slot.start >= range.start && slot.end <= range.end;
}

/**
 * 연속 슬롯 선택(§9.4): 첫 탭=단일, 둘째 탭=사이 전부 선택 가능이면 범위 확장, 아니면 재시작,
 * 동일 단일 슬롯 재탭=해제. 선택 불가 슬롯 탭은 무시.
 */
export function toggleSlotSelection(
  current: SlotRange | null,
  tapped: BookingAvailabilitySlot,
  slots: BookingAvailabilitySlot[],
): SlotRange | null {
  if (!isSelectableSlot(tapped)) {
    return current;
  }
  const single: SlotRange = { start: tapped.start, end: tapped.end };
  if (!current) {
    return single;
  }
  if (current.start === single.start && current.end === single.end) {
    return null;
  }
  const start = current.start < single.start ? current.start : single.start;
  const end = current.end > single.end ? current.end : single.end;
  const span = slots.filter((candidate) => slotInRange(candidate, { start, end }));
  const hourCount = Number(end.slice(0, 2)) - Number(start.slice(0, 2));
  if (span.length === hourCount && span.every(isSelectableSlot)) {
    return { start, end };
  }
  return single;
}

export function rangeContainsPendingHold(
  slots: BookingAvailabilitySlot[],
  range: SlotRange,
): boolean {
  return slots.some((slot) => slotInRange(slot, range) && slot.status === 'PENDING_HOLD');
}

export function rangeLabel(range: SlotRange): string {
  return `${range.start}~${range.end}`;
}

/** 선택일이 속한 주(일~토) 7일 — 월 경계를 넘을 수 있다(범위 밖 날짜는 호출부가 데이터 없음 처리). */
export function weekDatesOf(iso: string): string[] {
  const base = parseIsoDate(iso);
  const sunday = new Date(base);
  sunday.setDate(base.getDate() - base.getDay());
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + offset);
    return toIso(date.getFullYear(), date.getMonth(), date.getDate());
  });
}
```

- [ ] **Step 4: 통과 확인 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- --run test/facilities/booking-calendar-lib.test.ts`
Expected: 전건 PASS

```bash
git add frontend/apps/web
git commit -m "feat(frontend): 예약 캘린더 순수 계산 lib — 월 그리드·연속 슬롯 선택·주간 파생"
```

---

### Task 3: 조회 컴포넌트 — 칩·월간 캘린더·일간 슬롯·주간 타임테이블

**Files:**
- Create: `frontend/apps/web/app/facilities/_components/booking/FacilityChips.tsx`, `BookingCalendar.tsx`, `DaySlotList.tsx`, `WeekTimetable.tsx`
- Test: `frontend/apps/web/test/facilities/booking-components.test.tsx`

**Interfaces:**
- Consumes: Task 1 타입, Task 2 lib, `facilityTimeline.ts` 의 `yearMonthLabel`
- Produces(전부 presentational — 상태는 페이지가 소유):
  - `FacilityChips({ facilities: { id, roomName, isUsingNow }[], selectedId, onSelect })`
  - `BookingCalendar({ yearMonth, daysByIso: Map<string, BookingDayAvailability>, bookableFrom, bookableUntil, todayIso, selectedDate, onSelectDate, onPrevMonth, onNextMonth, canPrev, canNext })`
  - `DaySlotList({ day, selection, onToggleSlot })`
  - `WeekTimetable({ selectedDate, daysByIso, selection, onSelectDate })`

- [ ] **Step 1: 구현**

`FacilityChips.tsx`:

```tsx
'use client';

type ChipFacility = { id: number; roomName: string; isUsingNow: boolean };

type Props = {
  facilities: ChipFacility[];
  selectedId: number | null;
  onSelect: (facilityId: number) => void;
};

/** 시설 선택 가로 칩(§9.2) — 상태 도트로 "지금 사용중" 을 칩 레벨에 흡수한다. */
export function FacilityChips({ facilities, selectedId, onSelect }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="시설 선택">
      {facilities.map((facility) => {
        const selected = facility.id === selectedId;
        return (
          <button
            key={facility.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(facility.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-[13.5px] motion-safe:transition-colors ${
              selected
                ? 'border-ink bg-ink text-cream'
                : 'border-line bg-paper text-charcoal-2 hover:border-sage'
            }`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${facility.isUsingNow ? 'bg-coral' : 'bg-sage'}`}
            />
            {facility.roomName}
          </button>
        );
      })}
    </div>
  );
}
```

`BookingCalendar.tsx`:

```tsx
'use client';

import type { BookingDayAvailability } from '@duing/types';
import { yearMonthLabel } from '../../_lib/facilityTimeline';
import { buildMonthCells, isWithinBookable } from '../../_lib/bookingCalendar';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

type Props = {
  yearMonth: string;
  daysByIso: Map<string, BookingDayAvailability>;
  bookableFrom: string;
  bookableUntil: string;
  todayIso: string;
  selectedDate: string | null;
  onSelectDate: (iso: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  canPrev: boolean;
  canNext: boolean;
};

export function BookingCalendar({
  yearMonth, daysByIso, bookableFrom, bookableUntil, todayIso,
  selectedDate, onSelectDate, onPrevMonth, onNextMonth, canPrev, canNext,
}: Props) {
  const cells = buildMonthCells(yearMonth);
  return (
    <section className="rounded-lg border border-line bg-paper p-4 sm:p-5" aria-label="예약 캘린더">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className="btn btn-ghost" onClick={onPrevMonth} disabled={!canPrev}>
          ← 이전 달
        </button>
        <h2 className="font-display text-lg text-ink-deep">{yearMonthLabel(yearMonth)}</h2>
        <button type="button" className="btn btn-ghost" onClick={onNextMonth} disabled={!canNext}>
          다음 달 →
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-charcoal-3">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1">{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          if (!cell.inMonth) {
            return <div key={cell.iso} aria-hidden className="h-14 rounded-md" />;
          }
          const day = daysByIso.get(cell.iso);
          const withinRange = isWithinBookable(cell.iso, bookableFrom, bookableUntil);
          const isPast = day?.dayStatus === 'PAST' || cell.iso < todayIso;
          const isFull = day?.dayStatus === 'FULL';
          const selectable = withinRange && !isPast && day !== undefined;
          const selected = cell.iso === selectedDate;
          const isToday = cell.iso === todayIso;
          return (
            <button
              key={cell.iso}
              type="button"
              disabled={!selectable}
              onClick={() => onSelectDate(cell.iso)}
              aria-pressed={selected}
              aria-label={`${cell.day}일${isFull ? ' 마감' : ''}`}
              className={`flex h-14 flex-col items-center justify-center rounded-md border text-sm motion-safe:transition-colors ${
                selected
                  ? 'border-ink bg-ink text-cream'
                  : selectable
                    ? 'border-line bg-paper text-charcoal hover:border-sage'
                    : 'border-transparent bg-transparent text-charcoal-3 opacity-45'
              } ${isToday && !selected ? 'ring-1 ring-coral' : ''}`}
            >
              <span className="font-medium">{cell.day}</span>
              {selectable && (
                <span className={`text-[10px] ${selected ? 'text-cream/85' : isFull ? 'text-coral' : 'text-charcoal-3'}`}>
                  {isFull ? '마감' : `${day.availableSlotCount}칸`}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
```

`DaySlotList.tsx`:

```tsx
'use client';

import type { BookingDayAvailability } from '@duing/types';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { isSelectableSlot, slotInRange } from '../../_lib/bookingCalendar';

type Props = {
  day: BookingDayAvailability;
  selection: SlotRange | null;
  onToggleSlot: (slotStart: string) => void;
};

function slotStatusLabel(day: BookingDayAvailability, index: number): string {
  const slot = day.slots[index];
  if (!slot) return '';
  if (slot.status === 'BLOCKED') {
    // SCHOOL 은 공개 단체명, INTERNAL 은 비노출 정책 → "예약됨" 일반 문구(§16 결정 20)
    return slot.blockedBy === 'SCHOOL' && slot.organization ? slot.organization : '예약됨';
  }
  if (slot.status === 'PENDING_HOLD') return '승인 대기중';
  if (slot.status === 'PAST') return '지난 시간';
  return '신청 가능';
}

export function DaySlotList({ day, selection, onToggleSlot }: Props) {
  return (
    <div>
      {day.operatingNotes.length > 0 && (
        <p className="mb-2 text-xs text-charcoal-3">
          {day.operatingNotes
            .map((note) => `운영: ${note.organization} ${note.start}~${note.end}`)
            .join(' · ')}
        </p>
      )}
      <ul className="flex flex-col gap-1" aria-label="시간대 선택">
        {day.slots.map((slot, index) => {
          const selectable = isSelectableSlot(slot);
          const selected = selection !== null && slotInRange(slot, selection);
          return (
            <li key={slot.start}>
              <button
                type="button"
                disabled={!selectable}
                aria-pressed={selected}
                onClick={() => onToggleSlot(slot.start)}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm motion-safe:transition-colors ${
                  selected
                    ? 'border-ink bg-ink text-cream'
                    : selectable
                      ? 'border-line bg-paper hover:border-sage'
                      : 'border-transparent bg-graysoft/60 text-charcoal-3'
                }`}
              >
                <span className="font-mono text-[13px]">{slot.start}~{slot.end}</span>
                <span className={`text-xs ${selected ? 'text-cream/85' : slot.status === 'PENDING_HOLD' ? 'text-coral' : 'text-charcoal-3'}`}>
                  {slotStatusLabel(day, index)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

`WeekTimetable.tsx`:

```tsx
'use client';

import type { BookingDayAvailability } from '@duing/types';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { slotInRange, weekDatesOf } from '../../_lib/bookingCalendar';

const HOURS = Array.from({ length: 13 }, (_, index) => 9 + index);
const pad2 = (value: number) => String(value).padStart(2, '0');

type Props = {
  selectedDate: string;
  daysByIso: Map<string, BookingDayAvailability>;
  selection: SlotRange | null;
  onSelectDate: (iso: string) => void;
};

/** 주간 타임테이블(§9.5) — 선택일 컬럼 강조, 월 데이터 범위 밖 요일은 빈 컬럼. */
export function WeekTimetable({ selectedDate, daysByIso, selection, onSelectDate }: Props) {
  const weekDates = weekDatesOf(selectedDate);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[430px] border-separate border-spacing-0 text-center text-[11px]">
        <thead>
          <tr>
            <th className="w-11" aria-hidden />
            {weekDates.map((iso) => (
              <th
                key={iso}
                className={`cursor-pointer rounded-t-md px-1 py-1.5 font-medium ${
                  iso === selectedDate ? 'bg-ink text-cream' : 'text-charcoal-2'
                }`}
                onClick={() => daysByIso.has(iso) && onSelectDate(iso)}
              >
                {Number(iso.slice(8, 10))}일
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((hour) => (
            <tr key={hour}>
              <td className="pr-1 text-right font-mono text-charcoal-3">{pad2(hour)}</td>
              {weekDates.map((iso) => {
                const slot = daysByIso.get(iso)?.slots[hour - 9];
                const isSelectedColumn = iso === selectedDate;
                const selected =
                  isSelectedColumn && selection !== null && slot !== undefined && slotInRange(slot, selection);
                const tone =
                  slot === undefined
                    ? 'bg-transparent'
                    : slot.status === 'BLOCKED'
                      ? 'bg-graysoft'
                      : slot.status === 'PENDING_HOLD'
                        ? 'border border-dashed border-coral/60 bg-paper'
                        : slot.status === 'PAST'
                          ? 'bg-graysoft/40'
                          : 'bg-paper';
                return (
                  <td key={iso} className="p-[1.5px]">
                    <div
                      className={`h-5 rounded-[4px] border border-line/60 ${tone} ${
                        selected ? 'border-ink bg-ink' : ''
                      } ${isSelectedColumn && !selected ? 'ring-1 ring-ink/20' : ''}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: 컴포넌트 테스트 작성 → 통과**

`booking-components.test.tsx` — 렌더 단언 4건(라이트, 페이지 통합은 Task 6):

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BookingDayAvailability } from '@duing/types';
import { FacilityChips } from '@/app/facilities/_components/booking/FacilityChips';
import { BookingCalendar } from '@/app/facilities/_components/booking/BookingCalendar';
import { DaySlotList } from '@/app/facilities/_components/booking/DaySlotList';

function makeDay(overrides?: Partial<BookingDayAvailability>): BookingDayAvailability {
  return {
    date: '2026-07-20',
    dayStatus: 'AVAILABLE',
    availableSlotCount: 11,
    operatingNotes: [{ organization: '고정관념', start: '09:00', end: '20:00' }],
    slots: Array.from({ length: 13 }, (_, index) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const start = `${pad(9 + index)}:00`;
      const end = `${pad(10 + index)}:00`;
      if (index === 8) return { start, end, status: 'BLOCKED' as const, blockedBy: 'SCHOOL' as const, organization: '비호응원단' };
      if (index === 9) return { start, end, status: 'BLOCKED' as const, blockedBy: 'INTERNAL' as const };
      if (index === 11) return { start, end, status: 'PENDING_HOLD' as const };
      return { start, end, status: 'AVAILABLE' as const };
    }),
    ...overrides,
  };
}

it('칩은 선택 상태와 사용중 도트를 표시하고 탭 시 onSelect 를 부른다', () => {
  const onSelect = vi.fn();
  render(
    <FacilityChips
      facilities={[
        { id: 1, roomName: '커뮤니티룸(1)', isUsingNow: true },
        { id: 2, roomName: '공동연습실(1)', isUsingNow: false },
      ]}
      selectedId={1}
      onSelect={onSelect}
    />,
  );
  fireEvent.click(screen.getByRole('tab', { name: '공동연습실(1)' }));
  expect(onSelect).toHaveBeenCalledWith(2);
});

it('캘린더 셀은 가능 칸 수와 마감을 표시하고 범위 밖은 비활성이다', () => {
  const day = makeDay();
  const fullDay = makeDay({ date: '2026-07-21', dayStatus: 'FULL', availableSlotCount: 0 });
  render(
    <BookingCalendar
      yearMonth="2026-07"
      daysByIso={new Map([[day.date, day], [fullDay.date, fullDay]])}
      bookableFrom="2026-07-13"
      bookableUntil="2026-08-31"
      todayIso="2026-07-13"
      selectedDate={null}
      onSelectDate={vi.fn()}
      onPrevMonth={vi.fn()}
      onNextMonth={vi.fn()}
      canPrev={false}
      canNext
    />,
  );
  expect(screen.getByRole('button', { name: '20일' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '21일 마감' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '12일' })).toBeDisabled(); // bookableFrom 이전
});

it('슬롯 리스트는 SCHOOL 단체명·INTERNAL "예약됨"·승인 대기중을 구분 표시한다', () => {
  render(<DaySlotList day={makeDay()} selection={null} onToggleSlot={vi.fn()} />);
  expect(screen.getByText('비호응원단')).toBeInTheDocument();
  expect(screen.getByText('예약됨')).toBeInTheDocument();
  expect(screen.getByText('승인 대기중')).toBeInTheDocument();
  expect(screen.getByText(/운영: 고정관념 09:00~20:00/)).toBeInTheDocument();
});

it('차단 슬롯 버튼은 비활성이다', () => {
  render(<DaySlotList day={makeDay()} selection={null} onToggleSlot={vi.fn()} />);
  expect(screen.getByRole('button', { name: /17:00~18:00/ })).toBeDisabled();
});
```

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- --run test/facilities/booking-components.test.tsx`
Expected: 전건 PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/web
git commit -m "feat(frontend): 예약 홈 조회 컴포넌트 — 시설 칩·월간 캘린더·일간 슬롯·주간 타임테이블"
```

---

### Task 4: 신청 폼·성공 화면·Day View 패널(제어 컴포넌트)

**Files:**
- Create: `frontend/apps/web/app/facilities/_components/booking/BookingForm.tsx`, `BookingSuccess.tsx`, `BookingPanel.tsx`

**Interfaces:**
- Consumes: Task 1 훅(`useManagedClubsQuery`·`usePurposePresetsQuery`·`useCreateFacilityBookingMutation`), `useAuthStore`(@duing/stores), `useToast`, Task 2·3 산출물
- Produces(전부 제어 컴포넌트 — 상태는 페이지 소유):
  - `BookingForm({ facilityId, facilityName, date, range, hasPendingHold, onSubmitted, onBack })`
  - `BookingSuccess({ facilityName, date, range, overlappingPendingCount, onClose })`
  - `BookingPanel({ facility: { id, roomName }, day, daysByIso, view, onChangeView, selection, onToggleSlot, onSelectDate, step, onProceedToForm, onBackToSlots, submittedResult, onSubmitted, onClose })`

- [ ] **Step 1: BookingForm 구현**

```tsx
'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@duing/api';
import {
  useCreateFacilityBookingMutation,
  useManagedClubsQuery,
  usePurposePresetsQuery,
} from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import type { CreateFacilityBookingResult } from '@duing/types';
import { useToast } from '@/app/_components/toast/ToastProvider';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { rangeLabel } from '../../_lib/bookingCalendar';

const PURPOSE_MAX_LENGTH = 200;

type Props = {
  facilityId: number;
  facilityName: string;
  date: string;
  range: SlotRange;
  hasPendingHold: boolean;
  onSubmitted: (result: CreateFacilityBookingResult) => void;
  onBack: () => void;
};

export function BookingForm({
  facilityId, facilityName, date, range, hasPendingHold, onSubmitted, onBack,
}: Props) {
  const authStatus = useAuthStore((state) => state.status);
  const managedClubsQuery = useManagedClubsQuery({ enabled: authStatus === 'authenticated' });
  const presetsQuery = usePurposePresetsQuery();
  const createMutation = useCreateFacilityBookingMutation();
  const { addToast } = useToast();

  const purposeInputRef = useRef<HTMLInputElement>(null);
  const [clubId, setClubId] = useState<number | null>(null);
  const [purpose, setPurpose] = useState('');
  const [attendeeCount, setAttendeeCount] = useState('');

  if (authStatus !== 'authenticated') {
    return (
      <div className="space-y-3 text-sm text-charcoal-2">
        <p>예약 신청은 동아리 운영진 로그인 후 이용할 수 있어요.</p>
        <Link href="/login" className="btn btn-primary inline-flex">로그인하기</Link>
      </div>
    );
  }

  const managedClubs = managedClubsQuery.data ?? [];
  if (managedClubsQuery.isSuccess && managedClubs.length === 0) {
    return (
      <p className="text-sm text-charcoal-2">
        운영진(회장·운영진)으로 소속된 동아리가 없어 신청할 수 없어요. 시설 예약은 동아리 단위로 신청됩니다.
      </p>
    );
  }

  const effectiveClubId = clubId ?? managedClubs[0]?.clubId ?? null;
  const trimmedPurpose = purpose.trim();
  const attendeeNumber = attendeeCount === '' ? undefined : Number(attendeeCount);
  const attendeeInvalid =
    attendeeNumber !== undefined && (!Number.isInteger(attendeeNumber) || attendeeNumber <= 0);
  const canSubmit =
    effectiveClubId !== null &&
    trimmedPurpose.length > 0 &&
    trimmedPurpose.length <= PURPOSE_MAX_LENGTH &&
    !attendeeInvalid &&
    !createMutation.isPending;

  const submit = () => {
    if (!canSubmit || effectiveClubId === null) return;
    createMutation.mutate(
      {
        clubId: effectiveClubId,
        payload: {
          facilityId,
          date,
          startTime: range.start,
          endTime: range.end,
          purpose: trimmedPurpose,
          ...(attendeeNumber !== undefined ? { attendeeCount: attendeeNumber } : {}),
        },
      },
      {
        onSuccess: (result) => {
          addToast('예약 신청이 접수되었어요.');
          onSubmitted(result);
        },
        onError: (error) => {
          addToast(
            error instanceof ApiError ? error.message : '신청에 실패했어요. 잠시 후 다시 시도해주세요.',
            { variant: 'error' },
          );
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-line bg-cream/60 px-3 py-2 text-sm">
        <p className="font-medium text-ink-deep">{facilityName}</p>
        <p className="font-mono text-[13px] text-charcoal-2">{date} · {rangeLabel(range)}</p>
      </div>

      {hasPendingHold && (
        <p role="alert" className="rounded-md border border-coral/40 bg-coral/10 px-3 py-2 text-xs text-coral">
          이미 예약 신청이 접수된 시간이 포함돼 있어요. 계속 신청할 수 있지만, 승인은 한 신청에만 됩니다.
        </p>
      )}

      {managedClubs.length > 1 && (
        <div>
          <label htmlFor="booking-club" className="mb-1 block text-xs text-charcoal-3">신청 동아리</label>
          <select
            id="booking-club"
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-base"
            value={String(effectiveClubId ?? '')}
            onChange={(event) => setClubId(Number(event.target.value))}
          >
            {managedClubs.map((club) => (
              <option key={club.clubId} value={club.clubId}>{club.clubName}</option>
            ))}
          </select>
        </div>
      )}
      {managedClubs.length === 1 && (
        <p className="text-xs text-charcoal-3">신청 동아리: <span className="text-charcoal">{managedClubs[0]?.clubName}</span></p>
      )}

      <div>
        <p className="mb-1 text-xs text-charcoal-3">사용 목적</p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(presetsQuery.data ?? []).map((preset) => {
            const active = purpose === preset.label;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => setPurpose(preset.label)}
                className={`rounded-full border px-3 py-1.5 text-xs motion-safe:transition-colors ${
                  active ? 'border-ink bg-ink text-cream' : 'border-line bg-paper text-charcoal-2 hover:border-sage'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setPurpose('');
              purposeInputRef.current?.focus();
            }}
            className="rounded-full border border-dashed border-line bg-paper px-3 py-1.5 text-xs text-charcoal-3 hover:border-sage"
          >
            기타(직접 입력)
          </button>
        </div>
        <input
          ref={purposeInputRef}
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
          maxLength={PURPOSE_MAX_LENGTH}
          placeholder="사용 목적을 입력해주세요"
          aria-label="사용 목적"
          className="w-full rounded-md border border-line bg-paper px-3 py-2 text-base"
        />
      </div>

      <div>
        <label htmlFor="booking-attendees" className="mb-1 block text-xs text-charcoal-3">사용 인원 (선택)</label>
        <input
          id="booking-attendees"
          inputMode="numeric"
          value={attendeeCount}
          onChange={(event) => setAttendeeCount(event.target.value.replace(/[^0-9]/g, ''))}
          placeholder="예: 15"
          className="w-full rounded-md border border-line bg-paper px-3 py-2 text-base"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" className="btn btn-secondary flex-none" onClick={onBack}>
          시간 다시 선택
        </button>
        <button type="button" className="btn btn-primary flex-1" disabled={!canSubmit} onClick={submit}>
          {createMutation.isPending ? '신청 중…' : '예약 신청'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: BookingSuccess + BookingPanel 구현**

`BookingSuccess.tsx`:

```tsx
'use client';

import type { SlotRange } from '../../_lib/bookingCalendar';
import { rangeLabel } from '../../_lib/bookingCalendar';

const STEPS = ['신청 완료', '총동연 승인', '학교 확정'] as const;

type Props = {
  facilityName: string;
  date: string;
  range: SlotRange;
  overlappingPendingCount: number;
  onClose: () => void;
};

export function BookingSuccess({ facilityName, date, range, overlappingPendingCount, onClose }: Props) {
  return (
    <div className="space-y-4">
      <ol className="grid grid-cols-3 gap-1" aria-label="예약 진행 단계">
        {STEPS.map((label, index) => (
          <li key={label} className="flex flex-col items-center gap-1 text-center">
            <span
              aria-hidden
              className={`h-2.5 w-2.5 rounded-full ${index === 0 ? 'bg-ink' : 'bg-graysoft'}`}
            />
            <span className={`text-[11px] ${index === 0 ? 'font-medium text-ink-deep' : 'text-charcoal-3'}`}>
              {label}
            </span>
          </li>
        ))}
      </ol>
      <div role="status" className="rounded-md border border-line bg-cream/60 px-3 py-3 text-sm">
        <p className="font-medium text-ink-deep">{facilityName} · {date} · {rangeLabel(range)}</p>
        <p className="mt-1 text-charcoal-2">
          신청이 접수됐어요. 총동연 승인과 학교 반영을 거쳐 최종 확정됩니다.
        </p>
        {overlappingPendingCount > 0 && (
          <p className="mt-1 text-xs text-coral">
            같은 시간에 다른 신청 {overlappingPendingCount}건이 함께 대기 중이에요 — 승인은 한 건에만 됩니다.
          </p>
        )}
      </div>
      <button type="button" className="btn btn-primary w-full" onClick={onClose}>확인</button>
    </div>
  );
}
```

`BookingPanel.tsx`:

```tsx
'use client';

import type { BookingDayAvailability, CreateFacilityBookingResult } from '@duing/types';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { rangeContainsPendingHold, rangeLabel } from '../../_lib/bookingCalendar';
import { BookingForm } from './BookingForm';
import { BookingSuccess } from './BookingSuccess';
import { DaySlotList } from './DaySlotList';
import { WeekTimetable } from './WeekTimetable';

export type PanelStep = 'slots' | 'form' | 'success';
export type PanelView = 'day' | 'week';

type Props = {
  facility: { id: number; roomName: string };
  day: BookingDayAvailability;
  daysByIso: Map<string, BookingDayAvailability>;
  view: PanelView;
  onChangeView: (view: PanelView) => void;
  selection: SlotRange | null;
  onToggleSlot: (slotStart: string) => void;
  onSelectDate: (iso: string) => void;
  step: PanelStep;
  onProceedToForm: () => void;
  onBackToSlots: () => void;
  submittedResult: CreateFacilityBookingResult | null;
  onSubmitted: (result: CreateFacilityBookingResult) => void;
  onClose: () => void;
};

export function BookingPanel({
  facility, day, daysByIso, view, onChangeView, selection, onToggleSlot, onSelectDate,
  step, onProceedToForm, onBackToSlots, submittedResult, onSubmitted, onClose,
}: Props) {
  const dateLabel = `${Number(day.date.slice(5, 7))}월 ${Number(day.date.slice(8, 10))}일`;

  if (step === 'success' && selection) {
    return (
      <BookingSuccess
        facilityName={facility.roomName}
        date={day.date}
        range={selection}
        overlappingPendingCount={submittedResult?.overlappingPendingCount ?? 0}
        onClose={onClose}
      />
    );
  }

  if (step === 'form' && selection) {
    return (
      <BookingForm
        facilityId={facility.id}
        facilityName={facility.roomName}
        date={day.date}
        range={selection}
        hasPendingHold={rangeContainsPendingHold(day.slots, selection)}
        onSubmitted={onSubmitted}
        onBack={onBackToSlots}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-base text-ink-deep">{facility.roomName} · {dateLabel}</h3>
        <div className="flex rounded-full border border-line bg-paper p-0.5 text-xs" role="tablist" aria-label="보기 전환">
          {(['day', 'week'] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={view === candidate}
              onClick={() => onChangeView(candidate)}
              className={`rounded-full px-2.5 py-1 motion-safe:transition-colors ${
                view === candidate ? 'bg-ink text-cream' : 'text-charcoal-3'
              }`}
            >
              {candidate === 'day' ? '일간' : '주간'}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {view === 'day' ? (
          <DaySlotList day={day} selection={selection} onToggleSlot={onToggleSlot} />
        ) : (
          <WeekTimetable
            selectedDate={day.date}
            daysByIso={daysByIso}
            selection={selection}
            onSelectDate={onSelectDate}
          />
        )}
      </div>

      <div className="sticky bottom-0 bg-inherit pt-2">
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={!selection}
          onClick={onProceedToForm}
        >
          {selection ? `${rangeLabel(selection)} 예약 신청` : '시간을 선택해주세요'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 검증 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm typecheck && pnpm lint`
Expected: 통과

```bash
git add frontend/apps/web
git commit -m "feat(frontend): 예약 신청 폼·성공 화면·Day View 패널 — Preset 하이브리드·홀드 경고·단계 전환"
```

---

### Task 5: 페이지 조립 + redirect + 기존 화면 정리

**Files:**
- Create: `frontend/apps/web/app/facilities/_pages/FacilityBookingPage.tsx`, `_components/booking/BookingHomeSkeleton.tsx`
- Modify: `frontend/apps/web/app/facilities/page.tsx`, `[facilityId]/page.tsx`, `_components/FacilityUsageGuide.tsx`
- Delete: `_pages/FacilityExplorePage.tsx`, `_components/FacilityTimeline.tsx`, `[facilityId]/loading.tsx`, `test/facilities/facility-detail-page.test.tsx`, `test/facilities/facility-timeline.test.tsx`(구 상세 전용 — `facility-timeline-lib` 등 lib·Overview·배너 테스트는 유지)

**Interfaces:**
- Consumes: Task 1~4 전부, 기존 `FacilityUpdateBanner`·`FacilityOverviewTimeline`·`FacilityUsageGuide`, `useFacilityUsageQuery`, `facilityTimeline.ts`(`seoulDateIso`·`shiftYearMonth`), `Sheet`(ui)
- Produces: `/facilities` 예약 홈(딥링크 `?facilityId=&date=`), `/facilities/[facilityId]` → redirect

- [ ] **Step 1: BookingHomeSkeleton** (탐색 스켈레톤 전례 — 결정적 마크업·`role="status"`·motion-reduce):

```tsx
export function BookingHomeSkeleton() {
  return (
    <div role="status" aria-label="예약 캘린더 불러오는 중" className="animate-pulse motion-reduce:animate-none space-y-4">
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-9 w-28 rounded-full bg-graysoft" />
        ))}
      </div>
      <div className="rounded-lg border border-line bg-paper p-5">
        <div className="mx-auto mb-4 h-6 w-32 rounded-full bg-graysoft" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 42 }).map((_, index) => (
            <div key={index} className="h-14 rounded-md bg-graysoft/60" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: FacilityBookingPage 조립** — 핵심 형태(전문):

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFacilityAvailabilityQuery, useFacilityUsageQuery } from '@duing/hooks';
import type { BookingDayAvailability, CreateFacilityBookingResult } from '@duing/types';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { FacilityUpdateBanner } from '../_components/FacilityUpdateBanner';
import { FacilityOverviewTimeline } from '../_components/FacilityOverviewTimeline';
import { FacilityUsageGuide } from '../_components/FacilityUsageGuide';
import { seoulDateIso, shiftYearMonth } from '../_lib/facilityTimeline';
import type { SlotRange } from '../_lib/bookingCalendar';
import { toggleSlotSelection } from '../_lib/bookingCalendar';
import { BookingCalendar } from '../_components/booking/BookingCalendar';
import { BookingHomeSkeleton } from '../_components/booking/BookingHomeSkeleton';
import { BookingPanel, type PanelStep, type PanelView } from '../_components/booking/BookingPanel';
import { FacilityChips } from '../_components/booking/FacilityChips';

/** URL 은 딥링크 전용 — 상태 변경은 리렌더 없는 replaceState 로만 반영한다(App Router replace 는 RSC 왕복). */
function syncUrl(facilityId: number | null, date: string | null) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (facilityId !== null) params.set('facilityId', String(facilityId));
  else params.delete('facilityId');
  if (date !== null) params.set('date', date);
  else params.delete('date');
  const query = params.toString();
  window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}

export function FacilityBookingPage() {
  const searchParams = useSearchParams();
  const todayIso = seoulDateIso(new Date());
  const currentMonth = todayIso.slice(0, 7);

  const [facilityId, setFacilityId] = useState<number | null>(() => {
    const raw = searchParams.get('facilityId');
    const parsed = raw === null ? Number.NaN : Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    const raw = searchParams.get('date');
    return raw !== null && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  });
  const [yearMonth, setYearMonth] = useState(() =>
    selectedDate !== null && selectedDate.slice(0, 7) !== currentMonth
      ? shiftYearMonth(currentMonth, 1)
      : currentMonth,
  );
  const [selection, setSelection] = useState<SlotRange | null>(null);
  const [step, setStep] = useState<PanelStep>('slots');
  const [view, setView] = useState<PanelView>('day');
  const [submittedResult, setSubmittedResult] = useState<CreateFacilityBookingResult | null>(null);

  const usageQuery = useFacilityUsageQuery();
  const chipFacilities = useMemo(
    () =>
      (usageQuery.data?.facilities ?? []).map((facility) => ({
        id: facility.id,
        roomName: facility.roomName,
        isUsingNow: facility.isUsingNow,
      })),
    [usageQuery.data],
  );
  const effectiveFacilityId = facilityId ?? chipFacilities[0]?.id ?? undefined;
  const availabilityQuery = useFacilityAvailabilityQuery(effectiveFacilityId, yearMonth);
  const availability = availabilityQuery.data;

  const daysByIso = useMemo(() => {
    const map = new Map<string, BookingDayAvailability>();
    for (const day of availability?.days ?? []) map.set(day.date, day);
    return map;
  }, [availability]);
  const selectedDay = selectedDate !== null ? daysByIso.get(selectedDate) : undefined;
  const selectedFacility = chipFacilities.find((candidate) => candidate.id === effectiveFacilityId);

  const closePanel = () => {
    setSelectedDate(null);
    setSelection(null);
    setStep('slots');
    setSubmittedResult(null);
    syncUrl(effectiveFacilityId ?? null, null);
  };

  const selectFacility = (nextId: number) => {
    setFacilityId(nextId);
    closePanel();
    syncUrl(nextId, null);
  };

  const selectDate = (iso: string) => {
    if (iso.slice(0, 7) !== yearMonth) setYearMonth(iso.slice(0, 7));
    setSelectedDate(iso);
    setSelection(null);
    setStep('slots');
    setSubmittedResult(null);
    syncUrl(effectiveFacilityId ?? null, iso);
  };

  const toggleSlot = (slotStart: string) => {
    if (!selectedDay) return;
    const tapped = selectedDay.slots.find((slot) => slot.start === slotStart);
    if (!tapped) return;
    setSelection((current) => toggleSlotSelection(current, tapped, selectedDay.slots));
  };

  const changeMonth = (delta: 1 | -1) => {
    setYearMonth((current) => shiftYearMonth(current, delta));
    setSelectedDate(null);
    setSelection(null);
    setStep('slots');
  };

  const panelOpen = selectedDay !== undefined && selectedFacility !== undefined;
  const panel = panelOpen ? (
    <BookingPanel
      facility={selectedFacility}
      day={selectedDay}
      daysByIso={daysByIso}
      view={view}
      onChangeView={setView}
      selection={selection}
      onToggleSlot={toggleSlot}
      onSelectDate={selectDate}
      step={step}
      onProceedToForm={() => setStep('form')}
      onBackToSlots={() => setStep('slots')}
      submittedResult={submittedResult}
      onSubmitted={(result) => {
        setSubmittedResult(result);
        setStep('success');
      }}
      onClose={closePanel}
    />
  ) : null;

  return (
    <main className="mx-auto max-w-layout px-4 pb-16 pt-8 sm:px-6 md:px-10">
      <p className="text-xs font-medium tracking-widest text-charcoal-3">FACILITY · 시설 예약</p>
      <h1 className="mb-4 mt-1 font-display text-2xl text-ink-deep">시설 예약</h1>

      {usageQuery.isLoading && <BookingHomeSkeleton />}
      {usageQuery.isError && (
        <p role="alert" className="text-sm text-charcoal-2">시설 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
      )}

      {usageQuery.isSuccess && (
        <div className="space-y-4">
          <FacilityChips facilities={chipFacilities} selectedId={effectiveFacilityId ?? null} onSelect={selectFacility} />
          {availability && (
            <FacilityUpdateBanner lastUpdatedAt={availability.lastUpdatedAt ?? null} stale={availability.stale} />
          )}

          <div className={panelOpen ? 'md:grid md:grid-cols-[minmax(0,1fr)_380px] md:gap-5' : undefined}>
            <div>
              {availabilityQuery.isLoading && <BookingHomeSkeleton />}
              {availability && (
                <BookingCalendar
                  yearMonth={yearMonth}
                  daysByIso={daysByIso}
                  bookableFrom={availability.bookableFrom}
                  bookableUntil={availability.bookableUntil}
                  todayIso={todayIso}
                  selectedDate={selectedDate}
                  onSelectDate={selectDate}
                  onPrevMonth={() => changeMonth(-1)}
                  onNextMonth={() => changeMonth(1)}
                  canPrev={yearMonth !== currentMonth}
                  canNext={yearMonth === currentMonth}
                />
              )}
            </div>
            {/* 데스크탑 인라인 우측 패널 — 모바일에선 아래 Sheet 가 담당(단일 제어 상태 공유) */}
            {panelOpen && (
              <aside className="hidden rounded-lg border border-line bg-paper p-4 md:block">
                {panel}
              </aside>
            )}
          </div>

          <details className="rounded-lg border border-line bg-paper px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-ink-deep">오늘 이용 현황</summary>
            <div className="pt-3">
              <FacilityOverviewTimeline facilities={usageQuery.data.facilities} />
            </div>
          </details>
          <FacilityUsageGuide />
        </div>
      )}

      {/* 모바일 Bottom Sheet — md 미만 전용. 포털이라 .duing 스코프 재부여(bg-cream 함정 → bg-transparent) */}
      <Sheet open={panelOpen} onOpenChange={(open) => !open && closePanel()}>
        <SheetContent side="bottom" hideClose className="md:hidden">
          <div className="duing bg-transparent">
            <SheetHeader className="mb-2">
              <SheetTitle className="text-left font-display text-base text-ink-deep">
                {selectedFacility?.roomName}
              </SheetTitle>
            </SheetHeader>
            {panel}
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
```

- [ ] **Step 3: page.tsx·redirect·기존 정리**

`page.tsx`:

```tsx
import { Suspense } from 'react';
import { FacilityBookingPage } from './_pages/FacilityBookingPage';
import { BookingHomeSkeleton } from './_components/booking/BookingHomeSkeleton';

export default function FacilitiesPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-layout px-4 pb-16 pt-8 sm:px-6 md:px-10">
          <BookingHomeSkeleton />
        </main>
      }
    >
      <FacilityBookingPage />
    </Suspense>
  );
}
```

`[facilityId]/page.tsx` — 기존 링크 호환 redirect(§16 결정 14):

```tsx
import { redirect } from 'next/navigation';

export default async function LegacyFacilityDetailPage({
  params,
}: {
  params: Promise<{ facilityId: string }>;
}) {
  const { facilityId } = await params;
  redirect(`/facilities?facilityId=${encodeURIComponent(facilityId)}`);
}
```

`[facilityId]/loading.tsx`·`_pages/FacilityExplorePage.tsx`·`_components/FacilityTimeline.tsx` 삭제. `FacilityUsageGuide.tsx` 는 파일을 열어 **이메일(sd@daegu.ac.kr)·신청서 다운로드 관련 항목만 제거**하고 이용 수칙·주의 문구는 유지(제목도 "이용 수칙" 계열로 조정), 대응 테스트(`facility-usage-guide.test.tsx`) 단언 갱신. 구 상세 전용 테스트 2파일 삭제.

- [ ] **Step 4: 검증 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm typecheck && pnpm lint && pnpm --filter web test -- --run test/facilities`
Expected: 통과(구 상세 테스트 삭제 반영 후)

```bash
git add frontend/apps/web
git commit -m "feat(frontend): 시설 예약 홈 페이지 조립 — 딥링크·하이브리드 패널·기존 화면 정리·redirect"
```

---

### Task 6: 페이지 통합 테스트 (msw)

**Files:**
- Test: `frontend/apps/web/test/facilities/facility-booking-page.test.tsx`

**Interfaces:**
- Consumes: apply-page.test 의 msw+Provider 패턴(라우터 mock·ApiResponse 봉투·retry:false), `useAuthStore.setState`

- [ ] **Step 1: 테스트 작성** — 핵심 시나리오 6건. 셋업 골격:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import { FacilityBookingPage } from '@/app/facilities/_pages/FacilityBookingPage';

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useSearchParams: () => new URLSearchParams(searchParamsRef.value),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  };
});
const searchParamsRef = { value: '' };
```

응답 픽스처는 **오늘 날짜 기준 동적 생성**(하드코딩 절대날짜 = CI 타임밤 금지). 혼합 슬롯은 항상 캘린더에서 클릭 가능한 "오늘" 셀에 배치한다:

```tsx
import { seoulDateIso } from '@/app/facilities/_lib/facilityTimeline';
import type { BookingAvailabilitySlot, FacilityAvailabilityResponse } from '@duing/types';

const TODAY_ISO = seoulDateIso(new Date());
const CURRENT_MONTH = TODAY_ISO.slice(0, 7);
const TODAY_DAY_LABEL = `${Number(TODAY_ISO.slice(8, 10))}일`; // 캘린더 셀 접근성 이름

const pad2 = (value: number) => String(value).padStart(2, '0');

// 오늘 셀에 배치할 13칸: 11시=SCHOOL(비호응원단), 12시=INTERNAL(예약됨), 14시=HOLD, 나머지 AVAILABLE
function makeMixedSlots(): BookingAvailabilitySlot[] {
  return Array.from({ length: 13 }, (_, index) => {
    const start = `${pad2(9 + index)}:00`;
    const end = `${pad2(10 + index)}:00`;
    if (index === 2) return { start, end, status: 'BLOCKED' as const, blockedBy: 'SCHOOL' as const, organization: '비호응원단' };
    if (index === 3) return { start, end, status: 'BLOCKED' as const, blockedBy: 'INTERNAL' as const };
    if (index === 5) return { start, end, status: 'PENDING_HOLD' as const };
    return { start, end, status: 'AVAILABLE' as const };
  });
}

function makeAvailability(facilityId: number): FacilityAvailabilityResponse {
  const [year, month] = CURRENT_MONTH.split('-').map(Number);
  const daysInMonth = new Date(year ?? 1970, month ?? 1, 0).getDate();
  return {
    facilityId,
    yearMonth: CURRENT_MONTH,
    lastUpdatedAt: null,
    stale: false,
    bookableFrom: TODAY_ISO,
    bookableUntil: `${CURRENT_MONTH}-${pad2(daysInMonth)}`, // 테스트는 당월만 사용
    days: Array.from({ length: daysInMonth }, (_, index) => {
      const iso = `${CURRENT_MONTH}-${pad2(index + 1)}`;
      if (iso < TODAY_ISO) {
        return { date: iso, dayStatus: 'PAST' as const, availableSlotCount: 0, operatingNotes: [], slots: [] };
      }
      if (iso === TODAY_ISO) {
        return {
          date: iso,
          dayStatus: 'AVAILABLE' as const,
          availableSlotCount: 10,
          operatingNotes: [{ organization: '고정관념', start: '09:00', end: '20:00' }],
          slots: makeMixedSlots(),
        };
      }
      return {
        date: iso,
        dayStatus: 'AVAILABLE' as const,
        availableSlotCount: 13,
        operatingNotes: [],
        slots: Array.from({ length: 13 }, (_, slotIndex) => ({
          start: `${pad2(9 + slotIndex)}:00`,
          end: `${pad2(10 + slotIndex)}:00`,
          status: 'AVAILABLE' as const,
        })),
      };
    }),
  };
}

function ok<T>(data: T) {
  return HttpResponse.json({ ok: true, data, message: null });
}

const FACILITY_A = { id: 1, roomName: '커뮤니티룸(1)', isUsingNow: false };
const FACILITY_B = { id: 2, roomName: '공동연습실(1)', isUsingNow: true };

const server = setupServer(
  http.get('*/facilities/usage', () =>
    ok({ yearMonth: CURRENT_MONTH, lastUpdatedAt: null, stale: false, source: 'CACHE', facilities: [FACILITY_A, FACILITY_B] })),
  http.get('*/facilities/1/availability', () => ok(makeAvailability(1))),
  http.get('*/facilities/booking-purpose-presets', () =>
    ok([{ id: 1, label: '동아리 정기 모임' }, { id: 3, label: '정기 합주' }])),
  http.get('*/leader/clubs/me/managed', () =>
    ok([{ clubId: 7, clubName: '밴드부', logoUrl: null, myRole: 'LEADER', activeRecruitmentCount: 0 }])),
  http.post('*/clubs/7/facility-bookings', () =>
    ok({ bookingId: 31, status: 'PENDING', overlappingPendingCount: 1 })),
);
```

(테스트 픽스처의 `as const`는 리터럴 내로잉 관용구로 기존 테스트 전례와 동일 — 타입 단언 금지 규칙의 대상이 아니다. usage 핸들러의 `FacilityItem`은 기존 타입 전체 필드를 채워야 하면 기존 usage 테스트 픽스처를 복사해 사용.)

시나리오(각각 독립 `it` — 날짜 참조는 전부 `TODAY_ISO`/`TODAY_DAY_LABEL` 기반, 절대날짜 금지):
1. **캘린더 렌더** — 시설 칩 2개(`커뮤니티룸(1)`·`공동연습실(1)`), 오늘 셀(`TODAY_DAY_LABEL`)에 `10칸` 표시.
2. **날짜 선택 → 패널** — 오늘 셀 클릭 후 슬롯 리스트 노출: `비호응원단`(SCHOOL)·`예약됨`(INTERNAL)·`승인 대기중`(HOLD)·`운영: 고정관념 09:00~20:00`.
3. **연속 슬롯 선택 → CTA 라벨** — `18:00~19:00`·`19:00~20:00` 슬롯 탭(둘 다 AVAILABLE) → `18:00~20:00 예약 신청` 버튼 활성.
4. **신청 플로우 성공** — `useAuthStore.setState({ status: 'authenticated' })` 후 시나리오 3 경로로 CTA → 폼에서 Preset 칩 `정기 합주` 탭(input 값이 `정기 합주` 로 채워짐 단언) → `예약 신청` 클릭 → 성공 화면(`총동연 승인` 스텝, `1건이 함께 대기` 겹침 경고) 노출, msw 핸들러에서 `await request.json()` 으로 POST body 캡처해 `{ facilityId: 1, date: TODAY_ISO, startTime: '18:00', endTime: '20:00', purpose: '정기 합주' }` 단언.
5. **홀드 경고** — `14:00~15:00`(PENDING_HOLD) 선택 후 CTA → 폼 상단 `이미 예약 신청이 접수된 시간이 포함돼 있어요` 경고 노출.
6. **비로그인 폼** — `status: 'unauthenticated'` 로 CTA → `로그인하기` 링크(`href="/login"`) 노출.

각 테스트 후 `useAuthStore.setState({ status: 'idle', user: null })` 초기화(beforeEach). msw `onUnhandledRequest` 는 throw.

- [ ] **Step 2: 통과 확인 + Commit**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- --run test/facilities/facility-booking-page.test.tsx`
Expected: 6건 PASS

```bash
git add frontend/apps/web
git commit -m "test(frontend): 예약 홈 통합 테스트 — 캘린더·슬롯 선택·신청 플로우·홀드 경고·비로그인"
```

---

### Task 7: 전체 검증 + 실브라우저 QA

- [ ] **Step 1: CI 4종**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm lint; echo "lint=$?"
pnpm typecheck; echo "typecheck=$?"
NEXT_PUBLIC_API_BASE_URL=https://api.ci.invalid/api/v1 pnpm build; echo "build=$?"
pnpm test; echo "test=$?"
```
Expected: 전부 0 (exit code 를 직접 확인 — 파이프 가림 금지)

- [ ] **Step 2: 실브라우저 QA 체크리스트** (백엔드 bootRun + `pnpm dev` :3000, jsdom 한계 보완 — 컨트롤러 수행):
- 칩 전환·딥링크(`?facilityId=&date=`) 새로고침 복원
- 날짜 클릭 → 모바일(390px) Bottom Sheet / 데스크탑 우측 패널 — 포털에서 크림 띠 없음(.duing bg-transparent)
- 슬롯 연속 선택·재시작·해제 포인터 동작, 주간 토글·선택일 강조
- 신청 제출(dev DB 에 실제 PENDING 생성됨 — 확인 후 그대로 둬도 무해) → 성공 화면 → 캘린더 복귀 시 해당 슬롯 "승인 대기중" 반영
- `/facilities/1` 진입 → 예약 홈 redirect, BottomNav '시설' 탭 활성 유지
- reduced-motion 에서 스켈레톤·시트 애니메이션 억제

- [ ] **Step 3: 워킹트리 클린 확인** — `git status --short` clean.

---

## Out of Scope (후속 PR)

- 동아리 예약 관리 페이지(내 신청 목록·상세·취소) — PR4 (`client.facilityBookings` 의 list/detail/cancel 도 그때 추가)
- 관리자 승인 큐·대시보드 — PR5
- 성공 화면의 "내 예약에서 확인" 링크 — PR4 에서 페이지 생기면 추가
- 알림·정책 설정·페이징 — P2
