import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '@duing/api';
import { useCleanupClubPendingMutation } from '../src/admin';
import { adminQueryKeys } from '../src/adminQueryKeys';
import { ApiClientProvider } from '../src/api-context';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiClientProvider>
  );
  return { invalidateSpy, wrapper };
}

// 성공·실패 모두 같은 다섯 키 — 목록·홈 대기열, 처리 대기(추이 포함), 총동연 모집·지원자, 활동 기록, 가입 링크.
const EXPECTED_INVALIDATED_KEYS = [
  adminQueryKeys.clubsAll,
  adminQueryKeys.pendingCounts(),
  adminQueryKeys.recruitmentsAll,
  adminQueryKeys.clubActivityEventsAll(7),
  adminQueryKeys.clubJoinCodes(7),
];

describe('useCleanupClubPendingMutation', () => {
  it('정리에 성공하면 처리 건수를 돌려주고 다섯 키를 무효화한다', async () => {
    server.use(
      http.post('*/admin/clubs/7/pending-cleanup', () =>
        HttpResponse.json({ ok: true, message: null, data: { rejectedApplicationCount: 3, rejectedJoinRequestCount: 1 } }),
      ),
    );
    const { invalidateSpy, wrapper } = setup();
    const { result } = renderHook(() => useCleanupClubPendingMutation(), { wrapper });

    let cleanupResult: unknown;
    await act(async () => {
      cleanupResult = await result.current.mutateAsync(7);
    });

    expect(cleanupResult).toEqual({ rejectedApplicationCount: 3, rejectedJoinRequestCount: 1 });
    expect(invalidateSpy.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(EXPECTED_INVALIDATED_KEYS);
  });

  it('실패(409 — 그사이 재활성)해도 같은 키를 무효화해 낡은 목록을 스스로 맞춘다', async () => {
    server.use(
      http.post('*/admin/clubs/7/pending-cleanup', () =>
        HttpResponse.json(
          { ok: false, message: '운영 중단 동아리만 남은 미결을 정리할 수 있어요.', data: null },
          { status: 409 },
        ),
      ),
    );
    const { invalidateSpy, wrapper } = setup();
    const { result } = renderHook(() => useCleanupClubPendingMutation(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(7)).rejects.toMatchObject({ status: 409 });
    });

    expect(invalidateSpy.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(EXPECTED_INVALIDATED_KEYS);
  });
});
