import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

import { createApiClient } from '@duing/api';
import { ApiClientProvider, favoriteQueryKeys } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import type { StudentRecruitmentProjection } from '@duing/types';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { AdminRoleGuard } from '@/app/admin/_components/AdminRoleGuard';
import { FavoriteToggleButton } from '@/app/_components/FavoriteToggleButton';
import { HomeNavAuthSlot } from '@/app/_components/HomeNavAuthSlot';
import { useClubApply } from '@/app/clubs/[clubId]/_lib/useClubApply';

/**
 * status 'idle' 은 "세션 확인 중" 이지 "미인증" 이 아니다.
 * idle 을 미인증처럼 다루면 이미 로그인한 사용자가 하드 로드 직후 로그아웃 화면을 보거나
 * 로그인 페이지로 튕긴다(2026-08-03 재현). 소비자별로 그 규약을 고정한다.
 *
 * 스토어는 모킹하지 않고 실제 zustand 를 쓴다 — 이 PR 이 고치는 대상이 idle→확정 "전이" 라,
 * 정적 스냅샷만 검증하는 모킹으로는 회귀를 못 잡는다.
 */
const mockRouterPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush }) }));

const BASE = 'http://localhost:8080/api/v1';
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

/** 이 스위트에서 나간 API 요청 경로 — "요청 없이 튕겼는지" 를 단언으로 확인한다. */
const requestedPaths: string[] = [];
const trackRequest = ({ request }: { request: Request }) => {
  requestedPaths.push(new URL(request.url).pathname);
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  server.events.on('request:start', trackRequest);
});
afterEach(() => {
  server.resetHandlers();
  mockRouterPush.mockReset();
  requestedPaths.length = 0;
  act(() => useAuthStore.setState({ status: 'idle', user: null }));
});
afterAll(() => {
  server.events.removeListener('request:start', trackRequest);
  server.close();
});

let latestQueryClient: QueryClient;

function Wrapper({ children }: { children: ReactNode }) {
  latestQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={latestQueryClient}>
      <ApiClientProvider client={apiClient}>
        <ToastProvider>{children}</ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>
  );
}

const renderWithProviders = (ui: ReactNode) => render(<Wrapper>{ui}</Wrapper>);
const setAuthStatus = (status: 'idle' | 'authenticated' | 'unauthenticated') =>
  act(() => useAuthStore.setState({ status, user: null }));

/** 세션 만료가 확정되는 응답 한 쌍 — 원 401 과, 갱신 시도까지 실패시키는 refresh 401. */
function expiredSession(path: string) {
  return [
    http.all(`${BASE}${path}`, () =>
      HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 }),
    ),
    http.post(`${BASE}/auth/web/refresh`, () => new HttpResponse(null, { status: 401 })),
  ];
}

describe('HomeNavAuthSlot — 세션 확인 중에는 로그아웃 UI 를 보이지 않는다', () => {
  it('idle 이면 로그인·가입하기 대신 같은 자리의 확인 중 표시를 렌더하고, 확정되면 전환한다', () => {
    setAuthStatus('idle');
    renderWithProviders(<HomeNavAuthSlot />);

    expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '가입하기' })).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: '로그인 상태 확인 중' })).toBeInTheDocument();

    // 확인이 끝나면(미인증 확정) 같은 자리에 실제 버튼이 들어온다.
    setAuthStatus('unauthenticated');
    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '가입하기' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: '로그인 상태 확인 중' })).not.toBeInTheDocument();
  });

  // 부트스트랩은 401 이 아닌 실패(5xx·오프라인·CORS)에서 status 를 idle 로 남긴다.
  // 그때 자리표시만 계속 보이면 로그인 진입점이 사라져 사용자가 복구할 방법이 없어진다.
  it('확인이 끝나지 않아도 상한을 넘기면 로그인 진입점을 되살린다', () => {
    vi.useFakeTimers();
    try {
      setAuthStatus('idle');
      renderWithProviders(<HomeNavAuthSlot />);
      expect(screen.getByRole('status', { name: '로그인 상태 확인 중' })).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(10_000));

      expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AdminRoleGuard — 세션 확인 중에는 권한을 판정하지 않는다', () => {
  // useMeQuery 는 status 확정 전까지 enabled:false 라 isLoading 이 false 로 내려온다.
  // 그 값만 믿으면 로그인한 관리자가 콘솔을 열 때마다 권한 거부 문구를 먼저 본다.
  it('idle 이면 권한 거부 문구 대신 확인 중을 렌더한다', () => {
    setAuthStatus('idle');
    renderWithProviders(
      <AdminRoleGuard>
        <p>관리자 콘텐츠</p>
      </AdminRoleGuard>,
    );

    expect(screen.queryByText('총동연(관리자) 권한이 필요합니다.')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: '권한 확인 중' })).toBeInTheDocument();
  });

  it('미인증이 확정되면 권한 거부 문구를 렌더한다', () => {
    setAuthStatus('unauthenticated');
    renderWithProviders(
      <AdminRoleGuard>
        <p>관리자 콘텐츠</p>
      </AdminRoleGuard>,
    );

    expect(screen.getByText('총동연(관리자) 권한이 필요합니다.')).toBeInTheDocument();
  });
});

