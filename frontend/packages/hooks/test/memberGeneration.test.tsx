import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { clubQueryKeys } from '../src/clubQueryKeys';
import { useUpdateMemberGenerationMutation } from '../src/clubs';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (<ApiClientProvider client={apiClient}><QueryClientProvider client={qc}>{children}</QueryClientProvider></ApiClientProvider>);
  };
}
function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

const server = setupServer(
  http.patch('*/clubs/10/members/5/generation', () => new HttpResponse(null, { status: 204 })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('member generation hook', () => {
  it('기수 변경 성공 시 members 쿼리키를 무효화한다', async () => {
    const qc = newQueryClient();
    qc.setQueryData(clubQueryKeys.members(10), []);

    const { result } = renderHook(() => useUpdateMemberGenerationMutation(10), { wrapper: makeWrapper(qc) });
    await act(async () => {
      await result.current.mutateAsync({ memberId: 5, payload: { generation: 3 } });
    });

    expect(qc.getQueryState(clubQueryKeys.members(10))?.isInvalidated).toBe(true);
  });

  it('기수 클리어(null)도 members 쿼리키를 무효화한다', async () => {
    const qc = newQueryClient();
    qc.setQueryData(clubQueryKeys.members(10), []);

    const { result } = renderHook(() => useUpdateMemberGenerationMutation(10), { wrapper: makeWrapper(qc) });
    await act(async () => {
      await result.current.mutateAsync({ memberId: 5, payload: { generation: null } });
    });

    expect(qc.getQueryState(clubQueryKeys.members(10))?.isInvalidated).toBe(true);
  });
});
