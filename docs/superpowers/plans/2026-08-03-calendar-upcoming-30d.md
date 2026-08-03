# 캘린더 Upcoming 30일 창 + 모바일 타임라인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/calendar` 의 Upcoming 을 "보고 있는 달의 남은 일정"에서 **"오늘부터 30일 창"** 으로 바꾸고, 모바일을 카드 6장(1,580px)에서 타임라인 리스트(약 450px)로 재설계한다.

**Architecture:** 30일 창이 걸치는 달 목록(1~3개)을 계산해 월 단위 쿼리를 병합한다(쿼리 키가 월 단위라 그리드와 캐시가 겹쳐 추가 요청이 대부분 0). 목록 생성(`buildUpcoming`)과 표시 변환(`toUpcomingView`)을 분리하고, 데스크탑 카드와 모바일 타임라인이 같은 뷰모델을 소비한다. 뷰포트 분기는 CSS 로만 한다.

**Tech Stack:** Next.js 15.5 App Router, React 19, TanStack Query v5(`useQueries`), TypeScript, vitest + jsdom + @testing-library/react

**설계 문서:** `docs/superpowers/specs/2026-08-03-calendar-upcoming-30d-design.md` — 결정 근거·실측·엣지 케이스가 전부 여기 있다. 구현 전 반드시 읽는다.

## Global Constraints

- 작업 디렉터리는 두 곳이다. `frontend/packages/hooks` (Task 1) 와 `frontend/apps/web` (Task 2~5).
  명령은 각 디렉터리에서 실행한다(`pnpm test`, `pnpm typecheck`).
- `any` 금지, `as` 타입 단언 금지. 타입 선언은 `type`(`interface` 금지).
- 변수명은 역할이 드러나게 — `data`/`res`/`e` 축약 금지.
- `packages/*` 에서 `window`/`document` 직접 사용 금지, `apps/web` 의 `_lib` import 금지.
- 커밋: Conventional Commits + 한국어, `{type}(frontend): 내용`. **`Co-Authored-By`·`🤖 Generated` 금지.**
- **데스크탑 UI 는 시각적으로 변하지 않는다.** 카드 마크업은 파일만 옮기고 스타일은 손대지 않는다.
- 브랜치는 이미 있다: `feat/calendar-upcoming-30d`. **push·PR 생성은 사용자 지시 후에만.**
- 상수: `UPCOMING_WINDOW_DAYS = 30`, `UPCOMING_LIMIT = 6`.

---

### Task 1: 월 목록 계산 + `useCalendarMonthsQuery`

**Files:**
- Modify: `frontend/packages/hooks/src/calendarMonth.ts`
- Modify: `frontend/packages/hooks/src/index.ts` (export 추가)
- Test: `frontend/packages/hooks/test/calendarMonths.test.ts` (신규)

**Interfaces:**
- Produces:
  - `monthsInRange(fromIso: string, toIso: string): string[]` — `"YYYY-MM"` 배열
  - `monthBounds(yearMonth: string): { from: string; to: string }`
  - `useCalendarMonthsQuery(yearMonths: string[], options: { isAuthenticated: boolean; mappers: CalendarMappers }): CalendarMonthResult`
  - 기존 `useCalendarMonthQuery(yearMonth, options)` 는 시그니처 유지(내부 위임)
- Consumes: 없음

- [ ] **Step 1: 월 목록 계산 실패 테스트 작성**

`frontend/packages/hooks/test/calendarMonths.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { addDaysIso, monthBounds, monthsInRange } from '../src/calendarMonth';

describe('monthsInRange', () => {
  it('같은 달 안이면 1개', () => {
    expect(monthsInRange('2026-08-03', '2026-08-20')).toEqual(['2026-08']);
  });

  it('30일 창이 다음 달로 넘어가면 2개', () => {
    const today = '2026-08-03';
    expect(monthsInRange(today, addDaysIso(today, 30))).toEqual(['2026-08', '2026-09']);
  });

  it('연 경계를 넘어도 안전하다', () => {
    const today = '2026-12-31';
    expect(monthsInRange(today, addDaysIso(today, 30))).toEqual(['2026-12', '2027-01']);
  });

  it('1월 말은 2월이 통째로 들어가 3개가 된다', () => {
    // 2027-01-31 + 30일 = 2027-03-02 — "이번 달 + 다음 달" 고정이면 3월 초 일정이 누락된다.
    const today = '2027-01-31';
    expect(addDaysIso(today, 30)).toBe('2027-03-02');
    expect(monthsInRange(today, addDaysIso(today, 30))).toEqual(['2027-01', '2027-02', '2027-03']);
  });

  it('시작이 끝보다 뒤면 시작 달 하나만 돌려준다(무한 루프 방지)', () => {
    expect(monthsInRange('2026-08-03', '2026-07-01')).toEqual(['2026-08']);
  });
});

describe('monthBounds', () => {
  it('해당 달의 1일과 말일을 돌려준다', () => {
    expect(monthBounds('2026-08')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(monthBounds('2027-02')).toEqual({ from: '2027-02-01', to: '2027-02-28' });
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/packages/hooks && pnpm vitest run test/calendarMonths.test.ts`
Expected: FAIL — `monthsInRange`/`monthBounds` 가 없다.

- [ ] **Step 3: 순수 함수 구현**

`frontend/packages/hooks/src/calendarMonth.ts` 의 `addDaysIso` 아래에 추가한다:

