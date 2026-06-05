# PR3 — 캘린더 실데이터 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/calendar` 페이지의 하드코딩 `CAL_EVENTS_INITIAL` 을 제거하고, GlobalEvent + Recruitment + ClubEvent 3 도메인의 실데이터를 통합 표시한다. 캘린더의 로컬 작성/편집 기능을 제거하고 적절한 sub-flow 로 안내하는 deep link 디스패처(`AddEventDispatcher`)로 전환한다.

**Architecture:** 데이터는 신규 합본 훅 `useCalendarMonthQuery(yearMonth, options)` 가 3 도메인을 병렬 fetch 해 정규화(`toCalEvent_global` / `toCalEvent_recruitment` / `toCalEvent_clubEvent`) 한 뒤 **단일 `events: CalEvent[]` 로 이미 합쳐진 결과**를 반환한다 (CalendarPage 는 이걸 그대로 사용 — 자체 merge 없음). ClubEvent 병합은 `useQueries` 의 `queryFn` 내부에서 `club` 을 클로저로 캡처해 mapper 를 적용 — `myClubs[index]` 같은 위치 의존 제거. `CalEvent` 는 `EventKind` 3종(`system`/`deadline`/`event`) + 라우팅용 메타 `sourceType`/`sourceId`/`sourceClubId` 를 갖는다. 편집 핸들러는 모두 제거하고 `EventDetailModal` 은 읽기 전용 + sourceType 분기로 "원본 보기" 만 제공한다. 비로그인은 GlobalEvent + Recruitment 만 보여주고, 한 도메인만 에러 시 나머지는 그대로 렌더한다.

**Tech Stack:** Next.js 15 App Router · React 19 · TanStack Query v5 (`useQueries` 병렬) · `@duing/types|api|hooks`.

**브랜치:** `feat/calendar-integration` (develop 분기). **선행 의존:** PR1 (백엔드) + PR2 (어드민 UI) 머지 후 시작 — PR2 의 `useGlobalEventListQuery` 가 본 plan 의 합본 훅에서 호출됨.

**spec 참조:** [`docs/superpowers/specs/2026-06-05-calendar-integration-design.md`](../specs/2026-06-05-calendar-integration-design.md) §3.

---

## 사전 컨벤션 (모든 task 공통)

- 타입 `type`, `interface` 금지.
- `any` 금지, `as` 단언 금지. 좁히려면 zod parse / 타입 가드.
- 서버 상태는 무조건 TanStack Query — `useState` 로 events 보유 금지.
- 변수명 풀네임. `e` 대신 `event` / `clickEvent` / `keyboardEvent`.
- 커밋: `feat(frontend): ...` Conventional Commits. Claude attribution 없음.
- 빌드: `pnpm --filter web build` 그린 + dev 서버 수동 시나리오 검증.

---

## File Structure (전체 PR 산출물)

**신규**
```
frontend/packages/hooks/src/calendarMonth.ts

frontend/apps/web/app/calendar/_components/
└── AddEventDispatcher.tsx

frontend/apps/web/app/calendar/_lib/
├── calendarMappers.ts
└── monthRange.ts
```

**수정**
```
frontend/apps/web/app/calendar/_types/index.ts          # EventKind 3종 + sourceType/sourceId/sourceClubId
frontend/apps/web/app/calendar/_components/EventDetailModal.tsx  # 읽기 전용 + sourceType 분기
frontend/apps/web/app/calendar/_pages/CalendarPage.tsx  # 합본 훅 + 편집 로직 제거
frontend/packages/hooks/src/index.ts                    # useCalendarMonthQuery 재export
```

**제거**
```
frontend/apps/web/app/calendar/_components/AddEventModal.tsx
frontend/apps/web/app/calendar/_components/EventEditModal.tsx
frontend/apps/web/app/calendar/_components/DeleteConfirmModal.tsx
frontend/apps/web/app/calendar/_components/TimeField.tsx
```

---

## Task 1: `CalEvent` 타입 packages/types 승격 + month 윈도우 유틸

`EventKind` 3종으로 좁히고 `sourceType` / `sourceId` / `sourceClubId` 추가. `packages/hooks/src/calendarMonth.ts` 에서도 import 해야 하므로 도메인 타입은 `packages/types/src/calendar.ts` 로 승격하고 `apps/web/app/calendar/_types/index.ts` 는 re-export 만.

**Files:**
- Create: `frontend/packages/types/src/calendar.ts`
- Modify: `frontend/packages/types/src/index.ts`
- Modify: `frontend/apps/web/app/calendar/_types/index.ts`
- Create: `frontend/apps/web/app/calendar/_lib/monthRange.ts`

- [ ] **Step 1: `packages/types/src/calendar.ts` 작성**

```ts
export type EventKind = 'system' | 'deadline' | 'event';
export type EventSource = 'global' | 'recruitment' | 'clubEvent';
export type AccentKey = 'ink' | 'coral' | 'warm' | 'berry' | 'sage' | 'sky';

export type AccentStyle = {
  dot: string;
  bg: string;
  fg: string;
};

export type CalEvent = {
  id: string;                       // prefix 포함 (g-/r-/c-)
  date: string;                     // YYYY-MM-DD
  kind: EventKind;
  sourceType: EventSource;
  sourceId: number;
  sourceClubId?: number;            // clubEvent 만
  title: string;
  time: string;
  place: string;
  club: string | null;
  accent: AccentKey;
  span?: number;
  description?: string;
};
```

- [ ] **Step 2: `packages/types/src/index.ts` 에 재export 추가**

```ts
export * from './calendar';
```

