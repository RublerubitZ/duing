import { render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { ApiError, NETWORK_ERROR_MESSAGE, createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

import { AdminMobileBar } from '@/app/admin/_components/AdminMobileBar';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

// 로그아웃 실패 문구 — 리터럴로 적는다(상수를 import 하면 문구가 바뀌어도 통과한다).
const SWITCHED_TEXT = '다른 탭에서 로그인 상태가 바뀌었어요. 이 화면에서는 저장되지 않아요.';
const ENDED_TEXT = '로그아웃되었어요. 이 화면에서는 저장되지 않아요.';
const OFFLINE_LOGOUT_TEXT = '로그아웃하지 못했습니다. 네트워크 연결 후 다시 시도해 주세요.';
const mockUsePathname = vi.fn(() => '/admin');
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

// 로그아웃 훅만 바꿔 끼운다 — 실제 훅은 세션 저장소 정리까지 해서 이 테스트 환경에서는 끝나지 않는다(저장소 미구성).
// 이 화면이 책임지는 것은 "훅을 부르고, 끝나면 홈으로 하드 이동한다" 이다.
const logoutSpy = vi.fn(async () => {});
vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useLogout: () => logoutSpy,
}));

// 드로어의 메뉴 배지·이름·알림 종이 조회하는 것들.
const server = setupServer(
  http.get('*/admin/pending-counts', () => HttpResponse.json({ ok: true, data: {}, message: null })),
  http.get('*/users/me', () =>
    HttpResponse.json({ ok: true, data: { id: 1, name: '김총무', role: 'ADMIN' }, message: null }),
  ),
  http.get('*/notifications/unread-count', () => HttpResponse.json({ ok: true, data: { count: 2 }, message: null })),
);
// 로그아웃 후 이동은 window.location.replace(하드 이동)다 — jsdom 은 Location 을 재정의할 수 없어 전역을 스텁한다.
const hardReplaceSpy = vi.fn();
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  vi.stubGlobal('location', { ...window.location, replace: hardReplaceSpy });
});
afterEach(() => {
  server.resetHandlers();
  logoutSpy.mockClear();
  hardReplaceSpy.mockClear();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});
beforeEach(() => mockUsePathname.mockReturnValue('/admin'));

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe('AdminMobileBar', () => {
  it.each([
    ['/admin', '대시보드'],
    ['/admin/weekly-briefing', '주간 브리핑'],
    ['/admin/clubs/3', '동아리 관리'],
    ['/admin/unknown', '관리 콘솔'],
  ])('%s 의 모바일 제목은 %s 다 — 단독 메뉴와 섹션을 같은 판정으로 읽는다', (pathname, title) => {
    mockUsePathname.mockReturnValue(pathname);
    render(<AdminMobileBar />);
    expect(screen.getByText(title)).toBeInTheDocument();
  });

  it('모바일 상단 바는 인쇄에서 숨긴다', () => {
    render(<AdminMobileBar />);
    expect(screen.getByRole('button', { name: '관리 메뉴 열기' }).parentElement).toHaveClass(
      'no-print',
    );
  });

  it('로그인 상태면 상단 바가 알림 종을 맡는다 — 콘솔에는 사이트 상단바가 없다', async () => {
    useAuthStore.setState({ status: 'authenticated', isVerified: true, user: null });
    render(<AdminMobileBar />);
    await waitFor(() =>
      expect(screen.getByRole('link', { name: '알림 2개' })).toHaveAttribute('href', '/notifications'),
    );
  });

  it('드로어 아래에 내 이름(마이페이지)·홈으로·로그아웃이 있고, 로그아웃하면 홈으로 하드 이동한다', async () => {
    useAuthStore.setState({ status: 'authenticated', isVerified: true, user: null });
    const user = userEvent.setup();
    render(<AdminMobileBar />);

    await user.click(screen.getByRole('button', { name: '관리 메뉴 열기' }));
    const drawer = within(await screen.findByRole('dialog', { name: '관리 메뉴' }));
    expect(await drawer.findByRole('link', { name: /김총무/ })).toHaveAttribute('href', '/me');
    expect(drawer.getByRole('link', { name: '홈으로' })).toHaveAttribute('href', '/');

    await user.click(drawer.getByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(hardReplaceSpy).toHaveBeenCalledWith('/'));
    expect(logoutSpy).toHaveBeenCalledTimes(1);
  });

  // 다른 탭의 로그인 상태 바뀜으로 막혔으면 그 원인 문구, 진짜 오프라인이면 지금 문구 그대로.
  it.each([
    ['다른 탭의 계정 전환으로 막힘', SWITCHED_TEXT, SWITCHED_TEXT],
    ['다른 탭의 로그아웃·만료로 막힘', ENDED_TEXT, ENDED_TEXT],
    ['진짜 오프라인', NETWORK_ERROR_MESSAGE, OFFLINE_LOGOUT_TEXT],
  ])('드로어 로그아웃 실패 문구 — %s', async (_label, rejectedMessage, expectedToast) => {
    useAuthStore.setState({ status: 'authenticated', isVerified: true, user: null });
    logoutSpy.mockRejectedValueOnce(new ApiError(0, rejectedMessage, undefined, 'NETWORK'));
    const user = userEvent.setup();
    render(<AdminMobileBar />);

    await user.click(screen.getByRole('button', { name: '관리 메뉴 열기' }));
    const drawer = within(await screen.findByRole('dialog', { name: '관리 메뉴' }));
    await user.click(drawer.getByRole('button', { name: '로그아웃' }));

    expect(await screen.findByText(expectedToast)).toBeInTheDocument();
    expect(hardReplaceSpy).not.toHaveBeenCalled();
  });
});
