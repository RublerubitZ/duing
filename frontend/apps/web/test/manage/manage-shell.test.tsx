import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedClub, User } from '@duing/types';

const pushSpy = vi.fn();
const replaceSpy = vi.fn();
vi.mock('@/app/_lib/useGuardedRouter', () => ({
  useGuardedRouter: () => ({ push: pushSpy, replace: replaceSpy }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/manage/clubs/1',
}));

vi.mock('@/components/duing/BrandMark', () => ({
  BrandMark: () => <span>Duing</span>,
}));

const addToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast }),
}));

const CLUBS: ManagedClub[] = [
  { clubId: 1, clubName: 'AI 동아리', logoUrl: null, myRole: 'LEADER', centralClub: true, activeRecruitmentCount: 2 },
];

const ME: User = {
  id: 7,
  studentId: '20240001',
  name: '김도윤',
  phone: '01000000000',
  grade: 'JUNIOR',
  role: 'STUDENT',
};

const logoutSpy = vi.fn(async () => {});
vi.mock('@duing/hooks', () => ({
  useManagedClubsQuery: () => ({ data: CLUBS, isLoading: false }),
  useMeQuery: () => ({ data: ME }),
  useLogout: () => logoutSpy,
}));

import { ManageShell } from '@/app/manage/_components/ManageShell';

describe('ManageShell — 접기·푸터', () => {
  beforeEach(() => {
    window.localStorage.clear();
    pushSpy.mockReset();
    replaceSpy.mockReset();
    logoutSpy.mockClear();
  });

  it('접기 토글 시 localStorage 에 저장되고, 재마운트(새로고침) 후에도 접힘이 유지된다', async () => {
    const user = userEvent.setup();
    render(<ManageShell currentClubId={1}>본문</ManageShell>);

    await user.click(screen.getByRole('button', { name: '사이드바 접기' }));
    expect(window.localStorage.getItem('duing:manage:sidebar-collapsed')).toBe('1');

    cleanup();
    render(<ManageShell currentClubId={1}>본문</ManageShell>);
    expect(await screen.findByRole('button', { name: '사이드바 펼치기' })).toBeInTheDocument();
  });

  it('접힘 상태에서 내비 링크의 title 툴팁·접근 가능한 이름이 유지되고, 클럽 전환 헤더는 숨는다', async () => {
    window.localStorage.setItem('duing:manage:sidebar-collapsed', '1');
    render(<ManageShell currentClubId={1}>본문</ManageShell>);

    const dashboardLink = await screen.findByRole('link', { name: '대시보드' });
    expect(dashboardLink).toHaveAttribute('title', '대시보드');
    expect(screen.queryByRole('button', { name: /동아리 전환/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
  });

  it('펼침 상태에서 클럽 전환 트리거·내 이름·로그아웃이 표시된다', () => {
    render(<ManageShell currentClubId={1}>본문</ManageShell>);

    expect(screen.getByRole('button', { name: /동아리 전환/ })).toBeInTheDocument();
    expect(screen.getByText('김도윤')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
  });

  it('로그아웃 클릭 시 logout 후 홈으로 replace 한다', async () => {
    const user = userEvent.setup();
    render(<ManageShell currentClubId={1}>본문</ManageShell>);

    await user.click(screen.getByRole('button', { name: '로그아웃' }));

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenCalledWith('/');
  });
});
