import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MyClubSummary } from '@duing/types';

import { SectionMyClubs } from '../../app/me/_components/SectionMyClubs';

// 카드마다 같은 글자("공지"·"회비"·"일정")를 쓰는 링크가 여러 개라 구분은 aria-label 이 한다 —
// 스텁이 나머지 props 를 흘리면 접근성 이름이 사라져 단언이 공허해진다.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const make = (overrides: Partial<MyClubSummary> = {}): MyClubSummary => ({
  clubId: 1,
  clubName: '두잉',
  logoUrl: null,
  status: 'ACTIVE',
  myRole: 'MEMBER',
  activeRecruitmentCount: 0,
  joinedAt: '2026-05-20T10:00:00Z',
  ...overrides,
});

describe('SectionMyClubs', () => {
  it('LEADER 카드는 "회장" pill 과 "관리" 액션 링크를 노출한다', () => {
    render(<SectionMyClubs myClubs={[make({ myRole: 'LEADER', clubName: '리더동' })]} />);
    expect(screen.getByText(/회장/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /관리/ });
    expect(link).toHaveAttribute('href', '/manage?clubId=1');
  });

  it('MEMBER 카드는 "부원" pill 과 공지·회비·일정 링크를 노출한다', () => {
    render(<SectionMyClubs myClubs={[make({ myRole: 'MEMBER', clubId: 42, clubName: '회원동' })]} />);
    expect(screen.getByText('부원')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '회원동 공지' })).toHaveAttribute('href', '/clubs/42/member/notices');
    expect(screen.getByRole('link', { name: '회원동 회비' })).toHaveAttribute('href', '/me/fees');
    expect(screen.getByRole('link', { name: '회원동 일정' })).toHaveAttribute('href', '/clubs/42/member/events');
  });

  it('운영진 카드도 "관리" 와 함께 공지·회비·일정 링크를 노출한다', () => {
    render(<SectionMyClubs myClubs={[make({ myRole: 'LEADER', clubId: 7, clubName: '리더동' })]} />);
    expect(screen.getByRole('link', { name: /관리/ })).toHaveAttribute('href', '/manage?clubId=7');
    expect(screen.getByRole('link', { name: '리더동 공지' })).toHaveAttribute('href', '/clubs/7/member/notices');
    expect(screen.getByRole('link', { name: '리더동 회비' })).toHaveAttribute('href', '/me/fees');
    expect(screen.getByRole('link', { name: '리더동 일정' })).toHaveAttribute('href', '/clubs/7/member/events');
  });

  it('MEMBER 카드는 "탈퇴" 버튼을 노출한다', () => {
    render(<SectionMyClubs myClubs={[make({ myRole: 'MEMBER', clubName: '회원동' })]} />);
    expect(screen.getByRole('button', { name: /회원동 탈퇴/ })).toBeInTheDocument();
  });

  it('LEADER · OFFICER 카드는 "탈퇴" 버튼을 노출하지 않는다 (이번 범위는 평회원 한정)', () => {
    render(
      <SectionMyClubs
        myClubs={[
          make({ myRole: 'LEADER', clubId: 1, clubName: '리더동' }),
          make({ myRole: 'OFFICER', clubId: 2, clubName: '운영동' }),
        ]}
      />,
    );
    expect(screen.queryByRole('button', { name: /탈퇴/ })).not.toBeInTheDocument();
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

  it('INACTIVE 동아리 카드는 관리·공지·탈퇴를 모두 숨기고 "운영 종료된 동아리입니다." 를 노출한다', () => {
    render(
      <SectionMyClubs
        myClubs={[make({ myRole: 'LEADER', status: 'INACTIVE', clubName: '중단동' })]}
      />,
    );
    expect(screen.queryByRole('link', { name: /관리/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /공지/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /탈퇴/ })).not.toBeInTheDocument();
    expect(screen.getByText('운영 종료된 동아리입니다.')).toBeInTheDocument();
  });

  it('PENDING_APPROVAL 동아리 카드는 액션 없이 "승인 대기 중인 동아리입니다." 를 노출한다', () => {
    render(
      <SectionMyClubs
        myClubs={[make({ myRole: 'MEMBER', status: 'PENDING_APPROVAL', clubName: '대기동' })]}
      />,
    );
    expect(screen.queryByRole('link', { name: /공지/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /탈퇴/ })).not.toBeInTheDocument();
    expect(screen.getByText('승인 대기 중인 동아리입니다.')).toBeInTheDocument();
  });

  it('REJECTED 동아리 카드는 액션 없이 "거절된 동아리입니다." 를 노출한다', () => {
    render(
      <SectionMyClubs
        myClubs={[make({ myRole: 'OFFICER', status: 'REJECTED', clubName: '거절동' })]}
      />,
    );
    expect(screen.queryByRole('link', { name: /관리/ })).not.toBeInTheDocument();
    expect(screen.getByText('거절된 동아리입니다.')).toBeInTheDocument();
  });

  it('status 필드가 없는 구 백엔드 응답에서는 기존처럼 액션을 노출한다 (배포 전환기 fail-open)', () => {
    // BE #591 배포 전 전환기 페이로드 재현 — status 부재를 타입 체계 밖에서 주입해야 하므로 예외적으로 이중 단언 사용
    const legacyClub = { ...make({ myRole: 'LEADER', clubName: '레거시동' }), status: undefined } as unknown as MyClubSummary;
    render(<SectionMyClubs myClubs={[legacyClub]} />);
    expect(screen.getByRole('link', { name: /관리/ })).toBeInTheDocument();
  });
});
