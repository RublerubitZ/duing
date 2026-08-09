import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClubSummary } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
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
  it('마감 D-7 이내 모집을 배지로 렌더한다 (seamless 루프용 2배 복제 포함)', async () => {
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([
      makeSummary(1, '알파', isoInDays(2)),
      makeSummary(2, '베타', isoInDays(5)),
    ]);

    const Component = await RecruitmentTicker();
    render(<>{Component}</>);

    // 마퀴 seamless 루프를 위해 트랙을 2배 복제하므로 각 이름이 2번 렌더된다.
    expect(screen.getAllByText('알파')).toHaveLength(2);
    expect(screen.getAllByText('베타')).toHaveLength(2);
  });

  it('섹션 라벨은 "마감 임박" 으로 표기된다', async () => {
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([makeSummary(3, '감마', isoInDays(3))]);

    const Component = await RecruitmentTicker();
    render(<>{Component}</>);

    expect(screen.getByText('마감 임박')).toBeInTheDocument();
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
