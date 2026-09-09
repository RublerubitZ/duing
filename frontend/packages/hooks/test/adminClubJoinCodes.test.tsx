import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import {
  useAdminClubJoinCodesQuery,
  useForceRevokeAdminClubJoinCodeMutation,
} from '../src/admin';
import { adminQueryKeys } from '../src/adminQueryKeys';

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
  http.get('*/admin/clubs/7/join-codes', () =>
    HttpResponse.json({
      ok: true,
      message: null,
      data: [{ joinCodeId: 42, code: 'ABC123', status: 'ACTIVE' }],
    }),
  ),
  http.patch('*/admin/clubs/7/join-codes/42/revoke', () => new HttpResponse(null, { status: 204 })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useAdminClubJoinCodesQuery', () => {
  it('동아리 가입 링크 목록을 그대로 돌려준다', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAdminClubJoinCodesQuery(7), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.joinCodeId).toBe(42);
  });

  it('쿼리키는 동아리 id 하나로 끝난다 — 페이지·필터 축이 없다', () => {
    expect(adminQueryKeys.clubJoinCodes(7)).toEqual(['admin', 'club-join-codes', 7]);
  });
});

describe('useForceRevokeAdminClubJoinCodeMutation', () => {
  it('폐기에 성공하면 링크 목록과 활동 이력을 함께 무효화한다', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidatedKeys: unknown[] = [];
    const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
    queryClient.invalidateQueries = (filters) => {
      invalidatedKeys.push(filters?.queryKey);
      return originalInvalidate(filters);
    };

    const { result } = renderHook(() => useForceRevokeAdminClubJoinCodeMutation(7), {
      wrapper: makeWrapper(queryClient),
    });

    result.current.mutate({ joinCodeId: 42, payload: { reason: '유출 신고 접수' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidatedKeys).toContainEqual(adminQueryKeys.clubJoinCodes(7));
    expect(invalidatedKeys).toContainEqual(adminQueryKeys.clubActivityEventsAll(7));
  });
});
