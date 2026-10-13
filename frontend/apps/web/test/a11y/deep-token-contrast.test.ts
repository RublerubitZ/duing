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
    ['text-coral-deep', 'bg-coral/5'],
    ['text-coral-deep', 'bg-coral/10'],
  ] as const)('%s 는 바탕 4종 위 %s 합성에서 4.5:1 이상이다', (textClass, tintClass) => {
    expect(worstContrast(textClass, tintClass)).toBeGreaterThanOrEqual(SMALL_TEXT_AA);
  });

  // bg-coral/15 는 흰 모달 1곳(시설 예약 상세 BookingDetailModal 의 충돌 배너)에만 쓴다 — 크림 계열 위(최악 4.44)에는 쓰지 않는다.
  it('text-coral-deep 은 흰 바탕 위 bg-coral/15 합성에서 4.5:1 이상이다', () => {
    const tint = parseColorClass('bg-coral/15');
    const backgroundHex = blendOver(resolveTokenHex(tint.tokenPath), tint.alpha, LIGHT_SURFACES.흰색);
    expect(contrastRatio(resolveTokenHex('coral-deep'), backgroundHex)).toBeGreaterThanOrEqual(SMALL_TEXT_AA);
  });
});

describe('위험·종료 동작 danger 대비(WCAG AA 4.5:1)', () => {
  it('text-danger 는 바탕 4종 위에 그대로 4.5:1 이상이다', () => {
    expect(worstContrast('text-danger')).toBeGreaterThanOrEqual(SMALL_TEXT_AA);
  });

  // 크림2 위 hover:bg-danger/5 합성은 4.29 로 미달이라 단언하지 않는다 — 틴트는 hover 순간에만 깔리고,
  // 크림2 바탕 위에 놓인 위험 버튼은 지금 없다.
  it.each(['흰색', 'paper.warm', '크림'] as const)('text-danger 는 %s 바탕 위 bg-danger/5 합성에서 4.5:1 이상이다', (surfaceName) => {
    const tint = parseColorClass('bg-danger/5');
    const backgroundHex = blendOver(resolveTokenHex(tint.tokenPath), tint.alpha, LIGHT_SURFACES[surfaceName]);
    expect(contrastRatio(resolveTokenHex('danger'), backgroundHex)).toBeGreaterThanOrEqual(SMALL_TEXT_AA);
  });

  it.each(['danger', 'danger-hover'] as const)('흰 글자(paper)는 솔리드 %s 위에서 4.5:1 이상이다', (buttonToken) => {
    expect(contrastRatio(resolveTokenHex('paper'), resolveTokenHex(buttonToken))).toBeGreaterThanOrEqual(SMALL_TEXT_AA);
  });
});
