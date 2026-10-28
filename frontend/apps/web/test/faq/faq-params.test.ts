import { describe, expect, it } from 'vitest';
import { hashKey } from '@tanstack/react-query';

import { federationFaqQueryKeys } from '@duing/hooks/query-keys';

import {
  DEFAULT_FAQ_LIST_PARAMS,
  DEFAULT_FAQ_PARAMS,
  parseFaqParams,
  toFaqListParams,
} from '../../app/faq/_lib/faqParams';

describe('faqParams — 검색어 해석', () => {
  it('URL 의 검색어 앞뒤 공백을 지운다', () => {
    const parsed = parseFaqParams(new URLSearchParams({ keyword: '  회비  ' }));
    expect(parsed.keyword).toBe('회비');
  });

  // 서버는 100자를 넘는 검색어를 400 으로 거절한다(#1322) — 공유된 긴 링크도 오류 없이 열리게 해석에서 자른다.
  it('URL 의 검색어가 100자를 넘으면 앞 100자만 쓴다', () => {
    const parsed = parseFaqParams(new URLSearchParams({ keyword: '가'.repeat(101) }));
    expect(parsed.keyword).toBe('가'.repeat(100));
  });
});

describe('faqParams — 목록 조회 인자', () => {
  it('카테고리·검색어·페이지를 조회 인자로 옮긴다(page 는 0-based, size 20)', () => {
    expect(toFaqListParams({ categoryId: 3, keyword: '회비', page: 2, item: 7 })).toEqual({
      categoryId: 3,
      keyword: '회비',
      page: 1,
      size: 20,
    });
  });

  it('전체 카테고리와 빈 검색어는 조회 인자에서 뺀다', () => {
    const listParams = toFaqListParams({ categoryId: 'ALL', keyword: '', page: 1, item: null });

    expect(listParams.categoryId).toBeUndefined();
    expect(listParams.keyword).toBeUndefined();
  });

  it('기본 목록 인자는 기본 URL 상태에서 나온다', () => {
    expect(DEFAULT_FAQ_LIST_PARAMS).toEqual(toFaqListParams(DEFAULT_FAQ_PARAMS));
    expect(DEFAULT_FAQ_LIST_PARAMS).toEqual({ categoryId: undefined, keyword: undefined, page: 0, size: 20 });
  });

  // 서버 시드 키와 화면 키가 같은 캐시 항목이어야 시드가 잡힌다 — 키 해시는 undefined 필드를 버린다.
  it('기본 목록 키는 빈 필드 없는 첫 페이지 키와 같은 해시다', () => {
    expect(hashKey(federationFaqQueryKeys.list(DEFAULT_FAQ_LIST_PARAMS))).toBe(
      hashKey(federationFaqQueryKeys.list({ page: 0, size: 20 })),
    );
  });
});
