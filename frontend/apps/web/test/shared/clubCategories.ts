import type { ClubCategory } from '@duing/types';

// 분류 enum 전체 — 키와 값이 ClubCategory 와 1:1 인 객체라, enum 에 값이 생기면 이 목록이 컴파일 오류로 채우게 만든다.
const CLUB_CATEGORY_KEYS: { [Category in ClubCategory]: Category } = {
  ACADEMIC: 'ACADEMIC',
  CREATION: 'CREATION',
  ART: 'ART',
  SPORTS: 'SPORTS',
  VOLUNTEER: 'VOLUNTEER',
  RELIGION: 'RELIGION',
  HOBBY: 'HOBBY',
  OTHER: 'OTHER',
};

export const ALL_CLUB_CATEGORIES: ClubCategory[] = Object.values(CLUB_CATEGORY_KEYS);
