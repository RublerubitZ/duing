import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type {
  AdminClubEventCard,
  CalEvent,
  ClubEventCard,
  GlobalEventCard,
  MyClubSummary,
} from '@duing/types';

import { ApiClientProvider } from '../src/api-context';
import { monthBounds, useCalendarMonthsQuery } from '../src/calendarMonth';
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
  toClubEvent: (item: ClubEventCard, club: { clubId: number; clubName: string }): CalEvent => ({
    id: `c-${item.id}`,
    date: '2026-08-10',
    kind: 'event',
    sourceType: 'clubEvent',
    sourceId: item.id,
    sourceClubId: club.clubId,
    title: `일정 ${item.id}`,
    time: '10:00',
    place: '',
    club: club.clubName,
    accent: 'sage',
  }),
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

type ApiClient = Parameters<typeof ApiClientProvider>[0]['client'];

// 실제 클라이언트는 수십 개 도메인을 갖지만 이 훅이 부르는 것만 스텁한다.
function asApiClient(stub: object): ApiClient {
  return stub as unknown as ApiClient;
}

// 캐시를 미리 시드하므로 queryFn 은 호출되지 않는다 — Provider 를 채우기 위한 최소 스텁.
const apiClientStub = asApiClient({
  globalEvents: { list: async () => [] },
  recruitments: { calendar: async () => [] },
  clubEvents: { list: async () => [] },
});

const TWO_MONTHS = ['2026-08', '2026-09'];

/** 두 달치 글로벌·모집 캐시를 미리 채운다 — 동아리 일정 경로만 남겨 로딩·요청 수를 관찰한다. */
function seedNonClubDomains(client: QueryClient) {
  for (const month of TWO_MONTHS) {
    const { from, to } = monthBounds(month);
    client.setQueryData(globalEventKeys.publicList({ from, to }), []);
    client.setQueryData(recruitmentQueryKeys.calendar(month), []);
  }
}

/**
 * 도메인별 호출 횟수를 세는 스텁. 동아리 일정 응답은 조회 창의 월로 id 를 만들어
 * 달마다 다른 일정이 오게 한다(같은 id 는 병합 단계에서 접혀 개수 검증이 무의미해진다).
 */
function makeCallCountingClient(myClubs: MyClubSummary[], adminListFails = false) {
  const callCounts = { adminClubEvents: 0, clubEvents: 0, myClubs: 0 };
  const monthNumber = (params: { from?: string }): number => Number(params.from?.slice(5, 7) ?? 0);
  const apiClient = asApiClient({
    globalEvents: { list: async () => [] },
    recruitments: { calendar: async () => [] },
    users: {
      myClubs: async (): Promise<MyClubSummary[]> => {
        callCounts.myClubs += 1;
        return myClubs;
      },
    },
    clubEvents: {
      list: async (clubId: number, params: { from?: string }): Promise<ClubEventCard[]> => {
        callCounts.clubEvents += 1;
        return [
          {
            id: clubId * 100 + monthNumber(params),
            title: '동아리 정기모임',
            startAt: '2026-08-10T10:00:00',
            endAt: '2026-08-10T12:00:00',
            location: '동방',
          },
        ];
      },
    },
    admin: {
      clubEvents: {
        list: async (params: { from?: string }): Promise<AdminClubEventCard[]> => {
          callCounts.adminClubEvents += 1;
          if (adminListFails) throw new Error('전 동아리 일정 조회 실패');
          return [
            {
              id: monthNumber(params),
              clubId: 42,
              clubName: '다른 동아리',
              title: '전체 회의',
              startAt: '2026-08-20T18:00:00',
              endAt: '2026-08-20T20:00:00',
              location: '학생회관',
            },
          ];
        },
      },
    },
  });
  return { apiClient, callCounts };
}

