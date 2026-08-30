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
// 시안의 배너 화살표는 꼬리 없는 캐럿(‹ ›)이다 — 두잉 Icon 셋엔 꼬리 달린 화살표뿐이라 lucide 것을 쓴다.
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
    // 서버 refresh 로 슬라이드 수가 줄면 activeIndex 가 범위를 벗어나 위치 표시가 어긋난다.
    setActiveIndex((prev) => (slides.length === 0 ? 0 : prev % slides.length));
  }, [slides.length]);

  useEffect(() => {
    // OS '동작 줄이기' 면 자동 넘김을 처음부터 멈춘다(WCAG 2.3.3). 초기 state 에 넣지 않는 이유는
    // 서버 렌더가 matchMedia 를 모르기 때문 — 마운트 후 한 번만 내려 하이드레이션 불일치를 피한다.
    // 사용자는 토글로 다시 켤 수 있다. 전환 키프레임은 globals.css 의 같은 미디어 쿼리가 끈다.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setIsPlaying(false);
  }, []);

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

  return (
    <section className="px-4 pt-2 sm:px-6 md:px-10">
      <div className="max-w-layout relative mx-auto">
        {/*
         * 시안은 전체 폭 배너 한 장이다 — 예전의 [메인 + 우측 보조 2장] 그리드를 걷어냈다.
         * 컨트롤은 위치 표시(우측)·이전다음 화살표(md+ 하단)·자동 재생 토글(배너 밖 아래)로 나뉜다.
         *
         * 높이는 시안 비율로 정한다 — PC 프레임 배너 1472×342(≈4.3:1, 라운드 24→20), 모바일 프레임
         * 배너 361×124(≈2.9:1, 라운드 10). 전환은 화살표·CTA 와 같은 md 다. 예전의 viewport 1차식
         * clamp 는 PC ≈ 3.9:1·모바일 ≈ 1.95:1 로 어느 시안과도 달랐다. md 이상은 비율이 하나라
         * 관리자 권장 규격(1472×342)이 곧 보이는 모습이고, 모바일은 그 이미지의 가운데 2.9:1 이 보인다.
         * 1200 폭에서 279px, 390 폭에서 123px.
         */}
        <div
          ref={containerRef}
          data-testid="banner-carousel-viewport"
          className="relative aspect-[361/124] touch-pan-y select-none overflow-hidden rounded-[10px] md:aspect-[1472/342] md:rounded-lg"
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
                  <FullBleedSlide slide={exitingSlide} />
                ) : (
                  <SystemComposedSlide slide={exitingSlide} />
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
                <FullBleedSlide slide={activeSlide} />
              ) : (
                <SystemComposedSlide slide={activeSlide} />
              )}
            </div>
          </div>

          {/* 위치 표시 — sm 미만은 우측 하단, sm 부터는 우측 상단이다. 전환 지점은 합성 슬라이드가
              제목 오른쪽을 비우는 지점(pr-[84px] → sm:pr-0)과 반드시 같아야 한다. 어긋나면 그 사이 폭에서
              "표시는 아직 아래, 예약은 이미 없음" 이 되어 긴 제목과 겹친다.
              합성 슬라이드는 태그가 좌측 상단이라 위쪽 오른편이 비어 있다.
              누르면 다음으로 넘어간다. 화살표가 없는 모바일에서는 스와이프가 유일한 이동 수단이
              되는데 스와이프는 경로 제스처라 단일 포인터 대안이 따로 있어야 한다(WCAG 2.5.1).
              보이는 문구가 이름 안에 그대로 들어가 눈에 보이는 이름과 갈리지 않는다(2.5.3).
              보이는 알약은 시안(509:9182)대로 모바일 21px·sm 부터 32px 높이지만, 모바일의 유일한
              비제스처 이동 수단이라 before 가상요소로 히트 영역만 44px 로 넓힌다(레이아웃·높이 예산
              불변). 알약 높이가 바뀌면 inset 도 같이 바꿔야 44px 이 유지된다 — 21+11.5×2, 32+6×2. */}
          {slides.length > 1 && (
            <button
              type="button"
              data-testid="banner-pager"
              aria-label={`${activeIndex + 1} / ${slides.length} — 다음 배너로 이동`}
              onClick={goNext}
              className="btn absolute bottom-3 right-4 z-10 h-[21px] rounded-full bg-black/60 px-1.5 py-0 text-[12px] font-medium tabular-nums text-white transition before:absolute before:-inset-[11.5px] hover:bg-black/75 sm:bottom-auto sm:right-9 sm:top-5 sm:h-auto sm:px-3.5 sm:py-1.5 sm:text-[13px] sm:font-semibold sm:before:-inset-1.5"
            >
              {activeIndex + 1} / {slides.length}
            </button>
          )}

          {/* 이전·다음 — 데스크탑 전용. 모바일은 스와이프와 우측 하단 위치 표시로 넘긴다.
              track 밖이라 드래그해도 따라 움직이지 않고, 바깥 래퍼가 pointer-events-none 이라
              배너 위 빈 자리는 그대로 드래그 영역으로 남는다. */}
          {slides.length > 1 && (
            <div className="pointer-events-none absolute inset-x-9 bottom-5 z-10 hidden items-center justify-end gap-4 md:flex">
              <button
                type="button"
                aria-label="이전 배너"
                onClick={goPrev}
                className="btn bg-paper text-ink-deep shadow-1 ring-ink/15 hover:bg-cream pointer-events-auto grid h-9 w-9 place-items-center rounded-full p-0 ring-1"
              >
                <ChevronLeft size={20} strokeWidth={2.25} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="다음 배너"
                onClick={goNext}
                className="btn bg-ink-deep text-cream shadow-1 hover:bg-ink pointer-events-auto grid h-9 w-9 place-items-center rounded-full p-0"
              >
                <ChevronRight size={20} strokeWidth={2.25} aria-hidden />
              </button>
            </div>
          )}
        </div>

        {/* 자동 재생 토글 — 배너 밖 아래. 자동으로 움직이는 콘텐츠에는 멈출 방법이 있어야
            하는데(WCAG 2.2.2), 배너 안에 두면 슬라이드 콘텐츠와 자리를 다투고 이미지 위에서
            대비도 불안정하다. 밖으로 빼면 페이지 배경 위라 톤이 안정되고, 이동 수단(위치 표시·화살표)
            과 성격이 다른 컨트롤이 분리된다. 보이는 문구가 곧 상태라 aria-label 로 이름을
            덮지 않고(덮으면 눈에 보이는 이름과 갈린다 — 2.5.3), aria-pressed 도 두지 않는다.
            이름이 상태를 따라 바뀌는 토글에 눌림 상태까지 붙이면 같은 사실을 두 번 말한다(APG). */}
        {slides.length > 1 && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setIsPlaying((prev) => !prev)}
              className="btn btn-ghost btn-sm gap-1.5"
            >
              <span aria-hidden className="text-sm leading-none">
                {isPlaying ? '⏸' : '▶'}
              </span>
              <span className="text-xs">{isPlaying ? '자동재생 중' : '정지됨'}</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
