'use client';

import { useState } from 'react';

import { useAdminRecruitmentsQuery } from '@duing/hooks';
import type { AdminRecruitmentSort, ApplicationMode, RecruitmentStatus } from '@duing/types';

import { toRoute } from '@/app/_lib/route';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { ConsoleCard } from '../../_components/ConsoleCard';
import { ErrorState } from '../../_components/ErrorState';
import { useDebouncedValue } from '../../_hooks/useDebouncedValue';
import { AdminRecruitmentsTable } from '../_components/AdminRecruitmentsTable';

const STATUS_OPTIONS: { label: string; value?: RecruitmentStatus }[] = [
  { label: '전체 상태', value: undefined },
  { label: '모집중', value: 'OPEN' },
  { label: '마감', value: 'CLOSED' },
];

const MODE_OPTIONS: { label: string; value?: ApplicationMode }[] = [
  { label: '전체 방식', value: undefined },
  { label: '자체 지원', value: 'SELF' },
  { label: '외부 폼', value: 'EXTERNAL' },
];

const SORT_OPTIONS: { label: string; value: AdminRecruitmentSort }[] = [
  { label: '최근 수정순', value: 'LATEST' },
  { label: '지원자 많은순', value: 'APPLICANTS' },
  { label: '마감 임박순', value: 'DEADLINE' },
];

const inputCls =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function AdminRecruitmentsPage() {
  // 검색어·필터는 전부 컴포넌트 상태다 — 동아리명이 주소에 실리면 방문 기록·referrer 로 새어나간다.
  const [input, setInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<RecruitmentStatus | undefined>(undefined);
  const [modeFilter, setModeFilter] = useState<ApplicationMode | undefined>(undefined);
  const [sort, setSort] = useState<AdminRecruitmentSort>('LATEST');
  const router = useGuardedRouter();

  const debouncedQuery = useDebouncedValue(input.trim(), 300);
  const recruitmentsQuery = useAdminRecruitmentsQuery({
    q: debouncedQuery || undefined,
    status: statusFilter,
    mode: modeFilter,
    sort,
  });

  const recruitments = recruitmentsQuery.data ?? [];

  return (
    <main className="max-w-layout mx-auto px-4 py-10 sm:px-6 md:px-10">
      <header className="mb-6">
        <h1 className="text-[22px] font-bold text-ink">모집 관리</h1>
        <p className="mt-1 text-[13.5px] text-charcoal-2">
          전 동아리의 모집 현황을 한 자리에서 보고, 방치된 모집을 강제로 마감합니다.
        </p>
      </header>

      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            aria-label="모집 검색"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="동아리명 또는 모집 제목으로 검색"
            className={inputCls}
          />
          <label className="flex shrink-0 items-center gap-2 text-[12.5px] text-charcoal-2">
            <span>정렬</span>
            <select
              aria-label="정렬"
              value={sort}
              onChange={(event) => setSort(toSort(event.target.value))}
              className="rounded-md border border-line bg-paper px-2.5 py-2 text-[12.5px] text-charcoal focus-visible:border-ink focus-visible:outline-none"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <FilterChips
            ariaLabel="모집 상태 필터"
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <FilterChips
            ariaLabel="지원 방식 필터"
            options={MODE_OPTIONS}
            value={modeFilter}
            onChange={setModeFilter}
          />
        </div>
      </div>

      {recruitmentsQuery.isLoading && (
        <ListRowsSkeleton rows={5} rowClassName="h-12 rounded-md" label="모집 조회 중" />
      )}

      {recruitmentsQuery.isError && (
        <ConsoleCard>
          <ErrorState
            message="모집을 불러오지 못했어요."
            onRetry={() => void recruitmentsQuery.refetch()}
          />
        </ConsoleCard>
      )}

      {recruitmentsQuery.isSuccess && (
        <ConsoleCard>
          <AdminRecruitmentsTable
            items={recruitments}
            onOpenDetail={(recruitment) =>
              router.push(toRoute(`/admin/recruitments/${recruitment.recruitmentId}`))
            }
          />
        </ConsoleCard>
      )}
    </main>
  );
}

/** select 는 문자열만 돌려주므로 알려진 정렬 키인지 확인하고 좁힌다(`as` 단언 금지). */
function toSort(value: string): AdminRecruitmentSort {
  const matched = SORT_OPTIONS.find((option) => option.value === value);
  return matched ? matched.value : 'LATEST';
}

function FilterChips<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: { label: string; value?: T }[];
  value?: T;
  onChange: (next?: T) => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors ${
              selected
                ? 'border-ink bg-ink text-paper'
                : 'border-line bg-paper text-charcoal-2 hover:bg-graysoft'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
