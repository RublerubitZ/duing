'use client';

import Link from 'next/link';
import { useAdminFeeDashboardQuery } from '@duing/hooks';
import { cn } from '@/app/_lib/cn';
import { formatWon } from '@/app/_lib/feeLabels';
import { toRoute } from '@/app/_lib/route';
import { DashboardCard } from '@/components/dashboard/DashboardCard';

// 회비 감사 화면 기본 프리셋(전체 기간 → {})과 같은 키 — 캐시를 공유하고 의견 작성 뒤 dashboard 무효화가 닿는다.
const ALL_PERIOD = {};

export function AdminFeeAuditCard() {
  const feeDashboardQuery = useAdminFeeDashboardQuery(ALL_PERIOD);
  const feeDashboard = feeDashboardQuery.data;
  // 서버가 KST 오늘 0시부터 센 변경 건수 + 새 의견 수
  const todayActivityCount = feeDashboard
    ? Object.values(feeDashboard.recentActivity.eventCounts).reduce<number>((sum, count) => sum + (count ?? 0), 0) +
      feeDashboard.recentActivity.newOpinionCount
    : 0;

  return (
    <DashboardCard
      title="회비 감사 요약"
      // 로딩 = 아직 data 가 없고 실패도 아님 — 오프라인으로 멈춘 조회(isLoading false)도 빈 상자가 아니라 로딩이다.
      isLoading={feeDashboard === undefined && !feeDashboardQuery.isError}
      isError={feeDashboardQuery.isError}
      // 값 0 이 아니라 응답이 없을 때만 빈 상태 — 실패면 빈 값 본문 대신 오류 안내가 나온다.
      isEmpty={!feeDashboard}
      footer={
        <Link href={toRoute('/admin/fees')} className="inline-flex min-h-11 items-center text-xs font-medium text-ink hover:underline">
          회비 감사
        </Link>
      }
    >
      {feeDashboard ? (
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-sm">
          <dt className="break-keep text-charcoal-2">진행중 의견</dt>
          {/* 0건에 경고색을 칠하면 경고가 배경이 된다 — 1건 이상일 때만. */}
          <dd className={cn('text-right font-semibold tabular-nums', feeDashboard.openOpinionCount > 0 ? 'text-coral-deep' : 'text-ink')}>
            {feeDashboard.openOpinionCount}건
          </dd>
          <dt className="break-keep text-charcoal-2">오늘 회비 활동</dt>
          <dd className="text-right font-semibold tabular-nums text-ink">{todayActivityCount}건</dd>
          <dt className="break-keep text-charcoal-2">수납률(금액)</dt>
          <dd className="text-right tabular-nums text-ink">{feeDashboard.collectionRate}%</dd>
          <dt className="break-keep text-charcoal-2">미수금</dt>
          <dd className="text-right tabular-nums text-ink">{formatWon(feeDashboard.totalOutstanding)}</dd>
          <dt className="break-keep text-charcoal-2">회비 쓰는 동아리</dt>
          <dd className="text-right tabular-nums text-ink">
            {feeDashboard.feeUsingClubCount} / {feeDashboard.clubCount}곳
          </dd>
        </dl>
      ) : null}
    </DashboardCard>
  );
}
