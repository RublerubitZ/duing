import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

  it('로그아웃 실패 시 이동하지 않고 오류를 표시한 뒤 재시도할 수 있다', async () => {
    mockLogout.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <SettingsPage />
      </ToastProvider>,
    );

    const logoutButton = screen.getByRole('button', { name: '로그아웃' });
    await user.click(logoutButton);

    expect(await screen.findByText(/로그아웃하지 못했습니다/)).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();

    await user.click(logoutButton);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockLogout).toHaveBeenCalledTimes(2);
  });
});
