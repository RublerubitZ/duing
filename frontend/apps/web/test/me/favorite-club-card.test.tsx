import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ClubCategory, FavoriteClub } from '@duing/types';

// 찜 토글은 스토어·훅을 품는다 — 이 파일은 카드의 분류 표기만 본다.
vi.mock('@/app/_components/FavoriteToggleButton', () => ({
  FavoriteToggleButton: () => <button type="button">찜</button>,
}));

import { FavoriteClubCard } from '@/app/me/favorites/_components/FavoriteClubCard';

const favorite: FavoriteClub = {
  clubId: 3,
  name: '두잉동아리',
  logoUrl: null,
  category: 'ACADEMIC',
  division: null,
  favoritedAt: '2026-05-17T01:23:45',
  openRecruitmentCount: 0,
};

describe('FavoriteClubCard — 분류 라벨', () => {
  it('알려진 분류는 그 라벨로 그린다', () => {
    render(<FavoriteClubCard favorite={favorite} />);

    expect(screen.getByText('학술')).toBeInTheDocument();
  });

  it('백엔드가 먼저 배포한 모르는 분류는 빈칸 대신 기타로 그린다', () => {
    render(
      <FavoriteClubCard favorite={{ ...favorite, category: 'NEW_CATEGORY' as unknown as ClubCategory }} />,
    );

    expect(screen.getByText('기타')).toBeInTheDocument();
  });
});
