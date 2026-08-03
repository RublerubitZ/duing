import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useAuthStore, type AuthStatus } from '@duing/stores';
import type { UserRole } from '@duing/types';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

const mockLogout = vi.fn().mockResolvedValue(undefined);
const mockRefresh = vi.fn();
const mockMeData = vi.fn<() => { name: string; role?: UserRole } | undefined>(() => ({
  name: '홍길동',
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
// 스토어는 모킹하지 않는다 — 메뉴는 useSeededAuthStatus(useSyncExternalStore)로 상태를 읽으므로
// 셀렉터 한 번 호출로 대체되는 가짜 스토어로는 구독 계약이 재현되지 않는다.
vi.mock('@duing/hooks', () => ({
  useMeQuery: () => ({ data: mockMeData() }),
  useLogout: () => mockLogout,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { UserMenu } from '../../components/UserMenu';

function setStatus(status: AuthStatus) {
  act(() => useAuthStore.setState({ status }));
}

describe('UserMenu', () => {
  beforeEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    mockLogout.mockReset().mockResolvedValue(undefined);
    mockRefresh.mockClear();
    mockMeData.mockReturnValue({ name: '홍길동' });
  });

  function renderMenu() {
    return render(
      <ToastProvider>
        <UserMenu />
      </ToastProvider>,
    );
  }

  it('미인증 상태면 아무것도 렌더링하지 않는다', () => {
    setStatus('unauthenticated');
    const { container } = renderMenu();
    expect(container.firstChild).toBeNull();
  });

  it('인증 상태면 트리거에 사용자 이름이 표시된다', () => {
    setStatus('authenticated');
    renderMenu();
    expect(screen.getByRole('button', { name: /홍길동님/ })).toBeInTheDocument();
  });

  // 시드 구간의 계약 — 서버 힌트·로컬 이력으로 authenticated 를 세운 직후에는 프로필이 아직 없다.
  // 그때 메뉴를 감추면 로그인한 사용자가 첫 화면에서 자기 진입점을 잃는다.
  it('인증 상태에서 프로필이 아직 안 왔으면 회원 폴백으로 트리거를 렌더한다', () => {
    setStatus('authenticated');
    mockMeData.mockReturnValue(undefined);
    renderMenu();
    expect(screen.getByRole('button', { name: /회원님/ })).toBeInTheDocument();
  });

  it('메뉴를 열면 항목이 menuitem 으로 노출되고 로그아웃 시 logout + router.refresh 가 호출된다', async () => {
    setStatus('authenticated');
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: /홍길동님/ }));

    expect(screen.getByRole('menuitem', { name: '마이페이지' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '설정' })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: '로그아웃' }));

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it('로그아웃 실패 시 오류를 알리고 세션 화면을 유지해 다시 시도할 수 있다', async () => {
    setStatus('authenticated');
    mockLogout.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: /홍길동님/ }));
    await user.click(screen.getByRole('menuitem', { name: '로그아웃' }));

    expect(await screen.findByText(/로그아웃하지 못했습니다/)).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /홍길동님/ }));
    await user.click(screen.getByRole('menuitem', { name: '로그아웃' }));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    expect(mockLogout).toHaveBeenCalledTimes(2);
  });

  it('ADMIN 이면 총동연 콘솔 항목이 노출되고 /admin/clubs 로 연결된다', async () => {
    setStatus('authenticated');
    mockMeData.mockReturnValue({ name: '홍길동', role: 'ADMIN' });
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: /홍길동님/ }));

    const consoleItem = screen.getByRole('menuitem', { name: '총동연 콘솔' });
    expect(consoleItem).toBeInTheDocument();
    expect(consoleItem).toHaveAttribute('href', '/admin/clubs');
  });

  it('비ADMIN 이면 총동연 콘솔 항목이 노출되지 않는다', async () => {
    setStatus('authenticated');
    mockMeData.mockReturnValue({ name: '홍길동', role: 'STUDENT' });
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: /홍길동님/ }));

    expect(screen.getByRole('menuitem', { name: '마이페이지' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '총동연 콘솔' })).not.toBeInTheDocument();
  });

  it('Esc 키로 열린 메뉴가 닫힌다', async () => {
    setStatus('authenticated');
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: /홍길동님/ }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });
});
