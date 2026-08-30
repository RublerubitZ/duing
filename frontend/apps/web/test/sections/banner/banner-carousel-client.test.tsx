import { render, screen, fireEvent, createEvent, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('거리 임계를 넘게 좌로 드래그하면 다음 배너로 넘어간다(거리 경로)', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    const viewport = mockViewportWidth();

    // dt 2000ms → velocity 0.2px/ms (<0.5) 이므로 순수 거리(|−400| ≥ 300) 로 커밋.
    dispatchPointer(viewport, createEvent.pointerDown(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 1000);
    dispatchPointer(viewport, createEvent.pointerMove(viewport, { pointerId: 1, clientX: -400, clientY: 0 }));
    dispatchPointer(viewport, createEvent.pointerUp(viewport, { pointerId: 1, clientX: -400, clientY: 0 }), 3000);

    expect(screen.getByTestId('banner-pager')).toHaveTextContent('2 / 4');
  });

  it('거리 임계를 넘게 우로 드래그하면 이전 배너로 넘어간다(무한 루프: 첫→마지막)', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    const viewport = mockViewportWidth();

    dispatchPointer(viewport, createEvent.pointerDown(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 1000);
    dispatchPointer(viewport, createEvent.pointerMove(viewport, { pointerId: 1, clientX: 400, clientY: 0 }));
    dispatchPointer(viewport, createEvent.pointerUp(viewport, { pointerId: 1, clientX: 400, clientY: 0 }), 3000);

    expect(screen.getByTestId('banner-pager')).toHaveTextContent('4 / 4');
  });

  it('짧지만 빠른 플릭은 거리 미달이어도 다음 배너로 넘어간다(속도 경로)', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    const viewport = mockViewportWidth();

    // |−50| < 300(거리 미달) 이지만 dt 20ms → velocity 2.5px/ms (≥0.5) 이므로 플릭으로 커밋.
    dispatchPointer(viewport, createEvent.pointerDown(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 1000);
    dispatchPointer(viewport, createEvent.pointerMove(viewport, { pointerId: 1, clientX: -50, clientY: 0 }));
    dispatchPointer(viewport, createEvent.pointerUp(viewport, { pointerId: 1, clientX: -50, clientY: 0 }), 1020);

    expect(screen.getByTestId('banner-pager')).toHaveTextContent('2 / 4');
  });

  it('거리·속도 모두 미달인 드래그는 전환 없이 현재 배너를 유지한다(복귀)', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    const viewport = mockViewportWidth();

    // |−10| < 300 이고 dt 2000ms → velocity 0.005 (<0.5) → 복귀.
    dispatchPointer(viewport, createEvent.pointerDown(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 1000);
    dispatchPointer(viewport, createEvent.pointerMove(viewport, { pointerId: 1, clientX: -10, clientY: 0 }));
    dispatchPointer(viewport, createEvent.pointerUp(viewport, { pointerId: 1, clientX: -10, clientY: 0 }), 3000);

    expect(screen.getByTestId('banner-pager')).toHaveTextContent('1 / 4');
  });

  it('세로 우세 제스처는 전환을 일으키지 않는다(스크롤 양보)', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    const viewport = mockViewportWidth();

    dispatchPointer(viewport, createEvent.pointerDown(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 1000);
    dispatchPointer(viewport, createEvent.pointerMove(viewport, { pointerId: 1, clientX: 0, clientY: -200 }));
    dispatchPointer(viewport, createEvent.pointerUp(viewport, { pointerId: 1, clientX: 0, clientY: -200 }), 3000);

    expect(screen.getByTestId('banner-pager')).toHaveTextContent('1 / 4');
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

  it('슬라이드가 1장이면 드래그를 무시하고 컨트롤도 두지 않는다', () => {
    render(<BannerCarouselClient slides={makeSlides(1)} />);
    const viewport = mockViewportWidth();

    dispatchPointer(viewport, createEvent.pointerDown(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 1000);
    dispatchPointer(viewport, createEvent.pointerMove(viewport, { pointerId: 1, clientX: -400, clientY: 0 }));
    dispatchPointer(viewport, createEvent.pointerUp(viewport, { pointerId: 1, clientX: -400, clientY: 0 }), 3000);

    // 넘길 곳이 없으면 페이저·이전/다음을 그리지 않는다(시안의 컨트롤은 여러 장 전제).
    expect(screen.queryByTestId('banner-pager')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음 배너' })).not.toBeInTheDocument();
    // 배너 밖 자동 재생 토글도 마찬가지 — 넘어가지 않으니 멈출 것도 없다.
    expect(screen.queryByRole('button', { name: '자동재생 중' })).not.toBeInTheDocument();
    // 드래그가 무시됐으니 track 이 손가락을 따라가지 않는다(예전에는 페이저 값으로 확인했다).
    const track = viewport.firstElementChild as HTMLElement;
    expect(track.style.transform).toBe('translateX(0px)');
  });

  it('복귀 중 re-grab 후 탭으로 끝내도 track 이 0으로 복귀한다(어긋남 고정 방지)', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    const viewport = mockViewportWidth();
    const track = viewport.firstElementChild as HTMLElement;

    // readTranslateX 가 7 을 읽도록 DOMMatrixReadOnly 폴리필 + track 의 computed transform 스텁.
    class FakeMatrix {
      m41: number;
      constructor(transform: string) {
        const match = /translateX\(([-\d.]+)px\)/.exec(transform);
        this.m41 = match ? Number(match[1]) : 0;
      }
    }
    vi.stubGlobal('DOMMatrixReadOnly', FakeMatrix);
    const realGetComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) =>
      el === track
        ? ({ transform: 'translateX(7px)' } as unknown as CSSStyleDeclaration)
        : realGetComputedStyle(el, pseudo ?? undefined),
    );

    // 1) 임계 미만 수평 드래그 → 복귀(settle) 시작 (settleTimer 가동, dragOffset 0 으로 transition 중)
    dispatchPointer(viewport, createEvent.pointerDown(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 1000);
    dispatchPointer(viewport, createEvent.pointerMove(viewport, { pointerId: 1, clientX: -20, clientY: 0 }));
    dispatchPointer(viewport, createEvent.pointerUp(viewport, { pointerId: 1, clientX: -20, clientY: 0 }), 3000);

    // 2) 복귀 중 re-grab → readTranslateX 7 시드 → track translateX(7px)
    dispatchPointer(viewport, createEvent.pointerDown(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 3100);
    // 3) 수평 드래그 없이 탭으로 종료
    dispatchPointer(viewport, createEvent.pointerUp(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 3200);

    // track 이 0 으로 복귀해야 한다(7px 고정이면 버그).
    expect((viewport.firstElementChild as HTMLElement).style.transform).toBe('translateX(0px)');
  });

  it('네이티브 드래그(dragstart)를 막아 데스크탑 마우스 스와이프가 끊기지 않는다', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    const viewport = screen.getByTestId('banner-carousel-viewport');
    const dragEvent = createEvent.dragStart(viewport);
    fireEvent(viewport, dragEvent);
    expect(dragEvent.defaultPrevented).toBe(true);
  });

  // 포인터 캡처를 pointerdown 에 걸면, 컨테이너 내부 화살표 버튼을 '탭' 했을 때 click 이 캡처 대상(컨테이너)으로
  // 리다이렉트돼 버튼 onClick 이 안 불린다(실브라우저에서 확인). 캡처는 '가로 드래그가 잠긴 뒤'에만 걸어야 한다.
  it('단순 탭(드래그 아님)은 setPointerCapture 를 호출하지 않는다 — 내부 화살표 버튼 클릭을 가로채지 않도록', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    const viewport = screen.getByTestId('banner-carousel-viewport');
    const setPointerCapture = vi.fn();
    Object.assign(viewport, { setPointerCapture }); // jsdom 미구현 → 메서드 주입해 호출 시점 검증

    dispatchPointer(viewport, createEvent.pointerDown(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 1000);
    dispatchPointer(viewport, createEvent.pointerUp(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 1100);

    expect(setPointerCapture).not.toHaveBeenCalled();
  });

  it('가로 드래그가 잠길 때 비로소 setPointerCapture 를 호출한다', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    const viewport = screen.getByTestId('banner-carousel-viewport');
    const setPointerCapture = vi.fn();
    Object.assign(viewport, { setPointerCapture });

    dispatchPointer(viewport, createEvent.pointerDown(viewport, { pointerId: 1, clientX: 0, clientY: 0 }), 1000);
    expect(setPointerCapture).not.toHaveBeenCalled(); // 아직 탭 단계 — 캡처 안 함

    dispatchPointer(viewport, createEvent.pointerMove(viewport, { pointerId: 1, clientX: -40, clientY: 0 }));
    expect(setPointerCapture).toHaveBeenCalledTimes(1); // 가로 락 시 캡처
  });
});

describe('BannerCarouselClient — 오버레이 컨트롤', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('다음·이전 버튼이 배너를 순환 이동시킨다', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    expect(screen.getByTestId('banner-pager')).toHaveTextContent('1 / 4');

    fireEvent.click(screen.getByRole('button', { name: '다음 배너' }));
    expect(screen.getByTestId('banner-pager')).toHaveTextContent('2 / 4');

    fireEvent.click(screen.getByRole('button', { name: '이전 배너' }));
    expect(screen.getByTestId('banner-pager')).toHaveTextContent('1 / 4');

    // 첫 배너에서 이전 → 마지막으로 감긴다.
    fireEvent.click(screen.getByRole('button', { name: '이전 배너' }));
    expect(screen.getByTestId('banner-pager')).toHaveTextContent('4 / 4');
  });

  it('위치 표시를 눌러도 다음으로 넘어간다 — 화살표 없는 모바일의 단일 포인터 대안', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    const pager = screen.getByTestId('banner-pager');

    // 스와이프는 경로 제스처라 대안이 없으면 모바일에 이동 수단이 하나도 남지 않는다(WCAG 2.5.1).
    expect(pager.tagName).toBe('BUTTON');
    fireEvent.click(pager);
    expect(screen.getByTestId('banner-pager')).toHaveTextContent('2 / 4');
  });

  it('위치 표시의 접근 이름이 보이는 문구를 그대로 품는다', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    const pager = screen.getByTestId('banner-pager');

    // 이름이 보이는 글자를 포함하지 않으면 음성 조작 사용자가 부를 수 없다(WCAG 2.5.3).
    expect(pager).toHaveTextContent('1 / 4');
    expect(pager.getAttribute('aria-label')).toContain('1 / 4');
  });

  it('자동 재생 토글은 보이는 문구로만 상태를 알린다', () => {
    render(<BannerCarouselClient slides={makeSlides(4)} />);
    const toggle = screen.getByRole('button', { name: '자동재생 중' });

    // 이름이 상태를 따라 바뀌므로 aria-pressed 를 겹쳐 두지 않는다(APG) — 같은 사실을 두 번 말하게 된다.
    expect(toggle).not.toHaveAttribute('aria-pressed');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: '정지됨' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '자동재생 중' })).not.toBeInTheDocument();
  });

  it('자동 재생을 끄면 인터벌이 배너를 넘기지 않는다(WCAG 2.2.2)', () => {
    vi.useFakeTimers();
    try {
      render(<BannerCarouselClient slides={makeSlides(4)} />);
      fireEvent.click(screen.getByRole('button', { name: '자동재생 중' }));

      // 5초 간격이라 12초면 정지가 안 먹었을 때 3 / 4 가 된다 — 한 바퀴(20초) 를 쓰면
      // 정지 여부와 무관하게 1 / 4 로 돌아와 단언이 아무것도 못 잡는다.
      act(() => {
        vi.advanceTimersByTime(12_000);
      });
      expect(screen.getByTestId('banner-pager')).toHaveTextContent('1 / 4');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('BannerCarouselClient — 뷰포트 비율', () => {
  it('시안 비율을 쓴다 — 모바일 361:124, md 부터 1472:342 — 인라인 높이 없음', () => {
    render(<BannerCarouselClient slides={makeSlides(2)} />);
    const viewport = screen.getByTestId('banner-carousel-viewport');
    // 높이를 다시 vw 식으로 정하면 어느 시안과도 어긋나고 관리자 권장 규격(1472×342)과도 갈린다.
    expect(viewport).toHaveClass('aspect-[361/124]', 'md:aspect-[1472/342]');
    expect(viewport.style.height).toBe('');
  });
});
