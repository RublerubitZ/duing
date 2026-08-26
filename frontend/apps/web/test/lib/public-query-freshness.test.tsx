import { act, renderHook, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import {
  ApiClientProvider,
  clubQueryKeys,
  recruitmentQueryKeys,
  useClubPhotosQuery,
  useRecruitmentCalendarQuery,
} from '@duing/hooks';

/**
 * 공개 브라우징 쿼리의 freshness 계층(packages/hooks/src/freshness.ts) 회귀 테스트.
 *
 * <p>화면이 아니라 "나간 GET 요청 수"를 단언한다(eligibility-handoff 스위트와 같은 방식).
 * 테스트 QueryClient 는 전역 기본값(staleTime 30s)을 일부러 주지 않는다 — RQ 기본 staleTime 0
 * 아래에서 재마운트 무재요청이 성립하면, 신선도가 전역 설정이 아니라 훅 자신의 계약임이 증명된다.
 *
 * <p>세 가지 불변식:
 * <ol>
 *   <li>staleTime 이내 재마운트(목록↔상세 왕복)는 캐시로 즉시 그리고 재요청하지 않는다</li>
 *   <li>invalidateQueries 는 staleTime 과 무관하게 즉시 재요청한다 — 본인 수정 즉시 반영 유지</li>
 *   <li>staleTime 초과 후 재마운트는 정상적으로 서버를 다시 조회한다</li>
 * </ol>
 */
const BASE = 'http://localhost:8080/api/v1';
const CLUB_ID = 7;
const YEAR_MONTH = '2026-09';

// freshness.ts 의 계약값 — 값이 바뀌면 이 테스트도 함께 바뀌어야 한다(계약 테스트).
const PUBLIC_CONTENT_STALE_TIME_MS = 5 * 60_000;
const CALENDAR_STALE_TIME_MS = 2 * 60_000;

const requestCounts = new Map<string, number>();
const countRequest = ({ request }: { request: Request }) => {
  if (request.method !== 'GET') return;
  const { pathname } = new URL(request.url);
  requestCounts.set(pathname, (requestCounts.get(pathname) ?? 0) + 1);
};
const getCount = (pathname: string) => requestCounts.get(pathname) ?? 0;

const server = setupServer(
  http.get(`${BASE}/clubs/${CLUB_ID}/photos`, () =>
    HttpResponse.json({ ok: true, data: [], message: null }),
  ),
  http.get(`${BASE}/recruitments`, () => HttpResponse.json({ ok: true, data: [], message: null })),
);
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  server.events.on('request:start', countRequest);
});
afterEach(() => {
  server.resetHandlers();
  requestCounts.clear();
});
afterAll(() => {
  server.events.removeListener('request:start', countRequest);
  server.close();
});

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ApiClientProvider client={apiClient}>{children}</ApiClientProvider>
      </QueryClientProvider>
    );
  };
}

/** dataUpdatedAt 을 과거로 되돌려 "staleTime 경과"를 실시간 대기 없이 재현한다. */
function ageQuery(queryClient: QueryClient, queryKey: readonly unknown[], ageMs: number) {
  const query = queryClient.getQueryCache().find({ queryKey });
  if (!query) throw new Error(`캐시에 쿼리가 없습니다: ${JSON.stringify(queryKey)}`);
  query.setState({ dataUpdatedAt: Date.now() - ageMs });
}

describe('공개 콘텐츠 계층(5분) — 클럽 사진', () => {
  const pathname = `/api/v1/clubs/${CLUB_ID}/photos`;

  it('재마운트는 재요청하지 않고, invalidate 는 즉시, staleTime 초과 후에는 다시 조회한다', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = createWrapper(queryClient);

    // 1) 첫 마운트 — 요청 1건.
    const first = renderHook(() => useClubPhotosQuery(CLUB_ID), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    expect(getCount(pathname)).toBe(1);
    first.unmount();

    // 2) staleTime 이내 재마운트(목록↔상세 왕복) — 캐시로 즉시 성공, 재요청 없음.
    //    훅에 staleTime 이 없으면 RQ 기본 0 이라 이 지점에서 2건이 된다(변경 전 동작).
    const second = renderHook(() => useClubPhotosQuery(CLUB_ID), { wrapper });
    expect(second.result.current.isSuccess).toBe(true);
    await waitFor(() => expect(second.result.current.isFetching).toBe(false));
    expect(getCount(pathname)).toBe(1);

    // 3) mutation 무효화 경로 — staleTime 과 무관하게 즉시 재요청(본인 수정 즉시 반영).
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: clubQueryKeys.photos(CLUB_ID) });
    });
    expect(getCount(pathname)).toBe(2);
    second.unmount();

    // 4) staleTime 초과 후 재마운트 — 정상적으로 서버를 다시 조회한다.
    ageQuery(queryClient, clubQueryKeys.photos(CLUB_ID), PUBLIC_CONTENT_STALE_TIME_MS + 1_000);
    const third = renderHook(() => useClubPhotosQuery(CLUB_ID), { wrapper });
    await waitFor(() => expect(getCount(pathname)).toBe(3));
    third.unmount();
  });
});

describe('캘린더·모집 축 계층(2분) — 모집 캘린더', () => {
  const pathname = '/api/v1/recruitments';

  it('재마운트는 재요청하지 않고, staleTime 초과 후에는 다시 조회한다', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = createWrapper(queryClient);

    const first = renderHook(() => useRecruitmentCalendarQuery(YEAR_MONTH), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    expect(getCount(pathname)).toBe(1);
    first.unmount();

    // 그리드·Upcoming 처럼 같은 달을 다시 관측해도 2분 안에는 재요청이 없다.
    const second = renderHook(() => useRecruitmentCalendarQuery(YEAR_MONTH), { wrapper });
    expect(second.result.current.isSuccess).toBe(true);
    await waitFor(() => expect(second.result.current.isFetching).toBe(false));
    expect(getCount(pathname)).toBe(1);
    second.unmount();

    ageQuery(queryClient, recruitmentQueryKeys.calendar(YEAR_MONTH), CALENDAR_STALE_TIME_MS + 1_000);
    const third = renderHook(() => useRecruitmentCalendarQuery(YEAR_MONTH), { wrapper });
    await waitFor(() => expect(getCount(pathname)).toBe(2));
    third.unmount();
  });
});
