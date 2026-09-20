import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { clubMembershipKeys } from '../src/clubMembershipQueryKeys';
import { useLeaveClubMutation } from '../src/clubs';

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

const server = setupServer(
  http.delete('*/clubs/10/members/me', () => new HttpResponse(null, { status: 204 })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('leave club hook', () => {
  // 멤버십 조회는 staleTime 5분이다 — 무효화하지 않으면 탈퇴 직후에도 동아리 상세가
  // "이미 소속된 동아리예요" 를 유지해 재지원이 막힌다.
  it('탈퇴 성공 시 해당 동아리 멤버십 쿼리키를 무효화한다', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(clubMembershipKeys.byClub(10), { clubId: 10, role: 'MEMBER' });

    const { result } = renderHook(() => useLeaveClubMutation(10), {
      wrapper: makeWrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(queryClient.getQueryState(clubMembershipKeys.byClub(10))?.isInvalidated).toBe(true);
  });
});
