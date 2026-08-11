import type { ClubCategory, ClubDayOfWeek, ClubSearchParams, College } from '@duing/types';

import { type Division, isDivision } from './clubs';

export type Scope = '전체' | '중앙' | '학과';
export type DivisionFilter = '전체' | Division;
export type SortKey = 'RECOMMENDED' | 'DEADLINE_SOON' | 'ALPHABETICAL';

export type RecruitmentFilter = 'all' | 'available' | 'upcoming' | 'closed';

export type ExploreParams = {
  scope: Scope;
  division: DivisionFilter;
  keyword: string;
  recruitment: RecruitmentFilter;
  college: College | null;
  category: ClubCategory | null;
  activeDays: ClubDayOfWeek[];
  sort: SortKey;
  /** 찜한 동아리만 — 로그인 필요. 비로그인 딥링크는 페이지에서 쿼리를 게이트한다. */
  favorite: boolean;
  /** 1-based 페이지 — URL 표기와 일치. API 호출 시 -1. */
  page: number;
};

export const DEFAULT_EXPLORE_PARAMS: ExploreParams = {
  scope: '전체',
  division: '전체',
  keyword: '',
  recruitment: 'all',
  college: null,
  category: null,
  activeDays: [],
  sort: 'RECOMMENDED',
  favorite: false,
  page: 1,
};

export const CATEGORY_OPTIONS: ReadonlyArray<{ value: ClubCategory; label: string }> = [
  { value: 'ACADEMIC',  label: '학술' },
  { value: 'CREATION',  label: '창작' },
  { value: 'ART',       label: '예술' },
  { value: 'SPORTS',    label: '운동' },
  { value: 'VOLUNTEER', label: '봉사' },
  { value: 'RELIGION',  label: '종교' },
  { value: 'HOBBY',     label: '취미' },
  { value: 'OTHER',     label: '기타' },
];

const VALID_CATEGORIES = new Set<string>(CATEGORY_OPTIONS.map((option) => option.value));

function isCategory(value: string): value is ClubCategory {
  return VALID_CATEGORIES.has(value);
}

export function categoryLabel(value: ClubCategory): string {
  return CATEGORY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

const SCOPES: readonly Scope[] = ['전체', '중앙', '학과'];
const RECRUITMENTS: readonly RecruitmentFilter[] = ['all', 'available', 'upcoming', 'closed'];
const SORT_KEYS: readonly SortKey[] = ['RECOMMENDED', 'DEADLINE_SOON', 'ALPHABETICAL'];

const DAY_OF_WEEK: readonly ClubDayOfWeek[] = [
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
];
const VALID_DAYS = new Set<string>(DAY_OF_WEEK);

function isClubDayOfWeek(value: string): value is ClubDayOfWeek {
  return VALID_DAYS.has(value);
}

const VALID_COLLEGES = new Set<string>([
  'PUBLIC_LEADERS', 'GLOBAL_BUSINESS', 'SOCIAL_SCIENCE', 'HEALTH_BIO',
  'IT_ENGINEERING', 'DESIGN_ART', 'EDUCATION', 'REHABILITATION',
  'NURSING', 'GLOCAL_LIFE', 'INTERNATIONAL', 'SPORTS_LEISURE',
  'CULTURE_CONTENTS', 'FREE_MAJOR',
]);

function isCollege(value: string): value is College {
  return VALID_COLLEGES.has(value);
}

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
    rawCollege !== null && isCollege(rawCollege) ? rawCollege : null;

  const rawSort = search.get('sort');
  const sort: SortKey =
    rawSort === 'RECENT' ? 'RECOMMENDED'                            // 이전 URL 호환 (최근 등록순 → 추천순)
      : SORT_KEYS.find((s) => s === rawSort) ?? 'RECOMMENDED';

  const rawCategory = search.get('category');
  const category: ClubCategory | null =
    rawCategory === 'CULTURE' ? 'CREATION'                          // 이전 URL 호환 (문화 → 창작)
      : rawCategory !== null && isCategory(rawCategory) ? rawCategory : null;

  const activeDays = search.getAll('activeDays').filter(isClubDayOfWeek);

  const favorite = search.get('favorite') === 'true';

  const rawPage = Number(search.get('page'));
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  return {
    scope, division, keyword, recruitment, college, category, activeDays, sort, favorite, page,
  };
}

export function serializeExploreParams(params: ExploreParams): string {
  const next = new URLSearchParams();
  if (params.scope !== '전체') next.set('scope', params.scope);
  if (params.division !== '전체') next.set('division', params.division);
  if (params.keyword) next.set('q', params.keyword);
  if (params.recruitment !== 'all') next.set('recruitment', params.recruitment);
  if (params.college) next.set('college', params.college);
  if (params.category) next.set('category', params.category);
  params.activeDays.forEach((day) => next.append('activeDays', day));
  if (params.sort !== 'RECOMMENDED') next.set('sort', params.sort);
  if (params.favorite) next.set('favorite', 'true');
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

  const activeDays =
    params.activeDays.length === 0 || params.activeDays.length === DAY_OF_WEEK.length
      ? undefined
      : params.activeDays;

  return {
    keyword: params.keyword || undefined,
    division: params.division !== '전체' ? params.division : undefined,
    recruitmentStatus,
    centralClub,
    college: params.college ?? undefined,
    category: params.category ?? undefined,
    activeDays,
    // 기본 정렬(RECOMMENDED)은 미전송 — 서버 기본값에 맡긴다. 배포 전환기에 새 FE 가
    // RECOMMENDED 를 모르는 구 BE 를 만나면 enum 바인딩 400 으로 탐색이 깨지므로,
    // 기본값 생략이 유일하게 양방향 안전하다(구 FE 의 sort=RECENT 는 BE alias 가 흡수).
    sort: params.sort === 'RECOMMENDED' ? undefined : params.sort,
    favorite: params.favorite || undefined,
    page: Math.max(0, params.page - 1),
    size: pageSize,
  };
}

/**
 * favorite·page·sort 를 제외한 나머지 필터 중 하나라도 기본값이 아니면 true.
 * 찜 필터 빈 결과가 "찜이 없어서"인지 "조합 조건이 걸러서"인지 빈 상태 문구를 가른다.
 * 요일 전체(7개) 선택은 toApiParams 와 동일하게 필터 미적용으로 본다.
 */
export function hasNonFavoriteFilters(params: ExploreParams): boolean {
  return (
    params.scope !== '전체' ||
    params.division !== '전체' ||
    params.keyword !== '' ||
    params.recruitment !== 'all' ||
    params.college !== null ||
    params.category !== null ||
    (params.activeDays.length > 0 && params.activeDays.length < DAY_OF_WEEK.length)
  );
}
