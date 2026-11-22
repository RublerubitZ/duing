import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import type { FeeBill, PageResponse } from '@duing/types';
import { ApiClientProvider } from '../src/api-context';
import { useClubFeeBillsQuery } from '../src/fee';

// 청구 목록 훅의 자리 채움 옵션(#1762). 부원별로 부르는 수동 매칭(ManualMatchDialog)은 옵션을 넘기지 않으므로,
// 키가 바뀐 동안 이전 부원의 청구가 '적용 가능'으로 남지 않아야 한다 — 기본값이 그 회귀 가드다.
const CLUB_ID = 1;
const MEMBER_A = 42;
const MEMBER_B = 99;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

const buildBill = (userId: number): FeeBill => ({
  id: userId * 10,
  clubId: CLUB_ID,
  userId,
  feePolicyId: 7,
  amount: 10000,
  billingPeriod: '2026-07',
  billingStartDate: '2026-07-01',
  billingEndDate: '2026-07-31',
  dueDate: '2026-07-31',
  status: 'PENDING',
  displayStatus: 'PENDING',
  paidAmount: 0,
  remainingAmount: 10000,
});

const pageFor = (userId: number): PageResponse<FeeBill> => ({
  content: [buildBill(userId)],
  page: 0,
  size: 50,
  totalElements: 1,
  totalPages: 1,
  hasNext: false,
});

// 부원 B 의 응답은 테스트가 열 때까지 붙잡는다 — 키가 바뀐 뒤 응답 전 상태를 본다.
let memberBGate: Promise<void> = Promise.resolve();
let releaseMemberB: () => void = () => {};
function holdMemberB() {
  memberBGate = new Promise<void>((resolve) => {
    releaseMemberB = resolve;
  });
}

const server = setupServer(
  http.get(`*/leader/clubs/${CLUB_ID}/fee-bills`, async ({ request }) => {
    const userId = Number(new URL(request.url).searchParams.get('userId'));
    if (userId === MEMBER_B) await memberBGate;
    return HttpResponse.json({ ok: true, message: null, data: pageFor(userId) });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  releaseMemberB();
  server.resetHandlers();
});
afterAll(() => server.close());

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  };
}

describe('useClubFeeBillsQuery 자리 채움', () => {
  it('기본은 이전 목록을 남기지 않는다 — 부원을 바꾸면 새 부원 응답 전까지 data 가 비어 이전 부원 청구가 보이지 않는다', async () => {
    holdMemberB();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(
      ({ userId }: { userId: number }) => useClubFeeBillsQuery(CLUB_ID, { userId, size: 50 }),
      { initialProps: { userId: MEMBER_A }, wrapper: makeWrapper(queryClient) },
    );
    await waitFor(() => expect(result.current.data?.content[0]?.userId).toBe(MEMBER_A));

    rerender({ userId: MEMBER_B });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isPlaceholderData).toBe(false);

    releaseMemberB();
    await waitFor(() => expect(result.current.data?.content[0]?.userId).toBe(MEMBER_B));
  });

  it('keepPreviousList 를 켜면 새 조건 응답 전까지 이전 목록을 자리 채움으로 남긴다(청구 탭 목록용)', async () => {
    holdMemberB();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(
      ({ userId }: { userId: number }) =>
        useClubFeeBillsQuery(CLUB_ID, { userId, size: 50 }, { keepPreviousList: true }),
      { initialProps: { userId: MEMBER_A }, wrapper: makeWrapper(queryClient) },
    );
    await waitFor(() => expect(result.current.data?.content[0]?.userId).toBe(MEMBER_A));

    rerender({ userId: MEMBER_B });
    expect(result.current.data?.content[0]?.userId).toBe(MEMBER_A);
    expect(result.current.isPlaceholderData).toBe(true);

    releaseMemberB();
    await waitFor(() => expect(result.current.data?.content[0]?.userId).toBe(MEMBER_B));
    expect(result.current.isPlaceholderData).toBe(false);
  });
});
