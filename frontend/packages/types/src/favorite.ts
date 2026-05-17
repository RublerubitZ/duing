import type { ClubCategory } from './club';

export type FavoriteClub = {
  clubId: number;
  name: string;
  logoUrl: string | null;
  category: ClubCategory;
  division: string | null;
  favoritedAt: string; // ISO 8601 LocalDateTime e.g. "2026-05-17T01:23:45"
  openRecruitmentCount: number;
};

export type FavoriteIds = {
  clubIds: number[];
};
