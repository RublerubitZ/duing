import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { ApiError, createApiClient } from '@duing/api';
import type { LatestPromotionRequest } from '@duing/types';
import { ApiClientProvider } from '../src/api-context';
import { clubQueryKeys } from '../src/clubQueryKeys';
import {
  useLatestPromotionRequestQuery,
  useSubmitPromotionRequestMutation,
} from '../src/promotionRequests';
import { shouldRetryQuery } from '../src/retry';

const BASE = 'http://localhost:8080/api/v1';
const CLUB_ID = 7;
const LATEST_URL = `${BASE}/clubs/${CLUB_ID}/promotion-requests/latest`;
const SUBMIT_URL = `${BASE}/clubs/${CLUB_ID}/promotion-requests`;
const apiClient = createApiClient({ baseUrl: BASE });

const pendingRequest: LatestPromotionRequest = {
  requestId: 3,
  status: 'PENDING',
  title: '가을 정기 공연 홍보',
  actionNote: null,
  createdAt: '2026-10-21T03:00:00Z',
  handledAt: null,
};

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
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

const submitPayload = { title: '가을 정기 공연 홍보', description: '정기 공연을 알립니다.' };

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useLatestPromotionRequestQuery', () => {
  it('요청한 적이 없으면(data:null) null 을 돌려준다', async () => {
    server.use(http.get(LATEST_URL, () => HttpResponse.json({ ok: true, data: null, message: null })));

    const { result } = renderHook(() => useLatestPromotionRequestQuery(CLUB_ID), {
      wrapper: makeWrapper(newQueryClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('백엔드가 없으면(404 — FE 선배포·BE 롤백 중) 다시 요청하지 않는다', async () => {
    let latestRequests = 0;
    server.use(
      http.get(LATEST_URL, () => {
        latestRequests += 1;
        return HttpResponse.json({ ok: false, data: null, message: '찾을 수 없습니다.' }, { status: 404 });
      }),
    );
    // 앱의 전역 재시도 정책으로 돌린다 — 대기 없이 재시도하게 해 두 번째 요청이 나가면 바로 드러나게 한다.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 0 } } });

    const { result } = renderHook(() => useLatestPromotionRequestQuery(CLUB_ID), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(latestRequests).toBe(1);
  });
});

describe('useSubmitPromotionRequestMutation — 최근 요청 무효화', () => {
  function renderLatestAndSubmit(submitResponse: () => Response) {
    let latestRequests = 0;
    server.use(
      http.get(LATEST_URL, () => {
        latestRequests += 1;
        return HttpResponse.json({ ok: true, data: latestRequests === 1 ? null : pendingRequest, message: null });
      }),
      http.post(SUBMIT_URL, submitResponse),
    );
    const queryClient = newQueryClient();
    const { result } = renderHook(
      () => ({
        latest: useLatestPromotionRequestQuery(CLUB_ID),
        submit: useSubmitPromotionRequestMutation(CLUB_ID),
      }),
      { wrapper: makeWrapper(queryClient) },
    );
    return {
      result,
      latestRequestCount: () => latestRequests,
      cachedLatest: () => queryClient.getQueryData(clubQueryKeys.latestPromotionRequest(CLUB_ID)),
    };
  }

  // 재조회 promise 를 onSettled 가 돌려줘야 mutateAsync 가 그것까지 기다린다 — 끝난 그 순간의 캐시를 단언한다(act 가 흘리기 전).
  it('제출에 성공하면 최근 요청을 다시 받은 뒤에 끝나 "검토 대기 중"으로 바뀌어 있다', async () => {
    const { result, latestRequestCount, cachedLatest } = renderLatestAndSubmit(() =>
      HttpResponse.json({ ok: true, data: 3, message: null }),
    );
    await waitFor(() => expect(result.current.latest.isSuccess).toBe(true));
    expect(result.current.latest.data).toBeNull();

    let latestWhenSubmitResolved: unknown = undefined;
    await act(async () => {
      await result.current.submit.mutateAsync(submitPayload);
      latestWhenSubmitResolved = cachedLatest();
    });

    expect(latestRequestCount()).toBe(2);
    expect(latestWhenSubmitResolved).toEqual(pendingRequest);
  });

  it('409(다른 운영진이 먼저 낸 요청이 대기 중)여도 최근 요청을 다시 받는다', async () => {
    const { result, latestRequestCount, cachedLatest } = renderLatestAndSubmit(() =>
      HttpResponse.json(
        { ok: false, data: null, message: '이미 처리 대기 중인 홍보 요청이 있습니다.' },
        { status: 409 },
      ),
    );
    await waitFor(() => expect(result.current.latest.isSuccess).toBe(true));

    let latestWhenSubmitSettled: unknown = undefined;
    await act(async () => {
      await result.current.submit.mutateAsync(submitPayload).catch(() => undefined);
      latestWhenSubmitSettled = cachedLatest();
    });

    expect(latestRequestCount()).toBe(2);
    expect(latestWhenSubmitSettled).toEqual(pendingRequest);
  });

  it('서버 오류(5xx)여도 서버는 커밋했을 수 있어 최근 요청을 다시 받는다', async () => {
    const { result, latestRequestCount, cachedLatest } = renderLatestAndSubmit(() =>
      HttpResponse.json({ ok: false, data: null, message: '서버 오류' }, { status: 500 }),
    );
    await waitFor(() => expect(result.current.latest.isSuccess).toBe(true));

    let submitError: unknown = null;
    let latestWhenSubmitSettled: unknown = undefined;
    await act(async () => {
      await result.current.submit.mutateAsync(submitPayload).catch((error: unknown) => {
        submitError = error;
      });
      latestWhenSubmitSettled = cachedLatest();
    });

    expect(submitError).toBeInstanceOf(ApiError);
    expect(latestRequestCount()).toBe(2);
    expect(latestWhenSubmitSettled).toEqual(pendingRequest);
  });
});
