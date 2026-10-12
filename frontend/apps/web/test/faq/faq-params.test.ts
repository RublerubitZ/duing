import { describe, expect, it } from 'vitest';

import { parseFaqParams } from '../../app/faq/_lib/faqParams';

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
