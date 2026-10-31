'use client';

import { useEffect, useRef } from 'react';

import { cn } from '../../../_lib/cn';
import { STATUS_FILTER_LABEL, STATUS_FILTER_ORDER, type StatusFilter } from '../_lib/clubStatus';

type Props = {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
};

export function AdminClubStatusFilter({ value, onChange }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  // 주소(?status=INACTIVE_PENDING)로 끝쪽 탭에 도착하면 좁은 폭에서 선택 탭이 감싸개 밖에 걸친다 — 처음 그릴 때만 당긴다.
  // 눌러서 바꾼 탭은 이미 보이고, 주소가 바뀌면 목록 페이지가 key 로 다시 마운트한다.
  // 가로만 당긴다(scrollIntoView 는 창 세로 스크롤까지 움직일 수 있어 쓰지 않는다 — MyPageTabs 와 같다).
  useEffect(() => {
    const scroller = scrollerRef.current;
    const activeTab = activeTabRef.current;
    if (!scroller || !activeTab) return;
    const EDGE = 16;
    const activeTabRight = activeTab.offsetLeft - scroller.offsetLeft + activeTab.offsetWidth;
    if (activeTabRight > scroller.clientWidth) scroller.scrollLeft = activeTabRight - scroller.clientWidth + EDGE;
  }, []);

  return (
    // 6탭 알약은 줄바꿈하면 테두리가 깨진다 — 좁은 폭(약 460px 미만)에서는 묶음째 가로로 스크롤한다.
    // 탭 묶음은 w-max 로 내용 폭을 지킨다(없으면 버튼이 줄어들어 글자가 두 줄로 접힌다).
    <div ref={scrollerRef} className="max-w-full overflow-x-auto">
      <div
        role="tablist"
        aria-label="동아리 상태 필터"
        className="border-line bg-paper inline-flex w-max rounded-full border p-1"
      >
        {STATUS_FILTER_ORDER.map((filter) => {
          const isActive = filter === value;
          return (
            <button
              key={filter}
              ref={isActive ? activeTabRef : undefined}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => onChange(filter)}
              className={cn(
                'rounded-full px-3.5 py-1 text-[12.5px] font-semibold transition-colors',
                isActive ? 'bg-ink text-white' : 'text-charcoal-3 hover:text-ink',
              )}
            >
              {STATUS_FILTER_LABEL[filter]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
