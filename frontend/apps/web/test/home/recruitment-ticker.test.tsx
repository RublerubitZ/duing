import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClubSummary } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({ href, children, ...anchorProps }: React.ComponentPropsWithoutRef<'a'>) => (
    <a href={href} {...anchorProps}>
      {children}
    </a>
  ),
}));

const mockFetchUpcomingDeadlineClubs = vi.fn<(size: number) => Promise<ClubSummary[]>>();

vi.mock('../../app/_lib/home-data', () => ({
  fetchUpcomingDeadlineClubs: (size: number) => mockFetchUpcomingDeadlineClubs(size),
}));

import { RecruitmentTicker } from '../../app/_components/sections/RecruitmentTicker';

// 티커는 서버에서 new Date() 를 쓰므로, 실제 오늘 기준 상대 날짜(로컬 달력)로 픽스처를 만든다.
function isoInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function makeSummary(id: number, name: string, endDate: string | null): ClubSummary {
  return {
    id,
    name,
    category: 'ACADEMIC',
    division: '학술분과',
    college: null,
    department: null,
    logoUrl: null,
    status: 'ACTIVE',
    tags: [],
    tagline: null,
    centralClub: true,
    activeRecruitment:
      endDate === null
        ? null
        : { recruitmentId: 1, displayStatus: 'OPEN', startDate: isoInDays(-10), endDate },
  };
}

describe('RecruitmentTicker (server component)', () => {
  /** 스크린리더에 남는(복제가 아닌) 항목만 골라낸다 — 복제는 조상 span 이 aria-hidden 이다. */
  function announced(name: string): HTMLElement[] {
    return screen.getAllByText(name).filter((el) => el.closest('[aria-hidden="true"]') === null);
  }

  it('마감 D-7 이내 모집을 배지로 렌더하고, 복제본은 스크린리더에서 감춘다', async () => {
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([
      makeSummary(1, '알파', isoInDays(2)),
      makeSummary(2, '베타', isoInDays(5)),
    ]);

    const Component = await RecruitmentTicker();
    render(<>{Component}</>);

    expect(screen.getAllByText('알파').length).toBeGreaterThan(1);
    // 몇 번을 되풀이하든 읽히는 것은 동아리당 한 번뿐이어야 한다.
    expect(announced('알파')).toHaveLength(1);
    expect(announced('베타')).toHaveLength(1);
  });

  it('모집이 한 곳뿐이어도 한 카피가 4개가 되도록 채워 마퀴 이음매에 빈 띠가 생기지 않는다', async () => {
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([makeSummary(1, '외톨이', isoInDays(1))]);

    const Component = await RecruitmentTicker();
    render(<>{Component}</>);

    // 한 카피 최소 4개 × seamless 루프용 2배 = 8. 이 수가 줄면 좁은 폭에서 이음매가 벌어진다.
    expect(screen.getAllByText('외톨이')).toHaveLength(8);
    expect(announced('외톨이')).toHaveLength(1);
  });

  it('섹션 라벨은 "마감 임박 동아리", 전체 보기는 아이콘만 있는 링크라 접근명을 가진다', async () => {
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([makeSummary(3, '감마', isoInDays(3))]);

    const Component = await RecruitmentTicker();
    render(<>{Component}</>);

    expect(screen.getByText('마감 임박 동아리')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '마감 임박 동아리 전체 보기' })).toHaveAttribute(
      'href',
      '/clubs?recruitment=available',
    );
  });

  it('마감 D-8 이상만 있으면(윈도우 밖) 섹션이 미렌더된다', async () => {
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([makeSummary(4, '머나먼', isoInDays(30))]);

    const Component = await RecruitmentTicker();

    expect(Component).toBeNull();
  });

  it('데이터가 0건이면 섹션 자체가 미렌더', async () => {
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([]);

    const Component = await RecruitmentTicker();

    expect(Component).toBeNull();
  });
});
