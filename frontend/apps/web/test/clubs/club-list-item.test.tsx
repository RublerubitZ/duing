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
  tagline: '매주 함께 성장하는 동아리',
  cat: '학술',
  scope: '중앙',
  division: '컴퓨터정보공학분과',
  color: '#1F4A36',
  logoUrl: null,
  activeRecruitment: null,
};

describe('ClubListItem — 모바일 가로형 카드', () => {
  it('scope="중앙" + division → 소속 칩 "중앙" + 분과 회색 텍스트 분리(접미 "분과" 중복 없음)', () => {
    render(<ClubListItem club={{ ...baseClub, scope: '중앙', division: '컴퓨터정보공학분과' }} />);
    expect(screen.getByText('중앙')).toBeInTheDocument();
    expect(screen.getByText('컴퓨터정보공학분과')).toBeInTheDocument();
    expect(screen.queryByText('중앙 · 컴퓨터정보공학분과')).toBeNull();
  });

  it('scope="중앙" + division=null → "중앙" 칩만, 분과 텍스트 없음', () => {
    render(<ClubListItem club={{ ...baseClub, scope: '중앙', division: null }} />);
    expect(screen.getByText('중앙')).toBeInTheDocument();
    expect(screen.queryByText(/분과/)).toBeNull();
  });

  it('scope="학과" → 소속 칩 "학과", division 이 있어도 분과 텍스트 미노출', () => {
    render(<ClubListItem club={{ ...baseClub, scope: '학과' }} />);
    expect(screen.getByText('학과')).toBeInTheDocument();
    expect(screen.queryByText('컴퓨터정보공학분과')).toBeNull();
  });

  it('한줄 소개(tagline)를 이름 아래에 렌더한다', () => {
    render(<ClubListItem club={baseClub} />);
    expect(screen.getByText('매주 함께 성장하는 동아리')).toBeInTheDocument();
  });

  it('tagline 미작성(null)이면 플레이스홀더 없이 아무것도 표시하지 않는다', () => {
    render(<ClubListItem club={{ ...baseClub, tagline: null }} />);
    expect(screen.queryByText('소개 준비중')).toBeNull();
    expect(screen.queryByText('매주 함께 성장하는 동아리')).toBeNull();
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
