import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MyClubSummary } from '@duing/types';

import { SectionMyClubs } from '../../app/me/_components/SectionMyClubs';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const make = (overrides: Partial<MyClubSummary> = {}): MyClubSummary => ({
  clubId: 1,
  clubName: '두잉',
  logoUrl: null,
  myRole: 'MEMBER',
  activeRecruitmentCount: 0,
  joinedAt: '2026-05-20T10:00:00Z',
  ...overrides,
});

describe('SectionMyClubs', () => {
  it('LEADER 카드는 "동아리장" pill 과 "관리" 액션 링크를 노출한다', () => {
    render(<SectionMyClubs myClubs={[make({ myRole: 'LEADER', clubName: '리더동' })]} />);
    expect(screen.getByText(/동아리장/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /관리/ });
    expect(link).toHaveAttribute('href', '/manage?clubId=1');
  });

  it('MEMBER 카드는 "회원" pill 과 "둘러보기" 링크 (/clubs/{id}/member) 를 노출한다', () => {
    render(<SectionMyClubs myClubs={[make({ myRole: 'MEMBER', clubId: 42, clubName: '회원동' })]} />);
    expect(screen.getByText('회원')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /둘러보기/ });
    expect(link).toHaveAttribute('href', '/clubs/42/member');
  });

  it('빈 배열이면 안내 문구를 노출한다', () => {
    render(<SectionMyClubs myClubs={[]} />);
    expect(screen.getByText(/아직 가입한 동아리가 없어요/)).toBeInTheDocument();
  });

  it('카운트 헤더에 총 개수가 반영된다', () => {
    render(
      <SectionMyClubs
        myClubs={[make({ clubId: 1 }), make({ clubId: 2, myRole: 'LEADER' })]}
      />,
    );
    expect(screen.getByText(/가입한 동아리 · 2/)).toBeInTheDocument();
  });
});
