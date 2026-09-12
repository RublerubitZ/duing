import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClubStats, ClubSummary } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({ href, children, ...anchorProps }: React.ComponentPropsWithoutRef<'a'>) => (
    <a href={href} {...anchorProps}>
      {children}
    </a>
  ),
}));

const mockFetchClubStats = vi.fn<() => Promise<ClubStats | null>>();
const mockFetchUpcomingDeadlineClubs = vi.fn<(size: number) => Promise<ClubSummary[]>>();

vi.mock('../../app/_lib/club-stats', () => ({
  fetchClubStats: () => mockFetchClubStats(),
}));

vi.mock('../../app/_lib/home-data', () => ({
  fetchUpcomingDeadlineClubs: (size: number) => mockFetchUpcomingDeadlineClubs(size),
}));

import { HomeRecruitAnchor } from '../../app/_components/sections/HomeRecruitAnchor';

// 타일도 서버에서 new Date() 를 쓰므로, 티커 테스트와 같이 실제 오늘 기준 상대 날짜로 픽스처를 만든다.
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

describe('HomeRecruitAnchor (server component)', () => {
  it('모집 수와 가장 급한 마감 1건을 보여주고 모집 중 목록으로 연결한다', async () => {
    mockFetchClubStats.mockResolvedValueOnce({ totalCount: 30, recruitingCount: 28 });
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([
      makeSummary(1, '닛손가락', isoInDays(1)),
      makeSummary(2, '두번째', isoInDays(3)),
      makeSummary(3, '세번째', isoInDays(6)),
    ]);

    const rendered = await HomeRecruitAnchor();
    render(<>{rendered}</>);

    expect(screen.getByText('28곳')).toBeInTheDocument();
    expect(screen.getByText('닛손가락')).toBeInTheDocument();
    expect(screen.getByText('D-1')).toBeInTheDocument();
    // 가장 급한 1건만 — 뒤 항목은 타일에 나타나지 않는다(전체는 링크 너머 목록에서 본다).
    expect(screen.queryByText('두번째')).not.toBeInTheDocument();
    expect(screen.queryByText('세번째')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: '지금 모집 중 28곳, 가장 급한 마감 닛손가락 D-1. 모집 중 동아리 보기',
      }),
    ).toHaveAttribute('href', '/clubs?recruitment=available');
  });

  it('마감 임박 동아리가 없으면 오른쪽 칸을 그리지 않는다', async () => {
    mockFetchClubStats.mockResolvedValueOnce({ totalCount: 30, recruitingCount: 28 });
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([]);

    const rendered = await HomeRecruitAnchor();
    render(<>{rendered}</>);

    expect(screen.getByText('28곳')).toBeInTheDocument();
    expect(screen.queryByText('가장 급한 마감')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '지금 모집 중 28곳. 모집 중 동아리 보기' }),
    ).toBeInTheDocument();
  });

  it('통계가 없거나 모집 중이 0곳이면 아무것도 그리지 않는다', async () => {
    mockFetchClubStats.mockResolvedValueOnce(null);
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([makeSummary(1, '닛손가락', isoInDays(1))]);
    expect(await HomeRecruitAnchor()).toBeNull();

    mockFetchClubStats.mockResolvedValueOnce({ totalCount: 30, recruitingCount: 0 });
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([makeSummary(1, '닛손가락', isoInDays(1))]);
    expect(await HomeRecruitAnchor()).toBeNull();
  });

  it('상시모집·D-8 이상은 후보에서 제외된다', async () => {
    mockFetchClubStats.mockResolvedValueOnce({ totalCount: 30, recruitingCount: 28 });
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([
      makeSummary(1, '상시모집', null),
      makeSummary(2, '머나먼', isoInDays(9)),
    ]);

    const rendered = await HomeRecruitAnchor();
    render(<>{rendered}</>);

    expect(screen.getByText('28곳')).toBeInTheDocument();
    expect(screen.queryByText('가장 급한 마감')).not.toBeInTheDocument();
    expect(screen.queryByText('상시모집')).not.toBeInTheDocument();
    expect(screen.queryByText('머나먼')).not.toBeInTheDocument();
  });
});
