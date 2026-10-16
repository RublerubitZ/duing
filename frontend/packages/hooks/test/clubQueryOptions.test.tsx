import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { clubQueryKeys } from '../src/clubQueryKeys';
import { clubDetailQueryOptions, useClubDetailQuery } from '../src/clubs';
import { PUBLIC_CONTENT_STALE_TIME_MS } from '../src/freshness';
import { clubHeroActivitiesQueryOptions, useClubHeroActivitiesQuery } from '../src/heroActivities';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  };
}

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const requestedPaths: string[] = [];
const trackRequest = ({ request }: { request: Request }) => {
  requestedPaths.push(new URL(request.url).pathname);
};

const server = setupServer(
  http.get('*/clubs/7', () => HttpResponse.json({ ok: true, message: null, data: { id: 7, name: '밴드부' } })),
  http.get('*/clubs/7/hero-activities', () => HttpResponse.json({ ok: true, message: null, data: [] })),
);
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  server.events.on('request:start', trackRequest);
});
afterEach(() => {
  server.resetHandlers();
  requestedPaths.length = 0;
});
afterAll(() => {
  server.events.removeListener('request:start', trackRequest);
  server.close();
});

describe('동아리 상세·대표 활동 쿼리 옵션 — 훅과 카드 누름 선조회가 같은 키·조회·신선도를 쓴다(스펙 P1 §3.4)', () => {
  it('옵션은 훅과 같은 키와 공개 콘텐츠 신선도(5분)를 쓴다', () => {
    const detailOptions = clubDetailQueryOptions(apiClient, 7);
    expect(detailOptions.queryKey).toEqual(clubQueryKeys.detail(7));
    expect(detailOptions.staleTime).toBe(PUBLIC_CONTENT_STALE_TIME_MS);

    const heroOptions = clubHeroActivitiesQueryOptions(apiClient, 7);
    expect(heroOptions.queryKey).toEqual(clubQueryKeys.heroActivities(7));
    expect(heroOptions.staleTime).toBe(PUBLIC_CONTENT_STALE_TIME_MS);
  });

  it('선조회한 상세는 훅이 마운트될 때 다시 받지 않는다 — 요청 1회', async () => {
    const queryClient = newQueryClient();
    await queryClient.prefetchQuery(clubDetailQueryOptions(apiClient, 7));

    const { result } = renderHook(() => useClubDetailQuery(7), { wrapper: makeWrapper(queryClient) });
    await waitFor(() => expect(result.current.data?.name).toBe('밴드부'));
    expect(requestedPaths.filter((path) => path.endsWith('/clubs/7'))).toHaveLength(1);
  });

  it('선조회한 대표 활동은 훅이 마운트될 때 다시 받지 않는다 — 요청 1회', async () => {
    const queryClient = newQueryClient();
    await queryClient.prefetchQuery(clubHeroActivitiesQueryOptions(apiClient, 7));

    const { result } = renderHook(() => useClubHeroActivitiesQuery(7), { wrapper: makeWrapper(queryClient) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestedPaths.filter((path) => path.endsWith('/clubs/7/hero-activities'))).toHaveLength(1);
  });

  it('clubId 가 없으면 지금처럼 꺼진 쿼리다(키 ["clubs", undefined…])', () => {
    const detailOptions = clubDetailQueryOptions(apiClient, undefined);
    expect(detailOptions.enabled).toBe(false);
    expect(detailOptions.queryKey).toEqual(['clubs', undefined]);

    const heroOptions = clubHeroActivitiesQueryOptions(apiClient, undefined);
    expect(heroOptions.enabled).toBe(false);
    expect(heroOptions.queryKey).toEqual(['clubs', undefined, 'hero-activities']);
  });
});
