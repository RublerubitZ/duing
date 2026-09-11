import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedClub, User } from '@duing/types';

const pushSpy = vi.fn();
const replaceSpy = vi.fn();
vi.mock('@/app/_lib/useGuardedRouter', () => ({
  useGuardedRouter: () => ({ push: pushSpy, replace: replaceSpy }),
}));

// 경로 변경을 테스트에서 흉내 내려고 가변 값으로 둔다(vi.mock 은 호이스팅되므로 vi.hoisted).
const nav = vi.hoisted(() => ({ pathname: '/manage/clubs/1' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
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
  // 사이드바가 선택된 모집의 지원 방식을 보고 지원자·통계를 감춘다 — 이 화면은 모집 컨텍스트가 없다.
  useRecruitmentDetailQuery: () => ({ data: undefined }),
  // ManageNav 의 통계 폴백(진행 중 모집 판정)이 쓴다 — 셸 테스트는 나브 판정을 다루지 않으므로 빈 값.
  useClubRecruitmentsQuery: () => ({ data: undefined }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

import { ManageShell } from '@/app/manage/_components/ManageShell';

describe('ManageShell — 접기·푸터', () => {
  beforeEach(() => {
    window.localStorage.clear();
    nav.pathname = '/manage/clubs/1';
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

  // 드로어 안 링크를 미저장 이탈 가드가 capture 에서 멈추면 래퍼 onClick 이 실행되지 않아 드로어가
  // 열린 채 남는다 — 확인 후 이동한 새 화면을 드로어가 덮지 않도록 경로 변경으로도 닫혀야 한다.
  it('경로가 바뀌면 모바일 드로어가 닫힌다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ManageShell currentClubId={1}>본문</ManageShell>);

    await user.click(screen.getByRole('button', { name: '메뉴 열기' }));
    expect(await screen.findByRole('dialog', { name: '운영진 콘솔 메뉴' })).toBeInTheDocument();

    nav.pathname = '/manage/clubs/1/info';
    rerender(<ManageShell currentClubId={1}>본문</ManageShell>);

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '운영진 콘솔 메뉴' })).not.toBeInTheDocument(),
    );
  });

  // ManageGuard 자체 단위 테스트와 별개로, ManageShell 이 currentClubId 를 가드에 실제로 넘기는지
  // 확인한다 — 이 배선이 빠지면 URL 의 clubId 만 바꿔 남의 콘솔이 열리는 회귀가 그대로 돌아온다.
  it('운영 권한이 없는 clubId 로 들어오면 본문·사이드바 대신 403 안내만 렌더한다', () => {
    render(<ManageShell currentClubId={25}>본문</ManageShell>);

    expect(screen.queryByText('본문')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '대시보드' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '이 동아리의 운영 권한이 없습니다.' }),
    ).toBeInTheDocument();
  });
});
