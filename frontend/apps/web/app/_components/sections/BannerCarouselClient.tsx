'use client';

import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';
import { cn } from '@/app/_lib/cn';
import type { CarouselSlide } from '@/app/_lib/promotion';
import { ArrowLeft, ArrowRight } from '@/components/duing/Icon';
import { SystemComposedSlide } from './banner/SystemComposedSlide';
import { FullBleedSlide } from './banner/FullBleedSlide';

const AUTOPLAY_INTERVAL_MS = 5_000;
const SLIDE_DURATION_MS = 400;

type Props = {
  slides: CarouselSlide[];
};

export function BannerCarouselClient({ slides }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [direction, setDirection] = useState<'left' | 'right'>('left');
  const [exitingSlide, setExitingSlide] = useState<CarouselSlide | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 모바일 스와이프 (#4) — 가로 드래그 40px 이상이면 슬라이드 이동.
  const touchStartXRef = useRef<number | null>(null);

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
    // 서버 refresh 로 슬라이드 수가 줄어들면 activeIndex 가 범위를 벗어나 페이저(`04 / 02`)와 dot 활성 상태가 어긋난다.
    setActiveIndex((prev) => (slides.length === 0 ? 0 : prev % slides.length));
  }, [slides.length]);

  useEffect(() => {
    if (!isPlaying || slides.length <= 1) return;
    const timer = window.setInterval(goNext, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isPlaying, goNext, slides.length]);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  };
  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX === null || slides.length <= 1) return;
    const deltaX = (event.changedTouches[0]?.clientX ?? startX) - startX;
    if (Math.abs(deltaX) < 40) return;
    if (deltaX < 0) goNext();
    else goPrev();
  };

  const activeSlide = slideAt(activeIndex);
  if (!activeSlide) return null;
  const previewSlides: CarouselSlide[] = [slideAt(activeIndex + 1), slideAt(activeIndex + 2)]
    .filter((slide): slide is CarouselSlide => slide !== undefined && slide.key !== activeSlide.key);

  return (
    <section className="px-4 sm:px-6 md:px-10 pt-2">
      <div className="max-w-layout relative mx-auto">
        {/*
         * 반응형 위계 전략:
         * - md 미만: 메인만 (보조 숨김) — 모바일.
         * - md~xl: 단일 컬럼 → 메인 전체폭 상단 + 보조 2-up 하단 (중간 구간 위계 보강).
         * - xl 이상: [1fr_340px] 좌우 배치 (메인 폭이 보조의 2.5배라 위계 충분).
         * items-start 로 stretch 제거 → 메인이 보조 컬럼 높이로 늘어나지 않고 aspect-[24/8] 유지.
         */}
        <div className="grid items-start gap-4 xl:grid-cols-[1fr_340px]">
          <div
            className="relative aspect-[2/1] touch-pan-y select-none overflow-hidden rounded-xl sm:aspect-[24/8] md:min-h-[200px]"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
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

            {/* 모바일: 배너 양 끝 화살표(이동) + 내부 점 인디케이터(비상호작용) (#4) */}
            {slides.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="이전 배너"
                  onClick={goPrev}
                  className="absolute left-2 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-ink/40 text-white backdrop-blur-sm active:bg-ink/60 sm:grid md:hidden"
                >
                  <ArrowLeft />
                </button>
                <button
                  type="button"
                  aria-label="다음 배너"
                  onClick={goNext}
                  className="absolute right-2 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-ink/40 text-white backdrop-blur-sm active:bg-ink/60 sm:grid md:hidden"
                >
                  <ArrowRight />
                </button>
                <div
                  aria-hidden
                  className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-ink/30 px-2 py-1 backdrop-blur-sm md:hidden"
                >
                  {slides.map((slide, idx) => (
                    <span
                      key={slide.key}
                      className={`h-1.5 rounded-full transition-all ${
                        idx === activeIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/55'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 보조 배너 프리뷰 — md 미만 숨김(모바일은 메인만), md~xl 하단 2-up, xl 우측 세로 1열 */}
          <div className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-1">
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

        {/* 하단 컨트롤 바 — 모바일은 배너 내부 화살표·점으로 대체(#4), 데스크탑만 노출 */}
        <div className="mt-[18px] hidden items-center gap-3.5 md:flex">
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
            className="btn btn-ghost btn-sm hidden gap-1 md:inline-flex"
          >
            <span className="text-sm">{isPlaying ? '⏸' : '▶'}</span>
            <span className="text-xs">{isPlaying ? '자동재생 중' : '정지됨'}</span>
          </button>
          <button
            type="button"
            aria-label="이전 배너"
            onClick={goPrev}
            className="btn btn-secondary hidden h-9 w-9 place-items-center rounded-full p-0 md:grid"
          >
            <ArrowLeft />
          </button>
          <button
            type="button"
            aria-label="다음 배너"
            onClick={goNext}
            className="btn btn-primary hidden h-9 w-9 place-items-center rounded-full p-0 md:grid"
          >
            <ArrowRight />
          </button>
        </div>
      </div>
    </section>
  );
}
