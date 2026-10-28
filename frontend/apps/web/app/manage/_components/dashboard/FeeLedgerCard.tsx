'use client';

import Link from 'next/link';
import { useCashbookSummaryQuery, useClubFeeSummaryQuery } from '@duing/hooks';
import { cn } from '@/app/_lib/cn';
import { formatWon } from '@/app/_lib/feeLabels';
import { toRoute } from '@/app/_lib/route';
import { DashboardCard } from './DashboardCard';

// 필터 없는 전체 기준 — 회비 요약은 회비 관리 화면 기본값과 같은 키라 캐시를 공유하고, 둘 다 그 화면의 동아리 단위 무효화가 닿는다.
const ALL_BILLS = {};
const ALL_ENTRIES = {};

export function FeeLedgerCard({ clubId }: { clubId: number }) {
  const feeSummaryQuery = useClubFeeSummaryQuery(clubId, ALL_BILLS);
  const cashbookSummaryQuery = useCashbookSummaryQuery(clubId, ALL_ENTRIES);
  const feeSummary = feeSummaryQuery.data;
  const cashbookSummary = cashbookSummaryQuery.data;
  // collectionRate 는 금액 기준(납부액 ÷ 청구액, 서버 소수 1자리) — 막대 폭만 0~100 으로 자른다.
  const rateWidth = feeSummary ? Math.min(100, Math.max(0, feeSummary.collectionRate)) : 0;

  return (
    <DashboardCard
      title="회비 · 장부"
      badge={<span className="text-xs text-charcoal-3">전체 청구 기준</span>}
      isLoading={feeSummaryQuery.isLoading || cashbookSummaryQuery.isLoading}
      isError={feeSummaryQuery.isError || cashbookSummaryQuery.isError}
      isEmpty={!feeSummary && !cashbookSummary}
      footer={
        <Link href={toRoute(`/manage/clubs/${clubId}/fees`)} className="inline-flex min-h-11 items-center text-xs font-medium text-ink hover:underline">
          회비 관리
        </Link>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {feeSummary ? (
          feeSummary.billCount === 0 ? (
            <p className="rounded-md bg-graysoft py-4 text-center text-charcoal-2">아직 발행된 청구가 없어요.</p>
          ) : (
            <div>
              <p className="flex items-baseline justify-between">
                <span className="text-charcoal-2">수납률</span>
                <span className="text-xl font-bold tabular-nums text-ink">{feeSummary.collectionRate}%</span>
              </p>
              <div aria-hidden="true" className="mt-1.5 h-2 rounded-full bg-sage-mist">
                <div data-testid="fee-rate-bar" className="h-full rounded-full bg-ink" style={{ width: `${rateWidth}%` }} />
              </div>
              <p className="mt-1 text-xs text-charcoal-3">
                총 {formatWon(feeSummary.totalPaid)} / {formatWon(feeSummary.totalBilled)}
              </p>
              <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-charcoal-3">연체</dt>
                <dd className={cn('text-right font-semibold tabular-nums', feeSummary.overdueCount > 0 ? 'text-coral-deep' : 'text-ink')}>
                  {feeSummary.overdueCount}건
                </dd>
                <dt className="text-charcoal-3">기한 전 미납</dt>
                <dd className="text-right font-semibold tabular-nums">{feeSummary.pendingCount + feeSummary.partialPaidCount}건</dd>
                <dt className="text-charcoal-3">미납액</dt>
                <dd className="text-right font-semibold tabular-nums">{formatWon(feeSummary.outstanding)}</dd>
              </dl>
            </div>
          )
        ) : null}
        {cashbookSummary ? (
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 text-xs">
            <dt className="text-charcoal-3">장부 잔액</dt>
            <dd className="text-right font-semibold tabular-nums">{formatWon(cashbookSummary.bookBalance)}</dd>
          </dl>
        ) : null}
      </div>
    </DashboardCard>
  );
}
