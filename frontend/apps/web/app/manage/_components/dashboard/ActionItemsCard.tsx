'use client';

import Link from 'next/link';
import { useDashboardTaskQueue } from '@duing/hooks';
import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { DASHBOARD_CHIP_TONE_CLASS } from '@/components/dashboard/dashboardChipTone';
import { DASHBOARD_TASK_GROUP_LABEL, presentDashboardTask } from './dashboardTaskPresentation';
import type { DashboardTaskGroupKey } from '@duing/types';

const GROUP_HEADING_CLASS: Record<DashboardTaskGroupKey, string> = {
  NOW: 'text-coral-deep',
  WAITING: 'text-warm-deep',
  INFO: 'text-charcoal-2',
};

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
      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.key}>
            <h3 className={cn('px-2 pb-1 text-xs font-bold', GROUP_HEADING_CLASS[group.key])}>
              {DASHBOARD_TASK_GROUP_LABEL[group.key]}
              {showCounts ? <span className="tabular-nums"> {group.tasks.length}</span> : null}
            </h3>
            <ul className="flex flex-col gap-1">
              {group.tasks.map((task) => {
                const row = presentDashboardTask(clubId, task, now);
                return (
                  <li key={row.key}>
                    {/* 행 전체가 링크 하나 — 같은 이름의 버튼이 여러 개 생기지 않게 처리 문구는 span 이다. */}
                    <Link
                      href={toRoute(row.href)}
                      className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2 transition hover:bg-sage-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                    >
                      <span className="min-w-0 flex-1 basis-56">
                        <span className="block text-sm font-medium text-charcoal">{row.label}</span>
                        <span className="block break-words break-keep text-xs text-charcoal-3">{row.context}</span>
                      </span>
                      {/* 칩과 처리 문구는 함께 줄을 바꾼다 — 따로 바꾸면 행마다 처리 문구 자리가 달라진다. */}
                      <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                        {row.chip ? (
                          <span className={cn('max-w-full break-keep rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', DASHBOARD_CHIP_TONE_CLASS[row.chip.tone])}>
                            {row.chip.text}
                          </span>
                        ) : null}
                        <span className="shrink-0 rounded-md border border-sage-soft bg-paper px-3 py-1.5 text-xs font-semibold text-ink">
                          {row.actionLabel}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}