- [ ] **Step 3: `apps/web/app/calendar/_types/index.ts` 는 얇은 re-export**

```ts
export type {
  AccentKey,
  AccentStyle,
  CalEvent,
  EventKind,
  EventSource,
} from '@duing/types';
```

이전 `contact?: string` 필드는 하드코딩 전용이었으므로 제거.

- [ ] **Step 4: month 윈도우 유틸 작성**

`_lib/monthRange.ts`:

```ts
// yearMonth: "YYYY-MM" → { from: "YYYY-MM-01", to: "YYYY-MM-<lastDay>" }
export function monthRange(yearMonth: string): { from: string; to: string } {
  const parts = yearMonth.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    throw new Error(`invalid yearMonth: ${yearMonth}`);
  }
  const lastDay = new Date(year, month, 0).getDate();
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

export function spanDays(startAt: string, endAt: string): number {
  const startDay = new Date(startAt.slice(0, 10));
  const endDay = new Date(endAt.slice(0, 10));
  const diffMs = endDay.getTime() - startDay.getTime();
  return Math.max(1, Math.round(diffMs / 86_400_000) + 1);
}

export function formatRange(startAt: string, endAt: string): string {
  const startTime = startAt.slice(11, 16);
  const endTime = endAt.slice(11, 16);
  if (startTime === endTime) return startTime;
  return `${startTime}–${endTime}`;
}
```

- [ ] **Step 5: 타입체크**

Run: `pnpm --filter @duing/types typecheck && pnpm --filter web typecheck`
Expected: `@duing/types` PASS. web 은 `CalendarPage.tsx` 가 옛 필드를 참조 중이므로 컴파일 에러 다수 발생 가능 — 다음 task 에서 해결.

> ⚠️ **이 step 에서 web typecheck 가 빨개도 OK** — 본격 마이그레이션은 Task 5 의 `CalendarPage` 리팩토링에서 한 번에 통과. 다만 신규 파일 (`packages/types/src/calendar.ts`, `_lib/monthRange.ts`) 자체에는 에러가 없어야 함.

- [ ] **Step 6: 커밋**

```bash
git add frontend/packages/types/src/calendar.ts \
        frontend/packages/types/src/index.ts \
        frontend/apps/web/app/calendar/_types/index.ts \
        frontend/apps/web/app/calendar/_lib/monthRange.ts
git commit -m "feat(frontend): CalEvent 타입 packages/types 승격 + 월 윈도우 유틸"
```

---

## Task 2: 캘린더 합본 훅 `useCalendarMonthQuery`

3 도메인 병렬 fetch + 정규화 + 합본. recruitment 는 yearMonth 기반, global / clubEvent 는 from/to 기반. 로그인/회원 클럽 0 케이스 분기.

**Files:**
- Create: `frontend/apps/web/app/calendar/_lib/calendarMappers.ts`
- Create: `frontend/packages/hooks/src/calendarMonth.ts`
- Modify: `frontend/packages/hooks/src/index.ts`

- [ ] **Step 1: Mapper 작성**

`_lib/calendarMappers.ts`:

```ts
import type {
  ClubEventCard,
  GlobalEventCard,
  MyClubSummary,
  RecruitmentSummary,
} from '@duing/types';
import type { CalEvent } from '../_types';
import { formatRange, spanDays } from './monthRange';

export function toCalEvent_global(item: GlobalEventCard): CalEvent {
  return {
    id: `g-${item.id}`,
    sourceType: 'global',
    sourceId: item.id,
    kind: 'system',
    accent: 'warm',
    date: item.startAt.slice(0, 10),
    title: item.title,
    time: formatRange(item.startAt, item.endAt),
    place: item.location ?? '',
    club: null,
    span: spanDays(item.startAt, item.endAt),
  };
}

export function toCalEvent_recruitment(item: RecruitmentSummary): CalEvent | null {
  if (item.endDate === null) return null; // 상시모집 — 캘린더 표시 대상 아님
  return {
    id: `r-${item.id}`,
    sourceType: 'recruitment',
    sourceId: item.id,
    kind: 'deadline',
    accent: 'coral',
    date: item.endDate,
    title: `${item.clubName} 모집 마감`,
    time: '23:59',
    place: '지원폼',
    club: item.clubName,
  };
}

// 참고: Recruitment API 는 month 기준 (`?yearMonth=YYYY-MM`) 이며,
// 백엔드는 "해당 월과 기간이 겹치는" 모집을 모두 반환한다.
// 따라서 May 호출이 endDate=June 인 모집을 포함할 수 있고, mapper 가 찍은 date
// (= endDate) 가 현재 viewMonth 와 다를 수 있다. CalendarPage 그리드는
// `event.date.startsWith(viewMonthPrefix)` 로 필터링하므로 자동으로 드랍 — 정상 동작.
// 다음 달로 navigate 하면 새 yearMonth 쿼리가 동일 모집을 반환해 그때 렌더된다.

export function toCalEvent_clubEvent(item: ClubEventCard, club: MyClubSummary): CalEvent {
  return {
    id: `c-${item.id}`,
    sourceType: 'clubEvent',
    sourceId: item.id,
    sourceClubId: club.clubId,
    kind: 'event',
    accent: 'sage',
    date: item.startAt.slice(0, 10),
    title: item.title,
    time: formatRange(item.startAt, item.endAt),
    place: item.location ?? '',
    club: club.clubName,
  };
}
```

상시모집(`endDate === null`) 은 마감일이 없으므로 캘린더에 표시할 수 없어 null 반환 → 호출자가 filter.

- [ ] **Step 2: `useCalendarMonthQuery` 작성**

`packages/hooks/src/calendarMonth.ts`:

