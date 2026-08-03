import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
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
 */
const mockAuthStatus = { value: 'idle' };
vi.mock('@duing/stores', () => ({
  useAuthStore: Object.assign(
    (selector: (state: { status: string; user: null }) => unknown) =>
      selector({ status: mockAuthStatus.value, user: null }),
    { getState: () => ({ status: mockAuthStatus.value, user: null }) },
  ),
}));

const mockRouterPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush }) }));

const BASE = 'http://localhost:8080/api/v1';
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  mockRouterPush.mockReset();
  mockAuthStatus.value = 'idle';
});
afterAll(() => server.close());

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <ToastProvider>{children}</ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>
  );
}

const renderWithProviders = (ui: ReactNode) => render(<Wrapper>{ui}</Wrapper>);

describe('HomeNavAuthSlot — 세션 확인 중에는 로그아웃 UI 를 보이지 않는다', () => {
  it('idle 이면 로그인·가입하기 대신 같은 자리의 확인 중 표시를 렌더한다', () => {
    mockAuthStatus.value = 'idle';
    renderWithProviders(<HomeNavAuthSlot />);

    expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '가입하기' })).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: '로그인 상태 확인 중' })).toBeInTheDocument();
  });

  it('미인증이 확정되면 로그인·가입하기를 렌더한다', () => {
    mockAuthStatus.value = 'unauthenticated';
    renderWithProviders(<HomeNavAuthSlot />);

    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '가입하기' })).toBeInTheDocument();
  });
});

describe('AdminRoleGuard — 세션 확인 중에는 권한을 판정하지 않는다', () => {
  // useMeQuery 는 status 확정 전까지 enabled:false 라 isLoading 이 false 로 내려온다.
  // 그 값만 믿으면 로그인한 관리자가 콘솔을 열 때마다 권한 거부 문구를 먼저 본다.
  it('idle 이면 권한 거부 문구 대신 확인 중을 렌더한다', () => {
    mockAuthStatus.value = 'idle';
    renderWithProviders(
      <AdminRoleGuard>
        <p>관리자 콘텐츠</p>
      </AdminRoleGuard>,
    );

    expect(screen.queryByText('총동연(관리자) 권한이 필요합니다.')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: '권한 확인 중' })).toBeInTheDocument();
  });

  it('미인증이 확정되면 권한 거부 문구를 렌더한다', () => {
    mockAuthStatus.value = 'unauthenticated';
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
    mockAuthStatus.value = 'idle';
    let favoriteRequested = false;
    server.use(
      http.post(`${BASE}/me/favorites/7`, () => {
        favoriteRequested = true;
        return HttpResponse.json({ ok: true, data: 7, message: null });
      }),
    );

    renderWithProviders(<FavoriteToggleButton clubId={7} />);
    await userEvent.click(screen.getByRole('button', { name: '찜 추가' }));

    await waitFor(() => expect(favoriteRequested).toBe(true));
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('idle 클릭이 401 로 돌아오면 그때 로그인으로 보낸다', async () => {
    mockAuthStatus.value = 'idle';
    server.use(
      http.post(`${BASE}/me/favorites/7`, () =>
        HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 }),
      ),
      // 401 은 갱신을 한 번 시도한다 — 여기서도 실패하면 원 401 이 표면화된다.
      http.post(`${BASE}/auth/web/refresh`, () => new HttpResponse(null, { status: 401 })),
    );

    renderWithProviders(<FavoriteToggleButton clubId={7} />);
    await userEvent.click(screen.getByRole('button', { name: '찜 추가' }));

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith(expect.stringContaining('/login')));
  });

  it('미인증이 확정되면 요청 없이 즉시 로그인으로 보낸다', async () => {
    mockAuthStatus.value = 'unauthenticated';
    // 핸들러를 등록하지 않는다 — 요청이 새어 나가면 onUnhandledRequest 로 실패한다.
    renderWithProviders(<FavoriteToggleButton clubId={7} />);
    await userEvent.click(screen.getByRole('button', { name: '찜 추가' }));

    expect(mockRouterPush).toHaveBeenCalledWith(expect.stringContaining('/login'));
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
    mockAuthStatus.value = 'idle';
    let eligibilityChecked = false;
    server.use(
      http.get(`${BASE}/recruitments/3/applications/eligibility`, () => {
        eligibilityChecked = true;
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    const { result } = renderHook(() => useClubApply(recruitment), { wrapper: Wrapper });
    await result.current.handleApply();

    expect(eligibilityChecked).toBe(true);
    expect(mockRouterPush).toHaveBeenCalledWith('/apply/3');
  });

  it('idle 클릭이 401 로 돌아오면 그때 로그인으로 보낸다', async () => {
    mockAuthStatus.value = 'idle';
    server.use(
      http.get(`${BASE}/recruitments/3/applications/eligibility`, () =>
        HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 }),
      ),
      http.post(`${BASE}/auth/web/refresh`, () => new HttpResponse(null, { status: 401 })),
    );

    const { result } = renderHook(() => useClubApply(recruitment), { wrapper: Wrapper });
    await result.current.handleApply();

    expect(mockRouterPush).toHaveBeenCalledWith(expect.stringContaining('/login'));
  });

  it('미인증이 확정되면 자격 확인 없이 즉시 로그인으로 보낸다', async () => {
    mockAuthStatus.value = 'unauthenticated';
    const { result } = renderHook(() => useClubApply(recruitment), { wrapper: Wrapper });
    await result.current.handleApply();

    expect(mockRouterPush).toHaveBeenCalledWith(expect.stringContaining('/login'));
  });
});
