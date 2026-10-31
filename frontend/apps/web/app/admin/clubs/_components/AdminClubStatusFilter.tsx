'use client';

import { cn } from '../../../_lib/cn';
import { STATUS_FILTER_LABEL, STATUS_FILTER_ORDER, type StatusFilter } from '../_lib/clubStatus';

type Props = {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
};

export function AdminClubStatusFilter({ value, onChange }: Props) {
  return (
    // 6탭 알약은 줄바꿈하면 테두리가 깨진다 — 좁은 폭(약 460px 미만)에서는 묶음째 가로로 스크롤한다.
    // 탭 묶음은 w-max 로 내용 폭을 지킨다(없으면 버튼이 줄어들어 글자가 두 줄로 접힌다).
    <div className="max-w-full overflow-x-auto">
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
