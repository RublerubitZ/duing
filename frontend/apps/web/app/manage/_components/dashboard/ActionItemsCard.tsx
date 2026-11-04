'use client';

import { useDashboardTaskQueue } from '@duing/hooks';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { DashboardTaskGroupList } from './DashboardTaskGroupList';

export function ActionItemsCard({ clubId }: { clubId: number }) {
  const { groups, totalCount, isLoading, isError } = useDashboardTaskQueue(clubId);
  const now = new Date();
  // 로딩 중이거나 출처 하나라도 실패했으면 건수를 그리지 않는다 — 일부만 센 숫자가 사실처럼 보이지 않게.
  const showCounts = !isLoading && !isError;

  return (
    <DashboardCard
      title="처리 필요 업무"
      badge={showCounts && totalCount > 0 ? <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-paper">{totalCount}</span> : undefined}
      isLoading={isLoading}
      isError={isError}
      isEmpty={!isLoading && totalCount === 0}
      emptyText="처리할 업무가 없어요"
    >
      <DashboardTaskGroupList clubId={clubId} groups={groups} now={now} variant="home" showCounts={showCounts} />
    </DashboardCard>
  );
}
