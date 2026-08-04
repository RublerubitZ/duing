'use client';

import { useAdminFeeDashboardQuery } from '@duing/hooks';
import type { AdminFeePeriodParams, AdminFeeRecentActivity } from '@duing/types';

import { ErrorState } from '../../_components/ErrorState';
import { feeEventTypeLabel, formatFeeAmount } from '../_lib/feeAuditLabels';

/**
 * 전 동아리 회비 현황 요약. 기간 셀렉터가 고른 구간을 그대로 받아 조회한다 —
 * 목록과 같은 기간을 보고 있어야 "미수금 685만"과 아래 표의 합이 어긋나지 않는다.
 */
export function FeeDashboardStrip({ period }: { period: AdminFeePeriodParams }) {
  const dashboardQuery = useAdminFeeDashboardQuery(period);
  const dashboard = dashboardQuery.data;

  if (dashboardQuery.isError) {
    return (
      <div className="mb-5">
        <ErrorState
          variant="inline"
          message="전체 현황을 불러오지 못했어요."
          onRetry={() => void dashboardQuery.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="mb-5">
      <ul
        aria-label="회비 전체 현황"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
      >
        <Kpi
          label="사용 동아리"
          value={
            dashboard && `${dashboard.feeUsingClubCount.toLocaleString('ko-KR')}/${dashboard.clubCount.toLocaleString('ko-KR')}`
          }
        />
        <Kpi label="총 청구" value={dashboard && `${formatFeeAmount(dashboard.totalBilled)}원`} />
        <Kpi label="총 수납" value={dashboard && `${formatFeeAmount(dashboard.totalPaid)}원`} />
        <Kpi
          label="미수금"
          value={dashboard && `${formatFeeAmount(dashboard.totalOutstanding)}원`}
          // 미수금이 있을 때만 시선을 끈다 — 0 원에 경고색을 칠하면 경고가 배경이 된다.
          warn={(dashboard?.totalOutstanding ?? 0) > 0}
        />
        {/* 수납률·진행중 의견은 필드 부재까지 막는다 — `dashboard &&` 는 객체 부재만 막는다.
            의견 집계는 PR-3 에서 붙은 필드라, BE 가 아직 안 올라간 창구간에는 키 자체가 없다. */}
        <Kpi label="수납률" value={dashboard && `${dashboard.collectionRate ?? 0}%`} />
        <Kpi
          label="진행중 의견"
          value={dashboard && `${(dashboard.openOpinionCount ?? 0).toLocaleString('ko-KR')}건`}
          warn={(dashboard?.openOpinionCount ?? 0) > 0}
        />
      </ul>

      <RecentActivityLine activity={dashboard?.recentActivity} />
    </div>
  );
}

/**
 * 오늘 하루의 변경 요약. 기간 필터와 무관하게 항상 KST 오늘 00:00 이후를 본다(§7.2) —
 * "지금 무슨 일이 벌어지고 있는가"는 조회 구간과 별개의 질문이다.
 */
function RecentActivityLine({ activity }: { activity?: AdminFeeRecentActivity }) {
  if (!activity) return null;

  const parts = Object.entries(activity.eventCounts ?? {})
    .filter(([, count]) => count > 0)
    .map(([eventType, count]) => `${feeEventTypeLabel(eventType)} ${count}`);
  if (activity.newOpinionCount > 0) parts.push(`신규 의견 ${activity.newOpinionCount}`);

  // 오늘 아무 일도 없었으면 줄 자체를 없앤다 — "오늘: " 만 남은 빈 줄은 정보가 아니다.
  if (parts.length === 0) return null;

  return <p className="mt-2.5 text-[12.5px] text-charcoal-2">오늘: {parts.join(' · ')}</p>;
}

function Kpi({
  label,
  value,
  warn = false,
}: {
  label: string;
  /** 아직 도착하지 않았으면 undefined — 자리만 지켜 숫자가 들어올 때 카드가 튀지 않게 한다. */
  value: string | undefined;
  warn?: boolean;
}) {
  return (
    <li className="rounded-[14px] border border-line bg-paper px-3.5 py-3">
      <p className="text-[11.5px] font-semibold text-charcoal-3">{label}</p>
      {value === undefined ? (
        <span
          aria-hidden
          className="mt-1 block h-[24px] w-16 animate-pulse rounded bg-graysoft motion-reduce:animate-none"
        />
      ) : (
        <p
          className={`mt-1 truncate text-[17px] font-bold tabular-nums ${warn ? 'text-danger' : 'text-ink'}`}
        >
          {value}
        </p>
      )}
    </li>
  );
}
