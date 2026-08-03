import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ManagedClub } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { ManageGuard } from '@/app/manage/_components/ManageGuard';

const CLUBS: ManagedClub[] = [
  {
    clubId: 1,
    clubName: 'AI 동아리',
    logoUrl: null,
    myRole: 'LEADER',
    centralClub: true,
    activeRecruitmentCount: 1,
  },
];

function renderGuard(currentClubId: number | null) {
  return render(
    <ManageGuard managedClubs={CLUBS} currentClubId={currentClubId} isLoading={false}>
      <p>운영 콘솔 본문</p>
    </ManageGuard>,
  );
}

describe('ManageGuard — clubId 권한 게이트', () => {
  it('운영 중인 동아리의 clubId 면 본문을 렌더한다', () => {
    renderGuard(1);
    expect(screen.getByText('운영 콘솔 본문')).toBeInTheDocument();
  });

  it('URL 의 clubId 만 다른 동아리로 바꾸면 본문 대신 403 안내를 보여준다', () => {
    renderGuard(25);
    expect(screen.queryByText('운영 콘솔 본문')).not.toBeInTheDocument();
    expect(screen.getByText('이 동아리의 운영 권한이 없습니다.')).toBeInTheDocument();
  });

  it('숫자가 아닌 clubId(NaN → null)도 차단한다', () => {
    renderGuard(null);
    expect(screen.queryByText('운영 콘솔 본문')).not.toBeInTheDocument();
    expect(screen.getByText('이 동아리의 운영 권한이 없습니다.')).toBeInTheDocument();
  });

  it('운영하는 동아리가 하나도 없으면 기존 안내를 유지한다', () => {
    render(
      <ManageGuard managedClubs={[]} currentClubId={1} isLoading={false}>
        <p>운영 콘솔 본문</p>
      </ManageGuard>,
    );
    expect(screen.getByText('현재 운영하는 동아리가 없습니다.')).toBeInTheDocument();
  });

  it('운영 동아리 목록 조회가 실패해도(undefined) 본문을 열어주지 않는다', () => {
    render(
      <ManageGuard managedClubs={undefined} currentClubId={1} isLoading={false}>
        <p>운영 콘솔 본문</p>
      </ManageGuard>,
    );
    expect(screen.queryByText('운영 콘솔 본문')).not.toBeInTheDocument();
  });

  it('권한 확인 중에는 본문을 미리 렌더하지 않는다', () => {
    render(
      <ManageGuard managedClubs={undefined} currentClubId={25} isLoading>
        <p>운영 콘솔 본문</p>
      </ManageGuard>,
    );
    expect(screen.queryByText('운영 콘솔 본문')).not.toBeInTheDocument();
  });
});
