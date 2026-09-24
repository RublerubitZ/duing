'use client';

import { useEffect, useRef } from 'react';

import { cn } from '@/app/_lib/cn';

type Section = {
  id: string;
  label: string;
  /** 모바일 1줄용 짧은 라벨. 없으면 label 을 양쪽에 쓴다. */
  shortLabel?: string;
  count?: number;
  badge?: boolean;
};

type Props = {
  sections: Section[];
  active: string;
  onSelect: (id: string) => void;
};

export function MyPageTabs({ sections, active, onSelect }: Props) {
  const activeButtonRef = useRef<HTMLButtonElement>(null);

  // 320px 처럼 5개가 행을 넘치는 폭에서는 스크롤 동기화로 바뀐 활성 탭이 행 밖에 숨을 수 있다 —
  // 가로만 당긴다(scrollIntoView 는 바깥 세로 스크롤러까지 건드릴 수 있어 쓰지 않는다).
  useEffect(() => {
    const button = activeButtonRef.current;
    const row = button?.parentElement;
    if (!button || !row) return;
    const EDGE = 16;
    const left = button.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft) row.scrollLeft = left - EDGE;
    else if (left + button.offsetWidth > row.scrollLeft + row.clientWidth)
      row.scrollLeft = left + button.offsetWidth - row.clientWidth + EDGE;
  }, [active]);

  return (
    <div data-mypage-tabs className="sticky top-0 z-[5] bg-cream">
      {/* 모바일은 짧은 라벨·인라인 카운트로 5개를 한 줄에 넣는다(wrap 금지, 320px 보호용 overflow-x). PC 는 원래 wrap 행. */}
      <div className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 flex gap-5 sm:gap-6 overflow-x-auto sm:overflow-visible sm:flex-wrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((section) => {
          const isActive = section.id === active;
          const hasShortLabel = section.shortLabel != null && section.shortLabel !== section.label;
          return (
            <button
              key={section.id}
              ref={isActive ? activeButtonRef : undefined}
              type="button"
              onClick={() => onSelect(section.id)}
              className={cn(
                // border-none 은 border-style:none 이라 아래 border-b-[2.5px] 의 두께가 사용값 0 으로
                // 눌려 활성 탭 밑줄이 아예 그려지지 않았다. 버튼 기본 테두리는 border-0 으로 지우고
                // 밑줄만 명시적으로 solid 로 되살린다(비활성도 같은 두께의 투명 선이라 전환 시 안 밀린다).
                'flex shrink-0 items-center gap-1.5 sm:gap-2 py-3 sm:py-4 bg-transparent border-0 border-b-[2.5px] border-solid text-[14px] sm:text-[15px] font-semibold whitespace-nowrap cursor-pointer transition-colors duration-150',
                // 모바일 행은 overflow-x-auto 라 바깥쪽 포커스 링이 위아래로 잘린다 → 안쪽으로 그린다.
                'max-sm:focus-visible:outline-offset-[-2px]',
                isActive
                  ? 'text-ink border-ink'
                  : 'text-charcoal-3 border-transparent hover:text-charcoal',
              )}
            >
              {hasShortLabel ? (
                <>
                  <span className="sm:hidden">{section.shortLabel}</span>
                  <span className="hidden sm:inline">{section.label}</span>
                </>
              ) : (
                section.label
              )}
              {section.count != null && (
                <span
                  className={cn(
                    'font-bold tabular-nums transition-colors duration-150',
                    'text-[12px] sm:text-[11px] sm:px-2 sm:py-0.5 sm:rounded-full',
                    isActive
                      ? 'text-ink sm:bg-ink sm:text-paper'
                      : 'text-charcoal-3 sm:bg-graysoft',
                  )}
                >
                  {section.count}
                </span>
              )}
              {section.badge && (
                <span className="w-1.5 h-1.5 rounded-full bg-coral -ml-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
