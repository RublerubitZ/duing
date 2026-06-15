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

function makeSummary(name: string, endDate: string | null): ClubSummary {
  return {
    id: name.length,
    name,
    category: 'ACADEMIC',
    division: '학술분과',
    college: null,
    logoUrl: null,
    status: 'ACTIVE',
    tags: [],
    centralClub: true,
    activeRecruitment: endDate === null ? null : {
      recruitmentId: 1,
      displayStatus: 'OPEN',
      startDate: '2026-09-10',
      endDate,
    },
  };
}

describe('RecruitmentTicker (server component)', () => {
  it('helper 가 endDate=null 항목을 사전 필터하므로 도착한 데이터만 그대로 렌더된다', async () => {
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([
      makeSummary('알파', '2026-09-21'),
      makeSummary('베타', '2026-09-22'),
    ]);

    const Component = await RecruitmentTicker();
    render(<>{Component}</>);

    expect(screen.getByText('알파')).toBeInTheDocument();
    expect(screen.getByText('베타')).toBeInTheDocument();
  });

  it('섹션 라벨은 "마감 임박" 으로 표기된다 (쿼리는 7일 범위로 제한하지 않음)', async () => {
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([
      makeSummary('감마', '2026-10-15'),
    ]);

    const Component = await RecruitmentTicker();
    render(<>{Component}</>);

    expect(screen.getByText('마감 임박')).toBeInTheDocument();
  });

  it('helper 가 모두 필터해 0건이면 섹션 자체가 미렌더', async () => {
    mockFetchUpcomingDeadlineClubs.mockResolvedValueOnce([]);

    const Component = await RecruitmentTicker();

    expect(Component).toBeNull();
  });
});
