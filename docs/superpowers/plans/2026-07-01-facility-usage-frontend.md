# Facility Usage Frontend (/facilities) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Ship the public Next.js App Router `/facilities` page (list + `[facilityId]` detail with hourly timeline) that consumes the read-only backend API contract in spec §7 (`GET /api/v1/facilities`, `/facilities/usage?yearMonth=`, `/facilities/{facilityId}?yearMonth=`).

**Architecture:** Follows the codebase's strict layering: domain types in `packages/types` → ky-based API methods in `packages/api` → TanStack Query hooks in `packages/hooks` → route/layout/components in `apps/web/app/facilities`. The backend already exists per contract (separate plan); the frontend only reads it. All time-sensitive display (last-updated label, current-time indicator) is computed as Asia/Seoul wall-clock via `Intl.DateTimeFormat({ timeZone: 'Asia/Seoul' })` so it is deterministic under CI/prod UTC and matches the backend's `+09:00` payloads.

**Tech Stack:** Next.js 15 App Router (React 19), TypeScript, pnpm workspaces, `ky` HTTP client, TanStack Query v5, Tailwind (design tokens `ink #1F4A36` / `ink-soft #2E6149`, `.duing` scope auto-applies `bg-cream`), Vitest + Testing Library (jsdom).

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `frontend/packages/types/src/facility.ts` | Create | Domain types: `ReservationStatus`, `DataSource`, `ReservationSlot`, `FacilityItem`, `FacilitySummary`, `FacilityUsageResponse`, `FacilityDetailResponse` — 1:1 with spec §7. |
| `frontend/packages/types/src/index.ts` | Modify | Re-export `./facility`. |
| `frontend/packages/api/src/client.ts` | Modify | Add `facilities.list/usage/get` to `DuingApiClient` type + implementation; import new facility types. |
| `frontend/packages/hooks/src/facilityQueryKeys.ts` | Create | Query-key factory for facility usage/detail caches. |
| `frontend/packages/hooks/src/facilities.ts` | Create | `useFacilityUsageQuery(yearMonth?)`, `useFacilityDetailQuery(facilityId, yearMonth?)`. |
| `frontend/packages/hooks/src/index.ts` | Modify | Export the two hooks + `facilityQueryKeys`. |
| `frontend/apps/web/app/facilities/_lib/facilityTimeline.ts` | Create | Pure helpers: axis constants, `buildTimelineSegments`, `timelineIndicatorPct`, `seoulMinutesOfDay`, `seoulDateIso`, `daysInMonth`, `formatLastUpdated`. |
| `frontend/apps/web/app/facilities/_components/FacilityUpdateBanner.tsx` | Create | "마지막 업데이트 …" line + conditional stale banner (props-only, no hooks). |
| `frontend/apps/web/app/facilities/_components/FacilityCard.tsx` | Create | List card: status dot, roomName, location, current/next reservation line, 상세보기 link. |
| `frontend/apps/web/app/facilities/_components/FacilityTimeline.tsx` | Create | Hourly 09..22 track, reserved segments (`#2E6149`), current-time indicator, hover/click detail, date selector. |
| `frontend/apps/web/app/facilities/_pages/FacilityExplorePage.tsx` | Create | Client list page: `useFacilityUsageQuery`, banner + card grid. |
| `frontend/apps/web/app/facilities/page.tsx` | Create | Server route wrapping `FacilityExplorePage` in `<Suspense>`. |
| `frontend/apps/web/app/facilities/layout.tsx` | Create | Wraps children ONCE in `.duing min-h-dvh bg-cream` + `ExploreNav`. |
| `frontend/apps/web/app/facilities/[facilityId]/page.tsx` | Create | Client detail route (`use(params)`): hero + banner + `FacilityTimeline`. |
| `frontend/apps/web/components/duing/Icon.tsx` | Modify | Add `Building` icon (nav glyph). |
| `frontend/apps/web/app/_components/BottomNav.tsx` | Modify | Add `시설 → /facilities` tab; hide bar on `/facilities/{id}` detail. |
| `frontend/apps/web/app/_components/HomeNav.tsx` | Modify | Add desktop `시설` link. |
| `frontend/apps/web/app/_components/ExploreNav.tsx` | Modify | Add `시설` nav item + include `facilities` in detail-focus hide regex. |
| `frontend/apps/web/test/facilities/facility-timeline-lib.test.ts` | Create | Unit tests for the pure `_lib/facilityTimeline.ts` helpers. |
| `frontend/apps/web/test/facilities/facility-update-banner.test.tsx` | Create | Stale-banner conditional + formatted-timestamp render tests. |
| `frontend/apps/web/test/facilities/facility-card.test.tsx` | Create | Card status/current/next/available + link render tests. |
| `frontend/apps/web/test/facilities/facility-timeline.test.tsx` | Create | Timeline segment/date-switch/click render tests (fixed Date). |

**Conventions honored throughout:** `type` (never `interface`); no `any`/`as` (except the isolated `toRoute`); no `useEffect` data-fetching (TanStack Query only); no direct `ky`/`fetch` in components; public endpoints let `readToken()` return null so no manual header handling; `.duing` wrapped exactly once; inline hex for timeline colors (no arbitrary-value Tailwind). Commits are Conventional Commits, Korean bodies OK, **no** Claude attribution lines. **No push / no PR steps** — the plan stops at local commits.

---

### Task 1: Facility domain types

**Files:**
- Create: `frontend/packages/types/src/facility.ts`
- Modify: `frontend/packages/types/src/index.ts`

**Steps:**

- [ ] Create `frontend/packages/types/src/facility.ts` with the exact contents (mirrors `packages/types/src/publicActivity.ts` comment style; matches spec §7 field names exactly, `room_seq` intentionally absent):

