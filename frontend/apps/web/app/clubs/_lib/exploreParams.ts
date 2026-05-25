import type { ClubSearchParams, College } from '@duing/types';

import { type Division, isDivision } from './clubs';

export type Scope = '전체' | '중앙' | '학과';
export type DivisionFilter = '전체' | Division;
export type SortKey = 'DEADLINE_SOON' | 'RECENT' | 'ALPHABETICAL';

export type RecruitmentFilter = 'all' | 'available' | 'upcoming' | 'closed';

export type ExploreParams = {
  scope: Scope;
  division: DivisionFilter;
  keyword: string;
  recruitment: RecruitmentFilter;
  college: College | null;
  sort: SortKey;
  /** 1-based 페이지 — URL 표기와 일치. API 호출 시 -1. */
  page: number;
};

export const DEFAULT_EXPLORE_PARAMS: ExploreParams = {
  scope: '전체',
  division: '전체',
  keyword: '',
  recruitment: 'all',
  college: null,
  sort: 'RECENT',
  page: 1,
};

const SCOPES: readonly Scope[] = ['전체', '중앙', '학과'];
const RECRUITMENTS: readonly RecruitmentFilter[] = ['all', 'available', 'upcoming', 'closed'];
const SORT_KEYS: readonly SortKey[] = ['DEADLINE_SOON', 'RECENT', 'ALPHABETICAL'];

const VALID_COLLEGES = new Set<string>([
  'PUBLIC_LEADERS', 'GLOBAL_BUSINESS', 'SOCIAL_SCIENCE', 'HEALTH_BIO',
  'IT_ENGINEERING', 'DESIGN_ART', 'EDUCATION', 'REHABILITATION',
  'NURSING', 'GLOCAL_LIFE', 'INTERNATIONAL', 'SPORTS_LEISURE',
  'CULTURE_CONTENTS', 'FREE_MAJOR',
]);

export const RECRUITMENT_LABEL: Record<Exclude<RecruitmentFilter, 'all'>, string> = {
  available: '지원가능',
  upcoming: '모집예정',
  closed: '모집마감',
};

export function parseExploreParams(search: URLSearchParams): ExploreParams {
  const rawScope = search.get('scope');
  const scope: Scope = SCOPES.find((s) => s === rawScope) ?? '전체';

  const rawDivision = search.get('division');
  const division: DivisionFilter = isDivision(rawDivision) ? rawDivision : '전체';

  const keyword = search.get('q')?.trim() ?? '';

  const rawRecruitment = search.get('recruitment');
  const recruitment: RecruitmentFilter =
    rawRecruitment === 'open' ? 'available'                          // 이전 URL 호환
      : RECRUITMENTS.find((option) => option === rawRecruitment) ?? 'all';

  const rawCollege = search.get('college');
  const college: College | null =
    rawCollege && VALID_COLLEGES.has(rawCollege) ? (rawCollege as College) : null;

  const rawSort = search.get('sort');
  const sort: SortKey = SORT_KEYS.find((s) => s === rawSort) ?? 'RECENT';

  const rawPage = Number(search.get('page'));
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  return { scope, division, keyword, recruitment, college, sort, page };
}

export function serializeExploreParams(params: ExploreParams): string {
  const next = new URLSearchParams();
  if (params.scope !== '전체') next.set('scope', params.scope);
  if (params.division !== '전체') next.set('division', params.division);
  if (params.keyword) next.set('q', params.keyword);
  if (params.recruitment !== 'all') next.set('recruitment', params.recruitment);
  if (params.college) next.set('college', params.college);
  if (params.sort !== 'RECENT') next.set('sort', params.sort);
  if (params.page > 1) next.set('page', String(params.page));
  return next.toString();
}

/**
 * 백엔드 검색 파라미터 변환.
 * scope → centralClub 매핑: 중앙=true, 학과=false, 전체=undefined.
 */
export function toApiParams(params: ExploreParams, pageSize: number): ClubSearchParams {
  const recruitmentStatus =
    params.recruitment === 'available' ? 'AVAILABLE'
      : params.recruitment === 'upcoming' ? 'UPCOMING'
      : params.recruitment === 'closed' ? 'CLOSED'
      : undefined;

  const centralClub =
    params.scope === '중앙' ? true
      : params.scope === '학과' ? false
      : undefined;

  return {
    keyword: params.keyword || undefined,
    division: params.division !== '전체' ? params.division : undefined,
    recruitmentStatus,
    centralClub,
    college: params.college ?? undefined,
    sort: params.sort,
    page: Math.max(0, params.page - 1),
    size: pageSize,
  };
}