```ts
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type {
  CalEvent,
  ClubEventCard,
  GlobalEventCard,
  MyClubSummary,
  RecruitmentSummary,
} from '@duing/types';

import { useApiClient } from './api-context';
import { clubEventKeys } from './clubEventQueryKeys';
import { useGlobalEventListQuery } from './globalEvents';
import { useRecruitmentCalendarQuery } from './recruitments';
import { useMyClubsQuery } from './clubs';

export type CalendarMonthOptions = {
  from: string;
  to: string;
  /**
   * 비로그인 시 false 로 호출 — `myClubs` / `clubEvents` skip.
   * 401 을 isError 로 잡지 않게 하기 위함.
   */
  isAuthenticated: boolean;
  /** mapper 3 개를 주입 — packages/hooks 가 apps/web 의 `_lib` 를 import 하지 않도록 호출자에서 주입. */
  mappers: {
    toGlobal: (item: GlobalEventCard) => CalEvent;
    toRecruitment: (item: RecruitmentSummary) => CalEvent | null;
    toClubEvent: (item: ClubEventCard, club: MyClubSummary) => CalEvent;
  };
};

export type CalendarMonthResult = {
  events: CalEvent[];
  isLoading: boolean;
  isError: boolean;
  /** 도메인별 상세 상태가 필요한 경우 (재시도 버튼 등) 호출자에서 분기. */
  perDomain: {
    globalEventsError: boolean;
    recruitmentsError: boolean;
    clubEventsError: boolean;
  };
};

export function useCalendarMonthQuery(
  yearMonth: string,
  options: CalendarMonthOptions,
): CalendarMonthResult {
  const client = useApiClient();
  const { from, to, isAuthenticated, mappers } = options;

  const globalEvents = useGlobalEventListQuery({ from, to });
  const recruitments = useRecruitmentCalendarQuery(yearMonth);
  const myClubsQuery = useMyClubsQuery({ enabled: isAuthenticated });

  const myClubs = isAuthenticated ? (myClubsQuery.data ?? []) : [];

  // queryFn 안에서 `club` 을 클로저로 캡처 → data 는 `CalEvent[]`.
  // 이 패턴으로 index 정렬 의존성 제거 + myClubs 순서가 바뀌어도 안전.
  const clubEventQueries = useQueries({
    queries: myClubs.map((club) => ({
      queryKey: clubEventKeys.list(club.clubId, { from, to }),
      queryFn: async (): Promise<CalEvent[]> => {
        const items = await client.clubEvents.list(club.clubId, { from, to });
        return items.map((item) => mappers.toClubEvent(item, club));
      },
      staleTime: 30 * 1000,
      enabled: isAuthenticated,
    })),
  });

  const events = useMemo<CalEvent[]>(() => {
    const merged: CalEvent[] = [];
    if (globalEvents.data) merged.push(...globalEvents.data.map(mappers.toGlobal));
    if (recruitments.data) {
      for (const item of recruitments.data) {
        const mapped = mappers.toRecruitment(item);
        if (mapped) merged.push(mapped);
      }
    }
    for (const query of clubEventQueries) {
      if (query.data) merged.push(...query.data);
    }
    return merged;
  }, [globalEvents.data, recruitments.data, clubEventQueries, mappers]);

  const isLoading =
    globalEvents.isLoading
    || recruitments.isLoading
    || (isAuthenticated && myClubsQuery.isLoading)
    || clubEventQueries.some((query) => query.isLoading);

  const isError =
    globalEvents.isError
    || recruitments.isError
    || (isAuthenticated && myClubsQuery.isError)
    || clubEventQueries.some((query) => query.isError);

  return {
    events,
    isLoading,
    isError,
    perDomain: {
      globalEventsError: globalEvents.isError,
      recruitmentsError: recruitments.isError,
      clubEventsError: clubEventQueries.some((query) => query.isError)
        || (isAuthenticated && myClubsQuery.isError),
    },
  };
}
```

**설계 메모:**
- 훅은 `events: CalEvent[]` 를 직접 반환 — CalendarPage 에서 별도 merge 없음. spec §3.3 과 일치.
- `CalEvent` 는 현재 `apps/web/app/calendar/_types` 에 있음. `packages/hooks` 에서 import 하려면 cross-package boundary 가 깨짐 → **이 task 의 일부로 `CalEvent` / `EventKind` / `EventSource` / `AccentKey` 등 캘린더 도메인 타입을 `packages/types/src/calendar.ts` 로 승격**하고 `apps/web/app/calendar/_types/index.ts` 는 그것을 re-export 하는 얇은 파일로 전환한다. 위 import 경로는 그 가정.
- mapper 는 호출자(CalendarPage) 에서 주입 — `packages/hooks` 가 `apps/web` 의 `_lib` 를 import 하지 않도록 함. (단 mapper 자체에 `apps/web` 전용 의존이 없다면 mapper 도 `packages/hooks` 또는 `packages/types` 의 utility 로 옮길 수 있음. MVP 는 주입 방식.)

> ⚠️ **`useMyClubsQuery` 가 `{ enabled }` 옵션을 받지 않으면**, 본 task 의 일부로 `packages/hooks/src/clubs.ts` 의 `useMyClubsQuery` 시그니처를 `(options?: { enabled?: boolean })` 로 확장해야 한다. 기존 호출자 는 옵션 미지정 → `enabled` 기본 true 유지 — 하위 호환.
>
> queryKeys 들은 PR2 의 `globalEventKeys` + 기존 `clubEventKeys` / `recruitmentQueryKeys` 를 그대로 재사용 — mutation 시 자동 invalidate.

