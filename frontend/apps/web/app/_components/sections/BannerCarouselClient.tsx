'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { cn } from '@/app/_lib/cn';
import type { CarouselSlide } from '@/app/_lib/promotion';
import { ArrowLeft, ArrowRight } from '@/components/duing/Icon';
import { SystemComposedSlide } from './banner/SystemComposedSlide';
import { FullBleedSlide } from './banner/FullBleedSlide';

const AUTOPLAY_INTERVAL_MS = 5_000;
const SLIDE_DURATION_MS = 400;
// 스와이프 감각 상수 — 초기값. 구현 후 PC/태블릿/모바일 배율 시각 QA 로 최종 조정(이 값에 묶이지 말 것).
const DRAG_ACTIVATE_PX = 8; // 가로 드래그 확정 임계
const DRAG_DAMPING = 0.25; // peek 비율(현재 배너가 손가락을 따라오는 정도)
const COMMIT_RATIO = 0.3; // 커밋 거리 임계(고정 너비 대비)
const FLICK_VELOCITY = 0.5; // 커밋 속도 임계(px/ms)
const SETTLE_DURATION_MS = 250; // 임계 미달 복귀 transition

type Props = {
  slides: CarouselSlide[];
};

type LockAxis = 'none' | 'horizontal' | 'vertical';

/** 진행 중인 track transform 의 현재 translateX(px) 를 안전하게 읽는다(복귀 중 재드래그 시드용). */
function readTranslateX(element: HTMLElement | null): number {
  if (!element) return 0;
  try {
    const transform = getComputedStyle(element).transform;
    if (!transform || transform === 'none') return 0;
    return new DOMMatrixReadOnly(transform).m41;
  } catch {
    return 0;
  }
}

