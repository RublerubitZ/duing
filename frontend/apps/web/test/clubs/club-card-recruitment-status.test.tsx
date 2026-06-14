import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Club } from '../../app/clubs/_lib/clubs';
import { ClubCard } from '../../app/clubs/_components/ClubCard';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const baseClub: Club = {
  id: 1,
  name: '테스트 동아리',
  tag: '소개',
  cat: '학술',
  scope: '중앙',
  division: null,
  color: '#1F4A36',
  logoUrl: null,
  activeRecruitment: null,
};

describe('ClubCard — 모집 상태 뱃지 렌더링', () => {
  it('OPEN(마감일 있음): D-day 뱃지', () => {
    render(<ClubCard club={{
      ...baseClub,
      activeRecruitment: {
        recruitmentId: 10,
        displayStatus: 'OPEN',
        startDate: '2026-03-15',
        endDate: '2099-12-31', // 항상 미래 → 양수 D-day 보장
      },
    }} />);
    expect(screen.getByText(/^D-\d+$/)).toBeInTheDocument();
  });

  it('OPEN(마감일 없음): "모집중" 뱃지', () => {
    render(<ClubCard club={{
      ...baseClub,
      activeRecruitment: {
        recruitmentId: 14,
        displayStatus: 'OPEN',
        startDate: '2026-03-15',
        endDate: null,
      },
    }} />);
    expect(screen.getByText('모집중')).toBeInTheDocument();
  });

  it('ALWAYS_OPEN: "상시모집" 뱃지', () => {
    render(<ClubCard club={{
      ...baseClub,
      activeRecruitment: {
        recruitmentId: 11,
        displayStatus: 'ALWAYS_OPEN',
        startDate: '2026-03-01',
        endDate: null,
      },
    }} />);
    expect(screen.getByText('상시모집')).toBeInTheDocument();
  });

  it('UPCOMING: "모집예정" 뱃지', () => {
    render(<ClubCard club={{
      ...baseClub,
      activeRecruitment: {
        recruitmentId: 12,
        displayStatus: 'UPCOMING',
        startDate: '2026-03-20',
        endDate: '2026-04-10',
      },
    }} />);
    expect(screen.getByText('모집예정')).toBeInTheDocument();
  });

  it('CLOSED: "모집마감" 뱃지', () => {
    render(<ClubCard club={{
      ...baseClub,
      activeRecruitment: {
        recruitmentId: 13,
        displayStatus: 'CLOSED',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      },
    }} />);
    expect(screen.getByText('모집마감')).toBeInTheDocument();
  });

  it('activeRecruitment=null: 모집 뱃지가 렌더링되지 않는다', () => {
    render(<ClubCard club={{ ...baseClub, activeRecruitment: null }} />);
    expect(screen.queryByText(/^D-\d+$|모집중|상시모집|모집예정|모집마감/)).toBeNull();
  });
});