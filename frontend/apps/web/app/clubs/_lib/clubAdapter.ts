import type { ClubCategory, ClubSummary } from '@duing/types';

import { type Club, type ClubCat, type ClubScope, type ClubStatus } from './clubs';

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

const pickColor = (id: number): string => COLOR_PALETTE[Math.abs(id) % COLOR_PALETTE.length] ?? '#1F4A36';

const deriveScope = (centralClub: boolean): ClubScope =>
  centralClub ? '중앙' : '과';

/**
 * 백엔드 ClubStatus(PENDING/ACTIVE/INACTIVE) → UI ClubStatus(open/upcoming/closed) 임시 매핑.
 * 실제 모집중/오픈예정/마감은 Recruitment 도메인에 있으므로, 목록 응답에 그 정보가 추가될 때까지는
 * ACTIVE = open, 그 외 = closed 로 보수적으로 표시한다.
 */
const deriveStatus = (summary: ClubSummary): ClubStatus =>
  summary.status === 'ACTIVE' ? 'open' : 'closed';

export function summaryToClub(summary: ClubSummary): Club {
  const cat = CATEGORY_TO_CAT[summary.category];
  const scope = deriveScope(summary.centralClub);
  const division = summary.division ?? null;
  const status = deriveStatus(summary);
  const tag = summary.tags.length > 0 ? summary.tags.slice(0, 3).join(' · ') : '소개 준비중';

  return {
    id: summary.id,
    name: summary.name,
    tag,
    cat,
    scope,
    division,
    status,
    gen: '—',
    spots: '—',
    deadline: '—',
    color: pickColor(summary.id),
    logoUrl: summary.logoUrl,
  };
}
