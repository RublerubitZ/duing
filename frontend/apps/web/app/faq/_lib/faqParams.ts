// /faq 필터 상태의 URL 동기화 — clubs/_lib/exploreParams.ts 의 parse/serialize 패턴을 따른다.
// URL 이 상태의 소스: 새로고침·공유·뒤로가기에서 필터가 유지된다. 기본값은 query 에서 생략한다.

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

/** 양의 안전 정수만 통과 — '1e3'·소수·음수·0·NaN·초과 정수는 전부 null. */
function parsePositiveInt(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseFaqParams(search: URLSearchParams): FaqParams {
  const categoryId = parsePositiveInt(search.get('category')) ?? 'ALL';
  const keyword = search.get('keyword')?.trim() ?? '';
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
