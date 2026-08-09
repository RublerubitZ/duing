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
  department: null,
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

  it('scope="학과" → 소속 칩 "단과대", division 이 있어도 분과 텍스트 미노출', () => {
    render(<ClubListItem club={{ ...baseClub, scope: '학과' }} />);
    expect(screen.getByText('단과대')).toBeInTheDocument();
    expect(screen.queryByText('학과')).toBeNull();
    expect(screen.queryByText('컴퓨터정보공학분과')).toBeNull();
  });

  it('모바일 목록도 단과대 동아리에는 분과 자리에 학과를 표시하고, 없으면 그리지 않는다', () => {
    const { unmount } = render(
      <ClubListItem club={{ ...baseClub, scope: '학과', department: '회계학과' }} />,
    );
    expect(screen.getByText('회계학과')).toBeInTheDocument();
    unmount();

    render(<ClubListItem club={{ ...baseClub, scope: '학과', department: null }} />);
    expect(screen.queryByText('회계학과')).toBeNull();
    expect(screen.getByText('단과대')).toBeInTheDocument();
  });

  it('이름이 아주 길어도 소속 칩은 잘리지 않고 렌더된다 (이름만 truncate)', () => {
    render(
      <ClubListItem
        club={{ ...baseClub, name: '아주아주아주아주아주아주아주아주아주 긴 이름의 테스트 동아리' }}
      />,
    );
    expect(screen.getByText('중앙')).toBeInTheDocument();
  });

  it('한줄 소개(tagline)를 이름 아래에 렌더한다', () => {
    render(<ClubListItem club={baseClub} />);
    expect(screen.getByText('매주 함께 성장하는 동아리')).toBeInTheDocument();
  });

  it('tagline 미작성(null)이면 플레이스홀더 없이 NBSP 빈 줄로 높이만 유지한다', () => {
    render(<ClubListItem club={{ ...baseClub, tagline: null }} />);
    expect(screen.queryByText('소개 준비중')).toBeNull();
    expect(screen.queryByText('매주 함께 성장하는 동아리')).toBeNull();
    // 빈 줄(NBSP)이 렌더되어 행 간 정보 위치가 일정하게 유지된다
    expect(screen.getByText(' ', { normalizer: (text) => text })).toBeInTheDocument();
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
