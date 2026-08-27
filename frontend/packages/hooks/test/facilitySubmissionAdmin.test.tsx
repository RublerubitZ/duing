import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import type { CompleteSubmissionBatchResult } from '@duing/types';
import { ApiClientProvider } from '../src/api-context';
import { adminQueryKeys } from '../src/adminQueryKeys';
import {
  useCancelSubmissionBatchMutation,
  useCompleteSubmissionBatchMutation,
} from '../src/facilitySubmissionAdmin';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

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
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

const COMPLETE_RESULT: CompleteSubmissionBatchResult = {
  totalCount: 2,
  confirmedCount: 2,
  skippedCount: 0,
  completedAt: '2026-08-01T11:00:00',
  skippedBookings: [],
};

describe('제출 배치 완료·취소 훅 캐시 무효화 (P2-14)', () => {
  it('완료 성공 시 제출 캐시와 함께 예약 캐시(큐·상세·summary)도 무효화한다', async () => {
    server.use(
      http.post('*/admin/facility-bookings/submission/7/complete', () =>
        HttpResponse.json({ ok: true, message: null, data: COMPLETE_RESULT }),
      ),
    );
    const queryClient = newQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCompleteSubmissionBatchMutation(), {
      wrapper: makeWrapper(queryClient),
    });

    let completeResult: CompleteSubmissionBatchResult | null = null;
    await act(async () => {
      completeResult = await result.current.mutateAsync({ batchId: 7 });
    });

    expect(completeResult).toEqual(COMPLETE_RESULT);
    // 완료는 포함 예약을 APPROVED→CONFIRMED 로 전이 — 검토 탭이 stale 예약을 보이지 않도록 교차 무효화.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminQueryKeys.facilitySubmissionAll });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminQueryKeys.facilityBookingsAll });
  });

  it('완료 실패(409)는 서버 메시지를 담은 에러로 거부하고 settled 무효화는 그대로 수행한다', async () => {
    server.use(
      http.post('*/admin/facility-bookings/submission/7/complete', () =>
        HttpResponse.json(
          { ok: false, message: '이미 취소된 제출 목록입니다', data: null },
          { status: 409 },
        ),
      ),
    );
    const queryClient = newQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCompleteSubmissionBatchMutation(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await expect(result.current.mutateAsync({ batchId: 7 })).rejects.toThrow(
        '이미 취소된 제출 목록입니다',
      );
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminQueryKeys.facilitySubmissionAll });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminQueryKeys.facilityBookingsAll });
  });

  it('취소는 예약 상태가 바뀌지 않으므로 제출 캐시만 무효화하고 예약 캐시는 건드리지 않는다', async () => {
    server.use(
      http.delete('*/admin/facility-bookings/submission/7', () => new HttpResponse(null, { status: 204 })),
    );
    const queryClient = newQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCancelSubmissionBatchMutation(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ batchId: 7 });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminQueryKeys.facilitySubmissionAll });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: adminQueryKeys.facilityBookingsAll });
  });
});
