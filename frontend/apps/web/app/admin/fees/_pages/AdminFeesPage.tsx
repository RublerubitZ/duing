'use client';

import { useEffect, useState } from 'react';

import { useSearchParams } from 'next/navigation';

import { useAdminFeeClubsQuery } from '@duing/hooks';
import type { AdminFeeClubSort, AdminFeeUsageFilter } from '@duing/types';

import { toRoute } from '@/app/_lib/route';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { Pagination } from '@/components/Pagination';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { ConsoleCard } from '../../_components/ConsoleCard';
import { ErrorState } from '../../_components/ErrorState';
import { useDebouncedValue } from '../../_hooks/useDebouncedValue';
import { FeeClubsTable } from '../_components/FeeClubsTable';
import { FeeDashboardStrip } from '../_components/FeeDashboardStrip';
import { FeeFilterChips } from '../_components/FeeFilterChips';
import { FeePeriodSelect } from '../_components/FeePeriodSelect';
import {
  DEFAULT_FEE_CLUB_SORT,
  buildFeesQuery,
  readFeesQuery,
  resolvePeriodParams,
  type FeesQueryState,
} from '../_lib/feePeriod';

const PAGE_SIZE = 20;

const USAGE_OPTIONS: { label: string; value?: AdminFeeUsageFilter }[] = [
  { label: '전체', value: undefined },
  { label: '회비 사용', value: 'USING' },
  { label: '미사용', value: 'NOT_USING' },
];

const SORT_OPTIONS: { label: string; value: AdminFeeClubSort }[] = [
  { label: '미수금 많은순', value: 'OUTSTANDING' },
  { label: '청구액 많은순', value: 'BILLED' },
  { label: '수납액 많은순', value: 'COLLECTED' },
  { label: '최근 납부순', value: 'RECENT_PAYMENT' },
  { label: '이름순', value: 'NAME' },
];

const inputCls =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function AdminFeesPage() {
  // 검색어만 컴포넌트 상태다 — 동아리명이 주소에 실리면 방문 기록·referrer·페이지뷰 이벤트로 새어나간다.
  // 기간·사용 여부·정렬·페이지는 공유하고 되돌아올 수 있어야 하므로 주소에 남긴다.
  const [input, setInput] = useState('');
  const router = useGuardedRouter();
  const searchParams = useSearchParams();
  const query = readFeesQuery(searchParams);
  const periodParams = resolvePeriodParams(query.period);

  const debouncedQuery = useDebouncedValue(input.trim(), 300);
  const clubsQuery = useAdminFeeClubsQuery({
    ...periodParams,
    q: debouncedQuery || undefined,
    usage: query.usage,
    sort: query.sort,
    page: query.page,
    size: PAGE_SIZE,
  });

  const clubs = clubsQuery.data?.content ?? [];
  const totalPages = clubsQuery.data?.totalPages ?? 0;

  /**
   * 조건을 바꾸면 첫 페이지로 돌아간다 — 3페이지를 물고 조건을 바꾸면 대개 빈 목록이 나온다.
   * replace 라 필터를 만질 때마다 뒤로가기 기록이 쌓이지 않는다.
   */
  const syncQuery = (next: Partial<FeesQueryState>) => {
    const merged: FeesQueryState = { ...query, page: 0, ...next };
    router.replace(toRoute(`/admin/fees${buildFeesQuery(merged)}`), { scroll: false });
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    if (query.page !== 0) syncQuery({});
  };

  // 목록이 줄어 지금 페이지가 사라지면 첫 페이지로 되돌린다 — 페이지가 주소에 남아 새로고침으로도 안 풀린다.
  useEffect(() => {
    if (!clubsQuery.isSuccess) return;
    if (totalPages > 0 && query.page > totalPages - 1) syncQuery({});
    // syncQuery 는 매 렌더 새 함수라 의존성에 넣으면 매 렌더 실행된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubsQuery.isSuccess, totalPages, query.page]);

  return (
    <main className="max-w-layout mx-auto px-4 py-10 sm:px-6 md:px-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-ink">회비 감사</h1>
          <p className="mt-1 text-[13.5px] text-charcoal-2">
            전 동아리의 회비 운영 현황을 조회합니다. 이 콘솔에서는 회비 데이터를 바꿀 수 없습니다.
          </p>
        </div>
        <FeePeriodSelect value={query.period} onChange={(period) => syncQuery({ period })} />
      </header>

      <FeeDashboardStrip period={periodParams} />

      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            aria-label="동아리 검색"
            value={input}
            onChange={(event) => handleInputChange(event.target.value)}
            placeholder="동아리명으로 검색"
            className={inputCls}
          />
          <label className="flex shrink-0 items-center gap-2 text-[12.5px] text-charcoal-2">
            <span>정렬</span>
            <select
              aria-label="정렬"
              value={query.sort}
              onChange={(event) => syncQuery({ sort: toSort(event.target.value) })}
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

        <FeeFilterChips
          ariaLabel="회비 사용 여부 필터"
          options={USAGE_OPTIONS}
          value={query.usage}
          onChange={(usage) => syncQuery({ usage })}
        />
      </div>

      {clubsQuery.isLoading && (
        <ListRowsSkeleton rows={5} rowClassName="h-12 rounded-md" label="동아리 회비 조회 중" />
      )}

      {clubsQuery.isError && (
        <ConsoleCard>
          <ErrorState
            message="동아리 회비 현황을 불러오지 못했어요."
            onRetry={() => void clubsQuery.refetch()}
          />
        </ConsoleCard>
      )}

      {clubsQuery.isSuccess && (
        <ConsoleCard>
          <FeeClubsTable
            items={clubs}
            onOpenDetail={(club) => router.push(toRoute(`/admin/fees/${club.clubId}`))}
          />
          <Pagination
            page={query.page}
            totalPages={totalPages}
            onChange={(page) => syncQuery({ page })}
            ariaLabel="동아리 회비 목록 페이지"
            totalElements={clubsQuery.data?.totalElements}
            pageSize={PAGE_SIZE}
            className="py-3"
          />
        </ConsoleCard>
      )}
    </main>
  );
}

/** select 는 문자열만 돌려주므로 알려진 정렬 키인지 확인하고 좁힌다(`as` 단언 금지). */
function toSort(value: string): AdminFeeClubSort {
  const matched = SORT_OPTIONS.find((option) => option.value === value);
  return matched ? matched.value : DEFAULT_FEE_CLUB_SORT;
}
