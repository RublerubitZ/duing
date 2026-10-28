// /faq 필터 상태의 URL 동기화 — clubs/_lib/exploreParams.ts 의 parse/serialize 패턴을 따른다.
// URL 이 상태의 소스: 새로고침·공유·뒤로가기에서 필터가 유지된다. 기본값은 query 에서 생략한다.

import { SEARCH_KEYWORD_MAX_LENGTH } from '../../_lib/searchKeyword';

export type FaqParams = {
  categoryId: number | 'ALL';
  keyword: string;
  /** 1-based 페이지 — URL 표기와 일치. API 호출 시 -1. */
  page: number;
  /** 딥링크 대상 FAQ id (?item=) — 양의 안전 정수만 인정 */
  item: number | null;
};

export const DEFAULT_FAQ_PARAMS: FaqParams = {
  categoryId: 'ALL',
  keyword: '',
  page: 1,
  item: null,
};

/** FAQ 목록 한 페이지 크기 — 화면(FaqPage)과 서버 시드가 같은 키를 만들도록 한곳에 둔다. */
const FAQ_PAGE_SIZE = 20;

/** 목록 조회 인자 — useFederationFaqListQuery 의 인자 형태(훅 쪽 타입은 export 되지 않는다). */
export type FaqListParams = { categoryId?: number; keyword?: string; page: number; size: number };

/** URL 상태 → 목록 조회 인자. 전체 카테고리·빈 검색어는 보내지 않고, 페이지는 0-based 로 바꾼다. */
export function toFaqListParams(params: FaqParams): FaqListParams {
  return {
    categoryId: params.categoryId !== 'ALL' ? params.categoryId : undefined,
    keyword: params.keyword || undefined,
    page: params.page - 1,
    size: FAQ_PAGE_SIZE,
  };
}

/** 쿼리 없는 첫 진입의 기본 목록 인자 — 서버 시드 키와 화면 키가 같은 함수(toFaqListParams)에서 나온다. */
export const DEFAULT_FAQ_LIST_PARAMS: FaqListParams = toFaqListParams(DEFAULT_FAQ_PARAMS);

/** 양의 안전 정수만 통과 — '1e3'·소수·음수·0·NaN·초과 정수는 전부 null. */
function parsePositiveInt(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseFaqParams(search: URLSearchParams): FaqParams {
  const categoryId = parsePositiveInt(search.get('category')) ?? 'ALL';
  const keyword = search.get('keyword')?.trim().slice(0, SEARCH_KEYWORD_MAX_LENGTH) ?? '';
  const page = parsePositiveInt(search.get('page')) ?? 1;
  const item = parsePositiveInt(search.get('item'));
  return { categoryId, keyword, page, item };
}

export function serializeFaqParams(params: FaqParams): string {
  const next = new URLSearchParams();
  if (params.categoryId !== 'ALL') next.set('category', String(params.categoryId));
  if (params.keyword) next.set('keyword', params.keyword);
  if (params.page > 1) next.set('page', String(params.page));
  if (params.item !== null) next.set('item', String(params.item));
  return next.toString();
}