```ts
// 학생회관 시설 이용현황 — 백엔드 캐시 응답과 1:1 매칭(설계문서 §7).
// 시각 문자열은 백엔드가 KST(+09:00) wall-clock 으로 내려준다. room_seq(학교 내부키)는 응답에 없다.

// 예약 상태 — 백엔드가 Asia/Seoul now 기준으로 조회 시 계산해 응답에만 싣는다(§6.3, 미영속).
export type ReservationStatus = 'UPCOMING' | 'USING' | 'FINISHED';

// 캐시 응답 출처(§7.2, enum 확장 가능).
// CACHE: 캐시만 서빙 / LIVE_FETCH: 이번 요청이 온디맨드 fetch 수행 / STALE_CACHE: 라이브 실패 후 옛 캐시.
export type DataSource = 'CACHE' | 'LIVE_FETCH' | 'STALE_CACHE';

// 병합 완료된 예약 슬롯. start/end 는 'HH:mm'(KST wall-clock).
export type ReservationSlot = {
  date: string; // ISO yyyy-MM-dd
  start: string; // HH:mm
  end: string; // HH:mm
  organization: string; // 정리된 사용단체명
  status: ReservationStatus;
};

// usage/detail 응답의 시설 1건 + 해당 월 예약.
export type FacilityItem = {
  id: number;
  roomName: string;
  location: string | null;
  isUsingNow: boolean;
  currentReservation: ReservationSlot | null;
  nextReservation: ReservationSlot | null;
  reservations: ReservationSlot[];
};

// GET /api/v1/facilities (§7.1) — 가벼운 활성 시설 목록.
export type FacilitySummary = {
  id: number;
  roomName: string;
  location: string | null;
};

// GET /api/v1/facilities/usage?yearMonth=YYYY-MM (§7.2, 주력).
export type FacilityUsageResponse = {
  yearMonth: string; // YYYY-MM
  lastUpdatedAt: string; // ISO 8601 (+09:00)
  stale: boolean;
  source: DataSource;
  facilities: FacilityItem[];
};

// GET /api/v1/facilities/{facilityId}?yearMonth=YYYY-MM (§7.3) — usage 의 단일 시설 슬라이스.
export type FacilityDetailResponse = {
  yearMonth: string;
  lastUpdatedAt: string;
  stale: boolean;
  source: DataSource;
  facility: FacilityItem;
};
```

- [ ] Add the re-export to `frontend/packages/types/src/index.ts` — append after the last line (`export * from './publicActivity';`):

```ts
export * from './facility';
```

- [ ] Run typecheck (expected PASS — pure type additions):

```bash
pnpm --filter @duing/types typecheck
```

Expected: `tsc --noEmit` exits 0 with no output.

- [ ] Commit:

```bash
git add frontend/packages/types/src/facility.ts frontend/packages/types/src/index.ts
git commit -m "feat(web): 시설 이용현황 도메인 타입 추가"
```

---

### Task 2: API client methods

**Files:**
- Modify: `frontend/packages/api/src/client.ts`

**Steps:**

- [ ] Add the facility types to the `import type { … } from '@duing/types'` block. Replace this exact snippet (lines ~166-168):

```ts
  PublicActivityFeed,
  PublicActivityListParams,
} from '@duing/types';
```

with:

```ts
  PublicActivityFeed,
  PublicActivityListParams,
  FacilitySummary,
  FacilityUsageResponse,
  FacilityDetailResponse,
} from '@duing/types';
```

- [ ] Add the `facilities` block to the `DuingApiClient` type. Replace this exact snippet:

```ts
  publicActivities: {
    // GET /api/v1/public-activities — 공개·인증불요. 6도메인 최근 활동 집계(occurredAt DESC).
    list(params?: PublicActivityListParams): Promise<PublicActivityFeed>;
  };
```

with:

```ts
  publicActivities: {
    // GET /api/v1/public-activities — 공개·인증불요. 6도메인 최근 활동 집계(occurredAt DESC).
    list(params?: PublicActivityListParams): Promise<PublicActivityFeed>;
  };
  facilities: {
    // GET /api/v1/facilities — 공개·인증불요. 활성 시설 목록(가벼움).
    list(): Promise<FacilitySummary[]>;
    // GET /api/v1/facilities/usage?yearMonth=YYYY-MM — yearMonth 생략 시 현재월.
    usage(yearMonth?: string): Promise<FacilityUsageResponse>;
    // GET /api/v1/facilities/{facilityId}?yearMonth=YYYY-MM — 단일 시설 상세(타임라인용).
    get(facilityId: number, yearMonth?: string): Promise<FacilityDetailResponse>;
  };
```

- [ ] Add the `facilities` implementation to the returned client object. Replace this exact snippet:

```ts
    publicActivities: {
      list: (params) =>
        jsonOk<PublicActivityFeed>(
          http.get('public-activities', { searchParams: cleanParams(params) }),
        ),
    },
```

with:

```ts
    publicActivities: {
      list: (params) =>
        jsonOk<PublicActivityFeed>(
          http.get('public-activities', { searchParams: cleanParams(params) }),
        ),
    },
    facilities: {
      list: () => jsonOk<FacilitySummary[]>(http.get('facilities')),
      usage: (yearMonth) =>
        jsonOk<FacilityUsageResponse>(
          http.get('facilities/usage', {
            searchParams: yearMonth ? { yearMonth } : undefined,
          }),
        ),
      get: (facilityId, yearMonth) =>
        jsonOk<FacilityDetailResponse>(
          http.get(`facilities/${facilityId}`, {
            searchParams: yearMonth ? { yearMonth } : undefined,
          }),
        ),
    },
```

Note: public GETs skip Bearer automatically — `readToken()` returns null so the `beforeRequest` hook sets no `Authorization`. Do NOT hand-set headers.

- [ ] Run typecheck (expected PASS):

```bash
pnpm --filter @duing/api typecheck
```

Expected: exits 0 with no output.

- [ ] Commit:

```bash
git add frontend/packages/api/src/client.ts
git commit -m "feat(web): 시설 이용현황 API 클라이언트 메서드 추가"
```

---

### Task 3: Query hooks + keys

**Files:**
- Create: `frontend/packages/hooks/src/facilityQueryKeys.ts`
- Create: `frontend/packages/hooks/src/facilities.ts`
- Modify: `frontend/packages/hooks/src/index.ts`

**Steps:**

- [ ] Create `frontend/packages/hooks/src/facilityQueryKeys.ts` (mirrors `clubQueryKeys.ts`; `yearMonth ?? 'current'` keeps the current-month cache distinct from an explicit month):

```ts
export const facilityQueryKeys = {
  all: ['facilities'] as const,
  usage: (yearMonth?: string) =>
    [...facilityQueryKeys.all, 'usage', yearMonth ?? 'current'] as const,
  detail: (facilityId: number, yearMonth?: string) =>
    [...facilityQueryKeys.all, facilityId, yearMonth ?? 'current'] as const,
};
```

- [ ] Create `frontend/packages/hooks/src/facilities.ts` (mirrors `clubs.ts` `useClubDetailQuery` guard pattern):

