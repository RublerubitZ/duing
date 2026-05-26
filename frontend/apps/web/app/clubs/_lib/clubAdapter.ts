import type { ClubCategory, ClubSummary } from '@duing/types';

import { type Club, type ClubCat, type ClubScope } from './clubs';

const CATEGORY_TO_CAT: Record<ClubCategory, ClubCat> = {
  ACADEMIC: '학술',
  CULTURE: '문화',
  ART: '문화',
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

const pickColor = (id: number): string =>
  COLOR_PALETTE[Math.abs(id) % COLOR_PALETTE.length] ?? '#1F4A36';

const deriveScope = (centralClub: boolean): ClubScope =>
  centralClub ? '중앙' : '학과';

export function summaryToClub(summary: ClubSummary): Club {
  const cat = CATEGORY_TO_CAT[summary.category];
  const scope = deriveScope(summary.centralClub);
  const division = summary.division ?? null;
  const tag = summary.tags.length > 0 ? summary.tags.slice(0, 3).join(' · ') : '소개 준비중';

  return {
    id: summary.id,
    name: summary.name,
    tag,
    cat,
    scope,
    division,
    color: pickColor(summary.id),
    logoUrl: summary.logoUrl,
    activeRecruitment: summary.activeRecruitment,
  };
}
