import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';

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
  useManagedClubsQuery: () => ({ data: [] }),
  useFavoriteListQuery: () => ({ data: { content: [] } }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);
vi.mock('@/app/_components/HomeNav', () => ({ HomeNav: () => null }));
vi.mock('@/app/me/_components/MyPageHeader', () => ({ MyPageHeader: () => null }));
vi.mock('@/components/duing/Sparkle', () => ({ SparkleFull: () => null }));
vi.mock('@/app/me/settings/_components/ProfileEditDialog', () => ({ ProfileEditDialog: () => null }));
vi.mock('@/app/me/settings/_components/PasswordChangeDialog', () => ({ PasswordChangeDialog: () => null }));
vi.mock('@/app/me/settings/_components/PhoneChangeDialog', () => ({ PhoneChangeDialog: () => null }));
vi.mock('@/app/me/settings/_components/WithdrawAccountDialog', () => ({ WithdrawAccountDialog: () => null }));
vi.mock('@/app/me/settings/_components/SessionListCard', () => ({ SessionListCard: () => null }));

import { SettingsPage } from '@/app/me/settings/_pages/SettingsPage';

describe('SettingsPage logout', () => {
  beforeEach(() => {
    mockLogout.mockReset();
    mockReplace.mockReset();
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
    expect(mockReplace).not.toHaveBeenCalled();
    // 취소는 설정 화면을 그대로 둔다.
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '로그아웃' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: '로그아웃' }),
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockLogout).toHaveBeenCalledTimes(1);
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
    expect(mockReplace).not.toHaveBeenCalled();

    await confirmLogout();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockLogout).toHaveBeenCalledTimes(2);
  });
});