```ts
import { useQuery } from '@tanstack/react-query';

import { useApiClient } from './api-context';
import { facilityQueryKeys } from './facilityQueryKeys';

export function useFacilityUsageQuery(yearMonth?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: facilityQueryKeys.usage(yearMonth),
    queryFn: () => client.facilities.usage(yearMonth),
  });
}

export function useFacilityDetailQuery(facilityId: number | undefined, yearMonth?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey:
      facilityId !== undefined
        ? facilityQueryKeys.detail(facilityId, yearMonth)
        : ['facilities', undefined],
    queryFn: () => {
      if (facilityId === undefined) {
        throw new Error('facilityId is required');
      }
      return client.facilities.get(facilityId, yearMonth);
    },
    enabled: facilityId !== undefined,
  });
}
```

- [ ] Export from `frontend/packages/hooks/src/index.ts` — append after the last line (`export { cashbookQueryKeys } from './cashbookQueryKeys';`):

```ts
export { useFacilityUsageQuery, useFacilityDetailQuery } from './facilities';
export { facilityQueryKeys } from './facilityQueryKeys';
```

- [ ] Run typecheck (expected PASS):

```bash
pnpm --filter @duing/hooks typecheck
```

Expected: exits 0 with no output.

- [ ] Commit:

```bash
git add frontend/packages/hooks/src/facilityQueryKeys.ts frontend/packages/hooks/src/facilities.ts frontend/packages/hooks/src/index.ts
git commit -m "feat(web): 시설 이용현황 React Query 훅 추가"
```

---

### Task 4: Pure timeline/format helpers (TDD)

**Files:**
- Create: `frontend/apps/web/app/facilities/_lib/facilityTimeline.ts`
- Test: `frontend/apps/web/test/facilities/facility-timeline-lib.test.ts`

**Steps:**

- [ ] Write the failing test `frontend/apps/web/test/facilities/facility-timeline-lib.test.ts`. All inputs use absolute instants (`…Z`) converted to a fixed zone, so there is NO hardcoded-future-date timebomb:

```ts
import { describe, expect, it } from 'vitest';
import type { ReservationSlot } from '@duing/types';
import {
  buildTimelineSegments,
  timelineIndicatorPct,
  seoulMinutesOfDay,
  seoulDateIso,
  daysInMonth,
  formatLastUpdated,
} from '../../app/facilities/_lib/facilityTimeline';

const slots: ReservationSlot[] = [
  { date: '2026-07-01', start: '09:00', end: '11:00', organization: '고정관념', status: 'USING' },
  { date: '2026-07-01', start: '19:00', end: '20:00', organization: '댄스동아리', status: 'UPCOMING' },
  { date: '2026-07-02', start: '16:00', end: '17:00', organization: '밴드', status: 'UPCOMING' },
];

describe('buildTimelineSegments', () => {
  it('선택 날짜의 예약만 남기고 시작시각 오름차순으로 정렬한다', () => {
    const segments = buildTimelineSegments(slots, '2026-07-01');
    expect(segments.map((segment) => segment.organization)).toEqual(['고정관념', '댄스동아리']);
  });

  it('09~22(780분) 축 기준 left/width 퍼센트를 계산한다', () => {
    const [first] = buildTimelineSegments(slots, '2026-07-01');
    expect(first.startLabel).toBe('09:00');
    expect(first.endLabel).toBe('11:00');
    expect(first.leftPct).toBe(0);
    // 09:00~11:00 = 120분 / 780분
    expect(first.widthPct).toBeCloseTo((120 / 780) * 100, 5);
  });

  it('축을 벗어난 구간은 클램프하되 원본 라벨은 보존한다', () => {
    const early: ReservationSlot[] = [
      { date: '2026-07-01', start: '08:00', end: '10:00', organization: '조기예약', status: 'FINISHED' },
    ];
    const [segment] = buildTimelineSegments(early, '2026-07-01');
    expect(segment.leftPct).toBe(0); // 08:00 → 09:00 로 클램프
    expect(segment.widthPct).toBeCloseTo((60 / 780) * 100, 5);
    expect(segment.startLabel).toBe('08:00'); // 라벨은 원본
  });

  it('축과 겹치지 않는 슬롯은 제거한다', () => {
    const late: ReservationSlot[] = [
      { date: '2026-07-01', start: '23:00', end: '23:30', organization: '심야', status: 'UPCOMING' },
    ];
    expect(buildTimelineSegments(late, '2026-07-01')).toHaveLength(0);
  });
});

describe('timelineIndicatorPct', () => {
  it('축 안이면 퍼센트, 밖이면 null', () => {
    expect(timelineIndicatorPct(9 * 60)).toBe(0);
    expect(timelineIndicatorPct(22 * 60)).toBe(100);
    expect(timelineIndicatorPct(13 * 60)).toBeCloseTo((240 / 780) * 100, 5);
    expect(timelineIndicatorPct(8 * 60)).toBeNull();
    expect(timelineIndicatorPct(23 * 60)).toBeNull();
  });
});

describe('seoul* 헬퍼는 CI/UTC 와 무관하게 KST wall-clock 을 준다', () => {
  it('02:20Z → KST 11:20 / 2026-07-01', () => {
    const instant = new Date('2026-07-01T02:20:00Z');
    expect(seoulMinutesOfDay(instant)).toBe(11 * 60 + 20);
    expect(seoulDateIso(instant)).toBe('2026-07-01');
  });
});

describe('daysInMonth', () => {
  it.each([
    ['2026-02', 28],
    ['2024-02', 29],
    ['2026-07', 31],
  ] as const)('%s → %d일', (yearMonth, expected) => {
    expect(daysInMonth(yearMonth)).toBe(expected);
  });
});

describe('formatLastUpdated', () => {
  it('+09:00 ISO → "YYYY-MM-DD HH:mm"(KST)', () => {
    expect(formatLastUpdated('2026-07-01T11:20:00+09:00')).toBe('2026-07-01 11:20');
  });
  it('UTC ISO 도 KST 로 변환한다', () => {
    expect(formatLastUpdated('2026-07-01T02:20:00Z')).toBe('2026-07-01 11:20');
  });
  it('잘못된 값은 빈 문자열', () => {
    expect(formatLastUpdated('not-a-date')).toBe('');
  });
});
```

- [ ] Run it — expected FAIL (module does not exist yet):

```bash
pnpm --filter @duing/web test -- --run test/facilities/facility-timeline-lib.test.ts
```

Expected: FAIL — `Failed to resolve import "../../app/facilities/_lib/facilityTimeline"`.

- [ ] Create `frontend/apps/web/app/facilities/_lib/facilityTimeline.ts` (uses `hourCycle: 'h23'` to avoid the `24:00` midnight quirk; Asia/Seoul zone makes display deterministic regardless of viewer/CI timezone — see memory note on audit-timestamp timezone footguns):

