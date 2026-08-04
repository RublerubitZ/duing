'use client';

import { useState } from 'react';

import { useAdminApplicantsQuery } from '@duing/hooks';
import { APPLICATION_STATUSES } from '@duing/types';
import type { AdminApplicantSort, ApplicationStatus } from '@duing/types';

import { APPLICATION_STATUS_LABEL } from '@/app/_constants/application-status';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { ConsoleCard } from '../../_components/ConsoleCard';
import { EmptyState } from '../../_components/EmptyState';
import { ErrorState } from '../../_components/ErrorState';
import { useDebouncedValue } from '../../_hooks/useDebouncedValue';
import { AdminApplicantsTable } from './AdminApplicantsTable';
import { AdminApplicationSheet } from './AdminApplicationSheet';

const SUMMARY_HEADING_ID = 'admin-applicant-summary-heading';

// 상태 목록은 공용 enum 을 그대로 순회한다 — 상태 집합이 바뀌면 칩도 필터도 함께 따라온다.
const STATUS_FILTERS: { label: string; value?: ApplicationStatus }[] = [
  { label: '전체', value: undefined },
  ...APPLICATION_STATUSES.map((status) => ({
    label: APPLICATION_STATUS_LABEL[status],
    value: status,
  })),
];

const SORT_OPTIONS: { label: string; value: AdminApplicantSort }[] = [
  { label: '최신순', value: 'LATEST' },
  { label: '오래된순', value: 'OLDEST' },
];

/**
 * 자체 지원 모집의 지원자 패널. 총동연은 감독 주체라 열람만 하고 심사(상태 변경·일괄 처리)는 하지 않는다.
 *
 * <p>요약 칩은 서버가 준 모집 전체 기준 값이라 검색·필터를 좁혀도 변하지 않는다 — 표의 행 수와 다른
 * 숫자라는 사실이 헷갈리지 않도록 "전체 지원 현황"으로 이름 붙이고 그 사실을 문장으로도 적는다.
 */
export function AdminSelfRecruitmentPanel({ recruitmentId }: { recruitmentId: number }) {
  // 지원자 이름·학번이 주소에 실리면 방문 기록·referrer 로 새어나간다 — 검색어는 컴포넌트 상태로만 둔다.
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | undefined>(undefined);
  const [sort, setSort] = useState<AdminApplicantSort>('LATEST');
  const [openApplicationId, setOpenApplicationId] = useState<number | undefined>(undefined);

  const debouncedQuery = useDebouncedValue(searchInput.trim(), 300);
  const applicantsQuery = useAdminApplicantsQuery(recruitmentId, {
    q: debouncedQuery || undefined,
    status: statusFilter,
    sort,
  });

  const applicantList = applicantsQuery.data;

  return (
    <>
      {applicantsQuery.isLoading && (
        <ConsoleCard className="mt-5 p-6">
          <ListRowsSkeleton rows={5} rowClassName="h-12 rounded-md" label="지원자 조회 중" />
        </ConsoleCard>
      )}

      {!applicantsQuery.isLoading && !applicantList && (
        <ConsoleCard className="mt-5">
          <ErrorState
            message="지원자를 불러오지 못했어요."
            onRetry={() => void applicantsQuery.refetch()}
          />
        </ConsoleCard>
      )}

      {/* total 은 검색·필터와 무관한 모집 전체 값이라, 0 이면 어떤 조건으로도 볼 지원자가 없다는 뜻이다.
          이때는 검색 도구까지 감춘다 — 좁힐 대상이 없는 입력창은 쓸모 없는 선택지만 늘린다. */}
      {applicantList && applicantList.total === 0 && (
        <ConsoleCard className="mt-5">
          <EmptyState
            icon="🗂️"
            title="아직 지원자가 없습니다"
            body="지원서가 들어오면 이곳에서 확인할 수 있어요."
          />
        </ConsoleCard>
      )}

      {applicantList && applicantList.total > 0 && (
        <>
          <ConsoleCard className="mt-5 p-6">
            <section aria-labelledby={SUMMARY_HEADING_ID}>
              <h2 id={SUMMARY_HEADING_ID} className="text-[15.5px] font-bold text-ink-deep">
                전체 지원 현황
              </h2>
              <p className="mt-1 text-[12.5px] text-charcoal-2">
                아래 숫자는 검색·필터와 무관한 모집 전체 기준입니다.
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <SummaryChip label="총 지원자" count={applicantList.total} highlighted />
                {APPLICATION_STATUSES.map((status) => (
                  <SummaryChip
                    key={status}
                    label={APPLICATION_STATUS_LABEL[status]}
                    // 건수가 0 인 상태는 응답에 키 자체가 없다 — 빈칸 대신 0 으로 채운다.
                    count={applicantList.statusCounts[status] ?? 0}
                  />
                ))}
              </dl>
            </section>

            <div className="mt-6 flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="search"
                  aria-label="지원자 검색"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="이름 또는 학번으로 검색"
                  className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <label className="flex shrink-0 items-center gap-2 text-[12.5px] text-charcoal-2">
                  <span>정렬</span>
                  <select
                    aria-label="지원자 정렬"
                    value={sort}
                    onChange={(event) => setSort(toApplicantSort(event.target.value))}
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

              <div className="flex flex-wrap gap-1.5" role="group" aria-label="지원 상태 필터">
                {STATUS_FILTERS.map((option) => {
                  const selected = option.value === statusFilter;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setStatusFilter(option.value)}
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
            </div>
          </ConsoleCard>

          {/* keepPreviousData 전환 중(검색어·필터·정렬 변경)에는 이전 목록이 그대로 남는다 —
              딤으로 "지금 보이는 게 갱신 전 데이터"라는 신호를 준다. 툴바는 딤에서 제외한다:
              타이핑 중인 입력창까지 흐려지면 갱신 중이 아니라 잠긴 것처럼 읽힌다. */}
          <ConsoleCard className="mt-4">
            <div
              aria-busy={applicantsQuery.isPlaceholderData}
              className={
                applicantsQuery.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined
              }
            >
              <AdminApplicantsTable
                items={applicantList.applicants}
                onOpenApplication={setOpenApplicationId}
              />
            </div>
          </ConsoleCard>
        </>
      )}

      {/* 시트는 조회 상태와 무관하게 둔다 — 백그라운드 재조회가 실패해도 읽던 지원서가 닫히지 않는다. */}
      {openApplicationId !== undefined && (
        <AdminApplicationSheet
          applicationId={openApplicationId}
          onClose={() => setOpenApplicationId(undefined)}
        />
      )}
    </>
  );
}

/** select 는 문자열만 돌려주므로 알려진 정렬 키인지 확인하고 좁힌다(`as` 단언 금지). */
function toApplicantSort(value: string): AdminApplicantSort {
  return SORT_OPTIONS.find((option) => option.value === value)?.value ?? 'LATEST';
}

function SummaryChip({
  label,
  count,
  highlighted = false,
}: {
  label: string;
  count: number;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3.5 py-3 ${
        highlighted ? 'border-ink/15 bg-sage/10' : 'border-line bg-graysoft/40'
      }`}
    >
      <dt className="text-[12px] font-semibold text-charcoal-3">{label}</dt>
      <dd className="mt-1 text-[15px] font-bold text-ink-deep">{count}명</dd>
    </div>
  );
}
