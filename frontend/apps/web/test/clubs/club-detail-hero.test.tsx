import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClubDetail } from '@duing/types';
import { ClubDetailHero } from '../../app/clubs/[clubId]/_components/ClubDetailHero';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock('@duing/stores', () => ({
  useAuthStore: (selector: (state: { status: string }) => unknown) =>
    selector({ status: 'unauthenticated' }),
}));
vi.mock('@duing/hooks', () => ({
  useFavoriteIdsQuery: () => ({ data: [] }),
  useFavoriteToggleMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

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
  contactEmail: null,
  activityFrequency: null,
  activeDays: [],
  membershipFee: null,
  tagline: null,
  highlights: [],
  majorProjects: null,
  activeRecruitment: null,
};

// 이름 아래는 해시태그 전용 — 소개 본문·한줄 소개는 히어로에 표시하지 않는다.
describe('ClubDetailHero — 이름 아래 해시태그', () => {
  it('tags 를 "#태그" 칩으로 노출하고, 데이터에 "#" 가 있어도 중복 부착하지 않는다', () => {
    render(<ClubDetailHero club={{ ...baseClub, tags: ['AI', '#창업'] }} />);
    // 데스크탑·모바일 히어로가 함께 렌더되므로 칩은 각 2개
    expect(screen.getAllByText('#AI')).toHaveLength(2);
    expect(screen.getAllByText('#창업')).toHaveLength(2);
    expect(screen.queryByText('##창업')).toBeNull();
  });

  it('소개(description)·한줄 소개(tagline)는 히어로에 렌더하지 않는다', () => {
    render(
      <ClubDetailHero
        club={{ ...baseClub, description: '소개 본문', tagline: '한줄 소개 문구', tags: ['AI'] }}
      />,
    );
    expect(screen.queryByText('소개 본문')).toBeNull();
    expect(screen.queryByText('한줄 소개 문구')).toBeNull();
  });
});