```ts
import type { ReservationSlot, ReservationStatus } from '@duing/types';

// 타임라인 시간 축: 09:00 ~ 22:00 (학생회관 운영시간).
export const AXIS_START_HOUR = 9;
export const AXIS_END_HOUR = 22;
export const TIMELINE_HOURS: number[] = Array.from(
  { length: AXIS_END_HOUR - AXIS_START_HOUR + 1 },
  (_, index) => AXIS_START_HOUR + index,
);

export type TimelineSegment = {
  organization: string;
  status: ReservationStatus;
  startLabel: string; // 원본 HH:mm
  endLabel: string; // 원본 HH:mm
  startMinutes: number; // 축 기준(클램프)
  endMinutes: number; // 축 기준(클램프)
  leftPct: number;
  widthPct: number;
};

function toMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(':').map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

// 해당 날짜의 예약을 09~22 축 위 세그먼트로 변환. 축을 벗어난 구간은 클램프하고,
// 축과 겹치지 않는 슬롯은 제거하며 시작시각 오름차순 정렬한다. (병합은 백엔드가 이미 수행)
export function buildTimelineSegments(
  reservations: ReservationSlot[],
  date: string,
): TimelineSegment[] {
  const axisStart = AXIS_START_HOUR * 60;
  const axisEnd = AXIS_END_HOUR * 60;
  const axisSpan = axisEnd - axisStart;

  return reservations
    .filter((slot) => slot.date === date)
    .map((slot) => {
      const clampedStart = Math.max(toMinutes(slot.start), axisStart) - axisStart;
      const clampedEnd = Math.min(toMinutes(slot.end), axisEnd) - axisStart;
      const segment: TimelineSegment = {
        organization: slot.organization,
        status: slot.status,
        startLabel: slot.start,
        endLabel: slot.end,
        startMinutes: clampedStart,
        endMinutes: clampedEnd,
        leftPct: (clampedStart / axisSpan) * 100,
        widthPct: ((clampedEnd - clampedStart) / axisSpan) * 100,
      };
      return segment;
    })
    .filter((segment) => segment.endMinutes > segment.startMinutes)
    .sort((left, right) => left.startMinutes - right.startMinutes);
}

// 현재시각(분/일)을 축 위 위치(%)로. 축을 벗어나면 null(인디케이터 미표시).
export function timelineIndicatorPct(minutesOfDay: number): number | null {
  const axisStart = AXIS_START_HOUR * 60;
  const axisEnd = AXIS_END_HOUR * 60;
  if (minutesOfDay < axisStart || minutesOfDay > axisEnd) return null;
  return ((minutesOfDay - axisStart) / (axisEnd - axisStart)) * 100;
}

// Asia/Seoul 기준 오늘의 '분(minute of day)'. prod JVM/CI 타임존과 무관하게 KST wall-clock.
export function seoulMinutesOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const read = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return read('hour') * 60 + read('minute');
}

// Asia/Seoul 기준 오늘 날짜(YYYY-MM-DD).
export function seoulDateIso(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const read = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

// YYYY-MM 의 일수.
export function daysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(year ?? 1970, month ?? 1, 0).getDate();
}

// lastUpdatedAt(+09:00 ISO)를 'YYYY-MM-DD HH:mm'(KST)로 표시.
export function formatLastUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const read = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')} ${read('hour')}:${read('minute')}`;
}
```

- [ ] Run it — expected PASS:

```bash
pnpm --filter @duing/web test -- --run test/facilities/facility-timeline-lib.test.ts
```

Expected: PASS — all describe blocks green.

- [ ] Commit:

```bash
git add frontend/apps/web/app/facilities/_lib/facilityTimeline.ts frontend/apps/web/test/facilities/facility-timeline-lib.test.ts
git commit -m "feat(web): 시설 타임라인 매핑·KST 포맷 헬퍼 추가"
```

---

### Task 5: FacilityUpdateBanner — stale banner (TDD)

**Files:**
- Create: `frontend/apps/web/app/facilities/_components/FacilityUpdateBanner.tsx`
- Test: `frontend/apps/web/test/facilities/facility-update-banner.test.tsx`

**Steps:**

- [ ] Write the failing test `frontend/apps/web/test/facilities/facility-update-banner.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FacilityUpdateBanner } from '../../app/facilities/_components/FacilityUpdateBanner';

describe('FacilityUpdateBanner', () => {
  it('마지막 업데이트 시각을 KST 로 표시한다', () => {
    render(<FacilityUpdateBanner lastUpdatedAt="2026-07-01T11:20:00+09:00" stale={false} />);
    expect(screen.getByText('마지막 업데이트 2026-07-01 11:20')).toBeInTheDocument();
  });

  it('stale=true 이면 캐시 안내 배너를 노출한다', () => {
    render(<FacilityUpdateBanner lastUpdatedAt="2026-07-01T11:20:00+09:00" stale={true} />);
    expect(screen.getByText('현재 최신 캐시 데이터를 표시하고 있습니다')).toBeInTheDocument();
  });

  it('stale=false 이면 캐시 안내 배너를 노출하지 않는다', () => {
    render(<FacilityUpdateBanner lastUpdatedAt="2026-07-01T11:20:00+09:00" stale={false} />);
    expect(screen.queryByText('현재 최신 캐시 데이터를 표시하고 있습니다')).toBeNull();
  });
});
```

- [ ] Run it — expected FAIL (module missing):

```bash
pnpm --filter @duing/web test -- --run test/facilities/facility-update-banner.test.tsx
```

Expected: FAIL — cannot resolve `FacilityUpdateBanner`.

- [ ] Create `frontend/apps/web/app/facilities/_components/FacilityUpdateBanner.tsx` (inline hex for the amber cache banner, matching the codebase's UPCOMING chip palette `#FBEFD7`/`#8E6620`):

```tsx
'use client';

import { formatLastUpdated } from '../_lib/facilityTimeline';

export function FacilityUpdateBanner({
  lastUpdatedAt,
  stale,
}: {
  lastUpdatedAt: string;
  stale: boolean;
}) {
  return (
    <div>
      <p className="text-[12.5px] text-charcoal-3">
        마지막 업데이트 {formatLastUpdated(lastUpdatedAt)}
      </p>
      {stale && (
        <p
          role="status"
          className="mt-2 inline-flex rounded-[12px] px-3.5 py-2 text-[13px] font-semibold"
          style={{ background: '#FBEFD7', color: '#8E6620' }}
        >
          현재 최신 캐시 데이터를 표시하고 있습니다
        </p>
      )}
    </div>
  );
}
```

- [ ] Run it — expected PASS:

```bash
pnpm --filter @duing/web test -- --run test/facilities/facility-update-banner.test.tsx
```