```ts
/** "YYYY-MM" → 그 달의 1일·말일. UTC 파싱이라 타임존 영향 없음. */
export function monthBounds(yearMonth: string): { from: string; to: string } {
  const first = new Date(`${yearMonth}-01T00:00:00Z`);
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return { from: `${yearMonth}-01`, to: `${yearMonth}-${String(lastDay).padStart(2, '0')}` };
}

/**
 * [fromIso, toIso] 구간이 걸치는 "YYYY-MM" 목록.
 *
 * <p>30일 창은 최대 **3개** 달에 걸친다 — 2월이 28·29일이라 1월 말에는 2월이 통째로 들어간다
 * (2027-01-31 + 30일 = 2027-03-02). "이번 달 + 다음 달" 고정은 그 구간에서 누락을 만든다.
 */
export function monthsInRange(fromIso: string, toIso: string): string[] {
  const lastMonth = toIso.slice(0, 7);
  const months: string[] = [];
  let cursor = `${fromIso.slice(0, 7)}-01`;
  // 창 길이가 30일이라 실제로는 3회 이하지만, 잘못된 입력에서 무한 루프가 나지 않도록 상한을 둔다.
  for (let guard = 0; guard < 24; guard += 1) {
    const month = cursor.slice(0, 7);
    months.push(month);
    if (month >= lastMonth) break;
    const next = new Date(`${cursor}T00:00:00Z`);
    // day 를 1 로 함께 지정 — 31일에서 setUTCMonth 만 쓰면 다음 달을 건너뛴다.
    next.setUTCMonth(next.getUTCMonth() + 1, 1);
    cursor = next.toISOString().slice(0, 10);
  }
  return months;
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend/packages/hooks && pnpm vitest run test/calendarMonths.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: `useCalendarMonthsQuery` 구현**

같은 파일에서 `useCalendarMonthQuery` 를 아래 구조로 교체한다. **기존 export 이름과 반환 타입은 유지**한다.

```ts
export type CalendarMappers = CalendarMonthOptions['mappers'];

/**
 * 여러 달을 한 번에 조회해 CalEvent 로 병합한다.
 *
 * <p>월 개수가 가변이라 훅을 반복 호출할 수 없으므로(Hooks 규칙) 목록을 인자로 받아
 * 내부에서 useQueries 로 처리한다. 쿼리 키는 월 단위로 유지해 그리드 조회와 캐시가 겹치게 한다.
 */