export function BannerCarouselClient({ slides }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [direction, setDirection] = useState<'left' | 'right'>('left');
  const [exitingSlide, setExitingSlide] = useState<CarouselSlide | null>(null);
  // 드래그 피드백(peek) · 복귀/커밋 전환 상태.
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [settleMs, setSettleMs] = useState(SETTLE_DURATION_MS);

  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  // Pointer Events 스와이프 — 마우스·터치·펜 단일화.
  const pointerIdRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const containerWidthRef = useRef(0);
  const lockedRef = useRef<LockAxis>('none');
  const didDragRef = useRef(false);
  const dragBaseRef = useRef(0); // re-grab 시 현재 transform 위치(점프 없이 이어받기 위한 기준).

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
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    // 서버 refresh 로 슬라이드 수가 줄면 activeIndex 가 범위를 벗어나 페이저/dot 이 어긋난다.
    setActiveIndex((prev) => (slides.length === 0 ? 0 : prev % slides.length));
  }, [slides.length]);

  useEffect(() => {
    // 드래그/복귀/전환 애니메이션 중에는 오토플레이를 멈춰, 손 뗀 직후 애니메이션이 끝난 뒤 재개한다.
    if (!isPlaying || isDragging || isSettling || slides.length <= 1) return;
    const timer = window.setInterval(goNext, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isPlaying, isDragging, isSettling, goNext, slides.length]);

  const releasePointer = useCallback(() => {
    const element = containerRef.current;
    const pointerId = pointerIdRef.current;
    if (element && pointerId !== null && element.hasPointerCapture?.(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
    pointerIdRef.current = null;
  }, []);

  const settleAfterDrag = useCallback(
    (shouldCommit: boolean, deltaX: number) => {
      releasePointer();
      pointerStartRef.current = null;
      lockedRef.current = 'none';
      setIsDragging(false);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      const duration = shouldCommit ? SLIDE_DURATION_MS : SETTLE_DURATION_MS;
      setSettleMs(duration);
      setIsSettling(true);
      setDragOffset(0);
      if (shouldCommit) {
        if (deltaX < 0) goNext();
        else goPrev();
      }
      settleTimerRef.current = setTimeout(() => {
        setIsSettling(false);
        settleTimerRef.current = null;
        didDragRef.current = false;
      }, duration);
    },
    [goNext, goPrev, releasePointer],
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (slides.length <= 1) return;
    // 복귀 중 재드래그(re-grab): 진행 중 복귀를 끊고 현재 transform 위치에서 점프 없이 이어받는다.
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
      const current = readTranslateX(trackRef.current);
      dragBaseRef.current = current;
      setIsSettling(false);
      setDragOffset(current);
    } else {
      dragBaseRef.current = 0;
    }
    pointerStartRef.current = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    containerWidthRef.current = containerRef.current?.getBoundingClientRect().width ?? 0;
    pointerIdRef.current = event.pointerId;
    lockedRef.current = 'none';
    didDragRef.current = false;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    if (!start || slides.length <= 1) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (lockedRef.current === 'none') {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) <= DRAG_ACTIVATE_PX) return;
      lockedRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
      if (lockedRef.current === 'horizontal') {
        setIsDragging(true);
        // 캡처는 가로 드래그가 확정된 뒤에만 건다. pointerdown 에서 미리 걸면 내부 화살표 버튼 '탭'의
        // click 이 캡처 대상(컨테이너)으로 리다이렉트돼 버튼 onClick 이 죽는다(실브라우저 확인).
        try {
          containerRef.current?.setPointerCapture?.(event.pointerId);
        } catch {
          // 포인터가 이미 비활성이면 throw 가능 — 캡처는 향상 기능이라 무시.
        }
      }
    }
    if (lockedRef.current === 'horizontal') {
      didDragRef.current = true;
      setDragOffset(dragBaseRef.current + deltaX * DRAG_DAMPING);
      event.preventDefault();
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    if (lockedRef.current !== 'horizontal' || !start) {
      // re-grab 으로 비-0 offset 이 시드됐는데 수평 드래그 없이(탭/세로) 끝나면, track 이 어긋난 채 고정되지 않게 0으로 복귀.
      if (dragOffset !== 0) {
        settleAfterDrag(false, 0);
      } else {
        releasePointer();
        pointerStartRef.current = null;
        lockedRef.current = 'none';
      }
      return;
    }
    const deltaX = event.clientX - start.x;
    const deltaTime = event.timeStamp - start.time;
    const velocity = deltaTime > 0 ? deltaX / deltaTime : 0;
    const width = containerWidthRef.current;
    const commit =
      (width > 0 && Math.abs(deltaX) >= width * COMMIT_RATIO) ||
      Math.abs(velocity) >= FLICK_VELOCITY;
    settleAfterDrag(commit, deltaX);
  };

  const handlePointerCancel = () => {
    if (lockedRef.current === 'horizontal' || dragOffset !== 0) {
      settleAfterDrag(false, 0);
    } else {
      releasePointer();
      pointerStartRef.current = null;
      lockedRef.current = 'none';
      setIsDragging(false);
    }
    didDragRef.current = false;
  };

  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    // 드래그로 끝난 직후의 클릭은 억제한다(<a>/<Link> 배너 링크 이동 방지). 단순 탭은 통과.
    if (didDragRef.current) {
      event.preventDefault();
      event.stopPropagation();
      didDragRef.current = false;
    }
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
            ref={containerRef}
            data-testid="banner-carousel-viewport"
            className="relative aspect-[2/1] touch-pan-y select-none overflow-hidden rounded-xl sm:aspect-[24/8]"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onClickCapture={handleClickCapture}
            // 앵커/이미지 등의 네이티브 드래그(dragstart)를 막아 데스크탑 마우스 스와이프가 pointercancel 로 끊기지 않게 한다.
            onDragStart={(event) => event.preventDefault()}
          >
            {/* peek/커밋/복귀 변위를 담는 안정적인 track — 키 변경으로 remount 되는 슬라이드와 달리 마운트 유지. */}
            <div
              ref={trackRef}
              className="absolute inset-0"
              style={{
                transform: `translateX(${dragOffset}px)`,
                transition: isSettling ? `transform ${settleMs}ms ease-out` : 'none',
                willChange: isDragging || isSettling ? 'transform' : 'auto',
              }}
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
            </div>

            {/* 모바일: 배너 양 끝 화살표(이동) + 내부 점 인디케이터(비상호작용). track 밖이라 드래그 시 안 움직임. */}
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

          {/* 보조 배너 프리뷰 — md 미만 숨김(모바일은 메인만), md~xl 하단 2-up, xl 우측 세로 1열. */}
          <div
            className={cn(
              'hidden gap-3 md:grid xl:grid-cols-1',
              previewSlides.length > 1 ? 'md:grid-cols-2' : 'md:grid-cols-1',
            )}
          >
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

        {/* 하단 컨트롤 바 — 모바일은 배너 내부 화살표·점으로 대체, 데스크탑만 노출 */}
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
          <span data-testid="banner-pager" className="ml-1 font-mono text-xs text-charcoal-3">
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
