import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { CalEvent, GlobalEventCard } from '@duing/types';

import { ApiClientProvider } from '../src/api-context';
import { useCalendarMonthsQuery } from '../src/calendarMonth';
import { globalEventKeys } from '../src/globalEventQueryKeys';
import { recruitmentQueryKeys } from '../src/recruitmentQueryKeys';

// mapper 는 소비처(apps/web)가 주입한다 — 테스트에서는 최소 구현으로 대체한다.
const mappers = {
  toGlobal: (item: GlobalEventCard): CalEvent => ({
    id: `g-${item.id}`,
    date: item.startAt.slice(0, 10),
    kind: 'system',
    sourceType: 'global',
    sourceId: item.id,
    title: item.title,
    time: item.startAt.slice(11, 16),
    place: item.location ?? '',
    club: null,
    accent: 'warm',
    span: 1,
  }),
  toRecruitment: (): CalEvent | null => null,
  toClubEvent: (): CalEvent => {
    throw new Error('사용하지 않음');
  },
};

function makeGlobalEvent(id: number, startAt: string): GlobalEventCard {
  return {
    id,
    title: `행사 ${id}`,
    startAt,
    endAt: startAt,
    location: '학생회관',
    category: 'FESTIVAL',
  };
}

// 캐시를 미리 시드하므로 queryFn 은 호출되지 않는다 — Provider 를 채우기 위한 최소 스텁.
const apiClientStub = {
  globalEvents: { list: async () => [] },
  recruitments: { calendar: async () => [] },
  clubEvents: { list: async () => [] },
} as unknown as Parameters<typeof ApiClientProvider>[0]['client'];

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClientStub}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  };
}

function renderWithClient(client: QueryClient, yearMonths: string[]) {
  const wrapper = makeWrapper(client);
  return renderHook(
    ({ months }: { months: string[] }) =>
      useCalendarMonthsQuery(months, { isAuthenticated: false, mappers }),
    { wrapper, initialProps: { months: yearMonths } },
  );
}

describe('useCalendarMonthsQuery', () => {
  it('캐시 타임스탬프가 같아도 월 목록이 바뀌면 결과가 갱신된다', () => {
    // 여러 달을 병렬로 받으면 캐시가 같은 ms 에 채워질 수 있다. 그때 시그니처에 월 목록이 없으면
    // 달을 바꿔도 useMemo 가 스킵돼 이전 달 결과가 그대로 남는다(적대적 리뷰에서 검출).
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const sameTimestamp = 1_700_000_000_000;

    client.setQueryData(
      globalEventKeys.publicList({ from: '2026-08-01', to: '2026-08-31' }),
      [makeGlobalEvent(1, '2026-08-10T10:00:00')],
      { updatedAt: sameTimestamp },
    );
    client.setQueryData(
      globalEventKeys.publicList({ from: '2026-09-01', to: '2026-09-30' }),
      [makeGlobalEvent(2, '2026-09-10T10:00:00')],
      { updatedAt: sameTimestamp },
    );
    client.setQueryData(recruitmentQueryKeys.calendar('2026-08'), [], { updatedAt: sameTimestamp });
    client.setQueryData(recruitmentQueryKeys.calendar('2026-09'), [], { updatedAt: sameTimestamp });

    const { result, rerender } = renderWithClient(client, ['2026-08']);
    expect(result.current.events.map((event) => event.sourceId)).toEqual([1]);

    rerender({ months: ['2026-09'] });

    expect(result.current.events.map((event) => event.sourceId)).toEqual([2]);
  });

  it('빈 월 목록이면 쿼리를 만들지 않는다', () => {
    // ''.split(',') 은 [''] 이라 방어가 없으면 Invalid Date 로 만든 엉터리 범위를 요청한다.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderWithClient(client, []);

    expect(result.current.events).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    // 캐시에 달력 조회가 하나도 안 만들어져야 한다(비활성 myClubs 엔트리는 무관하므로 제외).
    const calendarHashes = client
      .getQueryCache()
      .getAll()
      .map((query) => query.queryHash)
      .filter((hash) => hash.includes('global-events') || hash.includes('recruitments'));
    expect(calendarHashes).toEqual([]);
  });

  it('두 달 캐시의 기간이 서로 달라도 유령 엔트리가 남지 않는다', () => {
    // 두 달의 staleTime 창은 독립적이라, 그 사이 관리자가 기간을 줄이면 한쪽 캐시만 옛 버전이다.
    // fan-out 뒤에 접으면 옛 버전이 만든 뒤쪽 날짜가 유령으로 남아 같은 셀에 두 번 그려진다.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spanMappers = {
      ...mappers,
      toGlobal: (item: GlobalEventCard): CalEvent => {
        const startDay = Date.parse(`${item.startAt.slice(0, 10)}T00:00:00Z`);
        const endDay = Date.parse(`${item.endAt.slice(0, 10)}T00:00:00Z`);
        return {
          ...mappers.toGlobal(item),
          span: Math.max(1, Math.round((endDay - startDay) / 86_400_000) + 1),
        };
      },
    };

    // 8월 캐시 = 옛 버전(8/30~9/2, 4일) / 9월 캐시 = 수정 후(9/1~9/2, 2일)
    const staleVersion = { ...makeGlobalEvent(9, '2026-08-30T10:00:00'), endAt: '2026-09-02T10:00:00' };
    const freshVersion = { ...makeGlobalEvent(9, '2026-09-01T10:00:00'), endAt: '2026-09-02T10:00:00' };

    client.setQueryData(globalEventKeys.publicList({ from: '2026-08-01', to: '2026-08-31' }), [staleVersion], { updatedAt: 1_000 });
    client.setQueryData(globalEventKeys.publicList({ from: '2026-09-01', to: '2026-09-30' }), [freshVersion], { updatedAt: 2_000 });
    client.setQueryData(recruitmentQueryKeys.calendar('2026-08'), []);
    client.setQueryData(recruitmentQueryKeys.calendar('2026-09'), []);

    const wrapper = makeWrapper(client);
    const { result } = renderHook(
      () =>
        useCalendarMonthsQuery(['2026-08', '2026-09'], {
          isAuthenticated: false,
          mappers: spanMappers,
        }),
      { wrapper },
    );

    // 한 버전만 살아남아야 한다 — 같은 날짜가 두 번 나오면 안 된다.
    const dates = result.current.events.map((event) => event.date);
    expect(new Set(dates).size).toBe(dates.length);
  });
});
