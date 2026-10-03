import { describe, expect, it } from 'vitest';

import { toMetaDescription } from '@/app/_lib/metaDescription';

// 동아리·소식 상세 두 라우트가 같이 쓴다 — 어느 한쪽 라우트 테스트가 바뀌어도 보장이 남게 직접 고정한다.
describe('toMetaDescription — 페이지 메타 설명', () => {
  it('공백(줄바꿈 포함)을 한 칸으로 접고 앞뒤를 자른다', () => {
    expect(toMetaDescription('  a \n\n b  ', 'f')).toBe('a b');
  });

  it('공백뿐이면 fallback 을 쓴다', () => {
    expect(toMetaDescription('   ', '대체')).toBe('대체');
  });

  it('150 코드 포인트를 넘으면 149자에 말줄임표를 붙이고, 정확히 150 이면 그대로 둔다', () => {
    expect(toMetaDescription('가'.repeat(200), 'f')).toBe(`${'가'.repeat(149)}…`);
    expect(toMetaDescription('가'.repeat(150), 'f')).toBe('가'.repeat(150));
  });

  it('이모지(서로게이트 쌍)를 반으로 가르지 않는다', () => {
    expect(toMetaDescription(`${'가'.repeat(148)}😀😀😀`, 'f')).toBe(`${'가'.repeat(148)}😀…`);
  });
});