export function useCalendarMonthsQuery(
  yearMonths: string[],
  options: { isAuthenticated: boolean; mappers: CalendarMappers },
): CalendarMonthResult {
  const client = useApiClient();
  const { isAuthenticated, mappers } = options;

  const monthsKey = yearMonths.join(',');
  const ranges = useMemo(
    () => yearMonths.map((yearMonth) => ({ yearMonth, ...monthBounds(yearMonth) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 배열 아이덴티티가 아니라 내용으로 비교한다.
    [monthsKey],
  );

  const myClubsQuery = useMyClubsQuery({ enabled: isAuthenticated });
  const myClubs = isAuthenticated ? (myClubsQuery.data ?? []) : [];

  const globalEventQueries = useQueries({
    queries: ranges.map((range) => ({
      queryKey: globalEventKeys.publicList({ from: range.from, to: range.to }),
      queryFn: () => client.globalEvents.list({ from: range.from, to: range.to }),
      staleTime: 30 * 1000,
    })),
  });

  const recruitmentQueries = useQueries({
    queries: ranges.map((range) => ({
      queryKey: recruitmentQueryKeys.calendar(range.yearMonth),
      queryFn: () => client.recruitments.calendar(range.yearMonth),
    })),
  });

  const clubEventQueries = useQueries({
    queries: myClubs.flatMap((club) =>
      ranges.map((range) => ({
        queryKey: clubEventKeys.list(club.clubId, { from: range.from, to: range.to }),
        queryFn: async (): Promise<CalEvent[]> => {
          const items = await client.clubEvents.list(club.clubId, { from: range.from, to: range.to });
          return items.map((item) => mappers.toClubEvent(item, club));
        },
        staleTime: 30 * 1000,
        enabled: isAuthenticated,
      })),
    ),
  });

  const events = useMemo<CalEvent[]>(() => {
    const merged: CalEvent[] = [];
    for (const query of globalEventQueries) {
      if (!query.data) continue;
      // 다일 GlobalEvent 는 시작~종료 사이 모든 날짜 셀에 나와야 하므로 day 단위로 fan-out 한다.
      // span 은 첫 날에만 set — 그리드/카드가 기간 표기에 쓴다.
      for (const item of query.data) {
        const baseEvent = mappers.toGlobal(item);
        const totalSpan = baseEvent.span ?? 1;
        for (let dayOffset = 0; dayOffset < totalSpan; dayOffset += 1) {
          merged.push({
            ...baseEvent,
            id: `${baseEvent.id}-d${dayOffset}`,
            date: addDaysIso(baseEvent.date, dayOffset),
            span: dayOffset === 0 ? totalSpan : undefined,
          });
        }
      }
    }
    for (const query of recruitmentQueries) {
      if (!query.data) continue;
      for (const item of query.data) {
        const mapped = mappers.toRecruitment(item);
        if (mapped) merged.push(mapped);
      }
    }
    for (const query of clubEventQueries) {
      if (query.data) merged.push(...query.data);
    }
    // 달 경계를 걸친 다일 행사는 두 달의 응답에 모두 담겨 같은 id 가 중복될 수 있다.
    const byId = new Map<string, CalEvent>();
    for (const event of merged) byId.set(event.id, event);
    return Array.from(byId.values());
  }, [globalEventQueries, recruitmentQueries, clubEventQueries, mappers]);

  const isLoading =
    globalEventQueries.some((query) => query.isLoading)
    || recruitmentQueries.some((query) => query.isLoading)
    || (isAuthenticated && myClubsQuery.isLoading)
    || clubEventQueries.some((query) => query.isLoading);

  const isError =
    globalEventQueries.some((query) => query.isError)
    || recruitmentQueries.some((query) => query.isError)
    || (isAuthenticated && myClubsQuery.isError)
    || clubEventQueries.some((query) => query.isError);

  return {
    events,
    isLoading,
    isError,
    perDomain: {
      globalEventsError: globalEventQueries.some((query) => query.isError),
      recruitmentsError: recruitmentQueries.some((query) => query.isError),
      clubEventsError:
        clubEventQueries.some((query) => query.isError)
        || (isAuthenticated && myClubsQuery.isError),
    },
  };
}

/**
 * 단일 달 조회 — 기존 호출처(캘린더 그리드) 호환용 래퍼.
 *
 * <p>options.from/to 는 monthBounds(yearMonth) 와 같은 값이라 내부에서 다시 유도한다
 * (쿼리 키가 달라지지 않는다).
 */
export function useCalendarMonthQuery(
  yearMonth: string,
  options: CalendarMonthOptions,
): CalendarMonthResult {
  const yearMonths = useMemo(() => [yearMonth], [yearMonth]);
  return useCalendarMonthsQuery(yearMonths, {
    isAuthenticated: options.isAuthenticated,
    mappers: options.mappers,
  });
}
```

import 에 `useQueries` 와 `recruitmentQueryKeys`, `globalEventKeys` 를 추가한다(기존 훅 대신 직접 쿼리를 구성하므로 `useGlobalEventListQuery`·`useRecruitmentCalendarQuery` import 는 제거).

- [ ] **Step 6: export 추가**

`frontend/packages/hooks/src/index.ts` 216행 근처:

```ts
export {
  useCalendarMonthQuery,
  useCalendarMonthsQuery,
  addDaysIso,
  monthsInRange,
  monthBounds,
} from './calendarMonth';
```

- [ ] **Step 7: 타입·테스트 확인**

Run: `cd frontend/packages/hooks && pnpm typecheck && pnpm vitest run`
Expected: 에러 0, 기존 테스트 전량 PASS

Run: `cd frontend/apps/web && pnpm typecheck`
Expected: 에러 0 (그리드 호출처는 시그니처가 같아 무수정)

- [ ] **Step 8: 커밋**

```bash
git add frontend/packages/hooks
git commit -m "feat(frontend): 캘린더 다월 조회 훅 — 창이 걸치는 월 목록 계산(1~3개)"
```

---

### Task 2: `buildUpcoming` · `toUpcomingView` 분리

**Files:**
- Create: `frontend/apps/web/app/calendar/_lib/upcoming.ts`
- Create: `frontend/apps/web/app/calendar/_lib/upcomingView.ts`
- Create: `frontend/apps/web/app/calendar/_lib/calendarDisplay.ts`
- Test: `frontend/apps/web/test/calendar/upcoming.test.ts` (신규)

**Interfaces:**
- Consumes: `addDaysIso` (Task 1 에서 이미 export 중)
- Produces:
  - `UPCOMING_WINDOW_DAYS = 30`, `UPCOMING_LIMIT = 6`
  - `buildUpcoming(events: CalEvent[], todayIso: string, activeKinds: Set<EventKind>): CalEvent[]`
  - `toUpcomingView(event: CalEvent, todayIso: string): UpcomingView`
  - `ACCENT`, `KIND_LABEL`, `KIND_ACCENT`, `KIND_ORDER` (CalendarPage 에서 이동)

- [ ] **Step 1: 실패 테스트 작성**

`frontend/apps/web/test/calendar/upcoming.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { CalEvent, EventKind } from '@duing/types';

import { buildUpcoming } from '@/app/calendar/_lib/upcoming';
import { toUpcomingView } from '@/app/calendar/_lib/upcomingView';

const ALL_KINDS = new Set<EventKind>(['system', 'deadline', 'event']);

function makeEvent(overrides: Partial<CalEvent> & { date: string }): CalEvent {
  return {
    id: `e-${overrides.date}-${overrides.sourceId ?? 1}`,
    kind: 'system',
    sourceType: 'global',
    sourceId: 1,
    title: '테스트 일정',
    time: '10:00',
    place: '학생회관',
    club: null,
    accent: 'warm',
    ...overrides,
  };
}

describe('buildUpcoming', () => {
  const today = '2026-08-03';

  it('오늘과 30일째는 포함하고 31일째와 어제는 제외한다', () => {
    const events = [
      makeEvent({ date: '2026-08-02', sourceId: 1 }),
      makeEvent({ date: today, sourceId: 2 }),
      makeEvent({ date: '2026-09-02', sourceId: 3 }),
      makeEvent({ date: '2026-09-03', sourceId: 4 }),
    ];
    expect(buildUpcoming(events, today, ALL_KINDS).map((event) => event.sourceId)).toEqual([2, 3]);
  });

  it('필터에서 빠진 종류는 제외한다', () => {
    const events = [
      makeEvent({ date: today, sourceId: 1, kind: 'deadline' }),
      makeEvent({ date: today, sourceId: 2, kind: 'event' }),
    ];
    const onlyDeadline = new Set<EventKind>(['deadline']);
    expect(buildUpcoming(events, today, onlyDeadline).map((event) => event.sourceId)).toEqual([1]);
  });

  it('다일 이벤트의 fan-out 은 가장 이른 날짜 하나로 합친다', () => {
    const events = [
      makeEvent({ date: '2026-08-10', sourceId: 7, id: 'g-7-d0' }),
      makeEvent({ date: '2026-08-11', sourceId: 7, id: 'g-7-d1' }),
      makeEvent({ date: '2026-08-12', sourceId: 7, id: 'g-7-d2' }),
    ];
    const result = buildUpcoming(events, today, ALL_KINDS);
    expect(result).toHaveLength(1);
    expect(result[0]?.date).toBe('2026-08-10');
  });

  it('날짜 → 시각 오름차순으로 정렬하고 6개로 자른다', () => {
    const events = Array.from({ length: 8 }, (_, index) =>
      makeEvent({ date: `2026-08-${String(20 - index).padStart(2, '0')}`, sourceId: index + 1 }),
    );
    events.push(makeEvent({ date: '2026-08-13', sourceId: 99, time: '09:00' }));
    events.push(makeEvent({ date: '2026-08-13', sourceId: 98, time: '08:00' }));

    const result = buildUpcoming(events, today, ALL_KINDS);
    expect(result).toHaveLength(6);
    expect(result[0]?.sourceId).toBe(98); // 같은 날이면 이른 시각이 먼저
    expect(result[1]?.sourceId).toBe(99);
    expect(result.map((event) => event.date)).toEqual([...result.map((event) => event.date)].sort());
  });
});

describe('toUpcomingView', () => {
  it('오늘은 D-DAY, 이후는 D-N 으로 표기한다', () => {
    const today = '2026-08-03';
    expect(toUpcomingView(makeEvent({ date: today }), today).dday).toBe('D-DAY');
    expect(toUpcomingView(makeEvent({ date: '2026-08-10' }), today).dday).toBe('D-7');
    expect(toUpcomingView(makeEvent({ date: '2026-09-02' }), today).dday).toBe('D-30');
  });

  it('날짜·요일 라벨과 장소·동아리 라벨을 만든다', () => {
    const view = toUpcomingView(
      makeEvent({ date: '2026-08-31', place: '지원폼', club: 'FLYING' }),
      '2026-08-03',
    );
    expect(view.dateLabel).toBe('08.31');
    expect(view.weekdayLabel).toBe('월');
    expect(view.placeLabel).toBe('지원폼 · FLYING');
  });

  it('동아리가 없으면 장소만 남긴다', () => {
    const view = toUpcomingView(makeEvent({ date: '2026-08-31', place: '학생회관', club: null }), '2026-08-03');
    expect(view.placeLabel).toBe('학생회관');
  });

  it('다일 이벤트만 기간 라벨을 갖는다', () => {
    expect(toUpcomingView(makeEvent({ date: '2026-08-10', span: 3 }), '2026-08-03').periodLabel).toBe('8/10 ~ 8/12');
    expect(toUpcomingView(makeEvent({ date: '2026-08-10' }), '2026-08-03').periodLabel).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/apps/web && pnpm vitest run test/calendar/upcoming.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 표시 상수 이동**

`frontend/apps/web/app/calendar/_lib/calendarDisplay.ts` 를 만들고, `CalendarPage.tsx` 상단에 있는
`ACCENT` / `KIND_LABEL` / `KIND_ORDER` / `KIND_ACCENT` 선언을 **그대로 잘라 옮긴다**(값 변경 금지).
`CalendarPage.tsx` 는 선언을 지우고 import 로 바꾼다:

```ts
import { ACCENT, KIND_ACCENT, KIND_LABEL, KIND_ORDER } from '../_lib/calendarDisplay';
```

- [ ] **Step 4: `upcoming.ts` 구현**

```ts
import { addDaysIso } from '@duing/hooks';
import type { CalEvent, EventKind } from '@duing/types';

/** Upcoming 조회 창 — 오늘부터 30일(양끝 포함). 14일은 현재 데이터 밀도에서 빈 상태가 잦다. */
export const UPCOMING_WINDOW_DAYS = 30;
export const UPCOMING_LIMIT = 6;

/**
 * 창·필터·중복 제거·정렬·limit 만 담당한다(표시 포맷은 toUpcomingView).
 *
 * @param events 창이 걸치는 달들을 병합한 이벤트 — 창 밖 날짜가 섞여 있어도 된다.
 * @param todayIso 로컬 오늘 "YYYY-MM-DD"
 * @param activeKinds 필터 칩 상태 — 메인 캘린더와 동기, 달(View)과는 무관
 */
export function buildUpcoming(
  events: CalEvent[],
  todayIso: string,
  activeKinds: Set<EventKind>,
): CalEvent[] {
  const windowEnd = addDaysIso(todayIso, UPCOMING_WINDOW_DAYS);
  // 다일 이벤트는 날짜별로 fan-out 되어 있으므로 원본(sourceType-sourceId) 단위로 접는다.
  const originals = new Map<string, CalEvent>();
  for (const event of events) {
    if (!activeKinds.has(event.kind)) continue;
    if (event.date < todayIso || event.date > windowEnd) continue;
    const key = `${event.sourceType}-${event.sourceId}`;
    const existing = originals.get(key);
    if (!existing || event.date < existing.date) originals.set(key, event);
  }
  return Array.from(originals.values())
    .sort((first, second) => first.date.localeCompare(second.date) || first.time.localeCompare(second.time))
    .slice(0, UPCOMING_LIMIT);
}
```

- [ ] **Step 5: `upcomingView.ts` 구현**

```ts
import { addDaysIso } from '@duing/hooks';
import type { AccentStyle, CalEvent } from '@duing/types';

import { ACCENT, KIND_LABEL } from './calendarDisplay';

export type UpcomingView = {
  dateLabel: string;
  weekdayLabel: string;
  dday: string;
  title: string;
  placeLabel: string;
  periodLabel: string | null;
  kindLabel: string;
  timeLabel: string;
  accent: AccentStyle;
};

const WEEKDAY_KR = ['일', '월', '화', '수', '목', '금', '토'];

function toLocalDate(iso: string): Date {
  const parts = iso.split('-').map(Number);
  return new Date(parts[0] ?? 0, (parts[1] ?? 1) - 1, parts[2] ?? 1);
}

function shortDate(iso: string): string {
  const parts = iso.split('-').map(Number);
  return `${parts[1] ?? 0}/${parts[2] ?? 0}`;
}

/** 목록 표시에 필요한 문자열만 만든다 — 데스크탑 카드와 모바일 타임라인이 같은 값을 쓴다. */
export function toUpcomingView(event: CalEvent, todayIso: string): UpcomingView {
  const eventDate = toLocalDate(event.date);
  const daysLeft = Math.round((eventDate.getTime() - toLocalDate(todayIso).getTime()) / 86_400_000);
  const span = event.span ?? 1;

  return {
    dateLabel: event.date.slice(5).replace('-', '.'),
    weekdayLabel: WEEKDAY_KR[eventDate.getDay()] ?? '',
    dday: daysLeft === 0 ? 'D-DAY' : `D-${daysLeft}`,
    title: event.title,
    placeLabel: event.club ? `${event.place} · ${event.club}` : event.place,
    periodLabel: span >= 2 ? `${shortDate(event.date)} ~ ${shortDate(addDaysIso(event.date, span - 1))}` : null,
    kindLabel: KIND_LABEL[event.kind],
    timeLabel: event.time,
    accent: ACCENT[event.accent],
  };
}
```

- [ ] **Step 6: 통과 확인**

Run: `cd frontend/apps/web && pnpm vitest run test/calendar/upcoming.test.ts`
Expected: PASS (8 tests)

Run: `pnpm typecheck && pnpm lint`
Expected: 에러 0

- [ ] **Step 7: 커밋**

```bash
git add frontend/apps/web/app/calendar/_lib frontend/apps/web/app/calendar/_pages/CalendarPage.tsx frontend/apps/web/test/calendar
git commit -m "feat(frontend): Upcoming 목록 로직·표시 변환 분리 및 표시 상수 이동"
```

---

### Task 3: CalendarPage 배선 — 30일 창 + 카피 + 빈 상태

**Files:**
- Modify: `frontend/apps/web/app/calendar/_pages/CalendarPage.tsx`
- Create: `frontend/apps/web/app/calendar/_components/UpcomingCards.tsx`
- Test: `frontend/apps/web/test/calendar/upcoming-section.test.tsx` (신규)

**Interfaces:**
- Consumes: `useCalendarMonthsQuery`, `monthsInRange`, `addDaysIso` (Task 1), `buildUpcoming`, `toUpcomingView`, `UPCOMING_WINDOW_DAYS` (Task 2)
- Produces: `UpcomingCards({ events, todayIso }: { events: CalEvent[]; todayIso: string })` — 데스크탑 카드 그리드(`.cal-upcoming`)

- [ ] **Step 1: 데스크탑 카드 컴포넌트로 이동**

`CalendarPage.tsx` 의 `{/* ===== Upcoming timeline ===== */}` 섹션 안에서 **`<div className="cal-upcoming">` 부터 그 닫는 태그까지**를 `_components/UpcomingCards.tsx` 로 옮긴다.

- 카드 내부의 인라인 스타일·마크업은 **한 글자도 바꾸지 않는다**(데스크탑 무변경 원칙).
- 카드 안에서 쓰던 `dleft` IIFE·`formatPeriod`·`ACCENT[event.accent]`·`KIND_LABEL[event.kind]` 는
  `toUpcomingView(event, todayIso)` 결과로 대체한다(값이 같아야 한다).
- 파일 상단은 `'use client';` 로 시작한다.

- [ ] **Step 2: 30일 창 배선**

`CalendarPage.tsx` 에서 기존 `upcoming` useMemo(“이번 달의 오늘 이후 6개”)를 삭제하고 아래로 교체한다:

```tsx
  // Upcoming 은 보고 있는 달과 무관하게 "오늘부터 30일" 을 본다. 창이 걸치는 달은 1~3개다.
  const upcomingMonths = useMemo(
    () => monthsInRange(todayIso, addDaysIso(todayIso, UPCOMING_WINDOW_DAYS)),
    [todayIso],
  );
  const upcomingCalendar = useCalendarMonthsQuery(upcomingMonths, {
    isAuthenticated,
    mappers: calendarMappers,
  });
  const upcoming = useMemo(
    () => buildUpcoming(upcomingCalendar.events, todayIso, activeKinds),
    [upcomingCalendar.events, todayIso, activeKinds],
  );
  // 필터를 모두 끈 경우와 진짜 일정이 없는 경우를 구분해 문구를 다르게 안내한다.
  const upcomingEmptyByFilter = upcoming.length === 0 && activeKinds.size < KIND_ORDER.length;
  // 창이 1~3개 달에 걸쳐 늦게 도착하는 달이 있다 — 로딩 중 0건에 "일정이 없어요" 를 띄우면 안 된다.
  const showUpcomingEmpty = upcoming.length === 0 && !upcomingCalendar.isLoading;
```

import 를 갱신한다:

```ts
import { addDaysIso, monthsInRange, useCalendarMonthQuery, useCalendarMonthsQuery, useManagedClubsQuery, useMeQuery } from '@duing/hooks';
import { buildUpcoming, UPCOMING_WINDOW_DAYS } from '../_lib/upcoming';
```

- [ ] **Step 3: 카피·빈 상태 반영**

섹션 제목을 바꾸고(로직과 문구 일치), 빈 상태를 추가한다:

```tsx
              <h2 style={{ fontSize: 28, lineHeight: 1.1 }}>
                앞으로 한 달, 놓치면 아쉬워요
              </h2>
```

`<UpcomingCards … />` 앞에 빈 상태 분기를 둔다:

```tsx
          {upcoming.length === 0 ? (
            showUpcomingEmpty && (
              <p style={{
                padding: '28px 4px', fontSize: 14, color: 'var(--charcoal-3)',
              }}>
                {upcomingEmptyByFilter
                  ? '필터를 켜면 다가오는 일정을 볼 수 있어요'
                  : '앞으로 한 달간 예정된 일정이 없어요'}
              </p>
            )
          ) : (
            <UpcomingCards events={upcoming} todayIso={todayIso} />
          )}
```

로딩 중에는 문구 없이 자리를 비워 둔다(이 섹션은 페이지 하단이라 스켈레톤까지 두지 않는다).

- [ ] **Step 4: 섹션 테스트 작성**

`frontend/apps/web/test/calendar/upcoming-section.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CalEvent } from '@duing/types';

import { UpcomingCards } from '@/app/calendar/_components/UpcomingCards';

const event: CalEvent = {
  id: 'g-1-d0',
  date: '2026-08-31',
  kind: 'deadline',
  sourceType: 'recruitment',
  sourceId: 1,
  title: 'FLYING 모집 마감',
  time: '23:59',
  place: '지원폼',
  club: 'FLYING',
  accent: 'coral',
};

describe('UpcomingCards', () => {
  it('제목·D-Day·장소를 보여준다', () => {
    render(<UpcomingCards events={[event]} todayIso="2026-08-03" />);
    expect(screen.getByText('FLYING 모집 마감')).toBeInTheDocument();
    expect(screen.getByText('D-28')).toBeInTheDocument();
    expect(screen.getByText(/지원폼/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: 검증**

Run: `cd frontend/apps/web && pnpm vitest run test/calendar && pnpm typecheck && pnpm lint`
Expected: 전량 PASS, 에러 0

Run: `pnpm vitest run`
Expected: 기존 테스트 전량 PASS

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/calendar frontend/apps/web/test/calendar
git commit -m "feat(frontend): Upcoming 을 오늘부터 30일 창으로 전환 — 달 이동과 분리, 빈 상태 2종"
```

---

### Task 4: 모바일 Timeline List

**Files:**
- Create: `frontend/apps/web/app/calendar/_components/UpcomingTimeline.tsx`
- Modify: `frontend/apps/web/app/calendar/_pages/CalendarPage.tsx` (타임라인 형제로 추가)
- Modify: `frontend/apps/web/app/globals.css` (뷰포트 스위치)
- Test: `frontend/apps/web/test/calendar/upcoming-timeline.test.tsx` (신규)

**Interfaces:**
- Consumes: `toUpcomingView` (Task 2), `KIND_ACCENT`/`ACCENT` (Task 2)
- Produces: `UpcomingTimeline({ events, todayIso, onSelect }: { events: CalEvent[]; todayIso: string; onSelect: (event: CalEvent) => void })`

- [ ] **Step 1: 실패 테스트 작성**

`frontend/apps/web/test/calendar/upcoming-timeline.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CalEvent } from '@duing/types';

import { UpcomingTimeline } from '@/app/calendar/_components/UpcomingTimeline';

const event: CalEvent = {
  id: 'g-1-d0',
  date: '2026-08-31',
  kind: 'deadline',
  sourceType: 'recruitment',
  sourceId: 1,
  title: 'FLYING 모집 마감',
  time: '23:59',
  place: '지원폼',
  club: 'FLYING',
  accent: 'coral',
};

describe('UpcomingTimeline', () => {
  it('행 전체가 버튼이고 탭하면 해당 일정을 넘겨준다', () => {
    const onSelect = vi.fn();
    render(<UpcomingTimeline events={[event]} todayIso="2026-08-03" onSelect={onSelect} />);

    const row = screen.getByRole('button', { name: /FLYING 모집 마감/ });
    fireEvent.click(row);

    expect(onSelect).toHaveBeenCalledWith(event);
  });

  it('날짜·요일·D-Day·장소를 보여준다', () => {
    render(<UpcomingTimeline events={[event]} todayIso="2026-08-03" onSelect={() => undefined} />);
    expect(screen.getByText('08.31')).toBeInTheDocument();
    expect(screen.getByText('월')).toBeInTheDocument();
    expect(screen.getByText('D-28')).toBeInTheDocument();
    expect(screen.getByText('지원폼 · FLYING')).toBeInTheDocument();
  });

  it('행에 합성된 접근성 이름이 붙는다', () => {
    render(<UpcomingTimeline events={[event]} todayIso="2026-08-03" onSelect={() => undefined} />);
    // 날짜·요일·제목·장소·D-Day 가 한 문장으로 읽혀야 한다.
    expect(
      screen.getByRole('button', { name: '8월 31일 월요일, FLYING 모집 마감, 지원폼 · FLYING, D-28' }),
    ).toBeInTheDocument();
  });

  it('목록 시맨틱을 유지한다(list + listitem)', () => {
    render(<UpcomingTimeline events={[event]} todayIso="2026-08-03" onSelect={() => undefined} />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('데스크탑 전용 요소(자세히)는 렌더하지 않는다', () => {
    render(<UpcomingTimeline events={[event]} todayIso="2026-08-03" onSelect={() => undefined} />);
    expect(screen.queryByText(/자세히/)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/apps/web && pnpm vitest run test/calendar/upcoming-timeline.test.tsx`
Expected: FAIL — 컴포넌트 없음

- [ ] **Step 3: 컴포넌트 구현**

`frontend/apps/web/app/calendar/_components/UpcomingTimeline.tsx`:

```tsx
'use client';

import type { CalEvent } from '@duing/types';

import { KIND_ACCENT, ACCENT } from '../_lib/calendarDisplay';
import { toUpcomingView } from '../_lib/upcomingView';

type Props = {
  events: CalEvent[];
  todayIso: string;
  onSelect: (event: CalEvent) => void;
};

// 모바일 전용 — 카드(250px)를 행(68px)으로 접어 한 화면에서 6건을 훑을 수 있게 한다.
// 데스크탑에서 노출하는 카테고리 칩·시각·"자세히"는 여기서 덜어낸다(칩은 레일 도트 색이 대신한다).
export function UpcomingTimeline({ events, todayIso, onSelect }: Props) {
  return (
    <ul className="cal-upcoming-timeline">
      {events.map((event, index) => {
        const view = toUpcomingView(event, todayIso);
        const dotColor = ACCENT[KIND_ACCENT[event.kind]].dot;
        const isLast = index === events.length - 1;
        // 시각 배치를 그대로 읽으면 파편적이라 한 문장으로 합성한다.
        // aria-label 은 내부 텍스트를 대체하므로 장소·기간까지 담아 정보가 빠지지 않게 한다.
        // '08.31' 을 그대로 읽히면 "공팔월" 이 되므로 숫자로 되돌려 조립한다.
        const [monthPart = '', dayPart = ''] = view.dateLabel.split('.');
        const rowLabel = [
          `${Number(monthPart)}월 ${Number(dayPart)}일 ${view.weekdayLabel}요일`,
          view.title,
          view.periodLabel ?? view.placeLabel,
          view.dday,
        ].join(', ');
        return (
          <li key={event.id}>
            <button
              type="button"
              onClick={() => onSelect(event)}
              aria-label={rowLabel}
              className="cal-upcoming-row"
            >
              <span className="cal-upcoming-rail">
                <span className="cal-upcoming-date">{view.dateLabel}</span>
                <span className="cal-upcoming-weekday">{view.weekdayLabel}</span>
              </span>
              <span className="cal-upcoming-marker" aria-hidden>
                <span className="cal-upcoming-dot" style={{ background: dotColor }} />
                {!isLast && <span className="cal-upcoming-line" />}
              </span>
              <span className="cal-upcoming-body">
                <span className="cal-upcoming-title">{view.title}</span>
                <span className="cal-upcoming-place">{view.periodLabel ?? view.placeLabel}</span>
              </span>
              <span className="cal-upcoming-dday">{view.dday}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: CalendarPage 에 형제로 추가**

Task 3 Step 3 의 빈 상태 분기 안에서, 카드와 타임라인을 **둘 다** 렌더한다(뷰포트 분기는 CSS 가 한다):

```tsx
          ) : (
            <>
              <UpcomingCards events={upcoming} todayIso={todayIso} />
              <UpcomingTimeline events={upcoming} todayIso={todayIso} onSelect={handleEventClick} />
            </>
          )}
```

`handleEventClick` 은 이미 있는 핸들러(`setSelectedEvent` + `setEventDetailOpen(true)`)를 그대로 쓴다 —
캘린더 상세 패널에서 일정을 탭하는 것과 같은 경로다.

- [ ] **Step 5: 뷰포트 스위치 CSS**

`frontend/apps/web/app/globals.css` 의 캘린더 모바일 블록에서 기존 `.cal-upcoming` 규칙을 교체한다.

```css
  /* 데스크탑 기본: 타임라인은 감춘다. 모바일에서만 카드와 자리를 바꾼다.
     JS 미디어쿼리 분기는 SSR 에서 첫 프레임 깜빡임/하이드레이션 불일치를 만들어 쓰지 않는다.
     주의: 감춰진 쪽도 React 렌더와 effect 는 돈다 — 행에 옵서버·이미지가 붙는 날이 오면 재검토할 것. */
  .cal-upcoming-timeline {
    display: none;
  }
```

미디어쿼리(`@media (max-width: 767px)`) 안:

```css
    .cal-upcoming {
      display: none !important;
    }
    .cal-upcoming-timeline {
      display: block !important;
      margin: 0;
      padding: 0;
      list-style: none;
      border-top: 1px solid var(--gray-line);
    }
    .cal-upcoming-row {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: 68px;
      padding: 12px 4px;
      border: none;
      border-bottom: 1px solid var(--gray-line);
      background: transparent;
      font-family: inherit;
      text-align: left;
      cursor: pointer;
    }
    .cal-upcoming-row:active {
      background: var(--cream-2);
    }
    /* 키보드 포커스 — :active 배경만으로는 보이지 않는다. 레포 관례(ring-ink)에 맞춘다. */
    .cal-upcoming-row:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: -2px;
    }
    .cal-upcoming-rail {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 48px;
      flex-shrink: 0;
    }
    .cal-upcoming-date {
      font-family: var(--font-mono);
      font-size: 15px;
      font-weight: 700;
      color: var(--ink);
    }
    .cal-upcoming-weekday {
      font-size: 11px;
      color: var(--charcoal-3);
    }
    .cal-upcoming-marker {
      position: relative;
      display: flex;
      justify-content: center;
      width: 6px;
      align-self: stretch;
      flex-shrink: 0;
    }
    .cal-upcoming-dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      margin-top: 7px;
    }
    .cal-upcoming-line {
      position: absolute;
      top: 17px;
      bottom: -12px;
      width: 1px;
      background: var(--gray-line);
    }
    .cal-upcoming-body {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
      flex: 1;
    }
    .cal-upcoming-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--ink-deep);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cal-upcoming-place {
      font-size: 12px;
      color: var(--charcoal-3);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cal-upcoming-dday {
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 700;
      color: var(--charcoal-2);
      flex-shrink: 0;
    }
```

- [ ] **Step 6: 검증**

Run: `cd frontend/apps/web && pnpm vitest run test/calendar && pnpm typecheck && pnpm lint`
Expected: 전량 PASS, 에러 0

- [ ] **Step 7: 커밋**

```bash
git add frontend/apps/web/app/calendar frontend/apps/web/app/globals.css frontend/apps/web/test/calendar
git commit -m "feat(frontend): Upcoming 모바일 타임라인 — 행 전체 터치·상세 모달 연결"
```

---

### Task 5: 실브라우저 검증 + 마무리

**Files:**
- Modify: `docs/superpowers/specs/2026-08-03-calendar-upcoming-30d-design.md` (상태 갱신)

- [ ] **Step 1: 개발 서버 기동**

Run: `cd frontend/apps/web && pnpm dev > /tmp/duing-dev.log 2>&1 &`
로그는 파일로 받는다(파이프로 띄우면 서버가 죽는다). `/tmp/duing-dev.log` 에서 `Local:` 포트가 **3000** 인지
확인하고, 3001 로 밀렸으면 좀비 `next-server` 를 정리한 뒤 재기동한다. 로컬 백엔드(:8080)도 떠 있어야 한다.

- [ ] **Step 2: 모바일 높이·동작 확인 (390×844)**

Playwright MCP 로 `/calendar` 접속 후:

- `.cal-upcoming-timeline` 이 보이고 `.cal-upcoming` 은 `display: none` 인지
- 행 높이가 64~72px 범위인지, 섹션 전체 높이가 이전(카드 250px×N)보다 줄었는지 — 수치로 기록
- 행을 탭하면 일정 상세 모달이 열리는지
- `browser_console_messages` 로 에러가 없는지

- [ ] **Step 3: 뷰 분리 확인**

달 이동 버튼으로 다음 달·지난 달로 이동해도 **Upcoming 목록이 그대로인지** 확인한다(이전에는 달을 넘기면
목록이 바뀌거나 비었다). 필터 칩을 끄면 목록이 따라 줄고, 전부 끄면 필터 안내 문구가 나오는지도 본다.

- [ ] **Step 4: 데스크탑 무변경 확인 (1280×900)**

카드 그리드가 3열로 그대로 나오고 타임라인은 감춰져 있는지, 카드의 D-Day·장소·시각 표기가 이전과 같은지
확인한다.

- [ ] **Step 5: 개발 서버 종료**

부모 → 워커(next-server) 순으로 종료하고 `:3000` 이 풀렸는지 확인한다.

- [ ] **Step 6: 문서 상태 갱신 + 커밋**

설계 문서 헤더의 `상태: 승인 대기` → `상태: 구현 완료`.

```bash
git add docs/superpowers/specs/2026-08-03-calendar-upcoming-30d-design.md
git commit -m "docs(spec): 캘린더 Upcoming 30일 창 구현 완료 상태 반영"
```

- [ ] **Step 7: 사용자 보고**

측정값(섹션 높이 before/after, 행 높이)과 함께 보고한다. **push·PR 생성은 사용자 지시 후에만 한다.**
후속 과제로 "모집 마감 API `from`/`to` 전환 후 range 단일 조회로 통일"을 함께 남긴다.

---

## Self-Review

**Spec coverage**

| 스펙 요구 | 담당 |
| --- | --- |
| 오늘~30일 창(양끝 포함), 최대 6개 | Task 2 Step 4 + 경계 테스트 |
| 창이 걸치는 달 1~3개 계산 | Task 1 Step 3 + 1월 말 3개월 테스트 |
| 훅 반복 호출 불가 → 목록 받는 훅 | Task 1 Step 5 |
| 캐시 중첩(월 단위 키 유지) | Task 1 Step 5 (globalEventKeys/recruitmentQueryKeys/clubEventKeys 그대로 사용) |
| 필터 연동 유지·달과 분리 | Task 3 Step 2 |
| 빈 상태 2종 | Task 3 Step 3 |
| 카피 일치 | Task 3 Step 3 |
| 모바일 타임라인·행 전체 터치·자세히 제거 | Task 4 Step 3 + 테스트 3건 |
| 탭 → 기존 상세 모달 경로 | Task 4 Step 4 (`handleEventClick`) |
| 데스크탑 무변경 | Task 3 Step 1(마크업 이동만) + Task 5 Step 4 |
| 반응형 = 양쪽 렌더 + CSS 숨김 | Task 4 Step 5 + 주석 |
| buildUpcoming / toUpcomingView 분리 | Task 2 |
| 백엔드 변경 없음 | 어느 Task 에서도 백엔드 미수정 |

**Placeholder scan:** "TBD"·"적절히" 류 없음. Task 3 Step 1 은 기존 마크업을 옮기는 작업이라 코드를 싣지 않고
"한 글자도 바꾸지 않는다"는 제약과 대체 규칙(`toUpcomingView` 결과 사용)을 명시했다.

**Type consistency:** `buildUpcoming(events, todayIso, activeKinds) → CalEvent[]`, `toUpcomingView(event, todayIso) → UpcomingView`,
`UpcomingTimeline({ events, todayIso, onSelect })`, `UpcomingCards({ events, todayIso })` 가 Task 2~4 에서 동일하게 쓰인다.
`monthsInRange`/`monthBounds`/`useCalendarMonthsQuery` 는 Task 1 에서 정의한 시그니처 그대로 Task 3 이 소비한다.
