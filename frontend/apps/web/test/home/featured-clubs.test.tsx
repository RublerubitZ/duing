import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClubSummary } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockFetchPopularClubs = vi.fn<(size: number) => Promise<ClubSummary[]>>();

vi.mock('../../app/_lib/home-data', () => ({
  fetchPopularClubs: (size: number) => mockFetchPopularClubs(size),
}));

import { FeaturedClubs } from '../../app/_components/sections/FeaturedClubs';

function makeSummary(overrides: Partial<ClubSummary> = {}): ClubSummary {
  return {
    id: 1,
    name: '두잉 동아리',
    category: 'ACADEMIC',
    division: '학술분과',
    college: null,
    department: null,
    logoUrl: null,
    status: 'ACTIVE',
    tags: ['스터디'],
    tagline: null,
    centralClub: true,
    activeRecruitment: {
      recruitmentId: 10,
      displayStatus: 'OPEN',
      startDate: '2026-09-10',
      endDate: '2026-09-30',
    },
    ...overrides,
  };
}

describe('FeaturedClubs (server component)', () => {
  it('응답이 4건이면 4개 카드가 렌더된다', async () => {
    mockFetchPopularClubs.mockResolvedValueOnce([
      makeSummary({ id: 1, name: '알파' }),
      makeSummary({ id: 2, name: '베타' }),
      makeSummary({ id: 3, name: '감마' }),
      makeSummary({ id: 4, name: '델타' }),
    ]);

    const Component = await FeaturedClubs();
    render(<>{Component}</>);

    expect(screen.getByText('알파')).toBeInTheDocument();
    expect(screen.getByText('베타')).toBeInTheDocument();
    expect(screen.getByText('감마')).toBeInTheDocument();
    expect(screen.getByText('델타')).toBeInTheDocument();
  });

  it('응답이 0건이면 섹션 자체를 렌더하지 않는다 (null 반환)', async () => {
    mockFetchPopularClubs.mockResolvedValueOnce([]);

    const Component = await FeaturedClubs();

    expect(Component).toBeNull();
  });
});
