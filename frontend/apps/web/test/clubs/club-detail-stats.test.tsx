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
  feeNote: null,
  tagline: null,
  highlights: [],
  projects: [],
  useGeneration: false,
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

describe('ClubDetailStats — 모바일 행 리스트 + Desktop 복원', () => {
  it('모바일에서 라벨과 값을 같은 flex 행에 두고, md 이상에서는 블록으로 복원한다', () => {
    render(<ClubDetailStats club={worstCaseClub} />);

    const label = screen.getByText('활동');
    const row = label.parentElement;
    // 라벨-값이 같은 행(부모)
    const value = screen.getByText(WORST_ACTIVITY_VALUE);
    expect(row).toHaveClass('flex', 'md:block');
    expect(row).toContainElement(value);
  });

  it('라벨은 모바일 고정폭(w-16 shrink-0), md 에서 블록 폭·상단 여백 복원', () => {
    render(<ClubDetailStats club={worstCaseClub} />);

    const label = screen.getByText('활동');
    expect(label).toHaveClass('w-16', 'shrink-0', 'md:w-auto', 'md:mb-1.5');
    // 기존 라벨 타이포 유지
    expect(label).toHaveClass('text-xs', 'tracking-wide04', 'text-charcoal-3');
  });

  it('가장 긴 활동 값에 반응형 크기·개행 보호 클래스를 적용한다', () => {
    render(<ClubDetailStats club={worstCaseClub} />);

    const value = screen.getByText(WORST_ACTIVITY_VALUE);
    // 모바일: 15px + 촘촘한 line-height + 한글 단어 보존 개행 + 남은 폭 전체
    expect(value).toHaveClass('text-[15px]');
    expect(value).toHaveClass('leading-snug');
    expect(value).toHaveClass('break-keep');
    expect(value).toHaveClass('[overflow-wrap:anywhere]');
    expect(value).toHaveClass('min-w-0', 'flex-1');
    // Desktop(md+) 복원: 기존 22px + 상속 line-height(1.5) 복원
    expect(value).toHaveClass('md:text-[22px]');
    expect(value).toHaveClass('md:leading-normal');
    // 기존 타이포 유지
    expect(value).toHaveClass('font-display', 'font-bold', 'text-ink-deep');
  });

  it('컨테이너는 모바일 세로 리스트(gap-3), md 이상에서 gap 없는 3열 그리드로 복원한다', () => {
    const { container } = render(<ClubDetailStats club={worstCaseClub} />);

    const root = container.firstChild;
    expect(root).toHaveClass(
      'flex',
      'flex-col',
      'gap-3',
      'py-5',
      'md:grid',
      'md:grid-cols-3',
      'md:gap-0',
    );
    expect(root).not.toHaveClass('border-y');
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

describe('ClubDetailStats — 회비 안내문', () => {
  const FEE_NOTE = '선수 : 학기당 30,000원\n매니저 : 학기당 15,000원';

  it('안내문이 있으면 회비 셀에 2줄 클램프 보조 텍스트로 표시한다', () => {
    render(<ClubDetailStats club={{ ...worstCaseClub, feeNote: FEE_NOTE }} />);

    const note = screen.getByText(/매니저 : 학기당 15,000원/);
    expect(note).toHaveClass('line-clamp-2', 'whitespace-pre-wrap', 'break-words');
    // 대표 금액의 굵은 타이포를 상속하지 않는다
    expect(note).toHaveClass('font-normal', 'text-charcoal-3');
    expect(note).not.toHaveClass('font-bold');
    // 대표 금액은 그대로 유지
    expect(screen.getByText('학기당 30,000원')).toBeInTheDocument();
  });

  it('안내문이 없으면 보조 텍스트를 렌더하지 않는다', () => {
    const { container } = render(<ClubDetailStats club={worstCaseClub} />);

    expect(screen.getByText('학기당 30,000원')).toBeInTheDocument();
    expect(container.querySelector('.line-clamp-2')).toBeNull();
  });

  it('대표 금액 없이 안내문만 있으면 통계 카드에 회비 셀을 만들지 않는다', () => {
    render(
      <ClubDetailStats
        club={{ ...worstCaseClub, feeCycle: 'NONE', membershipFeeAmount: null, feeNote: FEE_NOTE }}
      />,
    );

    expect(screen.queryByText('회비')).not.toBeInTheDocument();
    expect(screen.queryByText(/매니저 : 학기당 15,000원/)).not.toBeInTheDocument();
    expect(screen.getByText('창설년도')).toBeInTheDocument();
  });
});
