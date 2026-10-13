import { describe, expect, it } from 'vitest';

import { blendOver, contrastRatio, parseColorClass, resolveTokenHex } from './wcagContrast';

// 글자가 놓이는 밝은 바탕 4종 — 흰 카드, 관리자 사이드바 paper.warm, 페이지 크림, hover 최악 크림2.
const LIGHT_SURFACES = { 흰색: '#FFFFFF', 'paper.warm': '#FBFAF6', 크림: '#F6F3EC', 크림2: '#EFEBE0' } as const;
const SMALL_TEXT_AA = 4.5;

/** 바탕 4종 각각에 틴트(없으면 바탕 그대로)를 합성한 위에서 글자 대비의 최솟값. */
function worstContrast(textClass: string, tintClass?: string): number {
  const text = parseColorClass(textClass);
  const textHex = resolveTokenHex(text.tokenPath);
  const tint = tintClass === undefined ? undefined : parseColorClass(tintClass);
  return Math.min(
    ...Object.values(LIGHT_SURFACES).map((surfaceHex) => {
      const backgroundHex =
        tint === undefined ? surfaceHex : blendOver(resolveTokenHex(tint.tokenPath), tint.alpha, surfaceHex);
      return contrastRatio(blendOver(textHex, text.alpha, backgroundHex), backgroundHex);
    }),
  );
}

describe('deep 토큰 글자 대비(WCAG AA 4.5:1) — 밝은 바탕 4종', () => {
  it('text-sage-deep 은 바탕 4종 위에 그대로 4.5:1 이상이다', () => {
    expect(worstContrast('text-sage-deep')).toBeGreaterThanOrEqual(SMALL_TEXT_AA);
  });

  it.each([
    ['text-sage-deep', 'bg-sage/10'],
    ['text-sage-deep', 'bg-sage/20'],
    ['text-warm-deep', 'bg-warm/20'],
  ] as const)('%s 는 바탕 4종 위 %s 합성에서 4.5:1 이상이다', (textClass, tintClass) => {
    expect(worstContrast(textClass, tintClass)).toBeGreaterThanOrEqual(SMALL_TEXT_AA);
  });
});
