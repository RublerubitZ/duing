import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ApiError, NETWORK_ERROR_MESSAGE } from '@duing/api';
import { useAuthStore, type AuthStatus } from '@duing/stores';
import type { UserRole } from '@duing/types';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { SESSION_USER_KEY } from '@/app/_lib/authBoot';

// 로그아웃 실패 문구 — 리터럴로 적는다(상수를 import 하면 문구가 바뀌어도 통과한다).
const SWITCHED_TEXT = '다른 탭에서 로그인 상태가 바뀌었어요. 이 화면에서는 저장되지 않아요.';
const ENDED_TEXT = '로그아웃되었어요. 이 화면에서는 저장되지 않아요.';
const LOGOUT_BLOCKED_TEXT =
  '로그아웃하지 못했어요. 다른 탭에서 로그인 상태가 바뀌었어요 — 새로고침한 뒤 다시 로그아웃해주세요.';
const OFFLINE_LOGOUT_TEXT =
  '로그아웃하지 못했습니다. 네트워크 연결 후 다시 시도하고 이 기기를 떠나지 마세요.';
const mockLogout = vi.fn().mockResolvedValue(undefined);
const mockRefresh = vi.fn();
const mockMeData = vi.fn<() => { name: string; role?: UserRole } | undefined>(() => ({
  name: '홍길동',
}));
const mockMyClubs = vi.fn<
  () =>
    | Array<{
        clubId: number;
        clubName: string;
        myRole: 'LEADER' | 'OFFICER' | 'MEMBER';
        status: 'ACTIVE' | 'PENDING_APPROVAL';
      }>
    | undefined
>(() => []);

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
  useMyClubsQuery: () => ({ data: mockMyClubs() }),
  useLogout: () => mockLogout,
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);
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
    window.localStorage.removeItem(SESSION_USER_KEY);
    mockRefresh.mockClear();
    mockMeData.mockReturnValue({ name: '홍길동' });
    mockMyClubs.mockReturnValue([]);
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

  // 다른 탭 때문에 막혔으면 누를 때의 표지로 고른 문구(비면 로그아웃됨, 사용자가 있으면 못 함), 진짜 오프라인이면 지금 문구 그대로.
  // 표지는 로그아웃을 누를 때의 공유 표지 — 막혔으면 그 값으로 다시 판정한다(사용자가 있으면 로그아웃되지 않았다).
  it.each<[string, string, string | null, string]>([
    ['다른 탭의 계정 전환으로 막힘(표지에 다른 사용자)', SWITCHED_TEXT, '2', LOGOUT_BLOCKED_TEXT],
    ['다른 탭의 로그아웃·만료로 막힘(표지 없음)', ENDED_TEXT, null, ENDED_TEXT],
    ['로그아웃으로 막힌 뒤 다른 탭이 다시 로그인(표지에 사용자)', ENDED_TEXT, '3', LOGOUT_BLOCKED_TEXT],
    ['진짜 오프라인(표지 그대로)', NETWORK_ERROR_MESSAGE, '1', OFFLINE_LOGOUT_TEXT],
  ])('로그아웃 실패 문구 — %s', async (_label, rejectedMessage, sharedSessionUser, expectedToast) => {
    setStatus('authenticated');
    if (sharedSessionUser !== null) window.localStorage.setItem(SESSION_USER_KEY, sharedSessionUser);
    mockLogout.mockRejectedValueOnce(new ApiError(0, rejectedMessage, undefined, 'NETWORK'));
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: /홍길동님/ }));
    await user.click(screen.getByRole('menuitem', { name: '로그아웃' }));

    expect(await screen.findByText(expectedToast)).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
    // 막혔으면 '로그아웃하지 못했습니다' 는 뜨지 않는다(오프라인 행은 그 문구 하나).
    expect(screen.queryAllByText(/로그아웃하지 못했습니다/)).toHaveLength(
      expectedToast === OFFLINE_LOGOUT_TEXT ? 1 : 0,
    );
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

  it('ADMIN 이면 총동연 콘솔 항목이 노출되고 대시보드(/admin)로 연결된다', async () => {
    setStatus('authenticated');
    mockMeData.mockReturnValue({ name: '홍길동', role: 'ADMIN' });
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: /홍길동님/ }));

    const consoleItem = screen.getByRole('menuitem', { name: '총동연 콘솔' });
    expect(consoleItem).toBeInTheDocument();
    expect(consoleItem).toHaveAttribute('href', '/admin');
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

  it('관리 동아리가 1개면 "운영진 콘솔 · 동아리명" 이 그 동아리 콘솔로 연결된다', async () => {
    setStatus('authenticated');
    mockMyClubs.mockReturnValue([{ clubId: 7, clubName: '고정관념', myRole: 'LEADER', status: 'ACTIVE' }]);
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: /홍길동님/ }));
    expect(screen.getByRole('menuitem', { name: '운영진 콘솔 · 고정관념' })).toHaveAttribute('href', '/manage?clubId=7');
  });

  it('관리 동아리가 2개 이상이면 "운영진 콘솔" 이 /manage 로 연결된다', async () => {
    setStatus('authenticated');
    mockMyClubs.mockReturnValue([
      { clubId: 7, clubName: '고정관념', myRole: 'LEADER', status: 'ACTIVE' },
      { clubId: 8, clubName: '동6', myRole: 'OFFICER', status: 'ACTIVE' },
    ]);
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: /홍길동님/ }));
    expect(screen.getByRole('menuitem', { name: '운영진 콘솔' })).toHaveAttribute('href', '/manage');
  });

  it('부원뿐이거나 비활성 동아리만 관리하면 운영진 콘솔 항목이 없다', async () => {
    setStatus('authenticated');
    mockMyClubs.mockReturnValue([
      { clubId: 7, clubName: '고정관념', myRole: 'MEMBER', status: 'ACTIVE' },
      { clubId: 9, clubName: '대기', myRole: 'LEADER', status: 'PENDING_APPROVAL' },
    ]);
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: /홍길동님/ }));
    expect(screen.queryByRole('menuitem', { name: /운영진 콘솔/ })).not.toBeInTheDocument();
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
