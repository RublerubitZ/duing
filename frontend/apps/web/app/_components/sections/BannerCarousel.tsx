'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePublicPromotionsQuery } from '@duing/hooks';
import type { PromotionCard, PromotionRenderMode } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import { ArrowLeft, ArrowRight } from '@/components/duing/Icon';
import { PROMOTION_PALETTE } from '../../_lib/promotionPalette';
import { landingBanners, type LandingBanner } from '../../_mocks';
import { SystemComposedSlide } from './banner/SystemComposedSlide';
import { FullBleedSlide } from './banner/FullBleedSlide';

const AUTOPLAY_INTERVAL_MS = 5_000;
const SLIDE_DURATION_MS = 400;

/**
 * 캐러셀이 내부적으로 사용하는 정규화된 슬라이드 모델.
 * DB(PromotionCard) 와 mock(LandingBanner) 양쪽을 한 형태로 모은다.
 */
type CarouselSlide = {
  key: string;
  tag: string;
  title: string;
  sub: string;
  cta: string;
  bg: string;
  fg: string;
  accent: string;
  emoji: string;
  href: string;
  bannerImageUrl: string | null;
  renderMode: PromotionRenderMode;
  imageAltText: string | null;
};

function mockToSlide(banner: LandingBanner): CarouselSlide {
  // 기존 mock 의 정적 라우트 매핑을 유지한다.
  const href =
    banner.id === 1 ? '/calendar'
      : banner.id === 2 ? '/clubs'
      : banner.id === 3 ? '/introduce'
      : '/signup';
  return {
    key: `mock-${banner.id}`,
    tag: banner.tag,
    title: banner.title,
    sub: banner.sub,
    cta: banner.cta,
    bg: banner.bg,
    fg: banner.fg,
    accent: banner.accent,
    emoji: banner.emoji,
    href,
    bannerImageUrl: null,
    renderMode: 'SYSTEM_COMPOSED',
    imageAltText: null,
  };
}

function promotionToSlide(promotion: PromotionCard): CarouselSlide {
  const style = PROMOTION_PALETTE[promotion.palette];
  return {
    key: `promotion-${promotion.id}`,
    tag: promotion.tag ?? '',
    title: promotion.title,
    sub: promotion.subtitle ?? '',
    cta: promotion.ctaLabel ?? '자세히 보기',
    bg: style.bg,
    fg: style.fg,
    accent: style.accent,
    emoji: promotion.emoji ?? '',
    href: promotion.linkUrl ?? (promotion.club ? `/clubs/${promotion.club.id}` : '/clubs'),
    bannerImageUrl: promotion.bannerImageUrl,
    renderMode: promotion.renderMode,
    imageAltText: promotion.imageAltText,
  };
}

