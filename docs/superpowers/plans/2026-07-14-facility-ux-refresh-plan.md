# 시설 예약 홈 UX 리프레시 구현 계획 (PR-A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/facilities`를 목업(Concept A) 기반 2뷰 구조로 재편 — 시설 선택 홈(카드 그리드) ⇄ 캘린더 뷰(히트맵+콘텍스트 바+업그레이드 패널) — 하고, 반월 오픈 창(PR-0)을 FE에 반영(기본 월=창 월, 창 밖 토스트 안내, 창 배지/라벨)하며, 성공 화면을 세로 타임라인으로 교체하고 승인 문구를 통일한다.

**Architecture:** 단일 라우트·딥링크(`?facilityId=&date=`) 유지. `facilityId` 부재=홈 뷰, 존재=캘린더 뷰(자동 첫 시설 선택 제거). 신규 `booking-window` API를 데이터 레이어에 추가해 홈 카드·캘린더 배지·기본 월 결정에 사용. 파생 계산(레벨·분포·오늘 가용)은 순수 lib으로 격리해 단위 테스트.

**Tech Stack:** Next.js 15 / TanStack Query / ky(@duing/api) / vitest+msw(facilities 관례) / Tailwind(두잉 토큰)

**Spec:** [`2026-07-14-facility-ux-refresh-design.md`](../specs/2026-07-14-facility-ux-refresh-design.md) §1(조정 규칙)·§1.5(FE 반영)·§2(PR-A 전체)

## Global Constraints

