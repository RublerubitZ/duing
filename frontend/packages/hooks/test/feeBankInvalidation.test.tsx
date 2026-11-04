import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import {
  useApproveMatchMutation,
  useBankSyncMutation,
  useIgnoreTransactionMutation,
  useUnmatchTransactionMutation,
} from '../src/bank';
import { cashbookQueryKeys } from '../src/cashbookQueryKeys';
import { useCancelBillMutation, useGenerateBillsMutation } from '../src/fee';
import { feeQueryKeys } from '../src/feeQueryKeys';

const CLUB_ID = 10;
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

// 홈 카드가 쓰는 요약 키를 미리 채워 두고, mutation 뒤 무효화 표시가 붙는지 본다(관찰자가 없어 재요청은 하지 않는다).
function seededQueryClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  queryClient.setQueryData(feeQueryKeys.summary(CLUB_ID, {}), {
    totalBilled: 0, totalPaid: 0, outstanding: 0, collectionRate: 0, billCount: 0,
    pendingCount: 0, partialPaidCount: 0, overdueCount: 0, paidCount: 0,
  });
  queryClient.setQueryData(cashbookQueryKeys.summary(CLUB_ID, {}), { totalIncome: 0, totalExpense: 0, bookBalance: 0 });
  return queryClient;
}

const server = setupServer(
  http.post(`*/leader/clubs/${CLUB_ID}/fee-policies/3/bills`, () =>
    HttpResponse.json({ ok: true, message: null, data: { created: 1, skipped: 0, skippedUserIds: [] } }),
  ),
  http.delete(`*/leader/clubs/${CLUB_ID}/fee-bills/5`, () => new HttpResponse(null, { status: 204 })),
  http.post(`*/leader/clubs/${CLUB_ID}/bank-transactions/sync`, () =>
    HttpResponse.json({ ok: true, message: null, data: { fetched: 1, newlyStored: 1, autoMatched: 0, pendingReview: 1 } }),
  ),
  http.post(`*/leader/clubs/${CLUB_ID}/bank-transactions/7/approve`, () => new HttpResponse(null, { status: 204 })),
  http.post(`*/leader/clubs/${CLUB_ID}/bank-transactions/7/ignore`, () => new HttpResponse(null, { status: 204 })),
  http.post(`*/leader/clubs/${CLUB_ID}/bank-transactions/7/unmatch`, () => new HttpResponse(null, { status: 204 })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('회비·은행 mutation 무효화', () => {
  it('청구 발행 뒤 수납 요약을 무효화한다', async () => {
    const queryClient = seededQueryClient();
    const { result } = renderHook(() => useGenerateBillsMutation(CLUB_ID), { wrapper: makeWrapper(queryClient) });
    await act(() => result.current.mutateAsync({ policyId: 3, payload: { billingPeriod: '2026-2' } }));
    expect(queryClient.getQueryState(feeQueryKeys.summary(CLUB_ID, {}))?.isInvalidated).toBe(true);
  });

  it('청구 취소 뒤 수납 요약을 무효화한다', async () => {
    const queryClient = seededQueryClient();
    const { result } = renderHook(() => useCancelBillMutation(CLUB_ID), { wrapper: makeWrapper(queryClient) });
    await act(() => result.current.mutateAsync(5));
    expect(queryClient.getQueryState(feeQueryKeys.summary(CLUB_ID, {}))?.isInvalidated).toBe(true);
  });

  it('은행 동기화 뒤 장부를 무효화한다(서버가 장부 항목을 만든다)', async () => {
    const queryClient = seededQueryClient();
    const { result } = renderHook(() => useBankSyncMutation(CLUB_ID), { wrapper: makeWrapper(queryClient) });
    await act(() => result.current.mutateAsync({ accountPassword: '0000', residentNumber: '000000' }));
    expect(queryClient.getQueryState(cashbookQueryKeys.summary(CLUB_ID, {}))?.isInvalidated).toBe(true);
  });

  it('매칭 승인은 수납 요약만 무효화하고 장부는 그대로 둔다(장부를 바꾸지 않는다)', async () => {
    const queryClient = seededQueryClient();
    const { result } = renderHook(() => useApproveMatchMutation(CLUB_ID), { wrapper: makeWrapper(queryClient) });
    await act(() => result.current.mutateAsync({ txId: 7, feeBillId: 5 }));
    expect(queryClient.getQueryState(cashbookQueryKeys.summary(CLUB_ID, {}))?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(feeQueryKeys.summary(CLUB_ID, {}))?.isInvalidated).toBe(true);
  });

  it.each([
    ['무시', useIgnoreTransactionMutation],
    ['해제', useUnmatchTransactionMutation],
  ] as const)('거래 %s 는 장부를 무효화하지 않는다', async (_label, useTransactionMutation) => {
    const queryClient = seededQueryClient();
    const { result } = renderHook(() => useTransactionMutation(CLUB_ID), { wrapper: makeWrapper(queryClient) });
    await act(() => result.current.mutateAsync(7));
    expect(queryClient.getQueryState(cashbookQueryKeys.summary(CLUB_ID, {}))?.isInvalidated).toBe(false);
  });
});
