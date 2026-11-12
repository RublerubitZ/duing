import { beforeEach, describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError, NETWORK_ERROR_MESSAGE } from '@duing/api';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { SESSION_USER_KEY } from '@/app/_lib/authBoot';

// 로그아웃 실패 문구 — 리터럴로 적는다(상수를 import 하면 문구가 바뀌어도 통과한다).
const SWITCHED_TEXT = '다른 탭에서 로그인 상태가 바뀌었어요. 이 화면에서는 저장되지 않아요.';
const ENDED_TEXT = '로그아웃되었어요. 이 화면에서는 저장되지 않아요.';
const LOGOUT_BLOCKED_TEXT =
  '로그아웃하지 못했어요. 다른 탭에서 로그인 상태가 바뀌었어요 — 새로고침한 뒤 다시 로그아웃해주세요.';
const OFFLINE_LOGOUT_TEXT =
  '로그아웃하지 못했습니다. 네트워크 연결 후 다시 시도하고 이 기기를 떠나지 마세요.';
const mockLogout = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@duing/hooks', () => ({
  useLogout: () => mockLogout,
  useMeQuery: () => ({
    data: {
      id: 1,
      name: '홍길동',
      studentId: '20240001',
      phone: '010-1234-5678',
      grade: 'FRESHMAN',
      role: 'STUDENT',
    },
  }),
  useMyApplicationsQuery: () => ({ data: [] }),
  useMyClubsQuery: () => ({ data: [] }),
  useFavoriteListQuery: () => ({ data: { content: [] } }),
  useProfileCheckQuery: () => ({ data: { pending: false }, isFetching: false, isError: false }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);
vi.mock('@/app/_components/HomeNav', () => ({ HomeNav: () => null }));
vi.mock('@/app/me/_components/MyPageHeader', () => ({ MyPageHeader: () => null }));
vi.mock('@/components/duing/Sparkle', () => ({ SparkleFull: () => null }));
vi.mock('@/app/_components/ProfileEditDialog', () => ({ ProfileEditDialog: () => null }));
vi.mock('@/app/me/settings/_components/PasswordChangeDialog', () => ({ PasswordChangeDialog: () => null }));
vi.mock('@/app/me/settings/_components/PhoneChangeDialog', () => ({ PhoneChangeDialog: () => null }));
vi.mock('@/app/me/settings/_components/WithdrawAccountDialog', () => ({ WithdrawAccountDialog: () => null }));
vi.mock('@/app/me/settings/_components/SessionListCard', () => ({ SessionListCard: () => null }));

import { SettingsPage } from '@/app/me/settings/_pages/SettingsPage';

// 로그아웃 후 이동은 window.location.replace(하드 이동)다 — jsdom 은 Location 을 재정의할 수 없어 전역을 스텁한다.
const hardReplaceSpy = vi.fn();
beforeAll(() => vi.stubGlobal('location', { ...window.location, replace: hardReplaceSpy }));
afterAll(() => vi.unstubAllGlobals());

describe('SettingsPage logout', () => {
  beforeEach(() => {
    mockLogout.mockReset();
    mockReplace.mockReset();
    hardReplaceSpy.mockClear();
    window.localStorage.removeItem(SESSION_USER_KEY);
  });

  // 계정 카드는 "한 번 더 확인 후 진행"이라고 안내한다 — 버튼이 바로 세션을 끊으면 안내와 어긋난다.
  it('로그아웃은 확인 모달을 거치고, 취소하면 세션을 끊지 않는다', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <SettingsPage />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: '로그아웃' }));

    const dialog = screen.getByRole('dialog', { name: '로그아웃할까요?' });
    expect(within(dialog).getByText('이 기기에서 로그아웃돼요.')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(mockLogout).not.toHaveBeenCalled();
    expect(hardReplaceSpy).not.toHaveBeenCalled();
    // 취소는 설정 화면을 그대로 둔다.
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '로그아웃' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: '로그아웃' }),
    );

    await waitFor(() => expect(hardReplaceSpy).toHaveBeenCalledWith('/'));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  // 다른 탭 때문에 막혔으면 누를 때의 표지로 고른 문구(비면 로그아웃됨, 사용자가 있으면 못 함), 진짜 오프라인이면 지금 문구 그대로.
  // 표지는 로그아웃을 누를 때의 공유 표지 — 막혔으면 그 값으로 다시 판정한다(사용자가 있으면 로그아웃되지 않았다).
  it.each<[string, string, string | null, string]>([
    ['다른 탭의 계정 전환으로 막힘(표지에 다른 사용자)', SWITCHED_TEXT, '2', LOGOUT_BLOCKED_TEXT],
    ['다른 탭의 로그아웃·만료로 막힘(표지 없음)', ENDED_TEXT, null, ENDED_TEXT],
    ['로그아웃으로 막힌 뒤 다른 탭이 다시 로그인(표지에 사용자)', ENDED_TEXT, '3', LOGOUT_BLOCKED_TEXT],
    ['진짜 오프라인(표지 그대로)', NETWORK_ERROR_MESSAGE, '1', OFFLINE_LOGOUT_TEXT],
  ])('로그아웃 실패 문구 — %s', async (_label, rejectedMessage, sharedSessionUser, expectedToast) => {
    if (sharedSessionUser !== null) window.localStorage.setItem(SESSION_USER_KEY, sharedSessionUser);
    mockLogout.mockRejectedValueOnce(new ApiError(0, rejectedMessage, undefined, 'NETWORK'));
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <SettingsPage />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: '로그아웃' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '로그아웃' }));

    expect(await screen.findByText(expectedToast)).toBeInTheDocument();
    expect(hardReplaceSpy).not.toHaveBeenCalled();
    // 막혔으면 '로그아웃하지 못했습니다' 는 뜨지 않는다(오프라인 행은 그 문구 하나).
    expect(screen.queryAllByText(/로그아웃하지 못했습니다/)).toHaveLength(
      expectedToast === OFFLINE_LOGOUT_TEXT ? 1 : 0,
    );
  });

  it('로그아웃 실패 시 이동하지 않고 오류를 표시한 뒤 재시도할 수 있다', async () => {
    mockLogout.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <SettingsPage />
      </ToastProvider>,
    );

    const confirmLogout = async () => {
      await user.click(screen.getByRole('button', { name: '로그아웃' }));
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: '로그아웃' }),
      );
    };

    await confirmLogout();

    expect(await screen.findByText(/로그아웃하지 못했습니다/)).toBeInTheDocument();
    expect(hardReplaceSpy).not.toHaveBeenCalled();

    await confirmLogout();
    await waitFor(() => expect(hardReplaceSpy).toHaveBeenCalledWith('/'));
    expect(mockLogout).toHaveBeenCalledTimes(2);
  });
});