Expected: PASS — 3 tests green.

- [ ] Commit:

```bash
git add frontend/apps/web/app/facilities/_components/FacilityUpdateBanner.tsx frontend/apps/web/test/facilities/facility-update-banner.test.tsx
git commit -m "feat(web): 시설 마지막 업데이트·캐시 안내 배너 추가"
```

---

### Task 6: FacilityCard (TDD)

**Files:**
- Create: `frontend/apps/web/app/facilities/_components/FacilityCard.tsx`
- Test: `frontend/apps/web/test/facilities/facility-card.test.tsx`

**Steps:**

- [ ] Write the failing test `frontend/apps/web/test/facilities/facility-card.test.tsx` (relies on `test/setup.ts` global `next-view-transitions` mock — `Link` becomes a plain `<a>`; no extra mock needed):

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FacilityItem } from '@duing/types';
import { FacilityCard } from '../../app/facilities/_components/FacilityCard';

const base: FacilityItem = {
  id: 12,
  roomName: '공동연습실(1)',
  location: '2105',
  isUsingNow: false,
  currentReservation: null,
  nextReservation: null,
  reservations: [],
};

describe('FacilityCard', () => {
  it('사용 중이면 "현재 사용 중" + 현재 예약 시간·단체를 표시한다', () => {
    render(
      <FacilityCard
        facility={{
          ...base,
          isUsingNow: true,
          currentReservation: {
            date: '2026-07-01',
            start: '09:00',
            end: '11:00',
            organization: '댄스동아리',
            status: 'USING',
          },
        }}
      />,
    );
    expect(screen.getByText('현재 사용 중')).toBeInTheDocument();
    expect(screen.getByText(/09:00~11:00/)).toBeInTheDocument();
    expect(screen.getByText(/댄스동아리/)).toBeInTheDocument();
  });

  it('이용 가능 + 다음 예약이 있으면 "현재 이용 가능"과 다음 예약을 표시한다', () => {
    render(
      <FacilityCard
        facility={{
          ...base,
          nextReservation: {
            date: '2026-07-02',
            start: '16:00',
            end: '17:00',
            organization: '고정관념',
            status: 'UPCOMING',
          },
        }}
      />,
    );
    expect(screen.getByText('현재 이용 가능')).toBeInTheDocument();
    expect(screen.getByText(/다음 예약 16:00~17:00 · 고정관념/)).toBeInTheDocument();
  });

  it('이용 가능 + 다음 예약이 없으면 안내 문구를 표시한다', () => {
    render(<FacilityCard facility={base} />);
    expect(screen.getByText('현재 이용 가능')).toBeInTheDocument();
    expect(screen.getByText('예정된 예약이 없어요')).toBeInTheDocument();
  });

  it('상세보기 링크가 /facilities/{id} 로 향한다', () => {
    render(<FacilityCard facility={base} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/facilities/12');
    expect(screen.getByText(/상세보기/)).toBeInTheDocument();
  });
});
```

- [ ] Run it — expected FAIL (module missing):

```bash
pnpm --filter @duing/web test -- --run test/facilities/facility-card.test.tsx
```

Expected: FAIL — cannot resolve `FacilityCard`.

- [ ] Create `frontend/apps/web/app/facilities/_components/FacilityCard.tsx` (mirrors `ClubCard` structure: `next-view-transitions` Link + `toRoute`; inline hex for status dot per `ink #1F4A36` / `ink-soft #2E6149`):

```tsx
'use client';

import { Link } from 'next-view-transitions';

import { toRoute } from '../../_lib/route';
import type { FacilityItem, ReservationSlot } from '@duing/types';

const INK = '#1F4A36';
const INK_SOFT = '#2E6149';
const AVAILABLE_DOT = '#9DB6A0';
const MUTED = '#6F7574';

function slotTime(slot: ReservationSlot): string {
  return `${slot.start}~${slot.end}`;
}

export function FacilityCard({ facility }: { facility: FacilityItem }) {
  const usingNow = facility.isUsingNow && facility.currentReservation !== null;
  const dotColor = usingNow ? INK_SOFT : AVAILABLE_DOT;

  return (
    <Link
      href={toRoute(`/facilities/${facility.id}`)}
      className="relative flex flex-col gap-3 overflow-hidden rounded-[18px] border border-line bg-paper p-[18px] transition hover:shadow-2"
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: dotColor, boxShadow: usingNow ? `0 0 0 3px ${dotColor}33` : undefined }}
          aria-hidden
        />
        <span className="text-[12.5px] font-bold" style={{ color: usingNow ? INK_SOFT : MUTED }}>
          {usingNow ? '현재 사용 중' : '현재 이용 가능'}
        </span>
      </div>

      <div>
        <h3 className="text-[18px] leading-[1.25]" style={{ color: INK }}>
          {facility.roomName}
        </h3>
        {facility.location && <p className="mt-1 text-[13px] text-charcoal-3">{facility.location}</p>}
      </div>

      <div className="mt-1 border-t border-dashed border-line pt-3 text-[13px] text-charcoal-2">
        {usingNow && facility.currentReservation ? (
          <p>
            <span className="font-bold" style={{ color: INK_SOFT }}>
              {slotTime(facility.currentReservation)}
            </span>{' '}
            · {facility.currentReservation.organization}
          </p>
        ) : facility.nextReservation ? (
          <p className="text-charcoal-3">
            다음 예약 {slotTime(facility.nextReservation)} · {facility.nextReservation.organization}
          </p>
        ) : (
          <p className="text-charcoal-3">예정된 예약이 없어요</p>
        )}
      </div>

      <span className="mt-1 self-start text-[12.5px] font-semibold" style={{ color: INK }}>
        상세보기 →
      </span>
    </Link>
  );
}
```

- [ ] Run it — expected PASS:

```bash
pnpm --filter @duing/web test -- --run test/facilities/facility-card.test.tsx
```

Expected: PASS — 4 tests green.

- [ ] Commit:

```bash
git add frontend/apps/web/app/facilities/_components/FacilityCard.tsx frontend/apps/web/test/facilities/facility-card.test.tsx
git commit -m "feat(web): 시설 카드 컴포넌트 추가"
```

---

### Task 7: FacilityTimeline component (TDD)

**Files:**
- Create: `frontend/apps/web/app/facilities/_components/FacilityTimeline.tsx`
- Test: `frontend/apps/web/test/facilities/facility-timeline.test.tsx`

Note: hover/tooltip and pointer-drag visuals cannot be exercised in jsdom (see memory notes on native-drag / setPointerCapture / pointer visuals). This test only covers deterministic DOM logic (segment render, `onClick` detail, date switch). **Real-browser QA is required** for the hover tooltip, current-time indicator position, and reduced-motion behavior.

- [ ] Write the failing test `frontend/apps/web/test/facilities/facility-timeline.test.tsx` (fakes ONLY `Date` via `vi.useFakeTimers({ toFake: ['Date'] })` so React's real scheduler is untouched; fixed instant → default selected day = 1):

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReservationSlot } from '@duing/types';
import { FacilityTimeline } from '../../app/facilities/_components/FacilityTimeline';

const reservations: ReservationSlot[] = [
  { date: '2026-07-01', start: '09:00', end: '11:00', organization: '고정관념', status: 'USING' },
  { date: '2026-07-02', start: '16:00', end: '17:00', organization: '댄스동아리', status: 'UPCOMING' },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 2026-07-01 11:20 KST (= 02:20 UTC) → 기본 선택일 1일.
  vi.setSystemTime(new Date('2026-07-01T02:20:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FacilityTimeline', () => {
  it('오늘(1일)의 예약 구간 버튼을 렌더한다', () => {
    render(<FacilityTimeline reservations={reservations} yearMonth="2026-07" />);
    expect(screen.getByRole('button', { name: '고정관념 예약' })).toBeInTheDocument();
  });

  it('예약 구간 클릭 시 사용 단체·시간을 표시한다', () => {
    render(<FacilityTimeline reservations={reservations} yearMonth="2026-07" />);
    fireEvent.click(screen.getByRole('button', { name: '고정관념 예약' }));
    expect(screen.getByText(/09:00 ~ 11:00/)).toBeInTheDocument();
    expect(screen.getByText(/단체 고정관념/)).toBeInTheDocument();
  });

  it('다른 날짜(2일) 선택 시 해당일 예약으로 전환된다', () => {
    render(<FacilityTimeline reservations={reservations} yearMonth="2026-07" />);
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByRole('button', { name: '댄스동아리 예약' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '고정관념 예약' })).toBeNull();
  });
});
```

- [ ] Run it — expected FAIL (module missing):

```bash
pnpm --filter @duing/web test -- --run test/facilities/facility-timeline.test.tsx
```

Expected: FAIL — cannot resolve `FacilityTimeline`.

- [ ] Create `frontend/apps/web/app/facilities/_components/FacilityTimeline.tsx` (reserved segments `#2E6149`, empty track `#F0EDE5`, current-time indicator `#D9523A`; motion only under `motion-safe:` so reduced-motion users see no transitions; `<img>`-free so no drag guards needed):

```tsx
'use client';

import { useState } from 'react';

import {
  AXIS_START_HOUR,
  TIMELINE_HOURS,
  buildTimelineSegments,
  daysInMonth,
  seoulDateIso,
  seoulMinutesOfDay,
  timelineIndicatorPct,
  type TimelineSegment,
} from '../_lib/facilityTimeline';
import type { ReservationSlot } from '@duing/types';

const RESERVED_FILL = '#2E6149';
const EMPTY_FILL = '#F0EDE5';
const INDICATOR = '#D9523A';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function FacilityTimeline({
  reservations,
  yearMonth,
}: {
  reservations: ReservationSlot[];
  yearMonth: string;
}) {
  const now = new Date();
  const todayIso = seoulDateIso(now);
  const todayInMonth = todayIso.startsWith(yearMonth);
  const totalDays = daysInMonth(yearMonth);
  const defaultDay = todayInMonth ? Number(todayIso.slice(8, 10)) : 1;

  const [selectedDay, setSelectedDay] = useState(defaultDay);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const selectedDate = `${yearMonth}-${pad2(selectedDay)}`;
  const segments = buildTimelineSegments(reservations, selectedDate);
  const indicatorPct =
    selectedDate === todayIso ? timelineIndicatorPct(seoulMinutesOfDay(now)) : null;
  const activeSegment: TimelineSegment | null =
    activeIndex !== null ? segments[activeIndex] ?? null : null;

  return (
    <div className="rounded-[18px] border border-line bg-paper p-4 sm:p-5">
      {/* 날짜 선택 */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {Array.from({ length: totalDays }, (_, index) => index + 1).map((day) => {
          const on = day === selectedDay;
          return (
            <button
              key={day}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setSelectedDay(day);
                setActiveIndex(null);
              }}
              className={`h-8 w-8 shrink-0 rounded-full text-[13px] font-semibold motion-safe:transition-colors ${
                on ? 'bg-ink text-white' : 'bg-transparent text-charcoal-2 hover:bg-graysoft'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* 시간 축 트랙 */}
      <div className="relative">
        <div className="relative h-10 w-full overflow-hidden rounded-[10px]" style={{ background: EMPTY_FILL }}>
          {segments.map((segment, index) => (
            <button
              key={`${segment.startMinutes}-${index}`}
              type="button"
              aria-label={`${segment.organization} 예약`}
              title={`${segment.organization} ${segment.startLabel}~${segment.endLabel}`}
              onClick={() => setActiveIndex(index)}
              className="absolute top-0 h-full motion-safe:transition-opacity"
              style={{
                left: `${segment.leftPct}%`,
                width: `${segment.widthPct}%`,
                background: RESERVED_FILL,
                opacity: activeIndex === null || activeIndex === index ? 1 : 0.6,
              }}
            />
          ))}
          {indicatorPct !== null && (
            <span
              aria-hidden
              className="absolute top-0 h-full w-[2px]"
              style={{ left: `${indicatorPct}%`, background: INDICATOR }}
            />
          )}
        </div>

        {/* 시간 라벨(짝수 시각만) */}
        <div className="mt-1.5 flex justify-between text-[10px] text-charcoal-3" style={{ fontFamily: 'var(--font-mono)' }}>
          {TIMELINE_HOURS.filter((hour) => hour % 2 === AXIS_START_HOUR % 2).map((hour) => (
            <span key={hour}>{pad2(hour)}</span>
          ))}
        </div>
      </div>

      {/* 선택된 예약 상세 */}
      <div className="mt-3 min-h-[1.5rem] text-[13px]">
        {activeSegment ? (
          <p>
            <span className="font-bold" style={{ color: RESERVED_FILL }}>
              {activeSegment.startLabel} ~ {activeSegment.endLabel}
            </span>{' '}
            · 단체 {activeSegment.organization}
          </p>
        ) : (
          <p className="text-charcoal-3">예약 구간을 눌러 사용 단체와 시간을 확인하세요.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] Run it — expected PASS:

```bash
pnpm --filter @duing/web test -- --run test/facilities/facility-timeline.test.tsx
```

Expected: PASS — 3 tests green.

- [ ] Commit:

```bash
git add frontend/apps/web/app/facilities/_components/FacilityTimeline.tsx frontend/apps/web/test/facilities/facility-timeline.test.tsx
git commit -m "feat(web): 시설 시간별 타임라인 컴포넌트 추가"
```

---

### Task 8: List route — layout + page + FacilityExplorePage

**Files:**
- Create: `frontend/apps/web/app/facilities/layout.tsx`
- Create: `frontend/apps/web/app/facilities/_pages/FacilityExplorePage.tsx`
- Create: `frontend/apps/web/app/facilities/page.tsx`

Note: `/facilities` is public — `middleware.ts` only guards `/apply`, `/me`, `/manage`, `/admin` (its `config.matcher` does not list `/facilities`), so no gating change is needed. `Providers` (mounted in root `app/layout.tsx`) already supplies `ApiClientProvider` + `QueryClientProvider`, so the hooks work here.

**Steps:**

- [ ] Create `frontend/apps/web/app/facilities/layout.tsx` (wraps `.duing` EXACTLY once — nested `.duing` would paint a stray cream band per the bg-cream footgun memory note; mirrors `clubs/layout.tsx`):

```tsx
import type { ReactNode } from 'react';

import { ExploreNav } from '../_components/ExploreNav';

export default function FacilitiesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="duing min-h-dvh bg-cream">
      <ExploreNav slimOnMobile />
      {children}
    </div>
  );
}
```

- [ ] Create `frontend/apps/web/app/facilities/_pages/FacilityExplorePage.tsx`:

```tsx
'use client';

import { useFacilityUsageQuery } from '@duing/hooks';

import { FacilityCard } from '../_components/FacilityCard';
import { FacilityUpdateBanner } from '../_components/FacilityUpdateBanner';

export function FacilityExplorePage() {
  const usageQuery = useFacilityUsageQuery();

  return (
    <div>
      <section className="border-b border-line bg-cream px-4 sm:px-6 md:px-10 pt-10 pb-6">
        <div className="max-w-layout mx-auto">
          <div className="mb-2 text-[13px] font-semibold tracking-wide08 text-ink">
            FACILITY · 학생회관 이용현황
          </div>
          <h1 className="text-[28px] tracking-tightx md:text-[40px]">시설 이용현황</h1>
          <p className="mt-2 text-[14px] text-charcoal-2">
            학생회관 공용시설의 예약 현황을 확인하세요.
          </p>
          {usageQuery.data && (
            <div className="mt-4">
              <FacilityUpdateBanner
                lastUpdatedAt={usageQuery.data.lastUpdatedAt}
                stale={usageQuery.data.stale}
              />
            </div>
          )}
        </div>
      </section>

      <section className="px-4 sm:px-6 md:px-10 pt-6 pb-20">
        <div className="max-w-layout mx-auto">
          {usageQuery.isLoading && <p className="text-sm text-charcoal-2">불러오는 중…</p>}
          {usageQuery.error && <p className="text-sm text-coral">시설 정보를 불러오지 못했어요.</p>}
          {usageQuery.data && usageQuery.data.facilities.length === 0 && (
            <p className="text-sm text-charcoal-2">표시할 시설이 없어요.</p>
          )}
          {usageQuery.data && usageQuery.data.facilities.length > 0 && (
            <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
              {usageQuery.data.facilities.map((facility) => (
                <FacilityCard key={facility.id} facility={facility} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] Create `frontend/apps/web/app/facilities/page.tsx` (mirrors `clubs/page.tsx`):

```tsx
import { Suspense } from 'react';

import { FacilityExplorePage } from './_pages/FacilityExplorePage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <FacilityExplorePage />
    </Suspense>
  );
}
```

- [ ] Run typecheck (expected PASS):

```bash
pnpm --filter @duing/web typecheck
```

Expected: exits 0.

- [ ] Commit:

```bash
git add frontend/apps/web/app/facilities/layout.tsx frontend/apps/web/app/facilities/_pages/FacilityExplorePage.tsx frontend/apps/web/app/facilities/page.tsx
git commit -m "feat(web): 시설 목록 페이지 라우트 추가"
```

---

### Task 9: Detail route `[facilityId]/page.tsx`

**Files:**
- Create: `frontend/apps/web/app/facilities/[facilityId]/page.tsx`

**Steps:**

- [ ] Create `frontend/apps/web/app/facilities/[facilityId]/page.tsx` (Client Component using `use(params)`, mirrors `clubs/[clubId]/page.tsx`; full route, not a modal):

```tsx
'use client';

import { use } from 'react';

import { useFacilityDetailQuery } from '@duing/hooks';

import { FacilityTimeline } from '../_components/FacilityTimeline';
import { FacilityUpdateBanner } from '../_components/FacilityUpdateBanner';

export default function FacilityDetailPage({
  params,
}: {
  params: Promise<{ facilityId: string }>;
}) {
  const { facilityId: facilityIdParam } = use(params);
  const facilityId = Number(facilityIdParam);
  const detail = useFacilityDetailQuery(facilityId);

  if (detail.isLoading) {
    return <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>;
  }
  if (!detail.data) {
    return <p className="p-6 text-sm text-coral">시설을 찾을 수 없습니다.</p>;
  }

  const { facility, yearMonth, lastUpdatedAt, stale } = detail.data;
  const usingNow = facility.isUsingNow && facility.currentReservation !== null;

  return (
    <section className="bg-cream px-4 sm:px-6 md:px-10 pb-20 pt-8">
      <div className="max-w-layout mx-auto">
        <div className="mb-2 flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{
              background: usingNow ? '#2E6149' : '#9DB6A0',
              boxShadow: usingNow ? '0 0 0 3px #2E614933' : undefined,
            }}
            aria-hidden
          />
          <span className="text-[13px] font-bold" style={{ color: usingNow ? '#2E6149' : '#6F7574' }}>
            {usingNow ? '현재 사용 중' : '현재 이용 가능'}
          </span>
        </div>
        <h1 className="text-[28px] tracking-tightx md:text-[36px]" style={{ color: '#1F4A36' }}>
          {facility.roomName}
        </h1>
        {facility.location && <p className="mt-1 text-[14px] text-charcoal-2">{facility.location}</p>}

        <div className="mt-5">
          <FacilityUpdateBanner lastUpdatedAt={lastUpdatedAt} stale={stale} />
        </div>

        <div className="mt-5">
          <FacilityTimeline reservations={facility.reservations} yearMonth={yearMonth} />
        </div>
      </div>
    </section>
  );
}
```

- [ ] Run typecheck (expected PASS):

```bash
pnpm --filter @duing/web typecheck
```

Expected: exits 0.

- [ ] Commit:

```bash
git add "frontend/apps/web/app/facilities/[facilityId]/page.tsx"
git commit -m "feat(web): 시설 상세 페이지 라우트 추가"
```

---

### Task 10: Navigation + Building icon

**Files:**
- Modify: `frontend/apps/web/components/duing/Icon.tsx`
- Modify: `frontend/apps/web/app/_components/BottomNav.tsx`
- Modify: `frontend/apps/web/app/_components/HomeNav.tsx`
- Modify: `frontend/apps/web/app/_components/ExploreNav.tsx`

**Steps:**

- [ ] Add the `Building` icon to `frontend/apps/web/components/duing/Icon.tsx`. Append after the `Megaphone` function (the current last export, ends with `}` on the final line):

```tsx

