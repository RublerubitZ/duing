'use client';

import { cn } from '../../../_lib/cn';
import { STATUS_FILTER_LABEL, STATUS_FILTER_ORDER, type StatusFilter } from '../_lib/clubStatus';

type Props = {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
};

export function AdminClubStatusFilter({ value, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="동아리 상태 필터"
      className="border-line bg-paper inline-flex rounded-full border p-1"
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
  );
}
