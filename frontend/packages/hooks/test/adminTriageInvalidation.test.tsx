import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '@duing/api';
import { useCloseClubMutation, useUpdateClubStatusMutation } from '../src/admin';
import { adminQueryKeys } from '../src/adminQueryKeys';
import { useForceCloseRecruitmentMutation } from '../src/adminRecruitments';
import { ApiClientProvider } from '../src/api-context';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
const server = setupServer(
  http.patch('*/admin/recruitments/31/close', () => new HttpResponse(null, { status: 204 })),
  http.patch('*/admin/clubs/7/status', () => new HttpResponse(null, { status: 204 })),
  http.post('*/admin/clubs/7/close', () => new HttpResponse(null, { status: 204 })),
);
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

describe('총동연 홈 대기열에 닿는 무효화', () => {
  it('모집 강제 마감은 모집 목록과 처리 대기 건수(사이드바 배지·홈 칸)를 무효화한다', async () => {
    const { invalidateSpy, wrapper } = setup();
    const { result } = renderHook(() => useForceCloseRecruitmentMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ recruitmentId: 31, payload: { reason: '장기 방치' } });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminQueryKeys.recruitmentsAll });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminQueryKeys.pendingCounts() });
  });

  it('동아리 상태 변경은 모집 목록도 무효화한다 — 운영 중단 전환이 진행 중 모집을 마감한다', async () => {
    const { invalidateSpy, wrapper } = setup();
    const { result } = renderHook(() => useUpdateClubStatusMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ clubId: 7, payload: { status: 'INACTIVE' } });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminQueryKeys.pendingCounts() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminQueryKeys.recruitmentsAll });
  });

  it('동아리 폐쇄는 처리 대기 건수와 모집·회장 승계·홍보 요청 목록을 무효화한다', async () => {
    const { invalidateSpy, wrapper } = setup();
    const { result } = renderHook(() => useCloseClubMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ clubId: 7, payload: { closureReason: '활동 종료' } });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminQueryKeys.pendingCounts() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminQueryKeys.recruitmentsAll });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminQueryKeys.leaderSuccessionAll });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: adminQueryKeys.promotionRequestsAll });
  });
});
