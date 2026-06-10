import type { PromotionCard, PromotionRenderMode } from '@duing/types';
import { PROMOTION_PALETTE } from './promotionPalette';

/**
 * 배너 캐러셀이 내부적으로 사용하는 정규화된 슬라이드 모델.
 * DB(PromotionCard) 와 mock(LandingBanner) 양쪽을 한 형태로 모은다.
 */
export type CarouselSlide = {
  key: string;
  tag: string;
  title: string;
  sub: string;
  cta: string;
  bg: string;
  fg: string;
  accent: string;
  emoji: string;
  href: string | null;
  bannerImageUrl: string | null;
  renderMode: PromotionRenderMode;
  imageAltText: string | null;
};

/**
 * Promotion 의 연결 대상 우선순위:
 * 1. linkUrl (외부/내부 URL — 직접 입력 우선)
 * 2. notice (isAccessible=true 인 공지 — `/notices/{id}`)
 * 3. club (`/clubs/{id}`)
 * 4. null (연결 없음 — 슬라이드를 비인터랙티브로 렌더)
 */
export function resolvePromotionHref(promotion: PromotionCard): string | null {
  if (promotion.linkUrl) return promotion.linkUrl;
  if (promotion.notice?.isAccessible) return `/notices/${promotion.notice.id}`;
  if (promotion.club) return `/clubs/${promotion.club.id}`;
  return null;
}

export function promotionToSlide(promotion: PromotionCard): CarouselSlide {
  const style = PROMOTION_PALETTE[promotion.palette];
  return {
    key: `promotion-${promotion.id}`,
    tag: promotion.tag ?? '',
    title: promotion.title,
    sub: promotion.subtitle ?? '',
    cta: promotion.ctaLabel ?? '',
    bg: style.bg,
    fg: style.fg,
    accent: style.accent,
    emoji: promotion.emoji ?? '',
    href: resolvePromotionHref(promotion),
    bannerImageUrl: promotion.bannerImageUrl,
    renderMode: promotion.renderMode,
    imageAltText: promotion.imageAltText,
  };
}

/**
 * DB 가 비어 있을 때 보여줄 정적 폴백 배너.
 * 실서비스 운영 중에도 promotion 이 0건일 가능성에 대비해 둔다.
 */
export type LandingBanner = {
  id: number;
  tag: string;
  title: string;
  sub: string;
  cta: string;
  bg: string;
  fg: string;
  accent: string;
  emoji: string;
};

export const FALLBACK_BANNERS: ReadonlyArray<LandingBanner> = [
  {
    id: 1,
    tag: 'EVENT · 9.25 — 9.27',
    title: '가을 동아리 박람회 2025',
    sub: '67개 동아리 · 80개 부스 · 중앙광장',
    cta: '박람회 자세히 보기',
    bg: 'linear-gradient(120deg, #1F4A36 0%, #143025 100%)',
    fg: '#fff',
    accent: '#9DB6A0',
    emoji: '🍂',
  },
  {
    id: 2,
    tag: 'QUIZ · 30초 성향 테스트',
    title: '내게 맞는 동아리,\n어디일까요?',
    sub: '10개의 질문, 추천 동아리 3곳',
    cta: '테스트 시작',
    bg: 'linear-gradient(120deg, #E8EEE8 0%, #C9D8CC 100%)',
    fg: '#143025',
    accent: '#1F4A36',
    emoji: '✨',
  },
  {
    id: 3,
    tag: 'BENEFIT · 학생 제휴',
    title: '두잉 회원이면 15% 할인',
    sub: '스타벅스 · 교보문고 · 무신사 외 12곳',
    cta: '혜택 전체 보기',
    bg: 'linear-gradient(120deg, #FBEFD7 0%, #F3DEAA 100%)',
    fg: '#5C3F11',
    accent: '#8E6620',
    emoji: '🎁',
  },
  {
    id: 4,
    tag: 'NEW · 두잉 굿즈',
    title: '9월 가입하면 굿즈 증정',
    sub: '에코백 · 스티커팩 · 두잉 노트',
    cta: '혜택 받기',
    bg: 'linear-gradient(120deg, #FCE2D9 0%, #F4C0AE 100%)',
    fg: '#6A2611',
    accent: '#9A3F23',
    emoji: '📦',
  },
];

const FALLBACK_HREF: Record<number, string> = {
  1: '/calendar',
  2: '/clubs',
  3: '/introduce',
  4: '/signup',
};

export function fallbackBannerToSlide(banner: LandingBanner): CarouselSlide {
  return {
    key: `fallback-${banner.id}`,
    tag: banner.tag,
    title: banner.title,
    sub: banner.sub,
    cta: banner.cta,
    bg: banner.bg,
    fg: banner.fg,
    accent: banner.accent,
    emoji: banner.emoji,
    href: FALLBACK_HREF[banner.id] ?? '/signup',
    bannerImageUrl: null,
    renderMode: 'SYSTEM_COMPOSED',
    imageAltText: null,
  };
}
