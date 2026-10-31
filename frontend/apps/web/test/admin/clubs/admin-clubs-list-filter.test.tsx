import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

import { AdminClubsListPage } from '@/app/admin/clubs/_pages/AdminClubsListPage';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

const mockSearchParams = vi.fn(() => new URLSearchParams());
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/clubs',
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

let listRequests: Record<string, string>[] = [];
const server = setupServer(
  http.get('*/admin/clubs', ({ request }) => {
    listRequests.push(Object.fromEntries(new URL(request.url).searchParams));
    return HttpResponse.json({
      ok: true,
      message: null,
      data: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, hasNext: false },
    });
  }),
);
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  listRequests = [];
  mockSearchParams.mockReturnValue(new URLSearchParams());
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AdminClubsListPage />
        </ToastProvider>
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe('AdminClubsListPage — 상태 필터 첫 값·조회 조건', () => {
  it('주소 ?status=INACTIVE_PENDING 이면 미결 정리 필요 탭으로 열고, 운영 중단 + 남은 미결 조건으로 조회한다', async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams('status=INACTIVE_PENDING'));
    renderPage();

    await waitFor(() => expect(listRequests).toHaveLength(1));
    expect(listRequests[0]).toEqual({ status: 'INACTIVE', needsPendingCleanup: 'true', page: '0', size: '20' });
    expect(screen.getByRole('tab', { name: '미결 정리 필요' })).toHaveAttribute('aria-selected', 'true');
  });

  it('모르는 status 면 지금 기본(승인 대기)으로 연다', async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams('status=DELETED'));
    renderPage();

    await waitFor(() => expect(listRequests).toHaveLength(1));
    expect(listRequests[0]).toEqual({ status: 'PENDING_APPROVAL', page: '0', size: '20' });
    expect(screen.getByRole('tab', { name: '승인 대기' })).toHaveAttribute('aria-selected', 'true');
  });

  it('미결 정리 필요 탭을 눌러도 status=INACTIVE_PENDING 을 보내지 않는다(서버 400) — 조회 조건으로 바꿔 보낸다', async () => {
    renderPage();
    await waitFor(() => expect(listRequests).toHaveLength(1));

    await userEvent.click(screen.getByRole('tab', { name: '미결 정리 필요' }));

    await waitFor(() => expect(listRequests).toHaveLength(2));
    expect(listRequests[1]).toEqual({ status: 'INACTIVE', needsPendingCleanup: 'true', page: '0', size: '20' });
    expect(listRequests.some((params) => params.status === 'INACTIVE_PENDING')).toBe(false);
  });

  it('전체 탭은 상태 조건 없이 조회한다', async () => {
    renderPage();
    await waitFor(() => expect(listRequests).toHaveLength(1));

    await userEvent.click(screen.getByRole('tab', { name: '전체' }));

    await waitFor(() => expect(listRequests).toHaveLength(2));
    expect(listRequests[1]).toEqual({ page: '0', size: '20' });
  });
});
