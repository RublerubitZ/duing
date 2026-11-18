'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
// 배너의 이전·다음과 같은 꼬리 없는 캐럿 — 두잉 Icon 셋엔 꼬리 달린 화살표뿐이라 lucide 것을 쓴다.
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Props = {
  /** 섹션 제목(h2) — 모바일·PC 가 함께 쓴다. */
  heading: ReactNode;
  /** PC 가로 스크롤 줄에 놓일 카드들. */
  children: ReactNode;
};

// 카드 264(Categories.tsx CategoryCard 의 w-[264px]) + 간격 24(아래 gap-6). 한 번에 "화면에 다 들어오는 카드 수"만큼 넘긴다.
const CARD_STEP_PX = 288;

/**
 * 홈 카테고리 줄의 PC 가로 스크롤에 이전·다음 버튼을 붙인다.
 * 스크롤바가 평소에 안 보이고 다섯 번째 카드가 48px 만 걸쳐 보여, 휠 마우스로는 뒤쪽 카테고리에 닿기 어려웠다.
 * 스크롤 자체(터치패드·터치·Shift+휠)는 그대로 둔다 — 버튼은 같은 컨테이너를 밀기만 한다.
 */
export function CategoryRail({ heading, children }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  // 서버 HTML 과 첫 렌더가 같도록 상수로 시작하고, 실제 위치는 마운트 뒤에 읽는다.
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const sync = () => {
      setCanPrev(scroller.scrollLeft > 1);
      setCanNext(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1);
    };
    sync();
    scroller.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      scroller.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  const move = (direction: 1 | -1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const step = Math.max(CARD_STEP_PX, Math.floor(scroller.clientWidth / CARD_STEP_PX) * CARD_STEP_PX);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollBy({ left: direction * step, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  return (
    <>
      <div className="mb-6 flex items-center justify-between md:mb-10">
        {heading}
        {/* DESIGN.md 의 원형 아이콘 버튼 한 쌍 — 이전은 흰 면, 다음은 딥그린. 끝에 닿으면 꺼진다.
            disabled 가 아니라 aria-disabled — 1440 폭에서는 한 번 누르면 바로 끝이라, disabled 로 바꾸면
            키보드 포커스가 body 로 빠진다(WeekPicker 와 같은 이유). */}
        <div className="hidden shrink-0 items-center gap-3 md:flex">
          <button
            type="button"
            aria-label="이전 카테고리"
            aria-disabled={!canPrev || undefined}
            onClick={() => canPrev && move(-1)}
            className="btn grid h-9 w-9 place-items-center rounded-full bg-paper p-0 text-ink-deep shadow-1 ring-1 ring-ink/15 hover:bg-cream forced-colors:border aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-paper"
          >
            <ChevronLeft size={20} strokeWidth={2.25} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="다음 카테고리"
            aria-disabled={!canNext || undefined}
            onClick={() => canNext && move(1)}
            className="btn grid h-9 w-9 place-items-center rounded-full bg-ink-deep p-0 text-cream shadow-1 hover:bg-ink forced-colors:border aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-ink-deep"
          >
            <ChevronRight size={20} strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      </div>

      {/* 데스크탑: 가로 스크롤. 카테고리가 8종이라 한 화면에 4~5개만 보이고 나머지는 밀어서 본다. */}
      <div ref={scrollerRef} className="hidden overflow-x-auto pb-3 md:block">
        <div className="flex w-max gap-6">{children}</div>
      </div>
    </>
  );
}
