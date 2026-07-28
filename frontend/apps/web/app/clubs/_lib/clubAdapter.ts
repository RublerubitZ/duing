import type { ClubCategory, ClubSummary } from '@duing/types';

import { type Club, type ClubCat, type ClubScope } from './clubs';

const CATEGORY_TO_CAT: Record<ClubCategory, ClubCat> = {
  ACADEMIC: '학술',
  CREATION: '창작',
  ART: '예술',
  SPORTS: '운동',
  VOLUNTEER: '봉사',
  RELIGION: '친목',
  HOBBY: '친목',
  OTHER: '친목',
};

/** 카드 시그니처 컬러 팔레트. 동아리 id 해시로 결정 — 백엔드에 색 필드가 생기면 교체. */
const COLOR_PALETTE = [
  '#1F4A36', '#143025', '#2E6149', '#B65672',
  '#9A3F23', '#2F557A', '#8E6620', '#7E2A45',
] as const;

// 동아리 로고 박스 시그니처 컬러 — 카드/리스트/상세 히어로가 동일 색을 쓰도록 공유(공유요소 전환 배경 일치).
export const pickColor = (id: number): string =>
  COLOR_PALETTE[Math.abs(id) % COLOR_PALETTE.length] ?? '#1F4A36';

const deriveScope = (centralClub: boolean): ClubScope =>
  centralClub ? '중앙' : '학과';

export function summaryToClub(summary: ClubSummary): Club {
  const cat = CATEGORY_TO_CAT[summary.category];
  const scope = deriveScope(summary.centralClub);
  const division = summary.division ?? null;
  const tagline = summary.tagline?.trim() ? summary.tagline : null;

  return {
    id: summary.id,
    name: summary.name,
    tagline,
    cat,
    scope,
    division,
    color: pickColor(summary.id),
    logoUrl: summary.logoUrl,
    activeRecruitment: summary.activeRecruitment,
  };
}