- [ ] **Step 3: `useMyClubsQuery` 가 `enabled` 옵션 받도록 확장**

`packages/hooks/src/clubs.ts` 의 `useMyClubsQuery` 시그니처를 다음과 같이 확장:

```ts
export function useMyClubsQuery(options?: { enabled?: boolean }) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['users', 'me', 'clubs'],
    queryFn: () => client.users.myClubs(),
    enabled: options?.enabled ?? true,
  });
}
```

(기존 queryKey / queryFn 은 그대로. `enabled` 만 추가.)

다른 호출자(예: 회원 전용 동아리 페이지) 는 옵션 미지정으로 호출 중이라 영향 없음 — 기본값 `true`.

- [ ] **Step 4: hooks index 재export**

`packages/hooks/src/index.ts` 마지막에 추가:

```ts
export { useCalendarMonthQuery } from './calendarMonth';
```

- [ ] **Step 5: 타입체크**

Run: `pnpm --filter @duing/hooks typecheck && pnpm --filter web typecheck`
Expected: 새 파일들에는 에러 없음. CalendarPage 의 에러는 다음 task 에서 정리.

- [ ] **Step 6: 커밋**

```bash
git add frontend/packages/hooks/src/calendarMonth.ts \
        frontend/packages/hooks/src/clubs.ts \
        frontend/packages/hooks/src/index.ts \
        frontend/apps/web/app/calendar/_lib/calendarMappers.ts
git commit -m "feat(frontend): useCalendarMonthQuery (3 도메인 합본) + mapper"
```

---

## Task 3: `AddEventDispatcher` 신규 컴포넌트

기존 `AddEventModal` 대체. 사용자 권한 (LEADER/OFFICER × ADMIN) 에 따라 적절한 sub-page deep link 제공.