export function BannerCarousel() {
  const promotionsQuery = usePublicPromotionsQuery();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [direction, setDirection] = useState<'left' | 'right'>('left');
  const [exitingSlide, setExitingSlide] = useState<CarouselSlide | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slides = useMemo<CarouselSlide[]>(() => {
    const dbContent = promotionsQuery.data?.content ?? [];
    if (dbContent.length > 0) return dbContent.map(promotionToSlide);
    return landingBanners.map(mockToSlide);
  }, [promotionsQuery.data]);

  const slideAt = useCallback(
    (index: number): CarouselSlide | undefined => slides[index % slides.length],
    [slides],
  );

  const startSlideTransition = useCallback(
    (newDirection: 'left' | 'right', currentSlide: CarouselSlide) => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      setDirection(newDirection);
      setExitingSlide(currentSlide);
      transitionTimerRef.current = setTimeout(() => {
        setExitingSlide(null);
        transitionTimerRef.current = null;
      }, SLIDE_DURATION_MS);
    },
    [],
  );

  const goNext = useCallback(() => {
    const currentSlide = slides[activeIndex];
    if (currentSlide) startSlideTransition('left', currentSlide);
    setActiveIndex((prev) => (prev + 1) % slides.length);
  }, [slides, activeIndex, startSlideTransition]);

  const goPrev = useCallback(() => {
    const currentSlide = slides[activeIndex];
    if (currentSlide) startSlideTransition('right', currentSlide);
    setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides, activeIndex, startSlideTransition]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    // 슬라이드 수가 바뀌면 안전한 인덱스로 리셋.
    setActiveIndex((prev) => (slides.length === 0 ? 0 : prev % slides.length));
  }, [slides.length]);

  useEffect(() => {
    if (!isPlaying || slides.length <= 1) return;
    const timer = window.setInterval(goNext, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isPlaying, goNext, slides.length]);

  if (slides.length === 0) return null;

  const activeSlide = slideAt(activeIndex);
  if (!activeSlide) return null;
  const previewSlides: CarouselSlide[] = [slideAt(activeIndex + 1), slideAt(activeIndex + 2)]
    .filter((slide): slide is CarouselSlide => slide !== undefined && slide.key !== activeSlide.key);

  return (
    <section className="px-10 pt-2">
      <div className="max-w-layout relative mx-auto">
        <div className="grid gap-4 md:grid-cols-[1fr_340px]">
          <div className="relative h-[280px] overflow-hidden rounded-xl">
            {exitingSlide && (
              <div
                key={`exit-${exitingSlide.key}`}
                className={cn(
                  'pointer-events-none absolute inset-0',
                  direction === 'left' ? 'animate-slide-out-left' : 'animate-slide-out-right',
                )}
              >
                {exitingSlide.renderMode === 'FULL_BLEED_IMAGE' ? (
                  <FullBleedSlide variant="main" slide={exitingSlide} />
                ) : (
                  <SystemComposedSlide variant="main" slide={exitingSlide} />
                )}
              </div>
            )}
            <div
              key={`enter-${activeSlide.key}`}
              className={cn(
                'absolute inset-0',
                exitingSlide
                  ? direction === 'left'
                    ? 'animate-slide-in-right'
                    : 'animate-slide-in-left'
                  : '',
              )}
            >
              {activeSlide.renderMode === 'FULL_BLEED_IMAGE' ? (
                <FullBleedSlide variant="main" slide={activeSlide} />
              ) : (
                <SystemComposedSlide variant="main" slide={activeSlide} />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {previewSlides.map((slide, idx) => {
              const previewProps = {
                slide,
                direction,
                animationDelay: idx === 1 ? '120ms' : undefined,
                onSelect: () => {
                  const next = slides.findIndex((s) => s.key === slide.key);
                  if (next >= 0) {
                    const currentSlide = slides[activeIndex];
                    if (currentSlide) startSlideTransition(next > activeIndex ? 'left' : 'right', currentSlide);
                    setActiveIndex(next);
                  }
                },
              } as const;
              return slide.renderMode === 'FULL_BLEED_IMAGE' ? (
                <FullBleedSlide
                  key={`${activeIndex}-${direction}-${slide.key}`}
                  variant="preview"
                  {...previewProps}
                />
              ) : (
                <SystemComposedSlide
                  key={`${activeIndex}-${direction}-${slide.key}`}
                  variant="preview"
                  {...previewProps}
                />
              );
            })}
          </div>
        </div>

        <div className="mt-[18px] flex items-center gap-3.5">
          <div className="flex items-center gap-2">
            {slides.map((slide, idx) => (
              <button
                key={slide.key}
                type="button"
                aria-label={`배너 ${idx + 1}로 이동`}
                onClick={() => {
                  const currentSlide = slides[activeIndex];
                  if (currentSlide) startSlideTransition(idx > activeIndex ? 'left' : 'right', currentSlide);
                  setActiveIndex(idx);
                }}
                className={`h-[5px] rounded-full transition-all ${
                  idx === activeIndex ? 'w-6 bg-ink' : 'w-[5px] bg-line'
                }`}
              />
            ))}
          </div>
          <span className="ml-1 font-mono text-xs text-charcoal-3">
            {String(activeIndex + 1).padStart(2, '0')} /{' '}
            {String(slides.length).padStart(2, '0')}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setIsPlaying((prev) => !prev)}
            className="btn btn-ghost btn-sm gap-1"
          >
            <span className="text-sm">{isPlaying ? '⏸' : '▶'}</span>
            <span className="text-xs">{isPlaying ? '자동재생 중' : '정지됨'}</span>
          </button>
          <button
            type="button"
            aria-label="이전 배너"
            onClick={goPrev}
            className="btn btn-secondary grid h-9 w-9 place-items-center rounded-full p-0"
          >
            <ArrowLeft />
          </button>
          <button
            type="button"
            aria-label="다음 배너"
            onClick={goNext}
            className="btn btn-primary grid h-9 w-9 place-items-center rounded-full p-0"
          >
            <ArrowRight />
          </button>
        </div>
      </div>
    </section>
  );
}