describe('FavoriteToggleButton — 세션 확인 중 클릭은 로그인으로 튕기지 않는다', () => {
  it('idle 이면 로그인으로 보내지 않고 찜 요청을 보낸다', async () => {
    setAuthStatus('idle');
    server.use(
      http.post(`${BASE}/me/favorites/7`, () =>
        HttpResponse.json({ ok: true, data: 7, message: null }),
      ),
    );

    renderWithProviders(<FavoriteToggleButton clubId={7} />);
    await userEvent.click(screen.getByRole('button', { name: '찜 추가' }));

    await waitFor(() => expect(requestedPaths).toContain('/api/v1/me/favorites/7'));
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('idle 클릭이 401 로 돌아오면 요청을 보낸 뒤 로그인으로 보내고, 찜 캐시를 남기지 않는다', async () => {
    setAuthStatus('idle');
    server.use(...expiredSession('/me/favorites/7'));

    renderWithProviders(<FavoriteToggleButton clubId={7} />);
    await userEvent.click(screen.getByRole('button', { name: '찜 추가' }));

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/login?next=%2F'));
    // 즉시 튕긴 게 아니라 실제로 물어본 뒤 판단했는지 — 이게 없으면 수정 전 코드도 통과한다.
    expect(requestedPaths).toContain('/api/v1/me/favorites/7');
    // 실패한 낙관적 갱신이 캐시에 남으면 비로그인 화면에 채워진 하트로 보인다.
    expect(latestQueryClient.getQueryData(favoriteQueryKeys.ids())).toBeUndefined();
  });

  it('미인증이 확정되면 요청 없이 즉시 로그인으로 보낸다', async () => {
    setAuthStatus('unauthenticated');
    renderWithProviders(<FavoriteToggleButton clubId={7} />);
    await userEvent.click(screen.getByRole('button', { name: '찜 추가' }));

    expect(mockRouterPush).toHaveBeenCalledWith('/login?next=%2F');
    expect(requestedPaths).toHaveLength(0);
  });
});

describe('useClubApply — 세션 확인 중 지원 클릭은 로그인으로 튕기지 않는다', () => {
  const recruitment: StudentRecruitmentProjection = {
    id: 3,
    title: '모집',
    startDate: '2026-01-01',
    endDate: '2099-12-31',
    displayStatus: 'OPEN',
    capacity: 20,
    useInterview: false,
    targetRole: 'MEMBER',
    applicationMode: 'SELF',
    externalFormUrl: null,
    interviewStartDate: null,
    interviewEndDate: null,
    applicantCount: null,
  };

  it('idle 이면 지원 자격 확인을 거쳐 지원 페이지로 이동한다', async () => {
    setAuthStatus('idle');
    server.use(
      http.get(`${BASE}/recruitments/3/applications/eligibility`, () =>
        HttpResponse.json({ ok: true, data: null, message: null }),
      ),
    );

    const { result } = renderHook(() => useClubApply(recruitment), { wrapper: Wrapper });
    await act(() => result.current.handleApply());

    expect(requestedPaths).toContain('/api/v1/recruitments/3/applications/eligibility');
    expect(mockRouterPush).toHaveBeenCalledWith('/apply/3');
  });

  it('idle 클릭이 401 로 돌아오면 요청을 보낸 뒤 로그인으로 보낸다', async () => {
    setAuthStatus('idle');
    server.use(...expiredSession('/recruitments/3/applications/eligibility'));

    const { result } = renderHook(() => useClubApply(recruitment), { wrapper: Wrapper });
    await act(() => result.current.handleApply());

    expect(requestedPaths).toContain('/api/v1/recruitments/3/applications/eligibility');
    expect(mockRouterPush).toHaveBeenCalledWith('/login?next=%2Fapply%2F3');
  });

  it('미인증이 확정되면 자격 확인 없이 즉시 로그인으로 보낸다', async () => {
    setAuthStatus('unauthenticated');
    const { result } = renderHook(() => useClubApply(recruitment), { wrapper: Wrapper });
    await act(() => result.current.handleApply());

    expect(mockRouterPush).toHaveBeenCalledWith('/login?next=%2Fapply%2F3');
    expect(requestedPaths).toHaveLength(0);
  });
});