export function Building({ size = 22, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h.01M15 16h.01" />
      <path d="M4 21h16" />
    </svg>
  );
}
```

- [ ] In `frontend/apps/web/app/_components/BottomNav.tsx`, add `Building` to the Icon import. Replace:

```tsx
import { Calendar, Compass, Home, Megaphone } from '@/components/duing/Icon';
```

with:

```tsx
import { Building, Calendar, Compass, Home, Megaphone } from '@/components/duing/Icon';
```

- [ ] In the same file, add the 시설 tab to `TABS`. Replace:

```tsx
const TABS = [
  { label: '홈', href: '/', Icon: Home },
  { label: '탐색', href: '/clubs', Icon: Compass },
  { label: '캘린더', href: '/calendar', Icon: Calendar },
  { label: '공지', href: '/notices', Icon: Megaphone },
] as const;
```

with:

```tsx
const TABS = [
  { label: '홈', href: '/', Icon: Home },
  { label: '탐색', href: '/clubs', Icon: Compass },
  { label: '시설', href: '/facilities', Icon: Building },
  { label: '캘린더', href: '/calendar', Icon: Calendar },
  { label: '공지', href: '/notices', Icon: Megaphone },
] as const;
```

- [ ] In the same file, extend the detail-focus hide regex so the tab bar hides on `/facilities/{id}`. Replace:

```tsx
  if (/^\/(clubs|notices)\/\d+$/.test(pathname)) return null;
