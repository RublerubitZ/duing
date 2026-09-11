import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { FavoriteClub } from '@duing/types';

vi.mock('@/app/_components/HomeNav', () => ({ HomeNav: () => <nav data-testid="home-nav" /> }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
// 카드는 찜 토글(스토어·훅)을 품는다 — 이 파일은 페이지 셸만 본다.
vi.mock('@/app/me/favorites/_components/FavoriteClubCard', () => ({
  FavoriteClubCard: ({ favorite }: { favorite: FavoriteClub }) => <li>{favorite.name}</li>,
}));

const mockUseFavoriteListQuery = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useFavoriteListQuery: () => mockUseFavoriteListQuery(),
}));

import MyFavoritesPage from '@/app/me/favorites/page';

const favorite: FavoriteClub = {
  clubId: 3,
  name: '두잉동아리',
  logoUrl: null,
  category: 'ACADEMIC',
  division: null,
  favoritedAt: '2026-05-17T01:23:45',
  openRecruitmentCount: 0,
};

beforeEach(() => {
  mockUseFavoriteListQuery.mockReset();
});

describe('MyFavoritesPage', () => {
  // 로딩·빈 상태·목록 세 분기 모두 같은 셸 안에 있어야 상단바가 깜빡이지 않는다.
  it.each([
    ['로딩', { data: undefined, isLoading: true }],
    ['빈 상태', { data: { content: [] }, isLoading: false }],
    ['목록', { data: { content: [favorite] }, isLoading: false }],
  ])('%s 분기에서 공통 상단바를 렌더한다', (_label, queryResult) => {
    mockUseFavoriteListQuery.mockReturnValue(queryResult);

    render(<MyFavoritesPage />);

    expect(screen.getByTestId('home-nav')).toBeInTheDocument();
  });
});
