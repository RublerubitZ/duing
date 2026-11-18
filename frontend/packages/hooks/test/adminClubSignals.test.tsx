import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import type { AdminClubSignals } from '@duing/types';
import { ApiClientProvider } from '../src/api-context';
import { useAdminClubSignalsQuery, useCloseClubMutation, useUpdateClubStatusMutation } from '../src/admin';
import { adminQueryKeys } from '../src/adminQueryKeys';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

const CLUB_SIGNALS: AdminClubSignals = {
  activeClubCount: 165,
  resultWaiting: { clubCount: 6, applicationCount: 15, oldestEndedOn: '2026-07-25' },
  joinRequestWaiting: { clubCount: 1, requestCount: 1, oldestRequestedAt: '2026-10-23T03:00:00Z' },
  noRecordClubCount: 110,
  operatorInactiveClubCount: 119,
};

let signalsRequestCount = 0;
let signalsStatus = 200;
const server = setupServer(
  http.get('*/admin/club-signals', () => {
    signalsRequestCount += 1;
    return signalsStatus === 200
      ? HttpResponse.json({ ok: true, message: null, data: CLUB_SIGNALS })
      : HttpResponse.json({ ok: false, message: '오류', data: null }, { status: signalsStatus });
  }),
  http.patch('*/admin/clubs/7/status', () => new HttpResponse(null, { status: 204 })),
  http.post('*/admin/clubs/7/close', () => new HttpResponse(null, { status: 204 })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  signalsRequestCount = 0;
  signalsStatus = 200;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// 훅의 retry 정책을 보려고 전역 retry 를 끄지 않는다(지연만 0). 앱 기본값처럼 포커스 재조회는 끈다.
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  }
  return { queryClient, wrapper: Wrapper };
}

describe('useAdminClubSignalsQuery', () => {
  it('동아리 현황을 받아 온다', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdminClubSignalsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(CLUB_SIGNALS);
  });

  it('앱 기본값(포커스 때 안 받음)을 덮어 창 포커스 때 다시 받는다 — 띄워 둔 홈 숫자가 목록과 어긋나지 않게', async () => {
    const { queryClient, wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdminClubSignalsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const observerOptions = queryClient.getQueryCache().find({ queryKey: adminQueryKeys.clubSignals() })?.observers[0]?.options;
    expect(observerOptions?.refetchOnWindowFocus).toBe(true);
  });

  it('404(옛 백엔드)는 다시 묻지 않는다', async () => {
    signalsStatus = 404;
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdminClubSignalsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(signalsRequestCount).toBe(1);
  });

  it('그 밖의 오류는 전역 정책대로 한 번 다시 묻는다', async () => {
    signalsStatus = 500;
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAdminClubSignalsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(signalsRequestCount).toBe(2);
  });

  it('키가 동아리 접두(clubsAll) 아래라 동아리 상태 변경·폐쇄의 무효화가 카드도 다시 부른다', async () => {
    expect(adminQueryKeys.clubSignals()).toEqual([...adminQueryKeys.clubsAll, 'signals']);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () => ({
        clubSignals: useAdminClubSignalsQuery(),
        statusMutation: useUpdateClubStatusMutation(),
        closeMutation: useCloseClubMutation(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.clubSignals.isSuccess).toBe(true));
    expect(signalsRequestCount).toBe(1);

    await act(async () => {
      await result.current.statusMutation.mutateAsync({ clubId: 7, payload: { status: 'INACTIVE' } });
    });
    await waitFor(() => expect(signalsRequestCount).toBe(2));

    await act(async () => {
      await result.current.closeMutation.mutateAsync({ clubId: 7, payload: { closureReason: '활동 종료' } });
    });
    await waitFor(() => expect(signalsRequestCount).toBe(3));
  });
});
