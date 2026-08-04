import type { ReactNode } from 'react';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import { useAdminApplicantsQuery } from '../src/adminRecruitments';

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

const server = setupServer(
  http.get('*/admin/recruitments/5/applications', ({ request }) => {
    const searchedName = new URL(request.url).searchParams.get('q') ?? '정우진';
    return HttpResponse.json({
      ok: true,
      message: null,
      data: {
        total: 2,
        statusCounts: { SUBMITTED: 2 },
        applicants: [
          {
            applicationId: 31,
            userName: searchedName,
            studentId: '2023118902',
            college: 'IT_ENGINEERING',
            major: '전자공학과',
            status: 'SUBMITTED',
            submittedAt: '2026-08-01T02:30:00Z',
          },
        ],
      },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useAdminApplicantsQuery', () => {
  it('검색어가 바뀌어도 이전 목록을 유지한 채 갱신한다', async () => {
    // 첫 조회는 검색어 없음 — 타입을 명시해야 이후 rerender 에서 검색어를 넣을 수 있다.
    const initialProps: { searchQuery?: string } = { searchQuery: undefined };
    const { result, rerender } = renderHook(
      ({ searchQuery }: { searchQuery?: string }) =>
        useAdminApplicantsQuery(5, { q: searchQuery, sort: 'LATEST' }),
      { wrapper: makeWrapper(newQueryClient()), initialProps },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ searchQuery: '김민수' });

    // 새 키로 넘어가는 순간 data 가 비면 화면이 로딩으로 리셋된다 — 타이핑 중인 검색 입력창까지
    // 언마운트돼 포커스를 잃으므로, 갱신 중에도 이전 목록이 남아 있어야 한다.
    expect(result.current.data).toBeDefined();
    expect(result.current.isPlaceholderData).toBe(true);

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data?.applicants[0]?.userName).toBe('김민수');
  });
});
