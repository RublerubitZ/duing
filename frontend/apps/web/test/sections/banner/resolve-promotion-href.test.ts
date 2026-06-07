import { describe, expect, it } from 'vitest';
import type { PromotionCard } from '@duing/types';

import { resolvePromotionHref } from '../../../app/_components/sections/BannerCarousel';

function makePromotion(overrides: Partial<PromotionCard> = {}): PromotionCard {
  return {
    id: 1,
    title: 'T',
    subtitle: null,
    ctaLabel: null,
    linkUrl: null,
    palette: 'INK',
    bannerImageUrl: null,
    club: null,
    tag: null,
    emoji: null,
    renderMode: 'SYSTEM_COMPOSED',
    imageAltText: null,
    notice: null,
    displayOrder: 0,
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('resolvePromotionHref', () => {
  it('linkUrl 이 있으면 그 값을 반환한다', () => {
    expect(
      resolvePromotionHref(makePromotion({ linkUrl: 'https://example.com' })),
    ).toBe('https://example.com');
  });

  it('linkUrl 이 없고 club 만 있으면 /clubs/{id} 를 반환한다', () => {
    expect(
      resolvePromotionHref(makePromotion({ club: { id: 7, name: '두잉' } })),
    ).toBe('/clubs/7');
  });

  it('linkUrl 과 club 둘 다 없으면 null 을 반환한다', () => {
    expect(resolvePromotionHref(makePromotion())).toBeNull();
  });

  it('linkUrl 이 club 보다 우선한다 (둘 다 있을 때 linkUrl 선택)', () => {
    expect(
      resolvePromotionHref(
        makePromotion({
          linkUrl: 'https://override.example.com',
          club: { id: 7, name: '두잉' },
        }),
      ),
    ).toBe('https://override.example.com');
  });

  it('linkUrl 없고 notice 가 isAccessible=true 면 /notices/{id} 를 반환한다', () => {
    expect(
      resolvePromotionHref(
        makePromotion({
          notice: { id: 42, title: '공지', isAccessible: true },
        }),
      ),
    ).toBe('/notices/42');
  });

  it('notice.isAccessible=false 면 notice 를 건너뛰고 다음 폴백으로 간다', () => {
    expect(
      resolvePromotionHref(
        makePromotion({
          notice: { id: 42, title: '', isAccessible: false },
          club: { id: 7, name: '두잉' },
        }),
      ),
    ).toBe('/clubs/7');
  });
});
