import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ClubDetail } from '@duing/types';

import { ClubDetailStats } from '@/app/clubs/[clubId]/_components/ClubDetailStats';

const baseClub: ClubDetail = {
  id: 1,
  name: 'X',
  category: 'ACADEMIC',
  division: null,
  college: null,
  logoUrl: null,
  status: 'ACTIVE',
  tags: [],
  centralClub: false,
  description: null,
  coverUrl: null,
  snsLinks: [],
  faqs: [],
  leaderId: null,
  leaderName: null,
  photos: [],
  foundedYear: null,
  cohortNumber: null,
  location: null,
  contactPhone: null,
  contactVisibility: 'PUBLIC',
  activityFrequency: null,
  activeDays: [],
  membershipFeeAmount: null,
  feeCycle: 'NONE',
  tagline: null,
  highlights: [],
  projects: [],
  activeRecruitment: null,
};

// 최악 케이스: 주 7회 + 요일 전체 → 가장 긴 활동 값
const worstCaseClub: ClubDetail = {
  ...baseClub,
  activityFrequency: 7,
  activeDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
  foundedYear: 2020,
  feeCycle: 'SEMESTER',
  membershipFeeAmount: 30000,
};

const WORST_ACTIVITY_VALUE = '주 7회 (월·화·수·목·금·토·일)';

describe('ClubDetailStats — 모바일 타이포·개행 안전성', () => {
  it('가장 긴 활동 값에 반응형 크기·개행 보호 클래스를 적용한다', () => {
    render(<ClubDetailStats club={worstCaseClub} />);

    const value = screen.getByText(WORST_ACTIVITY_VALUE);
    // 모바일: 15px + 촘촘한 line-height + 한글 단어 보존 개행
    expect(value).toHaveClass('text-[15px]');
    expect(value).toHaveClass('leading-snug');
    expect(value).toHaveClass('break-keep');
    expect(value).toHaveClass('[overflow-wrap:anywhere]');
    // Desktop(md+) 복원: 기존 22px 유지
    expect(value).toHaveClass('md:text-[22px]');
    // 기존 타이포 유지
    expect(value).toHaveClass('font-display', 'font-bold', 'text-ink-deep');
  });

  it('컨테이너에 열 간격을 두어 값이 서로 붙지 않게 한다', () => {
    const { container } = render(<ClubDetailStats club={worstCaseClub} />);

    const root = container.firstChild;
    expect(root).toHaveClass('grid', 'grid-cols-3', 'gap-x-3', 'border-y', 'border-line', 'py-5');
  });

  it('활동·창설년도·회비 3개 셀을 회귀 없이 렌더한다', () => {
    render(<ClubDetailStats club={worstCaseClub} />);

    expect(screen.getByText('활동')).toBeInTheDocument();
    expect(screen.getByText(WORST_ACTIVITY_VALUE)).toBeInTheDocument();

    expect(screen.getByText('창설년도')).toBeInTheDocument();
    expect(screen.getByText('2020')).toBeInTheDocument();

    expect(screen.getByText('회비')).toBeInTheDocument();
    expect(screen.getByText('학기당 30,000원')).toBeInTheDocument();
  });
});
