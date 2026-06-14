import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Club } from '../../app/clubs/_lib/clubs';
import { ClubListItem } from '../../app/clubs/_components/ClubListItem';

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
  division: '컴퓨터정보공학분과',
  color: '#1F4A36',
  logoUrl: null,
  activeRecruitment: null,
};

describe('ClubListItem — 모바일 가로형 카드', () => {
  it('scope="중앙" → 소속 칩이 "중앙"(이모지 없음)', () => {
    render(<ClubListItem club={{ ...baseClub, scope: '중앙' }} />);
    const chip = screen.getByText('중앙');
    expect(chip).toBeInTheDocument();
    expect(chip.textContent).not.toContain('🏛️');
  });

  it('scope="학과" → 소속 칩이 "과"', () => {
    render(<ClubListItem club={{ ...baseClub, scope: '학과' }} />);
    expect(screen.getByText('과')).toBeInTheDocument();
  });

  it('OPEN(마감일 있음) → D-day 뱃지', () => {
    render(<ClubListItem club={{
      ...baseClub,
      activeRecruitment: { recruitmentId: 1, displayStatus: 'OPEN', startDate: '2026-03-15', endDate: '2099-12-31' },
    }} />);
    expect(screen.getByText(/^D-\d+$/)).toBeInTheDocument();
  });

  it('CLOSED → "마감" 뱃지', () => {
    render(<ClubListItem club={{
      ...baseClub,
      activeRecruitment: { recruitmentId: 2, displayStatus: 'CLOSED', startDate: '2026-02-01', endDate: '2026-02-28' },
    }} />);
    expect(screen.getByText('마감')).toBeInTheDocument();
  });

  it('recommended → "추천" 라벨 노출', () => {
    render(<ClubListItem club={baseClub} recommended />);
    expect(screen.getByText('추천')).toBeInTheDocument();
  });

  it('recommended=false → "추천" 라벨 없음', () => {
    render(<ClubListItem club={baseClub} />);
    expect(screen.queryByText('추천')).toBeNull();
  });
});