- 브랜치 `feat/facility-ux-refresh` — **PR-0(`feat/facility-booking-window-policy`, #644) 위 스택**(booking-window API 런타임 의존). PR base도 PR-0 브랜치.
- FE 규칙: `any`/`as` 금지(`as const`·route.ts 헬퍼 제외), `type`만, 서버 상태 TanStack Query만, `useEffect` 데이터 패칭 금지(상태 조정 이펙트는 허용 전례), 두잉 토큰만(slate/stone 금지 — 목업의 inline style·CSS 변수는 전부 Tailwind 토큰으로 번역).
- **스펙 §1 조정 규칙(불변식)**: INTERNAL·PENDING 동아리명 비노출("예약됨"/"승인 대기"), 하드 홀드 문구 금지("같은 시간에 다른 신청이 들어올 수 있어요 — 승인은 한 건에만 돼요"), closed/mine 상태 없음, **예상 처리 시간 문구 전면 금지** — 승인 안내는 "관리자 승인 후 학교 반영 절차가 진행됩니다."로 통일.
- **반월 창 FE 계약(§1.5)**: 캘린더 기본 표시 월=`bookableFrom`의 월, 창 밖 미래 셀=디밍+`aria-disabled`+탭 시 토스트 "현재 예약 가능한 기간이 아니에요 (M.d ~ M.d)", 딥링크 `date` 창 밖=패널 미오픈+동일 토스트, 캘린더 상단 창 배지 "예약 가능 기간 M.d ~ M.d", 홈 카드에도 동일 라벨. 과거/월밖 셀은 기존대로 클릭 불가 디밍(토스트 없음).
- **시설 카드(§2.2)**: 아이콘 FE 매핑(미매핑 폴백), 위치(null이면 생략), 오늘 가용 미니바(usage `reservations` 파생 — 22시 이후 "오늘 마감"), 지금 사용중 뱃지, CTA "날짜 보기"(항상 활성). **정렬: usage 응답 순서 그대로, FE 재정렬 없음**(비결정적이면 facilityId 오름차순 고정).
- **성공 화면(§2.5)**: F5 세로 타임라인 4단계(신청 접수=제출 시각 표기 / 관리자 승인 대기=현재 / 학교 예약 시스템 반영 / 예약 확정) + CTA 3종(내 예약에서 확인 / **다른 시설 예약하기**(홈 뷰 복귀) / 닫기).
- 기존 유지(§2.6): 뷰포트 게이트 하이브리드(aside/Sheet)·URL replaceState·에러/빈/스켈레톤·stale 배너·오늘 이용 현황 접이식·이용 안내·selectionInvalid 이펙트·연속 슬롯 선택 규칙. 관리자 콘솔·manage는 이 PR에서 무변경(PR-B).
- 테스트: facilities는 msw 패턴(기존 스위트 대폭 갱신 — 픽스처를 반월 창 미러로), 하드코딩 절대날짜 금지. 로컬 production build는 `NEXT_PUBLIC_API_BASE_URL=https://api.ci.invalid/api/v1 pnpm build`.
- 리뷰는 Fable(태스크·whole-branch)만 — codex 제외(사용자 지시).
- 명령은 `frontend/`에서. 커밋 한국어 Conventional Commits, Co-Authored-By/🤖 금지, push·PR 금지(컨트롤러 몫).

---

## File Structure

```
frontend/packages/types/src/facility.ts                  (Task 1 수정 — FacilityBookingWindow)
frontend/packages/api/src/client.ts                      (Task 1 수정 — facilities.bookingWindow)
frontend/packages/api/src/generated/schema.d.ts          (Task 1 재생성)
frontend/packages/hooks/src/facilities.ts + facilityQueryKeys.ts + index.ts (Task 1 수정)

frontend/apps/web/app/facilities/
├── _lib/bookingHome.ts                                  (Task 2 신규 — 아이콘·창 라벨·오늘 가용)
├── _lib/bookingCalendar.ts                              (Task 2 수정 — 레벨·분포·퀵 슬롯 파생)
├── _components/booking/
│   ├── FacilityHomeCard.tsx                             (Task 3 신규)
│   ├── FacilityContextBar.tsx                           (Task 4 신규 — FacilityChips 대체)
│   ├── FacilityChips.tsx                                (Task 4 삭제)
│   ├── BookingCalendar.tsx                              (Task 4 수정 — 히트맵·창 가드·배지)
│   ├── PanelSummaryCard.tsx                             (Task 5 신규 — 다크 요약)
│   ├── PanelStepIndicator.tsx                           (Task 5 신규)
│   ├── BookingPanel.tsx                                 (Task 5 수정 — 요약 카드·스텝·선택 요약)
│   ├── DaySlotList.tsx                                  (Task 5 수정 — 스타일 업)
│   ├── BookingForm.tsx                                  (Task 5 수정 — 섹션 카드·문구 통일)
│   └── BookingSuccess.tsx                               (Task 5 재작성 — 세로 타임라인+CTA 3종)
└── _pages/FacilityBookingPage.tsx                       (Task 3·4 수정 — 2뷰 재편·창 반영)

frontend/apps/web/test/facilities/
├── booking-home-lib.test.ts                             (Task 2)
├── booking-calendar-lib.test.ts                         (Task 2 수정 — 파생 추가분)
├── booking-components.test.tsx                          (Task 4·5 수정)
└── facility-booking-page.test.tsx                       (Task 6 대폭 갱신 — 반월 창 픽스처)
```

---

### Task 1: 데이터 레이어 — booking-window API

**Files:**
- Modify: `packages/types/src/facility.ts`, `packages/api/src/client.ts`, `packages/hooks/src/facilities.ts`, `packages/hooks/src/facilityQueryKeys.ts`, `packages/hooks/src/index.ts`
- Regenerate: `packages/api/src/generated/schema.d.ts`

**Interfaces:**
- Produces: `FacilityBookingWindow{bookableFrom, bookableUntil}`, `client.facilities.bookingWindow()`, `useBookingWindowQuery()`, `facilityQueryKeys.bookingWindow()`

- [ ] **Step 1: 타입·클라이언트·훅**

types(기존 예약 타입 옆):

```ts
// GET /api/v1/facilities/booking-window — 현재 예약 오픈 구간(전 시설 공통, §1.5)
export type FacilityBookingWindow = {
  bookableFrom: string; // yyyy-MM-dd
  bookableUntil: string;
};
```

client `facilities` 블록(선언+구현):

```ts
// 선언
bookingWindow(): Promise<FacilityBookingWindow>;
// 구현
bookingWindow: () => jsonOk<FacilityBookingWindow>(http.get('facilities/booking-window')),
```

queryKeys: `bookingWindow: () => [...facilityQueryKeys.all, 'booking-window'] as const,`

hooks:

```ts
export function useBookingWindowQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: facilityQueryKeys.bookingWindow(),
    queryFn: () => client.facilities.bookingWindow(),
    // 값은 KST 자정(1일·16일)에만 바뀐다 — 세션 내 재요청 억제
    staleTime: 5 * 60 * 1000,
  });
}
```

index.ts re-export.

- [ ] **Step 2: gen:api** — 스택 브랜치라 백엔드에 booking-window 포함: `cd backend && ./gradlew bootRun`(백그라운드, health UP 확인) → `cd frontend && pnpm gen:api` → `lsof -ti :8080 | xargs kill`. diff에 `/facilities/booking-window` 경로 확인.

- [ ] **Step 3: 검증 + Commit** — `pnpm typecheck && pnpm lint` 통과.

```bash
git add frontend/packages
git commit -m "feat(frontend): 예약 오픈 구간 API 연동 — 타입·클라이언트·훅"
```

---

### Task 2: 파생 lib — 아이콘·창 라벨·오늘 가용·레벨·분포 (TDD)

**Files:**
- Create: `apps/web/app/facilities/_lib/bookingHome.ts`
- Modify: `apps/web/app/facilities/_lib/bookingCalendar.ts`(추가만 — 기존 export 무변경)
- Test: `test/facilities/booking-home-lib.test.ts` 신규, `booking-calendar-lib.test.ts` 추가분

**Interfaces:**
- Produces(bookingHome): `facilityIcon(roomName) → string`, `windowRangeLabel(window) → '7.16 ~ 7.31'`, `todayFreeSlotCount(reservations, now) → number | null`(null=영업 종료 후)
- Produces(bookingCalendar): `DayLevel = 'HIGH'|'MID'|'LOW'|'FULL'`, `dayLevelOf(count)`, `DAY_LEVEL_META`, `periodDistribution(slots)`, `firstAvailableStarts(slots, max)`

- [ ] **Step 1: 실패하는 테스트** — `booking-home-lib.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { facilityIcon, todayFreeSlotCount, windowRangeLabel } from '@/app/facilities/_lib/bookingHome';

describe('facilityIcon', () => {
  it('시설명 패턴으로 아이콘을 매핑하고 미매핑은 기본 아이콘이다', () => {
    expect(facilityIcon('커뮤니티룸(1)')).toBe('🛋');
    expect(facilityIcon('공동연습실(3)')).toBe('🎸');
    expect(facilityIcon('빛광장')).toBe('🎤');
    expect(facilityIcon('자유광장(노천강당)')).toBe('🎪');
    expect(facilityIcon('웅지관 강당')).toBe('🏛');
    expect(facilityIcon('신규 시설')).toBe('🏢');
  });
});

describe('windowRangeLabel', () => {
  it('오픈 구간을 M.d ~ M.d 로 표기한다', () => {
    expect(windowRangeLabel({ bookableFrom: '2026-07-16', bookableUntil: '2026-07-31' })).toBe('7.16 ~ 7.31');
    expect(windowRangeLabel({ bookableFrom: '2026-08-01', bookableUntil: '2026-08-15' })).toBe('8.1 ~ 8.15');
  });
});

describe('todayFreeSlotCount', () => {
  const reservations = [
    { startTime: '11:00', endTime: '13:00' },
    { startTime: '18:00', endTime: '20:00' },
  ];
  it('현재 시각 이후 남은 슬롯 중 예약이 덮지 않은 수를 센다', () => {
    // 10시: 남은 슬롯 10~22시(12칸) 중 11·12·18·19시 예약 → 8칸
    expect(todayFreeSlotCount(reservations, new Date(2026, 6, 14, 10, 0))).toBe(8);
    // 19시 30분: 남은 슬롯 20·21시(19시 슬롯은 시작이 지났으므로 제외) → 2칸
    expect(todayFreeSlotCount(reservations, new Date(2026, 6, 14, 19, 30))).toBe(2);
  });
  it('영업 시작 전에는 전체에서 예약분만 빼고, 22시 이후에는 null 을 준다', () => {
    expect(todayFreeSlotCount(reservations, new Date(2026, 6, 14, 8, 0))).toBe(9); // 13칸 - 4칸
    expect(todayFreeSlotCount(reservations, new Date(2026, 6, 14, 22, 30))).toBeNull();
  });
});
```

`booking-calendar-lib.test.ts` 추가분:

```ts
import {
  DAY_LEVEL_META,
  dayLevelOf,
  firstAvailableStarts,
  periodDistribution,
} from '@/app/facilities/_lib/bookingCalendar';

describe('dayLevelOf', () => {
  it('가용 칸 비율로 여유/보통/혼잡/마감을 나눈다', () => {
    expect(dayLevelOf(13)).toBe('HIGH'); // 1.0
    expect(dayLevelOf(8)).toBe('HIGH'); // ≥0.6
    expect(dayLevelOf(7)).toBe('MID'); // ≥0.3
    expect(dayLevelOf(4)).toBe('MID');
    expect(dayLevelOf(3)).toBe('LOW'); // >0
    expect(dayLevelOf(1)).toBe('LOW');
    expect(dayLevelOf(0)).toBe('FULL');
    expect(DAY_LEVEL_META.HIGH.label).toBe('여유');
    expect(DAY_LEVEL_META.FULL.label).toBe('마감');
  });
});

describe('periodDistribution / firstAvailableStarts', () => {
  it('오전(09-12)/오후(12-18)/저녁(18-22) 가용 분포와 첫 가용 시각을 파생한다', () => {
    const slots = Array.from({ length: 13 }, (_, index) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const start = `${pad(9 + index)}:00`;
      const end = `${pad(10 + index)}:00`;
      // 11·12시 차단, 18시 홀드(선택 가능하나 분포에선 가용 아님으로 볼지? — 가용=AVAILABLE만)
      if (index === 2 || index === 3) return { start, end, status: 'BLOCKED' as const, blockedBy: 'INTERNAL' as const };
      if (index === 9) return { start, end, status: 'PENDING_HOLD' as const };
      return { start, end, status: 'AVAILABLE' as const };
    });
    const distribution = periodDistribution(slots);
    expect(distribution).toEqual([
      { key: 'MORNING', label: '오전', range: '09–12', free: 2, total: 3 },
      { key: 'AFTERNOON', label: '오후', range: '12–18', free: 5, total: 6 },
      { key: 'EVENING', label: '저녁', range: '18–22', free: 3, total: 4 },
    ]);
    expect(firstAvailableStarts(slots, 3)).toEqual(['09:00', '10:00', '13:00']);
  });
});
```

- [ ] **Step 2: 실패 확인** 후 구현:

`bookingHome.ts`:

```ts
// 시설 선택 홈 파생 유틸(§2.2). 아이콘은 FE 매핑 — 크롤이 SoT 라 신규 시설은 폴백 아이콘.
import type { FacilityBookingWindow } from '@duing/types';

const FACILITY_ICON_RULES: [RegExp, string][] = [
  [/커뮤니티룸/, '🛋'],
  [/공동연습실/, '🎸'],
  [/빛광장/, '🎤'],
  [/자유광장/, '🎪'],
  [/웅지관/, '🏛'],
];
const FALLBACK_ICON = '🏢';

export function facilityIcon(roomName: string): string {
  const matched = FACILITY_ICON_RULES.find(([pattern]) => pattern.test(roomName));
  return matched ? matched[1] : FALLBACK_ICON;
}

export function windowRangeLabel(window: FacilityBookingWindow): string {
  const label = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;
  return `${label(window.bookableFrom)} ~ ${label(window.bookableUntil)}`;
}

const OPEN_HOUR = 9;
const CLOSE_HOUR = 22;

type ReservationSlice = { startTime: string; endTime: string };

/** 오늘 남은 슬롯(현재 시각 이후 시작) 중 예약이 덮지 않은 수. 영업 종료 후엔 null. */
export function todayFreeSlotCount(reservations: ReservationSlice[], now: Date): number | null {
  const firstRemainingHour = Math.max(OPEN_HOUR, now.getMinutes() > 0 || now.getSeconds() > 0
    ? now.getHours() + 1
    : now.getHours());
  if (firstRemainingHour >= CLOSE_HOUR) return null;
  let freeCount = 0;
  for (let hour = firstRemainingHour; hour < CLOSE_HOUR; hour += 1) {
    const covered = reservations.some((reservation) => {
      const startHour = Number(reservation.startTime.slice(0, 2));
      const endHour = Number(reservation.endTime.slice(0, 2));
      return startHour <= hour && hour < endHour;
    });
    if (!covered) freeCount += 1;
  }
  return freeCount;
}
```

**주의(구현자)**: `FacilityItem`의 예약 항목 실제 타입(`packages/types/src/facility.ts`)을 열어 시간 필드명을 확인하라 — `ReservationSlice`는 구조적 최소 계약이므로 실제 필드명이 다르면(예: `start`/`end`) 이 타입과 테스트·호출부를 실제 필드명으로 맞춘다(파생 로직은 동일).

`bookingCalendar.ts` 추가:

```ts
export type DayLevel = 'HIGH' | 'MID' | 'LOW' | 'FULL';

const TOTAL_SLOTS = 13;

export function dayLevelOf(availableSlotCount: number): DayLevel {
  const ratio = availableSlotCount / TOTAL_SLOTS;
  if (ratio >= 0.6) return 'HIGH';
  if (ratio >= 0.3) return 'MID';
  if (availableSlotCount > 0) return 'LOW';
  return 'FULL';
}

export const DAY_LEVEL_META: Record<DayLevel, { label: string; barClass: string; textClass: string }> = {
  HIGH: { label: '여유', barClass: 'bg-sage', textClass: 'text-ink' },
  MID: { label: '보통', barClass: 'bg-warm', textClass: 'text-[#8E6620]' },
  LOW: { label: '혼잡', barClass: 'bg-coral', textClass: 'text-coral' },
  FULL: { label: '마감', barClass: 'bg-graysoft', textClass: 'text-charcoal-3' },
};

export type PeriodDistribution = {
  key: 'MORNING' | 'AFTERNOON' | 'EVENING';
  label: string;
  range: string;
  free: number;
  total: number;
};

export function periodDistribution(slots: BookingAvailabilitySlot[]): PeriodDistribution[] {
  const periods: { key: PeriodDistribution['key']; label: string; range: string; fromHour: number; toHour: number }[] = [
    { key: 'MORNING', label: '오전', range: '09–12', fromHour: 9, toHour: 12 },
    { key: 'AFTERNOON', label: '오후', range: '12–18', fromHour: 12, toHour: 18 },
    { key: 'EVENING', label: '저녁', range: '18–22', fromHour: 18, toHour: 22 },
  ];
  return periods.map(({ key, label, range, fromHour, toHour }) => {
    const inPeriod = slots.filter((slot) => {
      const hour = Number(slot.start.slice(0, 2));
      return fromHour <= hour && hour < toHour;
    });
    return {
      key, label, range,
      free: inPeriod.filter((slot) => slot.status === 'AVAILABLE').length,
      total: inPeriod.length,
    };
  });
}

export function firstAvailableStarts(slots: BookingAvailabilitySlot[], max: number): string[] {
  return slots.filter((slot) => slot.status === 'AVAILABLE').slice(0, max).map((slot) => slot.start);
}
```

- [ ] **Step 3: 통과 + Commit**

```bash
git add frontend/apps/web
git commit -m "feat(frontend): 예약 홈 파생 유틸 — 아이콘 매핑·창 라벨·오늘 가용·레벨·시간대 분포"
```

---

### Task 3: 시설 선택 홈 뷰 — 카드 그리드 + 페이지 2뷰 재편

**Files:**
- Create: `_components/booking/FacilityHomeCard.tsx`
- Modify: `_pages/FacilityBookingPage.tsx`(2뷰 재편 — 자동 첫 시설 선택 제거)
- Test: `booking-components.test.tsx`에 카드 렌더 2건

**Interfaces:**
- Consumes: Task 1 `useBookingWindowQuery`, Task 2 유틸, 기존 usage 쿼리·MyBookingsChip
- Produces: `FacilityHomeCard({ facility, windowLabel, onSelect })` — facility는 usage의 `FacilityItem`

- [ ] **Step 1: FacilityHomeCard**

```tsx
'use client';

import type { FacilityItem } from '@duing/types';
import { facilityIcon, todayFreeSlotCount } from '../../_lib/bookingHome';

type Props = {
  facility: FacilityItem;
  windowLabel: string | null;
  onSelect: (facilityId: number) => void;
};

export function FacilityHomeCard({ facility, windowLabel, onSelect }: Props) {
  const freeCount = todayFreeSlotCount(facility.reservations, new Date());
  return (
    <button
      type="button"
      onClick={() => onSelect(facility.id)}
      className="flex w-full flex-col overflow-hidden rounded-xl border border-line bg-paper text-left motion-safe:transition-shadow hover:shadow-md"
    >
      <div className="relative grid h-24 place-items-center bg-gradient-to-br from-sage-soft to-sage-mist">
        <span aria-hidden className="text-4xl">{facilityIcon(facility.roomName)}</span>
        {facility.isUsingNow && (
          <span className="absolute right-3 top-3 rounded-full bg-paper/90 px-2 py-0.5 text-[11px] font-bold text-coral">
            지금 사용중
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="text-base font-bold text-ink-deep">{facility.roomName}</h3>
        {facility.location && <p className="text-xs text-charcoal-3">{facility.location}</p>}
        {windowLabel && (
          <p className="text-xs text-charcoal-2">
            예약 가능 <span className="font-bold text-ink">{windowLabel}</span>
          </p>
        )}
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-charcoal-3">오늘 남은 시간</span>
            <span className="font-mono font-bold text-ink">
              {freeCount === null ? '오늘 마감' : freeCount === 0 ? '없음' : `${freeCount}칸`}
            </span>
          </div>
          <div className="flex gap-[2px]" aria-hidden>
            {Array.from({ length: 10 }).map((_, index) => (
              <span
                key={index}
                className={`h-1.5 flex-1 rounded-sm ${
                  freeCount !== null && index < Math.min(10, freeCount) ? 'bg-sage' : 'bg-graysoft'
                }`}
              />
            ))}
          </div>
        </div>
        <span className="btn btn-secondary mt-3 w-full justify-center">날짜 보기 →</span>
      </div>
    </button>
  );
}
```

(카드 전체가 버튼이므로 내부 CTA는 시각적 span. `sage-soft`/`sage-mist` 토큰은 tailwind config에 실존 — 확인 후 사용.)

- [ ] **Step 2: 페이지 2뷰 재편** — `FacilityBookingPage.tsx` 수정 규칙(파일을 열어 현재 구조 위에서 최소 변경):
  1. **자동 첫 시설 선택 제거**: `const effectiveFacilityId = facilityId ?? chipFacilities[0]?.id ?? undefined;` → `const effectiveFacilityId = facilityId ?? undefined;`
  2. `const windowQuery = useBookingWindowQuery();` 추가, `const windowLabel = windowQuery.data ? windowRangeLabel(windowQuery.data) : null;`
  3. usage 성공 분기에서 **뷰 분기**: `effectiveFacilityId === undefined`이면 홈 뷰 — 헤더(아이브로 "RESERVE · 시설 예약" + h1 "예약할 시설을 골라보세요" + 안내문 "학교 예약 현황을 반영해요. 비어 있는 시간만 신청할 수 있어요." + 창 배지) + `MyBookingsChip` + 카드 그리드:

```tsx
<ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {(usageQuery.data.facilities ?? []).map((facility) => (
    <li key={facility.id}>
      <FacilityHomeCard facility={facility} windowLabel={windowLabel} onSelect={selectFacility} />
    </li>
  ))}
</ul>
```

  4. 캘린더 뷰(기존 콘텐츠)는 `effectiveFacilityId !== undefined`일 때만. `selectFacility`는 기존 그대로(URL 동기화 포함). **홈 복귀 핸들러** 추가: `const goHome = () => { setFacilityId(null); closePanel(); syncUrl(null, null); };` — closePanel이 syncUrl(effectiveFacilityId, null)을 호출하므로 순서 주의(goHome에서는 closePanel의 syncUrl 이후 다시 `syncUrl(null, null)` — 혹은 closePanel을 facilityId 인자화. 최소 변경: goHome에서 상태 리셋을 직접 나열).
  5. `chipFacilities` 파생은 콘텍스트 바(Task 4)가 소비하므로 유지. `FacilityChips` 렌더는 Task 4에서 교체될 때까지 캘린더 뷰에 남겨둔다(이 태스크에서는 컴파일 유지 목적 — Task 4가 제거).
  6. 빈 시설(`facilities.length === 0`) 문구는 홈 뷰에서 유지.

- [ ] **Step 3: 테스트 2건** — `booking-components.test.tsx`: 카드가 아이콘·위치·창 라벨·"오늘 마감"(늦은 now 주입 불가 — todayFreeSlotCount가 내부 `new Date()`라 컴포넌트 테스트에선 `vi.useFakeTimers()+vi.setSystemTime`으로 고정) 렌더 + onSelect 호출. **주의**: fake timer 사용 시 `afterEach`에서 `vi.useRealTimers()`.

- [ ] **Step 4: 검증 + Commit** — `pnpm --filter web test -- --run test/facilities && pnpm typecheck` (페이지 msw 스위트는 홈 뷰 도입으로 깨질 수 있음 — **깨진 시나리오는 이 태스크에서 최소 수정**(시설 자동 선택 전제 제거: 각 시나리오 시작에 카드 클릭 추가 or 딥링크 `mockSearchParams.value='facilityId=1'` 세팅 — 후자가 최소), 전면 개편은 Task 6).

```bash
git add frontend/apps/web
git commit -m "feat(frontend): 시설 선택 홈 뷰 — 카드 그리드·2뷰 재편·자동 선택 제거"
```

---

### Task 4: 캘린더 히트맵 + 콘텍스트 바 + 창 가드

**Files:**
- Create: `_components/booking/FacilityContextBar.tsx`
- Delete: `_components/booking/FacilityChips.tsx`(+ 관련 테스트 케이스 갱신)
- Modify: `BookingCalendar.tsx`, `_pages/FacilityBookingPage.tsx`
- Test: `booking-components.test.tsx` 갱신(칩 테스트→콘텍스트 바, 캘린더 레벨·창 가드)

**Interfaces:**
- Produces: `FacilityContextBar({ facilities, selectedId, onSelect, onGoHome })`, `BookingCalendar` props 확장: `+ onOutOfWindowSelect: (iso: string) => void`, `+ windowLabel: string | null`

- [ ] **Step 1: FacilityContextBar** — 선택 시설 카드형 버튼(클릭=홈 복귀) + 다른 시설 퀵 칩:

```tsx
'use client';

import { facilityIcon } from '../../_lib/bookingHome';

type ContextFacility = { id: number; roomName: string; location: string | null };

type Props = {
  facilities: ContextFacility[];
  selectedId: number;
  onSelect: (facilityId: number) => void;
  onGoHome: () => void;
};

export function FacilityContextBar({ facilities, selectedId, onSelect, onGoHome }: Props) {
  const selected = facilities.find((facility) => facility.id === selectedId);
  const others = facilities.filter((facility) => facility.id !== selectedId).slice(0, 5);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onGoHome}
        aria-label={`${selected?.roomName ?? '시설'} — 다른 시설 보기`}
        className="flex items-center gap-2.5 rounded-xl border-[1.5px] border-ink bg-paper py-1.5 pl-1.5 pr-3 motion-safe:transition-colors hover:bg-cream/60"
      >
        <span aria-hidden className="grid h-9 w-9 place-items-center rounded-lg bg-sage-mist text-lg">
          {selected ? facilityIcon(selected.roomName) : '🏢'}
        </span>
        <span className="text-left">
          <span className="block text-sm font-bold text-ink-deep">{selected?.roomName}</span>
          {selected?.location && <span className="block text-[11px] text-charcoal-3">{selected.location}</span>}
        </span>
        <span aria-hidden className="text-xs text-charcoal-3">▾</span>
      </button>
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
        {others.map((facility) => (
          <button
            key={facility.id}
            type="button"
            onClick={() => onSelect(facility.id)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-medium text-charcoal-2 hover:border-sage"
          >
            <span aria-hidden>{facilityIcon(facility.roomName)}</span>
            {facility.roomName}
          </button>
        ))}
        <button
          type="button"
          onClick={onGoHome}
          className="inline-flex shrink-0 items-center rounded-full border border-dashed border-line bg-paper px-3 py-1.5 text-xs text-charcoal-3 hover:border-sage"
        >
          전체 보기
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: BookingCalendar 히트맵 + 창 가드** — 수정 규칙(파일 실물 기준 최소 변경):
  - props에 `windowLabel: string | null`, `onOutOfWindowSelect: (iso: string) => void` 추가.
  - 헤더 아래 창 배지 + 범례 줄 추가:

```tsx
<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
  {windowLabel && (
    <span className="rounded-full bg-sage-mist px-3 py-1 text-xs font-bold text-ink">
      예약 가능 기간 {windowLabel}
    </span>
  )}
  <span className="flex gap-3 text-[11px] text-charcoal-3">
    {(['HIGH', 'MID', 'LOW', 'FULL'] as const).map((level) => (
      <span key={level} className="inline-flex items-center gap-1">
        <span aria-hidden className={`h-2 w-2 rounded-[2px] ${DAY_LEVEL_META[level].barClass}`} />
        {DAY_LEVEL_META[level].label}
      </span>
    ))}
  </span>
</div>
```

  - 셀 분기 재정의: `isPastOrUnknown = day === undefined || day.dayStatus === 'PAST' || cell.iso < todayIso`(기존 disabled 유지), **창 밖 미래**(`!withinRange && !isPastOrUnknown`)는 `disabled` 대신 `aria-disabled` + `onClick={() => onOutOfWindowSelect(cell.iso)}` + 디밍 스타일(`opacity-45`), 창 안(`withinRange && !isPastOrUnknown`)만 기존 `onSelectDate`.
  - 셀 콘텐츠: "N칸" 텍스트 → 레벨 미니바(8칸) + 레벨 라벨:

```tsx
{selectable && day && (
  <>
    <span aria-hidden className="mt-auto flex w-full gap-[1.5px] px-1">
      {Array.from({ length: 8 }).map((_, barIndex) => {
        const filled = barIndex < Math.round((day.availableSlotCount / 13) * 8);
        return (
          <span
            key={barIndex}
            className={`h-1 flex-1 rounded-[1px] ${
              filled ? (selected ? 'bg-sage' : DAY_LEVEL_META[dayLevelOf(day.availableSlotCount)].barClass) : selected ? 'bg-cream/30' : 'bg-graysoft'
            }`}
          />
        );
      })}
    </span>
    <span className={`text-[10px] font-bold ${selected ? 'text-cream/85' : DAY_LEVEL_META[dayLevelOf(day.availableSlotCount)].textClass}`}>
      {DAY_LEVEL_META[dayLevelOf(day.availableSlotCount)].label}
    </span>
  </>
)}
```

  - 접근성 이름은 레벨 반영: `aria-label={\`${cell.day}일 ${DAY_LEVEL_META[...].label}\`}`(창 밖은 `${cell.day}일 예약 기간 아님`).

- [ ] **Step 3: 페이지 배선** — `FacilityChips` 렌더 제거(파일 삭제), `FacilityContextBar` 배선(`onGoHome={goHome}`), **기본 월 = 창 월**: `yearMonth` 초기값 로직 교체 —

```tsx
const windowMonth = windowQuery.data?.bookableFrom.slice(0, 7) ?? null;
const [yearMonthOverride, setYearMonthOverride] = useState<string | null>(() =>
  selectedDate !== null ? selectedDate.slice(0, 7) : null,
);
const yearMonth = yearMonthOverride ?? windowMonth ?? currentMonth;
```

(`changeMonth`는 `setYearMonthOverride(shiftYearMonth(yearMonth, delta))` — override가 null이어도 파생 `yearMonth`(창 월 폴백)를 기준으로 이동하도록 **파생값을 인자로 계산**한다(함수형 업데이트의 null 처리 불필요). `selectDate`의 월 동기화도 동일하게 `setYearMonthOverride(iso.slice(0, 7))`. 당월⇄익월 캡은 기존 `canPrev/canNext` 파생 유지 — `yearMonth !== currentMonth`/`===`.)
  - **창 밖 가드 2종**: ① `onOutOfWindowSelect = (iso) => addToast(\`현재 예약 가능한 기간이 아니에요${windowLabel ? \` (\${windowLabel})\` : ''}\`, { variant: 'error' })` (`useToast` 페이지에 도입) ② 딥링크 date 창 밖 정리 이펙트(selectionInvalid 전례와 동일 패턴):

```tsx
const selectedDateOutOfWindow =
  selectedDate !== null &&
  windowQuery.data !== undefined &&
  !isWithinBookable(selectedDate, windowQuery.data.bookableFrom, windowQuery.data.bookableUntil);
useEffect(() => {
  if (!selectedDateOutOfWindow) return;
  setSelectedDate(null);
  setSelection(null);
  setStep('slots');
  addToast(`현재 예약 가능한 기간이 아니에요${windowLabel ? ` (${windowLabel})` : ''}`, { variant: 'error' });
}, [selectedDateOutOfWindow]);
```

(availability의 bookableFrom/Until과 windowQuery는 동일 정책 산출 — 셀 게이팅은 기존 availability 메타 그대로 두고, 배지·토스트·딥링크 가드만 windowQuery 사용.)

- [ ] **Step 4: 테스트 갱신** — 칩 테스트를 콘텍스트 바(선택 시설 버튼·퀵 칩·전체 보기·onGoHome)로 교체, 캘린더 테스트를 레벨 라벨("여유"/"마감")·창 밖 셀 `aria-disabled`+`onOutOfWindowSelect` 호출로 갱신.

- [ ] **Step 5: 검증 + Commit**

```bash
git add frontend/apps/web
git commit -m "feat(frontend): 캘린더 히트맵·콘텍스트 바·반월 창 가드(배지·토스트·딥링크 정리)"
```

---

### Task 5: 패널·폼·성공 화면 업그레이드

**Files:**
- Create: `PanelSummaryCard.tsx`, `PanelStepIndicator.tsx`
- Modify: `BookingPanel.tsx`, `DaySlotList.tsx`, `BookingForm.tsx`
- Rewrite: `BookingSuccess.tsx`(세로 타임라인)
- Test: `booking-components.test.tsx` 갱신

**Interfaces:**
- Produces: `PanelSummaryCard({ day, onQuickSelect })`, `PanelStepIndicator({ step })`, `BookingSuccess({ facilityName, date, range, overlappingPendingCount, submittedAt, manageHref?, onExploreOther, onClose })` — **submittedAt·onExploreOther 신규**(BookingForm→Panel→Page 배선: onSubmitted 콜백에서 페이지가 `new Date()` 캡처해 `submittedAt` state, `onExploreOther`=goHome)

- [ ] **Step 1: PanelSummaryCard** — 다크 요약(ink 배경, 날짜+레벨 뱃지+분포 바+퀵 시간 칩):

```tsx
'use client';

import type { BookingDayAvailability } from '@duing/types';
import { bookingDateLabel } from '@/app/_lib/bookingDisplay';
import {
  DAY_LEVEL_META,
  dayLevelOf,
  firstAvailableStarts,
  periodDistribution,
} from '../../_lib/bookingCalendar';

type Props = {
  day: BookingDayAvailability;
  onQuickSelect: (slotStart: string) => void;
};

export function PanelSummaryCard({ day, onQuickSelect }: Props) {
  const level = dayLevelOf(day.availableSlotCount);
  const quickStarts = firstAvailableStarts(day.slots, 3);
  const remaining = day.availableSlotCount - quickStarts.length;
  return (
    <div className="rounded-xl bg-ink p-4 text-cream">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold tracking-wide text-sage">선택한 날짜</p>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${level === 'FULL' ? 'bg-graysoft text-charcoal-3' : 'bg-sage text-ink'}`}>
          {DAY_LEVEL_META[level].label}
        </span>
      </div>
      <p className="mt-1 font-display text-xl">{bookingDateLabel(day.date)}</p>

      <div className="mt-3 space-y-1.5">
        {periodDistribution(day.slots).map((period) => (
          <div key={period.key} className="flex items-center gap-2 text-[11px]">
            <span className="w-7 font-bold text-cream/90">{period.label}</span>
            <span className="w-11 font-mono text-cream/50">{period.range}</span>
            <span aria-hidden className="flex flex-1 gap-[2px]">
              {Array.from({ length: period.total }).map((_, index) => (
                <span key={index} className={`h-1.5 flex-1 rounded-[2px] ${index < period.free ? 'bg-sage' : 'bg-cream/15'}`} />
              ))}
            </span>
            <span className="w-8 text-right font-mono">{period.free}/{period.total}</span>
          </div>
        ))}
      </div>

      {quickStarts.length > 0 && (
        <div className="mt-3 border-t border-cream/15 pt-3">
          <p className="mb-1.5 text-[11px] text-cream/60">바로 신청 가능한 시간</p>
          <div className="flex gap-1.5">
            {quickStarts.map((start) => (
              <button
                key={start}
                type="button"
                onClick={() => onQuickSelect(start)}
                className="flex-1 rounded-lg bg-cream/15 py-1.5 font-mono text-xs font-bold text-cream hover:bg-cream/25"
              >
                {start}
              </button>
            ))}
            {remaining > 0 && <span className="grid w-9 place-items-center rounded-lg bg-cream/10 text-xs text-cream/70">+{remaining}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: PanelStepIndicator** — 미니 3단계(시간 선택→신청 확인→승인 대기):

```tsx
import type { PanelStep } from './BookingPanel';

const STEP_LABELS = ['시간 선택', '신청 확인', '승인 대기'] as const;

export function PanelStepIndicator({ step }: { step: PanelStep }) {
  const activeIndex = step === 'slots' ? 0 : step === 'form' ? 1 : 2;
  return (
    <ol className="flex items-center gap-1.5 text-[11px]" aria-label="예약 진행 단계">
      {STEP_LABELS.map((label, index) => (
        <li key={label} className="flex items-center gap-1.5">
          <span
            className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold ${
              index < activeIndex ? 'bg-sage-mist text-ink' : index === activeIndex ? 'bg-ink text-cream' : 'border border-line text-charcoal-3'
            }`}
          >
            {index + 1}
          </span>
          <span className={index === activeIndex ? 'font-bold text-ink-deep' : 'text-charcoal-3'}>{label}</span>
          {index < STEP_LABELS.length - 1 && <span aria-hidden className="h-px w-3 bg-line" />}
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 3: BookingSuccess 재작성** — 세로 타임라인(F5, 문구 통일·시간 암시 금지):

```tsx
'use client';

import Link from 'next/link';
import { toRoute } from '@/app/_lib/route';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { rangeLabel } from '../../_lib/bookingCalendar';

type TimelineState = 'done' | 'current' | 'todo';

type Props = {
  facilityName: string;
  date: string;
  range: SlotRange;
  overlappingPendingCount: number;
  submittedAt: string; // 'HH:mm' — 페이지가 제출 시각 캡처
  manageHref?: `/${string}`;
  onExploreOther: () => void;
  onClose: () => void;
};

const TIMELINE: { title: string; detail: string; state: TimelineState }[] = [
  { title: '신청 접수', detail: '', state: 'done' }, // detail 은 렌더 시 submittedAt 로 대체
  { title: '관리자 승인 대기', detail: '관리자 승인 후 학교 반영 절차가 진행됩니다.', state: 'current' },
  { title: '학교 예약 시스템 반영', detail: '승인 후 진행돼요.', state: 'todo' },
  { title: '예약 확정', detail: '학교 반영 확인 후 확정돼요.', state: 'todo' },
];

export function BookingSuccess({
  facilityName, date, range, overlappingPendingCount, submittedAt, manageHref, onExploreOther, onClose,
}: Props) {
  return (
    <div className="space-y-4">
      <div role="status" className="rounded-md border border-line bg-cream/60 px-3 py-3 text-sm">
        <p className="font-medium text-ink-deep">{facilityName} · {date} · {rangeLabel(range)}</p>
        <p className="mt-1 text-charcoal-2">예약 신청이 접수됐어요.</p>
        {overlappingPendingCount > 0 && (
          <p className="mt-1 text-xs text-coral">
            같은 시간에 다른 신청 {overlappingPendingCount}건이 함께 대기 중이에요 — 승인은 한 건에만 돼요.
          </p>
        )}
      </div>

      <ol aria-label="예약 진행 단계">
        {TIMELINE.map((item, index) => {
          const isLast = index === TIMELINE.length - 1;
          return (
            <li key={item.title} className="flex gap-3">
              <span className="flex flex-col items-center">
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                    item.state === 'done' ? 'bg-ink text-cream'
                    : item.state === 'current' ? 'border-2 border-warm bg-[#FBEFD7] text-[#8E6620]'
                    : 'bg-graysoft text-charcoal-3'
                  }`}
                >
                  {item.state === 'done' ? '✓' : index + 1}
                </span>
                {!isLast && <span aria-hidden className={`w-[2px] flex-1 ${item.state === 'done' ? 'bg-ink' : 'bg-line'}`} />}
              </span>
              <div className={isLast ? '' : 'pb-4'}>
                <p className={`text-sm font-bold ${item.state === 'current' ? 'text-ink-deep' : item.state === 'done' ? 'text-charcoal' : 'text-charcoal-3'}`}>
                  {item.title}
                </p>
                <p className="mt-0.5 text-xs text-charcoal-3">
                  {index === 0 ? `${date} ${submittedAt} 접수` : item.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="rounded-md bg-sage-mist px-3 py-2 text-xs leading-relaxed text-ink-deep">
        같은 시간에 다른 신청이 들어올 수 있어요 — 승인은 한 건에만 돼요.
      </p>

      <div className="flex flex-col gap-2">
        {manageHref && (
          <Link href={toRoute(manageHref)} className="btn btn-primary w-full">내 예약에서 확인</Link>
        )}
        <button type="button" className="btn btn-secondary w-full" onClick={onExploreOther}>다른 시설 예약하기</button>
        <button type="button" className="btn btn-ghost w-full" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: BookingPanel·DaySlotList·BookingForm 수정 규칙**(실물 기준 최소 변경):
  - `BookingPanel`: 헤더 아래 `<PanelStepIndicator step={step} />`, slots 뷰 상단에 `<PanelSummaryCard day={day} onQuickSelect={onToggleSlot} />`(일간 뷰일 때만), CTA 위 선택 요약 박스 추가(선택 시): `<div className="flex items-center gap-2 rounded-lg bg-sage-mist px-3 py-2"><span className="font-mono text-base font-bold text-ink-deep">{rangeLabel(selection)}</span><span className="ml-auto rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-cream">{시간수}시간</span></div>`(시간수 = `Number(selection.end.slice(0,2)) - Number(selection.start.slice(0,2))`). props에 `submittedAt`/`onExploreOther` 통과 배선.
  - CTA 아래 안내문을 통일 문구로: `신청 후 관리자 승인을 거쳐 확정돼요.` (시간 암시 금지).
  - `DaySlotList`: 행 패딩·라운드 업(`rounded-xl px-3.5 py-2.5`), 시간 `font-mono text-[13px] font-bold`, 선택 행에 체크 표시(`✓` 텍스트 or 기존 스타일 유지) — 시맨틱 무변경.
  - `BookingForm`: 섹션 카드화 — 요약 블록 위에 `<p className="text-xs font-bold text-charcoal-3">사용 정보</p>`, 하단 안내문을 통일 문구로. `onSubmitted(result, clubId)` 시그니처 유지.
  - 페이지: `const [submittedAt, setSubmittedAt] = useState<string | null>(null);` — onSubmitted에서 `const now = new Date(); setSubmittedAt(\`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}\`);`, closePanel·selectDate에서 리셋, Panel에 전달. `onExploreOther={goHome}`.

- [ ] **Step 5: 테스트 갱신 + Commit** — booking-components: BookingSuccess(타임라인 문구·CTA 3종·"보통 1~2일" 부재 단언), PanelSummaryCard(분포·퀵 칩 onQuickSelect) 추가.

```bash
git add frontend/apps/web
git commit -m "feat(frontend): 패널 요약 카드·스텝 인디케이터·성공 타임라인 — 승인 문구 통일"
```

---

### Task 6: 페이지 msw 스위트 반월 창 정합 + 신규 시나리오

**Files:**
- Test: `test/facilities/facility-booking-page.test.tsx` 대폭 갱신

- [ ] **Step 1: 픽스처 반월 미러** — `TODAY_ISO` 기반 창 파생(백엔드 정책 미러 — 테스트 주석에 "pivot 15, 백엔드 HalfMonthBookingWindowPolicy 미러" 명시):

```ts
function halfMonthWindow(todayIso: string): { from: string; until: string } {
  const [year, month, day] = todayIso.split('-').map(Number);
  const pad = (value: number) => String(value).padStart(2, '0');
  if ((day ?? 1) <= 15) {
    const lastDay = new Date(year ?? 1970, month ?? 1, 0).getDate();
    return { from: `${year}-${pad(month ?? 1)}-16`, until: `${year}-${pad(month ?? 1)}-${pad(lastDay)}` };
  }
  const nextMonthDate = new Date(year ?? 1970, month ?? 1, 1); // month는 1-based → Date(y, m, 1)=익월 1일
  const nextYear = nextMonthDate.getFullYear();
  const nextMonth = nextMonthDate.getMonth() + 1;
  return { from: `${nextYear}-${pad(nextMonth)}-01`, until: `${nextYear}-${pad(nextMonth)}-15` };
}
const WINDOW = halfMonthWindow(TODAY_ISO);
const WINDOW_MONTH = WINDOW.from.slice(0, 7);
```

- makeAvailability: `yearMonth = WINDOW_MONTH`, `bookableFrom/Until = WINDOW`, 혼합 슬롯 날짜 = `WINDOW.from`(항상 미래·창 내). days는 창 월 전체(창 밖 날짜도 AVAILABLE 데이터 — 페이지가 게이팅). availability 핸들러는 요청 `yearMonth` 파라미터를 읽어 해당 월 응답(기본 월=창 월 검증용).
- 신규 핸들러: `http.get('*/facilities/booking-window', () => ok({ bookableFrom: WINDOW.from, bookableUntil: WINDOW.until }))`.
- 시나리오 전면 갱신: ① 홈 뷰 렌더(카드·창 라벨) + 카드 클릭 → 캘린더 뷰(기본 월=창 월 — 캘린더 제목 단언) ② 딥링크 `facilityId=1` → 캘린더 직행 ③ 창 첫날 셀 클릭 → 패널(슬롯 상태 3종 + 요약 카드 분포) ④ 연속 선택 → CTA ⑤ 신청 성공 → 타임라인("관리자 승인 대기"·"보통" 문구 부재) + "다른 시설 예약하기" 클릭 → 홈 뷰 복귀 ⑥ **창 밖 미래 셀 클릭 → 토스트 문구+기간** ⑦ 딥링크 `date=창밖` → 패널 미오픈+토스트 ⑧ 홀드 경고 ⑨ 비로그인 ⑩ 409 후 선택 정리(기존) ⑪ 폼 에러(기존 시나리오 7) — 기존 단언 자산 최대 재사용.
- 주의: 시나리오들이 날짜 셀을 `WINDOW.from` 일자 라벨로 클릭(기존 TODAY_DAY_LABEL 대체). MyBookingsChip·managed 핸들러 등 기존 기본 핸들러 유지.

- [ ] **Step 2: 전체 facilities 스위트 green + Commit**

```bash
git add frontend/apps/web
git commit -m "test(frontend): 예약 홈 통합 테스트 반월 창 정합 + 홈 뷰·창 가드 시나리오"
```

---

### Task 7: 전체 검증 + 실브라우저 QA (컨트롤러)

- [ ] CI 4종(`pnpm lint/typecheck/build(env 주입)/test`) 전부 exit 0.
- [ ] 실브라우저 QA: 홈 그리드(카드·창 라벨·오늘 남은 시간) → 시설 선택 → 캘린더(기본 월=창 월·히트맵·배지) → 창 밖 셀 토스트 → 슬롯 선택 → 요약 카드 퀵 칩 → 폼 → (제출은 dev DB PENDING 생성 — 무해) 성공 타임라인 → "다른 시설 예약하기" 홈 복귀. 모바일 390px 시트. 콘솔 클린. `/facilities/1` redirect·딥링크 복원.
- [ ] `git status` clean → Fable whole-branch 리뷰(위험 관점: 창 가드 우회·정책 미러 드리프트·문구 정책) → 픽스 웨이브 → push·PR(base = PR-0 브랜치).

---

## Out of Scope

- manage 리스킨(PR-B — 문구 통일 포함), 시설 검색/카테고리, 시설 메타 확장, 폼 필드 확장, mine 슬롯, 인접 시간 추천
- 주간 뷰 셀 탭 선택 §9.5 잔여(기존 이연 유지 — 이 PR은 주간 뷰 무변경)
