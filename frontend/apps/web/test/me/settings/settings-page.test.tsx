import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@duing/hooks', () => ({
  useLogout: () => vi.fn(),
  useMeQuery: () => ({
    data: {
      id: 1,
      name: '홍길동',
      studentId: '20240001',
      phone: '010-1234-5678',
      grade: 'FRESHMAN',
      role: 'STUDENT',
      college: 'IT_ENGINEERING',
      major: '컴퓨터정보공학부',
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

function renderPage() {
  return render(
    <ToastProvider>
      <SettingsPage />
    </ToastProvider>,
  );
}

describe('SettingsPage', () => {
  it('단과대학·전공 행을 표시한다', () => {
    renderPage();
    expect(screen.getByText('단과대학')).toBeInTheDocument();
    expect(screen.getByText('IT·공과대학')).toBeInTheDocument();
    expect(screen.getByText('전공')).toBeInTheDocument();
    expect(screen.getByText('컴퓨터정보공학부')).toBeInTheDocument();
  });

  it('버전 푸터 문구를 더 이상 표시하지 않는다', () => {
    renderPage();
    expect(screen.queryByText(/두잉 v/)).not.toBeInTheDocument();
    expect(screen.queryByText(/마지막 업데이트/)).not.toBeInTheDocument();
  });

  it('1:1 문의 CTA 카드가 /me/inquiries/new 로 연결된다', () => {
    renderPage();
    const inquiryLink = screen.getByRole('link', { name: /1:1 문의하기/ });
    expect(inquiryLink).toHaveAttribute('href', '/me/inquiries/new');
  });
});