```

with:

```tsx
  if (/^\/(clubs|notices|facilities)\/\d+$/.test(pathname)) return null;
```

- [ ] In `frontend/apps/web/app/_components/HomeNav.tsx`, add the desktop 시설 link. Replace:

```tsx
          <li>
            <Link href="/notices" className={inactiveLink}>
              공지
            </Link>
          </li>
```

with:

```tsx
          <li>
            <Link href="/notices" className={inactiveLink}>
              공지
            </Link>
          </li>
          <li>
            <Link href="/facilities" className={inactiveLink}>
              시설
            </Link>
          </li>
```

- [ ] In `frontend/apps/web/app/_components/ExploreNav.tsx`, add 시설 to `NAV_ITEMS` (so the top bar on `/facilities` highlights it). Replace:

```tsx
const NAV_ITEMS = [
  { label: '홈', href: '/' },
  { label: '탐색', href: '/clubs' },
  { label: '캘린더', href: '/calendar' },
  { label: '공지', href: '/notices' },
] as const;
```

with:

```tsx
const NAV_ITEMS = [
  { label: '홈', href: '/' },
  { label: '탐색', href: '/clubs' },
  { label: '시설', href: '/facilities' },
  { label: '캘린더', href: '/calendar' },
  { label: '공지', href: '/notices' },
] as const;
```

- [ ] In the same file, extend the mobile detail-focus hide regex. Replace:

```tsx
  const isDetailFocus = /^\/(clubs|notices)\/\d+$/.test(pathname);