**경로 사전 확인 (plan 작성 시점 2026-06-05 확인 완료):**
- `/manage/clubs/[clubId]/recruitments/new` — `apps/web/app/manage/clubs/[clubId]/recruitments/new/page.tsx` 존재. 기존에도 `apps/web/app/manage/clubs/[clubId]/page.tsx` 와 `recruitments/page.tsx` 에서 동일 경로로 deep link 중.
- `/clubs/[clubId]/member/events` — `apps/web/app/clubs/[clubId]/member/events/page.tsx` 존재 (PR #237 머지 완료).
- `/clubs/[clubId]/member/events/[eventId]` — 존재 (EventDetailModal 의 deep link 에서 사용).
- `/admin/global-events/new` — 본 spec 의 PR2 산출물. PR3 시작 전 PR2 머지 필수.
- `/apply/[recruitmentId]` — `apps/web/app/apply/[recruitmentId]/page.tsx` 존재.

작업 시작 시점 (해당 task 시작 직전) 에 위 5 개 경로가 여전히 존재하는지 `find ... -name "page.tsx"` 로 한 번 더 검증할 것.

**Files:**
- Create: `frontend/apps/web/app/calendar/_components/AddEventDispatcher.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useManagedClubsQuery, useMeQuery } from '@duing/hooks';
import type { ManagedClub } from '@duing/types';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AddEventDispatcher({ open, onClose }: Props) {
  const router = useRouter();
  const meQuery = useMeQuery();
  const managedClubsQuery = useManagedClubsQuery();
  const [selectedClubId, setSelectedClubId] = useState<number | null>(null);

  if (!open) return null;

  const isAdmin = meQuery.data?.role === 'ADMIN';
  const managedClubs: ManagedClub[] = managedClubsQuery.data ?? [];
  const hasManagedClubs = managedClubs.length > 0;
  const targetClubId = selectedClubId ?? managedClubs[0]?.clubId ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-[480px] max-w-[92vw] rounded-2xl bg-paper p-6 space-y-6">
        <header className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-ink">일정 추가</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-charcoal-3 text-[20px]"
          >
            ×
          </button>
        </header>

        {hasManagedClubs && (
          <Section title="동아리 일정 추가" description="회원 전용 동아리 일정 페이지로 이동합니다.">
            <ClubSelect
              clubs={managedClubs}
              value={targetClubId}
              onChange={setSelectedClubId}
            />
            <PrimaryButton
              disabled={targetClubId === null}
              onClick={() => {
                if (targetClubId === null) return;
                router.push(`/clubs/${targetClubId}/member/events`);
              }}
            >
              선택한 동아리 일정 페이지로 이동
            </PrimaryButton>
          </Section>
        )}

        {hasManagedClubs && (
          <Section title="모집 공고" description="모집 마감일이 캘린더에 자동 노출됩니다.">
            <PrimaryButton
              disabled={targetClubId === null}
              onClick={() => {
                if (targetClubId === null) return;
                router.push(`/manage/clubs/${targetClubId}/recruitments/new`);
              }}
            >
              모집 공고 작성
            </PrimaryButton>
          </Section>
        )}

        {isAdmin && (
          <Section title="총동연 일정 등록" description="비로그인 포함 모든 사용자에게 노출됩니다.">
            <PrimaryButton onClick={() => router.push('/admin/global-events/new')}>
              글로벌 일정 등록
            </PrimaryButton>
          </Section>
        )}

        {!hasManagedClubs && !isAdmin && (
          <p className="text-[13px] text-charcoal-2">
            일정 추가 권한이 없습니다. 동아리 운영진(LEADER/OFFICER) 또는 총동연(ADMIN) 만 사용할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 border border-line rounded-xl p-4 bg-cream-2">
      <div>
        <h3 className="text-[14px] font-bold text-ink">{title}</h3>
        <p className="text-[12px] text-charcoal-3">{description}</p>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function ClubSelect({
  clubs,
  value,
  onChange,
}: {
  clubs: ManagedClub[];
  value: number | null;
  onChange: (next: number) => void;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(changeEvent) => onChange(Number(changeEvent.target.value))}
      className="px-3 py-2 rounded-md border border-line bg-paper text-[13px]"
    >
      {clubs.map((club) => (
        <option key={club.clubId} value={club.clubId}>
          {club.clubName} ({club.myRole})
        </option>
      ))}
    </select>
  );
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 rounded-full bg-ink text-paper text-[13px] font-semibold disabled:opacity-50"
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter web typecheck`
Expected: 본 컴포넌트 자체에는 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add frontend/apps/web/app/calendar/_components/AddEventDispatcher.tsx
git commit -m "feat(frontend): AddEventDispatcher (deep link 디스패처)"
```

---

## Task 4: `EventDetailModal` 읽기 전용 + sourceType 분기

편집/삭제 버튼 제거. `sourceType === 'global'` 이면 모달 안에서 `useGlobalEventDetailQuery(sourceId)` lazy fetch 해서 description + linkUrl 표시. `recruitment` / `clubEvent` 는 "원본 보기" 버튼으로 deep link.

**Files:**
- Modify: `frontend/apps/web/app/calendar/_components/EventDetailModal.tsx`

- [ ] **Step 1: 기존 파일 확인 후 전체 교체**

먼저 `Read` 로 기존 파일 구조 (props 등) 파악. 그 후 다음으로 전체 교체:

```tsx
'use client';

import Link from 'next/link';
import { useGlobalEventDetailQuery } from '@duing/hooks';
import type { CalEvent, EventSource } from '../_types';

type Props = {
  event: CalEvent;
  open: boolean;
  onClose: () => void;
};

const KIND_LABEL: Record<CalEvent['kind'], string> = {
  system: '행사·일정',
  deadline: '모집 마감',
  event: '동아리 일정',
};

const SOURCE_PATH: Record<EventSource, (event: CalEvent) => string | null> = {
  global: () => null, // 캘린더 모달 안에서 description + linkUrl 노출 — 별도 페이지 없음
  recruitment: (event) => `/apply/${event.sourceId}`,
  clubEvent: (event) =>
    event.sourceClubId !== undefined
      ? `/clubs/${event.sourceClubId}/member/events/${event.sourceId}`
      : null,
};

export function EventDetailModal({ event, open, onClose }: Props) {
  if (!open) return null;
  const sourcePath = SOURCE_PATH[event.sourceType](event);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-[480px] max-w-[92vw] rounded-2xl bg-paper p-6 space-y-5">
        <header className="flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-wider text-charcoal-3">
            {KIND_LABEL[event.kind]}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-charcoal-3 text-[20px]"
          >
            ×
          </button>
        </header>

        <div>
          <h2 className="text-[18px] font-bold text-ink leading-snug">{event.title}</h2>
          <p className="mt-2 text-[12.5px] text-charcoal-3 font-mono">
            {event.date} · {event.time}
          </p>
          {event.place && (
            <p className="mt-1 text-[13px] text-charcoal-2">📍 {event.place}</p>
          )}
          {event.club && (
            <p className="mt-1 text-[13px] text-charcoal-2">🏷 {event.club}</p>
          )}
        </div>

        {event.sourceType === 'global' && (
          <GlobalDetailSection eventId={event.sourceId} />
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full border border-line text-[13px] text-charcoal-2"
          >
            닫기
          </button>
          {sourcePath && (
            <Link
              href={sourcePath}
              className="px-4 py-2 rounded-full bg-ink text-paper text-[13px] font-semibold"
            >
              원본 보기
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function GlobalDetailSection({ eventId }: { eventId: number }) {
  const detailQuery = useGlobalEventDetailQuery(eventId);

  if (detailQuery.isLoading) {
    return <p className="text-[13px] text-charcoal-3">상세 정보를 불러오는 중…</p>;
  }
  if (detailQuery.isError || !detailQuery.data) {
    return <p className="text-[13px] text-coral">상세 정보를 불러오지 못했습니다.</p>;
  }
  const detail = detailQuery.data;
  return (
    <div className="space-y-3 border-t border-line pt-4">
      {detail.description && (
        <p className="text-[13.5px] text-charcoal-1 whitespace-pre-wrap">{detail.description}</p>
      )}
      {detail.linkUrl && (
        <a
          href={detail.linkUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-[13px] text-ink font-semibold underline"
        >
          자세히 보기 ↗
        </a>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter web typecheck`
Expected: 모달 자체 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add frontend/apps/web/app/calendar/_components/EventDetailModal.tsx
git commit -m "feat(frontend): EventDetailModal 읽기 전용 + sourceType 분기"
```

---

## Task 5: `CalendarPage` 리팩토링

하드코딩 제거 + 합본 훅 연결 + 편집 로직 제거 + dispatcher 연결. 이 task 의 commit 으로 typecheck 가 그린이 되어야 함.

**Files:**
- Modify: `frontend/apps/web/app/calendar/_pages/CalendarPage.tsx`

- [ ] **Step 1: 변경 범위 파악**

`Read` 로 현재 `CalendarPage.tsx` 전체 확인 (이미 plan 작성 시 읽음). 변경 포인트:
1. `CAL_EVENTS_INITIAL` 배열 + 관련 상수 삭제
2. `KIND_LABEL` / `KIND_ORDER` 를 3종으로 좁힘
3. `events` state (`useState<CalEvent[]>`) 제거 → `useCalendarMonthQuery` 로 교체
4. `handleAddEvent` / `handleEventEdit` / `handleEventSave` / `handleEventDelete` / `handleEventDeleteConfirm` / `expandRepeat` / `CATEGORY_TO_ACCENT` / `addDays` / `addMonths` 함수 제거
5. `AddEventModal` import 삭제, `AddEventDispatcher` import 추가
6. `EventEditModal` / `DeleteConfirmModal` import + 사용처 삭제
7. `viewMonth` 기본값을 현재 월로 변경 — 하드코딩된 `TODAY = '2026-05-26'` 도 제거하고 실시간 계산 (`new Date()`)
8. `stats.fair` 같은 카드는 spec 3 종 기준 (`stats.system` / `stats.deadline` / `stats.event`) 로 갱신
9. 비로그인 / 에러 / 로딩 분기 추가 (spec §3.7)

- [ ] **Step 2: 전체 교체**

(파일이 크므로 핵심 골격 — 기존 UI 마크업은 보존, 데이터 소스만 교체)

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { SparkleFull } from '../../_components/Sparkle';
import { AddEventDispatcher } from '../_components/AddEventDispatcher';
import { EventDetailModal } from '../_components/EventDetailModal';
import {
  toCalEvent_clubEvent,
  toCalEvent_global,
  toCalEvent_recruitment,
} from '../_lib/calendarMappers';
import { monthRange } from '../_lib/monthRange';
import { useCalendarMonthQuery, useMeQuery } from '@duing/hooks';
import type { AccentKey, AccentStyle, CalEvent, EventKind } from '../_types';

type MonthCell = {
  iso: string;
  d: number;
  inMonth: boolean;
  dow: number;
};

const ACCENT: Record<AccentKey, AccentStyle> = {
  ink:    { dot: 'var(--ink)',      bg: 'var(--sage-mist)', fg: 'var(--ink-deep)' },
  coral:  { dot: '#D97757',         bg: '#FCE2D9',          fg: '#9A3F23'         },
  warm:   { dot: '#E8B968',         bg: '#FBEFD7',          fg: '#8E6620'         },
  berry:  { dot: '#B65672',         bg: '#F6DCE3',          fg: '#7E2A45'         },
  sage:   { dot: 'var(--sage)',     bg: 'var(--sage-tint)', fg: 'var(--ink-deep)' },
  sky:    { dot: '#6A95B8',         bg: '#DDE8F1',          fg: '#2F557A'         },
};

const KIND_LABEL: Record<EventKind, string> = {
  system: '행사·일정',
  deadline: '모집 마감',
  event: '동아리 일정',
};

const KIND_ORDER: EventKind[] = ['system', 'deadline', 'event'];

const KIND_ACCENT: Record<EventKind, AccentKey> = {
  system: 'warm',
  deadline: 'coral',
  event: 'sage',
};

const KR_MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

const fmt = (year: number, monthIndex: number, day: number): string =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const dayOfWeekKR = (iso: string): string => {
  const parts = iso.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const weekday = new Date(year, month - 1, day).getDay();
  return ['일', '월', '화', '수', '목', '금', '토'][weekday] ?? '';
};

const buildMonth = (year: number, monthIndex: number): MonthCell[] => {
  const first = new Date(year, monthIndex, 1);
  const startCol = first.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const prevDays = new Date(year, monthIndex, 0).getDate();
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const offset = i - startCol;
    let day: number;
    let month: number;
    let year2 = year;
    let inMonth: boolean;
    if (offset < 0) {
      day = prevDays + offset + 1;
      month = monthIndex - 1;
      inMonth = false;
    } else if (offset >= daysInMonth) {
      day = offset - daysInMonth + 1;
      month = monthIndex + 1;
      inMonth = false;
    } else {
      day = offset + 1;
      month = monthIndex;
      inMonth = true;
    }
    if (month < 0) { month = 11; year2 -= 1; }
    if (month > 11) { month = 0; year2 += 1; }
    cells.push({ iso: fmt(year2, month, day), d: day, inMonth, dow: i % 7 });
  }
  return cells;
};

export function CalendarPage() {
  const today = new Date();
  const todayIso = fmt(today.getFullYear(), today.getMonth(), today.getDate());

  const [viewYear, setViewYear] = useState<number>(today.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(today.getMonth()); // 0-indexed
  const [activeKinds, setActiveKinds] = useState<Set<EventKind>>(new Set(KIND_ORDER));
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [detailOpen, setDetailOpen] = useState<boolean>(false);
  const [addModalOpen, setAddModalOpen] = useState<boolean>(false);
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [eventDetailOpen, setEventDetailOpen] = useState<boolean>(false);

  const calendarCardRef = useRef<HTMLDivElement>(null);
  const [calendarCardHeight, setCalendarCardHeight] = useState<number | null>(null);

  useEffect(() => {
    const calendarCard = calendarCardRef.current;
    if (!calendarCard) return;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setCalendarCardHeight(
          Math.round(entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height),
        );
      }
    });
    resizeObserver.observe(calendarCard);
    return () => resizeObserver.disconnect();
  }, []);

  const yearMonth = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
  const { from, to } = useMemo(() => monthRange(yearMonth), [yearMonth]);

  const meQuery = useMeQuery();
  const isAuthenticated = !!meQuery.data;

  // mapper 는 안정 참조 — 모듈 스코프 함수이므로 useMemo 의존성으로 안전.
  const calendarMappers = useMemo(
    () => ({
      toGlobal: toCalEvent_global,
      toRecruitment: toCalEvent_recruitment,
      toClubEvent: toCalEvent_clubEvent,
    }),
    [],
  );

  const calendar = useCalendarMonthQuery(yearMonth, {
    from,
    to,
    isAuthenticated,
    mappers: calendarMappers,
  });
  const { events } = calendar;

  const filteredEvents = events.filter((event) => activeKinds.has(event.kind));
  const eventsByDate = filteredEvents.reduce<Record<string, CalEvent[]>>((acc, event) => {
    (acc[event.date] = acc[event.date] || []).push(event);
    return acc;
  }, {});

  const monthCells = buildMonth(viewYear, viewMonth);
  const viewMonthPrefix = yearMonth;
  const inMonth = (iso: string) => iso.startsWith(viewMonthPrefix);
  const stats = {
    total:    events.filter((event) => inMonth(event.date)).length,
    system:   events.filter((event) => inMonth(event.date) && event.kind === 'system').length,
    deadline: events.filter((event) => inMonth(event.date) && event.kind === 'deadline').length,
    event:    events.filter((event) => inMonth(event.date) && event.kind === 'event').length,
  };

  const dayEvents = (eventsByDate[selectedDate] || []).slice().sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
  );

  const upcoming = filteredEvents
    .filter((event) => event.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .slice(0, 6);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((prev) => prev - 1);
      setViewMonth(11);
    } else {
      setViewMonth((prev) => prev - 1);
    }
    setDetailOpen(false);
  };
  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((prev) => prev + 1);
      setViewMonth(0);
    } else {
      setViewMonth((prev) => prev + 1);
    }
    setDetailOpen(false);
  };

  const handleEventClick = (event: CalEvent) => {
    setSelectedEvent(event);
    setEventDetailOpen(true);
  };

  const toggleKind = (kind: EventKind) => {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  return (
    <div className="duing" style={{ background: 'var(--cream)', minHeight: '100%' }}>
      {/* Header / Stats / Filter chips — 기존 마크업 보존, stats 라벨만 3종으로 교체 */}
      {/* (이전 코드의 통계 카드 4 개를 [전체 / 행사·일정(system) / 모집 마감 / 내 동아리 일정(event)] 로 교체) */}
      {/* (이전 코드의 필터 chip KIND_ORDER 매핑은 위 새 KIND_ACCENT 로 단순화) */}

      {!isAuthenticated && !meQuery.isLoading && (
        <div className="bg-coral/10 text-[13px] text-coral px-6 py-2 text-center">
          내 동아리 일정을 보려면 로그인해주세요.
        </div>
      )}

      {calendar.isError && (
        <div className="bg-coral/10 text-[13px] text-coral px-6 py-2 text-center">
          일부 일정을 불러오지 못했습니다.
          {/* perDomain.{globalEventsError|recruitmentsError|clubEventsError} 로 세분화 가능 */}
        </div>
      )}

      {/* (기존 month grid 및 day panel UI 마크업 그대로) */}
      {/* (handleAddEvent → AddEventDispatcher 호출로 교체. EventEditModal/DeleteConfirmModal 마운트 제거) */}

      <AddEventDispatcher open={addModalOpen} onClose={() => setAddModalOpen(false)} />

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          open={eventDetailOpen}
          onClose={() => {
            setEventDetailOpen(false);
            setSelectedEvent(null);
          }}
        />
      )}
    </div>
  );
}
```

> ⚠️ **위는 골격이므로 실제 교체 시 기존 UI 마크업 (header / stats / filter chips / month grid / day panel / upcoming) 은 그대로 유지하고, 데이터 바인딩만 새 변수로 교체** 한다. `useState<CalEvent[]>` / `setEvents` / `handleAddEvent` / `handleEventEdit` / `handleEventSave` / `handleEventDelete*` / `expandRepeat` / `CATEGORY_TO_ACCENT` / `CAL_EVENTS_INITIAL` / `addDays` / `addMonths` / `TODAY` 상수는 모두 제거.
>
> 통계 카드 라벨은 다음으로 교체:
> - `이번 달 전체 일정` → stats.total
> - `행사·일정` (color: warm) → stats.system
> - `모집 마감` (color: coral) → stats.deadline
> - `내 동아리 일정` (color: sage) → stats.event
>
> 필터 chip 의 `ACCENT[k === 'fair' ? 'warm' : ...]` 매핑은 `ACCENT[KIND_ACCENT[k]]` 로 단순화.
>
> `EventDetailModal` 사용처는 `onEdit` / `onDelete` props 를 제거하고 `event` / `open` / `onClose` 만 넘긴다.

- [ ] **Step 3: 빌드 검증**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add frontend/apps/web/app/calendar/_pages/CalendarPage.tsx
git commit -m "feat(frontend): 캘린더 페이지 실데이터 통합 (3 도메인 합본)"
```

---

## Task 6: 사용되지 않는 컴포넌트 제거

`AddEventModal` / `EventEditModal` / `DeleteConfirmModal` / `TimeField` 더 이상 참조되지 않음. import 누수가 없는지 확인 후 삭제.

**Files (제거):**
- Delete: `frontend/apps/web/app/calendar/_components/AddEventModal.tsx`
- Delete: `frontend/apps/web/app/calendar/_components/EventEditModal.tsx`
- Delete: `frontend/apps/web/app/calendar/_components/DeleteConfirmModal.tsx`
- Delete: `frontend/apps/web/app/calendar/_components/TimeField.tsx`

- [ ] **Step 1: 참조 검색**

Run:
```bash
grep -rn "AddEventModal\|EventEditModal\|DeleteConfirmModal\|TimeField" frontend/apps/web/app/calendar/
```
Expected: 매치 없음 (선택적으로 본 파일들 자체만 매치).

- [ ] **Step 2: 파일 제거**

Run:
```bash
rm frontend/apps/web/app/calendar/_components/AddEventModal.tsx \
   frontend/apps/web/app/calendar/_components/EventEditModal.tsx \
   frontend/apps/web/app/calendar/_components/DeleteConfirmModal.tsx \
   frontend/apps/web/app/calendar/_components/TimeField.tsx
```

- [ ] **Step 3: 빌드 검증**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add -u frontend/apps/web/app/calendar/_components/
git commit -m "chore(frontend): 사용하지 않는 캘린더 작성/편집 컴포넌트 제거"
```

---

## Task 7: 수동 시나리오 검증 + PR 준비

- [ ] **Step 1: Dev 서버에서 5 개 권한 시나리오 확인**

Run: `pnpm --filter web dev`

| 권한 | 기대 동작 |
|---|---|
| 비로그인 | GlobalEvent + Recruitment 만 노출, 상단 "로그인 안내" 배너, "내 일정 추가" 클릭 시 dispatcher 의 "권한 없음" 안내 |
| STUDENT (회원 클럽 0) | 위와 동일 + 로그인 배너 사라짐 |
| STUDENT (회원 클럽 1+) | ClubEvent 추가 노출, dispatcher 에서 "권한 없음" (LEADER/OFFICER 아니므로) |
| LEADER (회원 클럽 1+) | 모든 카테고리 노출, dispatcher 에 "동아리 일정 추가" + "모집 공고" 섹션 노출 |
| ADMIN | + dispatcher 에 "글로벌 일정 등록" 섹션 노출 |

- [ ] **Step 2: 데이터 노출 시나리오 확인**

- 다일 GlobalEvent (예: 박람회 3 일짜리) 가 `span: 3` 으로 첫 날 셀에 길게 들어가는지
- 모집 마감 카드 클릭 → `/apply/{recruitmentId}` 이동
- ClubEvent 카드 클릭 → `/clubs/{clubId}/member/events/{eventId}` 이동
- GlobalEvent 카드 클릭 → 모달 안에서 description + (있으면) linkUrl "자세히 보기 ↗" 외부 링크 노출
- 한 도메인만 에러 (예: 백엔드에서 `/recruitments` 만 5xx 강제) → 나머지는 그대로 렌더, 상단 toast/배너 노출
- 월 변경 → 새 query key 로 자동 fetch

- [ ] **Step 3: 전체 lint/typecheck/build**

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: 모두 PASS.

- [ ] **Step 4: spec / PR 체크리스트 self-review**

1. spec §3.1 의 5 개 핵심 변경 (데이터 소스 / EventKind / Accent / AddEventModal / 이벤트 클릭 모달) 모두 반영됐는가
2. spec §3.2 `CalEvent` 타입에 `sourceType` / `sourceId` / `sourceClubId` 추가됐는가
3. spec §3.3 합본 훅이 `useQueries` 로 ClubEvent 병렬 fetch 하는가
4. spec §3.4 mapper 가 prefix 별 id (`g-/r-/c-`) 생성하는가
5. spec §3.5 dispatcher 의 권한별 섹션 분기 (LEADER/OFFICER × ADMIN) 가 동작하는가
6. spec §3.6 EventDetailModal 의 sourceType 분기 + 글로벌 lazy fetch 가 동작하는가
7. 커밋 Conventional Commits + Claude attribution 없음

- [ ] **Step 5: PR 생성**

`feat/calendar-integration` push → develop PR. 본문 예시:

```
## 🚀 작업 내용
캘린더 페이지의 하드코딩 일정을 제거하고 GlobalEvent / Recruitment / ClubEvent 3 도메인의 실데이터를 통합 표시하도록 마이그레이션했습니다.
캘린더 안의 로컬 작성/편집 기능은 제거하고, 적절한 sub-flow 로 안내하는 deep link 디스패처로 전환했습니다.

## 🤔 고민했던 내용
- ClubEvent 는 회원 클럽 N개에 대해 N번 fetch 되는 N+1 구조입니다. 회원 1~3 개 환경에선 `useQueries` 병렬 + 30s 캐시로 충분하다 판단해 통합 API 도입은 후속 과제로 미뤘습니다 (spec Out of Scope 3).
- 모집 상시(`endDate === null`) 은 캘린더 표시 대상에서 제외했습니다 — 날짜 없는 일정을 어디에 놓을지 정의가 없어서입니다.
- 한 도메인만 에러나도 나머지는 보여주도록 합본 훅을 만들었습니다. 부분 실패는 상단 배너로만 알리고 캘린더 본체는 그대로 유지합니다.

## 💬 리뷰 중점사항
- 합본 훅의 `useQueries` 부분 — staleTime / queryKey prefix 공유로 다른 페이지의 mutation 이 자동 invalidate 되는지
- AddEventDispatcher 의 권한 매트릭스 (STUDENT × LEADER/OFFICER × ADMIN) 처리
- EventDetailModal 이 글로벌 이벤트에 한해 description 을 lazy fetch 하는 방식
```

---

## Out of Scope (이 plan 에서 안 함)

- ClubEvent 통합 엔드포인트 (`GET /me/club-events`) — N+1 트리거 발생 시 별도 spec.
- `ClubEventType` enum 도입 — 현재는 모두 `event` 단일 kind.
- GlobalEvent 공개 상세 페이지 (`/global-events/[eventId]`) — 캘린더 모달로 충분.
- 캘린더 검색/키워드 필터 (월 단위 grid + kind 필터만 유지).
- EXTERNAL 모집의 외부 폼 분기 — `/apply/{id}` 통일.
- 캘린더 "기간 더 보기" 옵션.
