# 메인 홈 배너 스와이프 + 이미지 드래그 다운로드 차단 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 메인 홈 배너에서 (1) 이미지를 마우스로 끌면 PNG 로 다운로드되는 현상을 막고, (2) 마우스·터치·펜 모두에서 "약한 드래그 피드백(peek) + 임계/속도 판정 + 부드러운 복귀" 스와이프로 배너를 넘길 수 있게 한다.

**Architecture:** 슬라이드 렌더러의 `<img>` 에 `draggable={false}` 를 박아 네이티브 드래그를 끄고, `BannerCarouselClient` 의 터치 전용 핸들러를 Pointer Events 로 교체한다. 나가는/들어오는 슬라이드를 감싸는 안정적인 `track` 래퍼에 peek 변위를 주고, 커밋 시 track 을 0으로 되돌리는 transition 을 기존 키프레임과 동기로 실행해 점프 없이 이어지게 한다. 오토플레이는 드래그/애니메이션 동안 멈춘다.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind v3, Vitest + @testing-library/react (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-28-banner-swipe-and-image-drag-design.md`

---

## File Structure

- **수정** `apps/web/app/_components/sections/banner/FullBleedSlide.tsx` — 메인/프리뷰 `<img>` 2곳에 `draggable={false}`.
- **수정** `apps/web/app/_components/sections/banner/SystemComposedSlide.tsx` — 메인/프리뷰 `<img>` 2곳에 `draggable={false}`.
- **수정** `apps/web/app/_components/sections/BannerCarouselClient.tsx` — 터치 핸들러 → Pointer Events 스와이프(peek·임계/속도·복귀·클릭억제·포인터캡처·너비고정), `track` 래퍼, 오토플레이 가드.
- **수정(테스트 보강)** `apps/web/test/sections/banner/full-bleed-slide.test.tsx`, `apps/web/test/sections/banner/system-composed-slide.test.tsx` — `draggable=false` 단언.
- **신규(테스트)** `apps/web/test/sections/banner/banner-carousel-client.test.tsx` — 포인터 스와이프 동작.
- `BannerCarousel.tsx`(서버), `home-data.ts`, `promotion.ts`, 백엔드는 **무변경**.

> 명령 cwd: 모두 `frontend/` 에서 실행. 단일 테스트는 `pnpm --filter @duing/web test -- --run <path>`(= apps/web 에서 `vitest --run <path>`), 타입체크 `pnpm --filter @duing/web typecheck`, 린트 `pnpm --filter @duing/web lint`.

---

## Task 1: 이미지 드래그 다운로드 차단 (`draggable={false}`)

**Files:**
- Modify: `apps/web/app/_components/sections/banner/FullBleedSlide.tsx:42-49`, `:100-107`
- Modify: `apps/web/app/_components/sections/banner/SystemComposedSlide.tsx:64-72`, `:197-205`
- Test: `apps/web/test/sections/banner/full-bleed-slide.test.tsx`, `apps/web/test/sections/banner/system-composed-slide.test.tsx`

- [ ] **Step 1: Write the failing tests**

`full-bleed-slide.test.tsx` 의 `describe('FullBleedSlide — main variant', ...)` 안에 추가:

```tsx
  it('이미지에 draggable=false 가 설정된다 (바탕화면 드래그 다운로드 차단)', () => {
    render(<FullBleedSlide variant="main" slide={makeSlide()} />);
    expect(screen.getByAltText('2026 해커톤 포스터')).toHaveAttribute('draggable', 'false');
  });
```

같은 파일의 `describe('FullBleedSlide — preview variant', ...)` 안에 추가:

```tsx
  it('preview 이미지에 draggable=false 가 설정된다', () => {
    render(
      <FullBleedSlide
        variant="preview"
        slide={makeSlide()}
        direction="left"
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByAltText('2026 해커톤 포스터')).toHaveAttribute('draggable', 'false');
  });
```

`system-composed-slide.test.tsx` 의 `describe('SystemComposedSlide — main variant', ...)` 안에 추가 (이미지는 `alt=""` `aria-hidden` 이라 `container.querySelector('img')` 로 조회):

```tsx
  it('이미지가 있으면 draggable=false 가 설정된다 (바탕화면 드래그 다운로드 차단)', () => {
    const { container } = render(
      <SystemComposedSlide variant="main" slide={makeSlide({ bannerImageUrl: 'https://cdn.test/x.jpg' })} />,
    );
    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute('draggable', 'false');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @duing/web test -- --run test/sections/banner/full-bleed-slide.test.tsx test/sections/banner/system-composed-slide.test.tsx`
Expected: FAIL — 새 3개 케이스가 "expected element to have attribute draggable=\"false\"" 로 실패(현재 `draggable` 미설정).

- [ ] **Step 3: Add `draggable={false}` — FullBleedSlide.tsx**

메인 이미지 (`:42-49`) 를 다음으로 교체:

```tsx
    <img
      src={slide.bannerImageUrl}
      alt={slide.imageAltText ?? ''}
      draggable={false}
      className="block h-full w-full object-cover"
      onError={(event) => {
        event.currentTarget.style.display = 'none';
      }}
    />
```

프리뷰 이미지 (`:100-107`) 를 다음으로 교체:

```tsx
        <img
          src={slide.bannerImageUrl}
          alt={slide.imageAltText ?? ''}
          draggable={false}
          className="block h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
```

- [ ] **Step 4: Add `draggable={false}` — SystemComposedSlide.tsx**

메인 이미지 (`:64-72`) 를 다음으로 교체:

```tsx
          <img
            src={slide.bannerImageUrl ?? ''}
            alt=""
            aria-hidden
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
```

프리뷰 이미지 (`:197-205`) 를 다음으로 교체:

```tsx
          <img
            src={slide.bannerImageUrl ?? ''}
            alt=""
            aria-hidden
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @duing/web test -- --run test/sections/banner/full-bleed-slide.test.tsx test/sections/banner/system-composed-slide.test.tsx`
Expected: PASS (기존 케이스 포함 전부 green).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/_components/sections/banner/FullBleedSlide.tsx \
        apps/web/app/_components/sections/banner/SystemComposedSlide.tsx \
        apps/web/test/sections/banner/full-bleed-slide.test.tsx \
        apps/web/test/sections/banner/system-composed-slide.test.tsx
git commit -m "fix(web): 배너 이미지 draggable=false 로 바탕화면 드래그 다운로드 차단"
```

---

## Task 2: Pointer Events 스와이프 (peek · 임계/속도 · 복귀 · 클릭억제)

**Files:**
- Modify: `apps/web/app/_components/sections/BannerCarouselClient.tsx` (전체 교체)
- Test: `apps/web/test/sections/banner/banner-carousel-client.test.tsx` (신규)

> jsdom 제약과 대응:
> - `getBoundingClientRect().width` 는 기본 0 → 각 드래그 테스트에서 viewport width 를 1000 으로 spy.
> - `event.timeStamp` 는 동기 fireEvent 간 간격이 불안정 → velocity 가 우연히 임계를 넘어 "복귀" 테스트를 깨뜨릴 수 있다. 그래서 pointerdown/up 이벤트에 `Object.defineProperty(event, 'timeStamp', ...)` 로 **시각을 명시 제어**해 거리 경로와 플릭(속도) 경로를 **둘 다 결정적으로** 검증한다.
> - peek transform·복귀 애니메이션의 시각 결과는 jsdom 에서 검증 불가 → 테스트는 **commit 으로 인한 activeIndex 변화(페이저 텍스트)** 와 **클릭 억제** 만 단언. 손맛(peek·복귀 부드러움)은 Task 3 시각 QA.

- [ ] **Step 1: Write the failing test file**

Create `apps/web/test/sections/banner/banner-carousel-client.test.tsx`:

```tsx
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { BannerCarouselClient } from '../../../app/_components/sections/BannerCarouselClient';
import {
  FALLBACK_BANNERS,
  fallbackBannerToSlide,
  type CarouselSlide,
} from '../../../app/_lib/promotion';

function makeSlides(count: number): CarouselSlide[] {
  return FALLBACK_BANNERS.slice(0, count).map(fallbackBannerToSlide);
}

/** jsdom 의 getBoundingClientRect 는 0 을 반환하므로 뷰포트 너비를 고정한다. */
function mockViewportWidth(width = 1000) {
  const viewport = screen.getByTestId('banner-carousel-viewport');
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
    width,
    height: 100,
    top: 0,
    left: 0,
    right: width,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  return viewport;
}

/**
 * 포인터 이벤트를 발사하되 timeStamp 를 명시 제어한다.
 * jsdom 의 자동 timeStamp 는 불안정해 velocity 판정이 흔들리므로, down/up 의 시각을 고정해
 * 거리 경로와 플릭 경로를 결정적으로 테스트한다.
 */
function dispatchPointer(target: HTMLElement, event: Event, timeStamp?: number) {
  if (timeStamp !== undefined) {
    Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  }
  fireEvent(target, event);
}

describe('BannerCarouselClient — 포인터 스와이프', () => {
  it('거리 임계를 넘게 좌로 드래그하면 다음 배너로 넘어간다(거리 경로)', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    const viewport = mockViewportWidth();

    // dt 2000ms → velocity 0.2px/ms (<0.5) 이므로 순수 거리(|−400| ≥ 300) 로 커밋.
    dispatchPointer(viewport, createEvent.pointerDown(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 1000);
    dispatchPointer(viewport, createEvent.pointerMove(viewport, { pointerId: 1, clientX: -400, clientY: 0 }));
    dispatchPointer(viewport, createEvent.pointerUp(viewport, { pointerId: 1, clientX: -400, clientY: 0 }), 3000);

    expect(screen.getByTestId('banner-pager')).toHaveTextContent('02 / 04');
  });

  it('거리 임계를 넘게 우로 드래그하면 이전 배너로 넘어간다(무한 루프: 첫→마지막)', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    const viewport = mockViewportWidth();

    dispatchPointer(viewport, createEvent.pointerDown(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 1000);
    dispatchPointer(viewport, createEvent.pointerMove(viewport, { pointerId: 1, clientX: 400, clientY: 0 }));
    dispatchPointer(viewport, createEvent.pointerUp(viewport, { pointerId: 1, clientX: 400, clientY: 0 }), 3000);

    expect(screen.getByTestId('banner-pager')).toHaveTextContent('04 / 04');
  });

  it('짧지만 빠른 플릭은 거리 미달이어도 다음 배너로 넘어간다(속도 경로)', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    const viewport = mockViewportWidth();

    // |−50| < 300(거리 미달) 이지만 dt 20ms → velocity 2.5px/ms (≥0.5) 이므로 플릭으로 커밋.
    dispatchPointer(viewport, createEvent.pointerDown(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 1000);
    dispatchPointer(viewport, createEvent.pointerMove(viewport, { pointerId: 1, clientX: -50, clientY: 0 }));
    dispatchPointer(viewport, createEvent.pointerUp(viewport, { pointerId: 1, clientX: -50, clientY: 0 }), 1020);

    expect(screen.getByTestId('banner-pager')).toHaveTextContent('02 / 04');
  });

  it('거리·속도 모두 미달인 드래그는 전환 없이 현재 배너를 유지한다(복귀)', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    const viewport = mockViewportWidth();

    // |−10| < 300 이고 dt 2000ms → velocity 0.005 (<0.5) → 복귀.
    dispatchPointer(viewport, createEvent.pointerDown(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 1000);
    dispatchPointer(viewport, createEvent.pointerMove(viewport, { pointerId: 1, clientX: -10, clientY: 0 }));
    dispatchPointer(viewport, createEvent.pointerUp(viewport, { pointerId: 1, clientX: -10, clientY: 0 }), 3000);

    expect(screen.getByTestId('banner-pager')).toHaveTextContent('01 / 04');
  });

  it('세로 우세 제스처는 전환을 일으키지 않는다(스크롤 양보)', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    const viewport = mockViewportWidth();

    dispatchPointer(viewport, createEvent.pointerDown(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 1000);
    dispatchPointer(viewport, createEvent.pointerMove(viewport, { pointerId: 1, clientX: 0, clientY: -200 }));
    dispatchPointer(viewport, createEvent.pointerUp(viewport, { pointerId: 1, clientX: 0, clientY: -200 }), 3000);

    expect(screen.getByTestId('banner-pager')).toHaveTextContent('01 / 04');
  });

  it('드래그 후 발생한 클릭은 억제된다(링크 이동 방지)', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    const viewport = mockViewportWidth();

    dispatchPointer(viewport, createEvent.pointerDown(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 1000);
    dispatchPointer(viewport, createEvent.pointerMove(viewport, { pointerId: 1, clientX: -400, clientY: 0 }));
    dispatchPointer(viewport, createEvent.pointerUp(viewport, { pointerId: 1, clientX: -400, clientY: 0 }), 3000);

    const clickEvent = createEvent.click(viewport);
    fireEvent(viewport, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
  });

  it('단순 탭(드래그 아님)의 클릭은 억제되지 않는다', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    const viewport = mockViewportWidth();

    dispatchPointer(viewport, createEvent.pointerDown(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 1000);
    dispatchPointer(viewport, createEvent.pointerUp(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 1100);

    const clickEvent = createEvent.click(viewport);
    fireEvent(viewport, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(false);
  });

  it('슬라이드가 1장이면 드래그를 무시한다', () => {
    render(<BannerCarouselClient slides={makeSlides(1)} />);
    const viewport = mockViewportWidth();

    dispatchPointer(viewport, createEvent.pointerDown(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 1000);
    dispatchPointer(viewport, createEvent.pointerMove(viewport, { pointerId: 1, clientX: -400, clientY: 0 }));
    dispatchPointer(viewport, createEvent.pointerUp(viewport, { pointerId: 1, clientX: -400, clientY: 0 }), 3000);

    expect(screen.getByTestId('banner-pager')).toHaveTextContent('01 / 01');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @duing/web test -- --run test/sections/banner/banner-carousel-client.test.tsx`
Expected: FAIL — `getByTestId('banner-carousel-viewport')`/`banner-pager` 없음, 포인터 핸들러 없음 → 커밋 케이스에서 페이저가 안 바뀜.

- [ ] **Step 3: Replace `BannerCarouselClient.tsx` with the Pointer Events implementation**

`apps/web/app/_components/sections/BannerCarouselClient.tsx` 전체를 다음으로 교체:

```tsx
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
    containerRef.current?.setPointerCapture?.(event.pointerId);
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
      if (lockedRef.current === 'horizontal') setIsDragging(true);
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
      releasePointer();
      pointerStartRef.current = null;
      lockedRef.current = 'none';
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
    if (lockedRef.current === 'horizontal') {
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @duing/web test -- --run test/sections/banner/banner-carousel-client.test.tsx`
Expected: PASS (8개 케이스 green — 거리/플릭/복귀/세로/클릭억제·비억제/1장).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @duing/web typecheck`
Expected: 통과(에러 0). `ReactPointerEvent`/`ReactMouseEvent` 타입, `DOMMatrixReadOnly` 사용에 타입 에러 없음 확인.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/_components/sections/BannerCarouselClient.tsx \
        apps/web/test/sections/banner/banner-carousel-client.test.tsx
git commit -m "feat(web): 메인 배너 Pointer Events 스와이프(peek·임계/속도·복귀) 추가"
```

---

## Task 3: 시각 QA + 감각 상수 튜닝 (수동)

**Files:**
- (조정 시) Modify: `apps/web/app/_components/sections/BannerCarouselClient.tsx` 의 `DRAG_DAMPING`/`COMMIT_RATIO`/`FLICK_VELOCITY`

- [ ] **Step 1: dev 서버 기동**

Run: `pnpm --filter @duing/web dev` (→ http://localhost:3000)

- [ ] **Step 2: PC / 태블릿 / 모바일 배율에서 점검 (브라우저 반응형 + 실제 터치)**

체크리스트:
1. **이미지 드래그 다운로드 미발생** — 커버 이미지(FULL_BLEED) 배너를 마우스로 바탕화면 방향으로 끌어도 PNG 가 저장되지 않는다.
2. **마우스 드래그 스와이프** — PC 에서 좌/우로 끌면 다음/이전 배너로 넘어가고, peek(현재 배너가 ~25% 따라옴)·복귀가 자연스럽다.
3. **터치 스와이프 + flick** — 모바일/태블릿(또는 기기 에뮬레이션)에서 느린 드래그와 빠른 플릭 모두 전환된다.
4. **세로 스크롤 보존** — 배너 위에서 세로로 끌면 페이지가 정상 스크롤된다(가로만 가로채야 함).
5. **클릭 이동 정상** — 드래그 아닌 단순 클릭은 배너 링크로 이동한다.
6. **오토플레이 재개** — 드래그를 끝낸 직후가 아니라 복귀/전환 애니메이션이 끝난 뒤 자동재생이 재개된다.
7. **커밋 직후 점프 없음** — 손 떼는 순간 끌던 방향으로 매끄럽게 이어진다(역방향 튐 없음).

- [ ] **Step 3: 필요 시 상수 미세조정**

손맛이 과하거나(너무 쉽게 넘어감) 둔하면 `DRAG_DAMPING`(피드백 양), `COMMIT_RATIO`(거리 임계), `FLICK_VELOCITY`(플릭 민감도)를 조정하고 Step 2 재확인.

- [ ] **Step 4: dev 서버 종료**

QA 종료 후 dev 서버 프로세스를 종료한다(백그라운드 잔류 금지).

- [ ] **Step 5: (상수 조정했다면) Commit**

```bash
git add apps/web/app/_components/sections/BannerCarouselClient.tsx
git commit -m "chore(web): 배너 스와이프 감각 상수 QA 조정"
```

---

## Task 4: 전체 검증 + 리뷰 디스패치

- [ ] **Step 1: 배너 관련 테스트 전체 통과 확인**

Run: `pnpm --filter @duing/web test -- --run test/sections/banner`
Expected: 슬라이드 3종 + 캐러셀 클라이언트 전부 PASS.

- [ ] **Step 2: 워크스페이스 전체 lint / typecheck / test**

Run (cwd `frontend/`):
```bash
pnpm --filter @duing/web lint
pnpm --filter @duing/web typecheck
pnpm --filter @duing/web test -- --run
```
Expected: 모두 통과. 출력에서 실패 0 확인(`| tail` 등으로 exit code 가리지 말 것).

- [ ] **Step 3: 빌드 스모크 (선택, 변경이 표현 계층이라 권장)**

Run: `pnpm --filter @duing/web build`
Expected: BUILD 성공 메시지 확인.

- [ ] **Step 4: 코드 리뷰 디스패치**

FE 표현(상호작용) 단독 변경 → 기본 리뷰 라인: `duing-code-reviewer` + `codex:review`. 리뷰 중점(스펙 "리뷰 강도"): 포인터 핸들러가 링크/버튼 기본동작·페이지 스크롤을 부당히 가로채지 않을 것, 터치+포인터 이중 발화 없을 것, settle/transition 타이머·포인터캡처가 언마운트/중단 시 누수 없이 정리될 것. (권한·상태전이·동시성·Migration·API contract 해당 없음 → adversarial-review 불요.)

- [ ] **Step 5: 리뷰 반영 후 PR 준비**

PR 본문(🚀 작업 내용 / 🤔 고민했던 내용 / 💬 리뷰 중점사항)은 자연스러운 문장으로. **PR 생성·머지는 사용자 지시 후에만.**

---

## Self-Review (계획 작성자 체크)

**Spec coverage:**
- 이미지 드래그 차단(4 imgs) → Task 1 ✓
- Pointer Events 통일/이중발화 차단 → Task 2 (handlers, 터치 제거) ✓
- 방향 의도 락(스크롤 양보) → `handlePointerMove` lock 분기 + 테스트 ✓
- Pointer Capture(set/release 가드) → `handlePointerDown`/`releasePointer` ✓
- 너비 고정 → `containerWidthRef` (pointerdown 시 측정) ✓
- peek(댐핑) → `handlePointerMove` `dragBaseRef + deltaX*DAMPING`, track transform ✓
- 거리/속도 판정 → `handlePointerUp` commit 식 ✓
- 커밋=기존 키프레임 + track 동기 복귀(점프 제거) → `settleAfterDrag` + track style ✓
- 복귀 transform 250ms ease-out(한정) → track `transition` ✓
- 클릭 억제 → `handleClickCapture` + 테스트 ✓
- 오토플레이 재개 지연 → autoplay effect `isDragging||isSettling` 가드 ✓
- re-grab 점프 없음 → `readTranslateX` 시드 + `dragBaseRef` ✓
- will-change → track style ✓
- pointercancel 전체 정리 → `handlePointerCancel` ✓
- 테스트(신규 캐러셀 + draggable 단언) → Task 1·2 ✓
- 시각 QA/상수 튜닝 → Task 3 ✓

**Placeholder scan:** TODO/TBD/"적절히 처리" 없음. 모든 코드 블록은 실제 동작 코드. ✓

**Type consistency:** `settleAfterDrag(shouldCommit, deltaX)`, `releasePointer()`, `readTranslateX(element)`, `LockAxis`, ref 이름(`pointerIdRef`/`pointerStartRef`/`containerWidthRef`/`lockedRef`/`didDragRef`/`dragBaseRef`/`trackRef`/`settleTimerRef`) 이 정의·사용 전반에서 일치. 테스트의 `banner-carousel-viewport`/`banner-pager` testid 가 컴포넌트와 일치. ✓