const myClub: MyClubSummary = {
  clubId: 7,
  clubName: '내 동아리',
  logoUrl: null,
  status: 'ACTIVE',
  myRole: 'MEMBER',
  activeRecruitmentCount: 0,
  joinedAt: '2026-03-01T00:00:00',
};

function makeWrapper(client: QueryClient, apiClient: ApiClient = apiClientStub) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  };
}

function renderWithClient(client: QueryClient, yearMonths: string[]) {
  const wrapper = makeWrapper(client);
  return renderHook(
    ({ months }: { months: string[] }) =>
      useCalendarMonthsQuery(months, { isAuthenticated: false, isAdmin: false, mappers }),
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
          isAdmin: false,
          mappers: spanMappers,
        }),
      { wrapper },
    );

    // 한 버전만 살아남아야 한다 — 같은 날짜가 두 번 나오면 안 된다.
    const dates = result.current.events.map((event) => event.date);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('ADMIN 세션은 전 동아리 집계를 월당 1회만 부르고 동아리별 조회는 하지 않는다', async () => {
    // 총동연 분기를 "전 동아리 루프" 로 되돌리는 변경을 막는 잠금이다 —
    // 동아리 수만큼 요청이 나가면 이 카운트가 즉시 깨진다.
    const adminQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedNonClubDomains(adminQueryClient);
    // ADMIN 이 어느 동아리의 멤버이더라도 동아리별 경로는 타지 않아야 한다.
    const adminSession = makeCallCountingClient([myClub]);

    const adminRender = renderHook(
      () =>
        useCalendarMonthsQuery(TWO_MONTHS, { isAuthenticated: true, isAdmin: true, mappers }),
      { wrapper: makeWrapper(adminQueryClient, adminSession.apiClient) },
    );

    // 집계를 받는 동안 isLoading 이 false 면 "일정이 없어요" 가 떴다가 채워진다 — 집계도 로딩에 포함된다.
    expect(adminRender.result.current.isLoading).toBe(true);
    await waitFor(() => expect(adminRender.result.current.isLoading).toBe(false));

    expect(adminSession.callCounts.adminClubEvents).toBe(TWO_MONTHS.length);
    expect(adminSession.callCounts.clubEvents).toBe(0);
    expect(adminSession.callCounts.myClubs).toBe(0);
    expect(adminRender.result.current.events.map((event) => event.club)).toEqual([
      '다른 동아리',
      '다른 동아리',
    ]);

    // ── 일반 학생은 기존 경로 그대로 (요청 수까지 회귀 잠금) ──
    const studentQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedNonClubDomains(studentQueryClient);
    const studentSession = makeCallCountingClient([myClub]);

    const studentRender = renderHook(
      () =>
        useCalendarMonthsQuery(TWO_MONTHS, { isAuthenticated: true, isAdmin: false, mappers }),
      { wrapper: makeWrapper(studentQueryClient, studentSession.apiClient) },
    );

    await waitFor(() => expect(studentRender.result.current.isLoading).toBe(false));

    expect(studentSession.callCounts.adminClubEvents).toBe(0);
    expect(studentSession.callCounts.myClubs).toBe(1);
    expect(studentSession.callCounts.clubEvents).toBe(TWO_MONTHS.length);
    expect(studentRender.result.current.events.map((event) => event.club)).toEqual([
      '내 동아리',
      '내 동아리',
    ]);
  });

  it('ADMIN 집계 조회가 실패하면 오류로 집계된다', async () => {
    // 집계를 오류 판정에서 빼면 "일부 일정을 불러오지 못했습니다" 배너가 뜨지 않는다.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedNonClubDomains(client);
    const { apiClient } = makeCallCountingClient([], true);

    const { result } = renderHook(
      () => useCalendarMonthsQuery(TWO_MONTHS, { isAuthenticated: true, isAdmin: true, mappers }),
      { wrapper: makeWrapper(client, apiClient) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.perDomain.clubEventsError).toBe(true);
  });
});
