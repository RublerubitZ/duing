import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { clubQueryKeys } from '../src/clubQueryKeys';
import {
  useClubHeroActivitiesQuery,
  useCreateHeroActivityMutation,
  useReorderHeroActivitiesMutation,
} from '../src/heroActivities';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (<ApiClientProvider client={apiClient}><QueryClientProvider client={qc}>{children}</QueryClientProvider></ApiClientProvider>);
  };
}
function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function heroRow(id: number, displayOrder: number) {
  return { id, clubPhotoId: id + 100, storageKey: `k/${id}`, caption: null,
    width: 800, height: 600, title: `활동${id}`, description: '설명', displayOrder };
}

const server = setupServer(
  http.get('*/clubs/10/hero-activities', () =>
    HttpResponse.json({ ok: true, message: null, data: [heroRow(1, 1), heroRow(2, 2)] }),
  ),
  http.post('*/clubs/10/hero-activities', () =>
    HttpResponse.json({ ok: true, message: null, data: heroRow(3, 3) }, { status: 201 }),
  ),
  http.put('*/clubs/10/hero-activities/order', () =>
    HttpResponse.json({ ok: true, message: null, data: [heroRow(2, 1), heroRow(1, 2)] }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('hero activities hooks', () => {
  it('목록 쿼리는 배열을 반환한다', async () => {
    const { result } = renderHook(() => useClubHeroActivitiesQuery(10), { wrapper: makeWrapper(newQueryClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Array.isArray(result.current.data)).toBe(true);
    expect(result.current.data).toHaveLength(2);
  });

  it('생성 성공 시 hero-activities와 photos 두 쿼리키를 무효화한다', async () => {
    const qc = newQueryClient();
    // 두 캐시를 미리 시드 — 무효화 관찰용(비활성 쿼리는 isInvalidated 플래그만 세워진다)
    qc.setQueryData(clubQueryKeys.heroActivities(10), [heroRow(1, 1)]);
    qc.setQueryData(clubQueryKeys.photos(10), []);

    const { result } = renderHook(() => useCreateHeroActivityMutation(10), { wrapper: makeWrapper(qc) });
    await act(async () => {
      await result.current.mutateAsync({ clubPhotoId: 101, title: '활동', description: '설명', displayOrder: 1 });
    });

    expect(qc.getQueryState(clubQueryKeys.heroActivities(10))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(clubQueryKeys.photos(10))?.isInvalidated).toBe(true);
  });

  it('정렬 성공 시 hero-activities만 무효화하고 photos는 건드리지 않는다', async () => {
    const qc = newQueryClient();
    qc.setQueryData(clubQueryKeys.heroActivities(10), [heroRow(1, 1)]);
    qc.setQueryData(clubQueryKeys.photos(10), []);

    const { result } = renderHook(() => useReorderHeroActivitiesMutation(10), { wrapper: makeWrapper(qc) });
    await act(async () => {
      await result.current.mutateAsync({ items: [{ heroActivityId: 2, displayOrder: 1 }, { heroActivityId: 1, displayOrder: 2 }] });
    });

    expect(qc.getQueryState(clubQueryKeys.heroActivities(10))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(clubQueryKeys.photos(10))?.isInvalidated).toBe(false);
  });
});
