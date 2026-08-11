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
  tagline: '매주 함께 성장하는 동아리',
  cat: '학술',
  scope: '중앙',
  division: null,
  department: null,
  college: null,
  color: '#1F4A36',
  logoUrl: null,
  activeRecruitment: null,
};

describe('ClubCard — 모집 상태 뱃지/기간 렌더링', () => {
  it('OPEN: "모집중" 뱃지 + "3.15 - 4.20" 기간(앞자리 0 제거, 접두어 없음)', () => {
    render(<ClubCard club={{
      ...baseClub,
      activeRecruitment: {
        recruitmentId: 10,
        displayStatus: 'OPEN',
        startDate: '2026-03-15',
        endDate: '2026-04-20',
      },
    }} />);
    expect(screen.getByText('모집중')).toBeInTheDocument();
    expect(screen.getByText('3.15 - 4.20')).toBeInTheDocument();
  });

  it('ALWAYS_OPEN: "상시모집" 뱃지 + "상시모집" 기간 라벨', () => {
    render(<ClubCard club={{
      ...baseClub,
      activeRecruitment: {
        recruitmentId: 11,
        displayStatus: 'ALWAYS_OPEN',
        startDate: '2026-03-01',
        endDate: null,
      },
    }} />);
    expect(screen.getAllByText('상시모집').length).toBeGreaterThanOrEqual(1);
  });

  it('UPCOMING: "모집예정" 뱃지 + "3.20부터 모집"', () => {
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
    expect(screen.getByText('3.20부터 모집')).toBeInTheDocument();
  });

  it('CLOSED: "모집마감" 뱃지 + "모집 종료"', () => {
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
    expect(screen.getByText('모집 종료')).toBeInTheDocument();
  });

  it('activeRecruitment=null: "모집 없음" 뱃지, 기간 영역에 텍스트 없음', () => {
    render(<ClubCard club={{ ...baseClub, activeRecruitment: null }} />);
    expect(screen.getByText('모집 없음')).toBeInTheDocument();
    expect(screen.queryByText(/모집 종료|상시모집|부터 모집|\d{1,2}\.\d{1,2} - /)).toBeNull();
  });
});
