import type { ClubSearchParams } from '@duing/types';

import { type Division, isDivision } from './clubs';

export type Scope = '전체' | '중앙' | '과';
export type DivisionFilter = '전체' | Division;

/**
 * 카드에 표시되는 모집 상태 필터.
 * - 'all'      : 필터 없음
 * - 'open'     : 모집중 (API recruiting=true)
 * - 'upcoming' : 오픈 예정 (백엔드 미지원 — UI 만 노출)
 * - 'closed'   : 모집 마감 (API recruiting=false)
 */
export type RecruitmentFilter = 'all' | 'open' | 'upcoming' | 'closed';

export type ExploreParams = {
  scope: Scope;
  division: DivisionFilter;
  keyword: string;
  recruitment: RecruitmentFilter;
  /** 1-based 페이지 — URL 표기와 일치. API 호출 시 -1. */
  page: number;
};

export const DEFAULT_EXPLORE_PARAMS: ExploreParams = {
  scope: '전체',
  division: '전체',
  keyword: '',
  recruitment: 'all',
  page: 1,
};

const SCOPES: readonly Scope[] = ['전체', '중앙', '과'];
const RECRUITMENTS: readonly RecruitmentFilter[] = ['all', 'open', 'upcoming', 'closed'];

export const RECRUITMENT_LABEL: Record<Exclude<RecruitmentFilter, 'all'>, string> = {
  open: '모집중',
  upcoming: '오픈 예정',
  closed: '모집 마감',
};

export function parseExploreParams(search: URLSearchParams): ExploreParams {
  const rawScope = search.get('scope');
  const scope: Scope = SCOPES.find((s) => s === rawScope) ?? '전체';

  const rawDivision = search.get('division');
  const division: DivisionFilter = isDivision(rawDivision) ? rawDivision : '전체';

  const keyword = search.get('q')?.trim() ?? '';

  const rawRecruitment = search.get('recruitment');
  const recruitment: RecruitmentFilter =
    RECRUITMENTS.find((r) => r === rawRecruitment) ?? 'all';

  const rawPage = Number(search.get('page'));
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  return { scope, division, keyword, recruitment, page };
}

export function serializeExploreParams(params: ExploreParams): string {
  const next = new URLSearchParams();
  if (params.scope !== '전체') next.set('scope', params.scope);
  if (params.division !== '전체') next.set('division', params.division);
  if (params.keyword) next.set('q', params.keyword);
  if (params.recruitment !== 'all') next.set('recruitment', params.recruitment);
  if (params.page > 1) next.set('page', String(params.page));
  return next.toString();
}

/**
 * 백엔드 검색 파라미터 변환.
 * - scope 는 백엔드 스키마에 없으므로 클라이언트에서 후처리.
 * - recruitment='upcoming' 도 백엔드 미지원 — 필터를 보내지 않고 클라이언트에서 후처리.
 */
export function toApiParams(params: ExploreParams, pageSize: number): ClubSearchParams {
  const recruiting =
    params.recruitment === 'open' ? true
      : params.recruitment === 'closed' ? false
      : undefined;

  return {
    keyword: params.keyword || undefined,
    division: params.division !== '전체' ? params.division : undefined,
    recruiting,
    page: Math.max(0, params.page - 1),
    size: pageSize,
  };
}
