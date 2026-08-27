'use client';

import { useCallback, useRef, useState } from 'react';

import { cn } from '@/app/_lib/cn';

import type { HeroToast } from './hero-activity';

/**
 * 히어로 우측 활동 토스트 — 한 번에 하나만 보이고 옆으로 밀어 나머지를 본다.
 *
 * <p>드래그를 직접 구현하지 않고 네이티브 스크롤 스냅에 맡긴다. 포인터 이벤트로 만들면 이 레포가
 * 배너 캐러셀에서 이미 겪은 두 함정(앵커·이미지의 네이티브 dragstart 가 스와이프를 끊는 것,
 * pointerdown 캡처가 자식 버튼 클릭을 가로채는 것)을 여기서 다시 만나게 된다.
 * 스크롤 스냅은 관성·트랙패드·스크롤바를 브라우저가 알아서 처리한다.
 */
export function HeroActivityToasts({ toasts }: { toasts: HeroToast[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.clientWidth === 0) return;
    const nearest = Math.round(scroller.scrollLeft / scroller.clientWidth);
    setActiveIndex(Math.min(Math.max(nearest, 0), toasts.length - 1));
  }, [toasts.length]);

  const scrollToIndex = useCallback((index: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    // behavior 를 넘기지 않아 컨테이너의 scroll-behavior 를 따른다 — motion-reduce 가 그대로 먹는다.
    scroller.scrollTo({ left: index * scroller.clientWidth });
  }, []);

  return (
    <div className="w-[182px] lg:w-[230px]">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        role="group"
        aria-label="최근 동아리 활동"
        // -my-6 py-6: 가로 스크롤 컨테이너는 세로도 함께 잘라서, 여유가 0 이면 카드의 그림자가
        // 라운드 경계에서 직각으로 잘려 사각 테두리처럼 보인다. 안쪽 여백으로 그림자 자리를
        // 만들고 같은 크기의 음수 마진으로 되돌려, 레이아웃 위치는 그대로 두면서 클리핑만 피한다.
        className="-my-6 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth py-6 [-ms-overflow-style:none] [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
      >
        {toasts.map((toast, index) => (
          <div
            key={`${toast.clubName}-${toast.message}-${index}`}
            className="w-full shrink-0 snap-center"
          >
            <HeroActivityToast {...toast} />
          </div>
        ))}
      </div>

      {toasts.length > 1 && (
        <div className="mt-2.5 flex justify-center">
          {toasts.map((toast, index) => (
            <button
              key={`${toast.clubName}-${toast.message}-${index}`}
              type="button"
              onClick={() => scrollToIndex(index)}
              aria-label={`${index + 1}번째 활동 보기`}
              aria-current={index === activeIndex ? 'true' : undefined}
              // 점 자체는 8px 이지만 누르는 면은 24px 로 넓혀 둔다(WCAG 2.5.8 최소 크기).
              className="grid h-6 w-6 place-items-center"
            >
              <span
                aria-hidden
                className={cn(
                  'h-2 w-2 rounded-full transition-colors duration-250',
                  index === activeIndex ? 'bg-ink-deep' : 'bg-ink-deep/25',
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 활동 토스트 한 장. 폭은 캐러셀 슬라이드가 정하므로 여기서는 꽉 채운다. */
export function HeroActivityToast({ variant, clubName, message, timeAgo }: HeroToast) {
  const isDark = variant === 'dark';
  return (
    <div
      className={cn(
        'w-full rounded-md px-3 py-2 shadow-2 lg:px-4 lg:py-3',
        isDark ? 'bg-ink-deep text-cream' : 'border border-line bg-paper text-ink',
      )}
    >
      <div className="flex items-center gap-1.5 lg:gap-2">
        <span
          aria-hidden
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full lg:h-2 lg:w-2', isDark ? 'bg-warm' : 'bg-sage')}
        />
        <span className={cn('truncate text-[11.5px] font-semibold lg:text-[13px]', isDark ? 'text-cream' : 'text-ink')}>
          {clubName}
        </span>
        <span className={cn('ml-auto shrink-0 text-[10px] lg:text-[11px]', isDark ? 'text-cream/60' : 'text-charcoal-3')}>
          {timeAgo}
        </span>
      </div>
      <div
        className={cn(
          'mt-0.5 text-[11px] leading-snug lg:mt-1 lg:text-[12.5px]',
          isDark ? 'text-cream/85' : 'text-charcoal-2',
        )}
      >
        {message}
      </div>
    </div>
  );
}
