import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { ApiError, createApiClient } from '@duing/api';
import type { LatestLeaderSuccessionRequest } from '@duing/types';
import { ApiClientProvider } from '../src/api-context';
import { clubQueryKeys } from '../src/clubQueryKeys';
import {
  useMyLatestLeaderSuccessionRequestQuery,
  useSubmitSuccessionRequestMutation,
} from '../src/leaderSuccession';
import { shouldRetryQuery } from '../src/retry';

const BASE = 'http://localhost:8080/api/v1';
const CLUB_ID = 7;
const MY_LATEST_URL = `${BASE}/clubs/${CLUB_ID}/leader-succession-requests/me/latest`;
const SUBMIT_URL = `${BASE}/clubs/${CLUB_ID}/leader-succession-requests`;
const apiClient = createApiClient({ baseUrl: BASE });

const pendingRequest: LatestLeaderSuccessionRequest = {
  requestId: 5,
  status: 'PENDING',
  reason: '회장이 두 달째 연락이 닿지 않습니다.',
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

const submitPayload = { reason: '회장이 두 달째 연락이 닿지 않습니다.' };

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useMyLatestLeaderSuccessionRequestQuery', () => {
  it('요청한 적이 없으면(data:null) null 을 돌려준다', async () => {
    server.use(http.get(MY_LATEST_URL, () => HttpResponse.json({ ok: true, data: null, message: null })));

    const { result } = renderHook(() => useMyLatestLeaderSuccessionRequestQuery(CLUB_ID), {
      wrapper: makeWrapper(newQueryClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('동아리 id 가 없으면 조회하지 않는다', () => {
    const { result } = renderHook(() => useMyLatestLeaderSuccessionRequestQuery(undefined), {
      wrapper: makeWrapper(newQueryClient()),
    });

    // onUnhandledRequest: 'error' — 요청이 나갔다면 MSW 가 실패시킨다.
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('백엔드가 없으면(404 — FE 선배포·BE 롤백 중) 다시 요청하지 않는다', async () => {
    let myLatestRequests = 0;
    server.use(
      http.get(MY_LATEST_URL, () => {
        myLatestRequests += 1;
        return HttpResponse.json({ ok: false, data: null, message: '찾을 수 없습니다.' }, { status: 404 });
      }),
    );
    // 앱의 전역 재시도 정책으로 돌린다 — 대기 없이 재시도하게 해 두 번째 요청이 나가면 바로 드러나게 한다.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 0 } } });

    const { result } = renderHook(() => useMyLatestLeaderSuccessionRequestQuery(CLUB_ID), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(myLatestRequests).toBe(1);
  });
});

describe('useSubmitSuccessionRequestMutation — 내 최근 요청 무효화', () => {
  function renderMyLatestAndSubmit(submitResponse: () => Response) {
    let myLatestRequests = 0;
    server.use(
      http.get(MY_LATEST_URL, () => {
        myLatestRequests += 1;
        return HttpResponse.json({ ok: true, data: myLatestRequests === 1 ? null : pendingRequest, message: null });
      }),
      http.post(SUBMIT_URL, submitResponse),
    );
    const queryClient = newQueryClient();
    const { result } = renderHook(
      () => ({
        myLatest: useMyLatestLeaderSuccessionRequestQuery(CLUB_ID),
        submit: useSubmitSuccessionRequestMutation(CLUB_ID),
      }),
      { wrapper: makeWrapper(queryClient) },
    );
    return {
      result,
      myLatestRequestCount: () => myLatestRequests,
      cachedMyLatest: () => queryClient.getQueryData(clubQueryKeys.myLatestLeaderSuccessionRequest(CLUB_ID)),
    };
  }

  // 재조회 promise 를 onSettled 가 돌려줘야 mutateAsync 가 그것까지 기다린다 — 끝난 그 순간의 캐시를 단언한다(act 가 흘리기 전).
  it('제출에 성공하면 내 최근 요청을 다시 받은 뒤에 끝나 "검토 대기 중"으로 바뀌어 있다', async () => {
    const { result, myLatestRequestCount, cachedMyLatest } = renderMyLatestAndSubmit(() =>
      HttpResponse.json({ ok: true, data: 5, message: null }),
    );
    await waitFor(() => expect(result.current.myLatest.isSuccess).toBe(true));
    expect(result.current.myLatest.data).toBeNull();

    let myLatestWhenSubmitResolved: unknown = undefined;
    await act(async () => {
      await result.current.submit.mutateAsync(submitPayload);
      myLatestWhenSubmitResolved = cachedMyLatest();
    });

    expect(myLatestRequestCount()).toBe(2);
    expect(myLatestWhenSubmitResolved).toEqual(pendingRequest);
  });

  it('409(이미 대기 중인 요청)여도 내 최근 요청을 다시 받는다', async () => {
    const { result, myLatestRequestCount, cachedMyLatest } = renderMyLatestAndSubmit(() =>
      HttpResponse.json(
        { ok: false, data: null, message: '이미 처리 대기 중인 승계 요청이 있습니다.' },
        { status: 409 },
      ),
    );
    await waitFor(() => expect(result.current.myLatest.isSuccess).toBe(true));

    let myLatestWhenSubmitSettled: unknown = undefined;
    await act(async () => {
      await result.current.submit.mutateAsync(submitPayload).catch(() => undefined);
      myLatestWhenSubmitSettled = cachedMyLatest();
    });

    expect(myLatestRequestCount()).toBe(2);
    expect(myLatestWhenSubmitSettled).toEqual(pendingRequest);
  });

  it('서버 오류(5xx)여도 서버는 커밋했을 수 있어 내 최근 요청을 다시 받는다', async () => {
    const { result, myLatestRequestCount, cachedMyLatest } = renderMyLatestAndSubmit(() =>
      HttpResponse.json({ ok: false, data: null, message: '서버 오류' }, { status: 500 }),
    );
    await waitFor(() => expect(result.current.myLatest.isSuccess).toBe(true));

    let submitError: unknown = null;
    let myLatestWhenSubmitSettled: unknown = undefined;
    await act(async () => {
      await result.current.submit.mutateAsync(submitPayload).catch((error: unknown) => {
        submitError = error;
      });
      myLatestWhenSubmitSettled = cachedMyLatest();
    });

    expect(submitError).toBeInstanceOf(ApiError);
    expect(myLatestRequestCount()).toBe(2);
    expect(myLatestWhenSubmitSettled).toEqual(pendingRequest);
  });
});
