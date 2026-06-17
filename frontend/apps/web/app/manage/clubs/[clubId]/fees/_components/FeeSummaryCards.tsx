'use client';

import { useClubFeeSummaryQuery } from '@duing/hooks';

import { cn } from '@/app/_lib/cn';
import { feeStatusLabel, formatWon } from '@/app/_lib/feeLabels';

type FeeSummaryCardsProps = {
  clubId: number;
  // 회차 지정 시 해당 회차로 집계를 한정한다. 미지정이면 동아리 전체 집계.
  billingPeriod?: string;
};

export function FeeSummaryCards({ clubId, billingPeriod }: FeeSummaryCardsProps) {
  const { data: summary, isLoading } = useClubFeeSummaryQuery(
    clubId,
    billingPeriod ? { billingPeriod } : {},
  );

  if (isLoading) {
    return <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>;
  }

  if (!summary) {
    return null;
  }

  // 발행된 청구가 0건이면 0% 같은 오해 소지가 있는 수치 대신 빈 상태를 노출한다.
  if (summary.billCount === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line px-6 py-8 text-center">
        <p className="text-sm text-charcoal-2">아직 발행된 청구가 없어요.</p>
        <p className="mt-1 text-xs text-charcoal-3">
          청구를 발행하면 수납 현황이 여기에 표시됩니다.
        </p>
      </div>
    );
  }

  const hasOutstanding = summary.outstanding > 0;
  const hasOverdue = summary.overdueCount > 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line px-4 py-3">
          <p className="text-xs font-semibold text-charcoal-3">수납률</p>
          <p className="mt-1 text-2xl font-bold text-ink">{summary.collectionRate}%</p>
          <p className="mt-1 text-xs text-charcoal-3">
            총 {formatWon(summary.totalPaid)} / {formatWon(summary.totalBilled)}
          </p>
        </div>

        <div className="rounded-xl border border-line px-4 py-3">
          <p className="text-xs font-semibold text-charcoal-3">미수금</p>
          <p
            className={cn(
              'mt-1 text-2xl font-bold',
              hasOutstanding ? 'text-coral' : 'text-ink',
            )}
          >
            {formatWon(summary.outstanding)}
          </p>
        </div>

        <div className="rounded-xl border border-line px-4 py-3">
          <p className="text-xs font-semibold text-charcoal-3">총 청구액</p>
          <p className="mt-1 text-2xl font-bold text-ink">{formatWon(summary.totalBilled)}</p>
          <p className="mt-1 text-xs text-charcoal-3">청구 {summary.billCount}건</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge
          label={feeStatusLabel('PENDING')}
          count={summary.pendingCount}
          className="bg-warm/15 text-charcoal"
        />
        <StatusBadge
          label={feeStatusLabel('PARTIAL_PAID')}
          count={summary.partialPaidCount}
          className="bg-warm/15 text-charcoal"
        />
        <StatusBadge
          label={feeStatusLabel('OVERDUE')}
          count={summary.overdueCount}
          className={hasOverdue ? 'bg-coral/10 text-coral' : 'bg-graysoft text-charcoal-3'}
        />
        <StatusBadge
          label={feeStatusLabel('PAID')}
          count={summary.paidCount}
          className="bg-sage/20 text-sage"
        />
      </div>
    </div>
  );
}

type StatusBadgeProps = {
  label: string;
  count: number;
  className: string;
};

function StatusBadge({ label, count, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-1 text-[11px] font-medium',
        className,
      )}
    >
      {label} {count}
    </span>
  );
}
