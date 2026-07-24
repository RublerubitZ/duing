'use client';

import { cn } from '@/app/_lib/cn';
import {
  FLAG_FILTER_DEFS,
  ROLE_FILTER_DEFS,
  type FlagFilterKey,
  type MemberFilters,
  type RoleFilterKey,
} from '../_lib/memberFilters';

type Props = {
  query: string;
  filters: MemberFilters;
  onQueryChange: (query: string) => void;
  onChange: (filters: MemberFilters) => void;
  useGeneration: boolean;
  // 존재하는 기수 목록(availableGenerations 결과). useGeneration=true 이고 비어있지 않을 때만 드롭다운 노출.
  generations: number[];
};

const CHIP_BASE = 'rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors';
const CHIP_ON = 'bg-ink border-ink text-paper';
const CHIP_OFF = 'bg-paper border-line text-charcoal-2 hover:border-sage hover:text-ink';

export function MemberFilterChips({
  query,
  filters,
  onQueryChange,
  onChange,
  useGeneration,
  generations,
}: Props) {
  const selectRole = (role: RoleFilterKey) => onChange({ ...filters, role });

  const toggleFlag = (flag: FlagFilterKey) => {
    const nextFlags = filters.flags.includes(flag)
      ? filters.flags.filter((key) => key !== flag)
      : [...filters.flags, flag];
    onChange({ ...filters, flags: nextFlags });
  };

  const selectGeneration = (generation: number | null) =>
    onChange({ ...filters, generation });

  return (
    <div className="space-y-3">
      <input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="이름·학과·학번으로 검색"
        aria-label="회원 검색"
        className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal placeholder:text-charcoal-3 focus:border-sage focus:outline-none sm:w-72"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {ROLE_FILTER_DEFS.map((def) => {
          const selected = filters.role === def.key;
          return (
            <button
              key={def.key}
              type="button"
              aria-pressed={selected}
              onClick={() => selectRole(def.key)}
              className={cn(CHIP_BASE, selected ? CHIP_ON : CHIP_OFF)}
            >
              {def.label}
            </button>
          );
        })}

        <span className="mx-1 h-4 w-px bg-line" aria-hidden />

        {FLAG_FILTER_DEFS.map((def) => {
          const selected = filters.flags.includes(def.key);
          return (
            <button
              key={def.key}
              type="button"
              aria-pressed={selected}
              onClick={() => toggleFlag(def.key)}
              className={cn(CHIP_BASE, selected ? CHIP_ON : CHIP_OFF)}
            >
              {def.label}
            </button>
          );
        })}

        {useGeneration && generations.length > 0 && (
          <select
            value={filters.generation ?? ''}
            onChange={(event) =>
              selectGeneration(event.target.value === '' ? null : Number(event.target.value))
            }
            aria-label="기수"
            className="rounded-full border border-line bg-paper px-3 py-1.5 text-[13px] font-medium text-charcoal-2"
          >
            <option value="">기수 전체</option>
            {generations.map((generation) => (
              <option key={generation} value={generation}>
                {generation}기
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