```

with:

```tsx
  const isDetailFocus = /^\/(clubs|notices|facilities)\/\d+$/.test(pathname);
```

- [ ] Run typecheck (expected PASS):

```bash
pnpm --filter @duing/web typecheck
```

Expected: exits 0.

- [ ] Commit:

```bash
git add frontend/apps/web/components/duing/Icon.tsx frontend/apps/web/app/_components/BottomNav.tsx frontend/apps/web/app/_components/HomeNav.tsx frontend/apps/web/app/_components/ExploreNav.tsx
git commit -m "feat(web): 시설 페이지 네비게이션 진입점 추가"
```

---

### Task 11: Full verification — typecheck, tests, build

**Files:** none (verification only)

**Steps:**

- [ ] Run all facility tests (expected PASS — 4 files, all green):

```bash
pnpm --filter @duing/web test -- --run test/facilities
```

Expected: `Test Files 4 passed`, no failures.

- [ ] Run workspace typecheck across all edited packages (expected PASS):

```bash
pnpm -r typecheck
```

Expected: every package's `tsc --noEmit` exits 0.

- [ ] Run the frontend build. Per the build-cwd memory note, run from the `frontend/` root so `--filter` resolves `@duing/web`; do NOT pipe to `tail` (it hides the exit code):

```bash
pnpm --filter @duing/web build
```

Expected: `next build` completes with "✓ Compiled successfully" and lists `/facilities` and `/facilities/[facilityId]` in the route output, exit 0. (Root `next.config.mjs` `transpilePackages` compiles the `@duing/*` workspace source, so no separate package build is required.)

- [ ] Real-browser QA checklist (jsdom cannot cover these — verify manually at `:3000`, then shut the dev server down per the dev-server-port memory note): timeline hover tooltip shows organization/time/단체; current-time vertical indicator sits at the correct Asia/Seoul position on today's column; reduced-motion OS setting suppresses hover transitions (`MotionConfig reducedMotion="user"` + `motion-safe:` classes); `.duing` renders no stray cream band; stale banner appears when the API returns `stale: true`.

- [ ] Commit (verification produced no file changes; if any lint autofix touched files, commit them):

```bash
git commit -am "test(web): 시설 이용현황 페이지 검증" --allow-empty
```

---

## Coverage note

All code above is complete and self-contained (no placeholders). Every referenced type (`FacilityItem`, `ReservationSlot`, `TimelineSegment`, `DataSource`, `ReservationStatus`, `FacilityUsageResponse`, `FacilityDetailResponse`, `FacilitySummary`) and helper (`buildTimelineSegments`, `timelineIndicatorPct`, `seoulMinutesOfDay`, `seoulDateIso`, `daysInMonth`, `formatLastUpdated`) is defined within Tasks 1 and 4. Backend endpoints are assumed to exist per spec §7 (separate plan).
