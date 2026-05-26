'use client';

type ActiveFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

type Props = {
  activeFilter: ActiveFilter;
  onActiveFilterChange: (next: ActiveFilter) => void;
};

const ACTIVE_OPTIONS: { value: ActiveFilter; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'ACTIVE', label: '활성' },
  { value: 'INACTIVE', label: '비활성' },
];

function isActiveFilter(value: string): value is ActiveFilter {
  return value === 'ALL' || value === 'ACTIVE' || value === 'INACTIVE';
}

export function AdminPromotionsFilterBar({ activeFilter, onActiveFilterChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={activeFilter}
        onChange={(event) => {
          const next = event.target.value;
          if (isActiveFilter(next)) onActiveFilterChange(next);
        }}
        className="px-3 py-1.5 rounded-md border border-line bg-paper text-[13px]"
      >
        {ACTIVE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
