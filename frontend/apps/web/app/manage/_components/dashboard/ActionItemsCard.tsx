'use client';

import Link from 'next/link';
import type { ActionItem } from '@duing/types';
import { useClubActionItems } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { DashboardCard } from './DashboardCard';
import { ACTION_ITEM_TYPE_LABEL } from './dashboard-labels';

function hrefFor(clubId: number, item: ActionItem): `/${string}` {
  switch (item.type) {
    case 'INTERVIEW_ROUND_UNCONFIRMED':
    case 'INTERVIEW_RESPONSE_UNCOLLECTED':
      if (item.roundId === undefined) {
        return `/manage/clubs/${clubId}/recruitments/${item.recruitmentId}/interview`;
      }
      return `/manage/clubs/${clubId}/recruitments/${item.recruitmentId}/interview/rounds/${item.roundId}`;
    case 'APPLICANTS_AWAITING_REVIEW':
    case 'INTERVIEW_RESULT_PENDING':
      return `/manage/clubs/${clubId}/recruitments/${item.recruitmentId}/applicants`;
    case 'RECRUITMENT_CLOSING_SOON':
      return `/manage/clubs/${clubId}/recruitments/${item.recruitmentId}`;
  }
}

function contextText(item: ActionItem): string {
  const parts = [item.recruitmentTitle];
  if (item.roundTitle) parts.push(item.roundTitle);
  if (item.count !== undefined) parts.push(`${item.count}명`);
  if (item.daysLeft !== undefined) parts.push(item.daysLeft < 0 ? `${-item.daysLeft}일 경과` : `D-${item.daysLeft}`);
  return parts.join(' · ');
}

export function ActionItemsCard({ clubId }: { clubId: number }) {
  const { preview, totalCount, isLoading } = useClubActionItems(clubId);

  return (
    <DashboardCard
      title="처리 필요 업무"
      badge={totalCount > 0 ? <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-paper">{totalCount}</span> : undefined}
      isLoading={isLoading}
      isEmpty={!isLoading && totalCount === 0}
      emptyText="처리할 업무가 없어요"
      footer={totalCount > preview.length ? <p className="text-xs text-charcoal-3">전체 {totalCount}건</p> : undefined}
    >
      <ul className="flex flex-col gap-2">
        {preview.map((item) => (
          <li key={`${item.type}-${item.recruitmentId}-${item.roundId ?? ''}`}>
            <Link
              href={toRoute(hrefFor(clubId, item))}
              className="flex items-center justify-between rounded-md px-2 py-2 text-sm transition hover:bg-sage-tint"
            >
              <span className="font-medium text-charcoal">{ACTION_ITEM_TYPE_LABEL[item.type]}</span>
              <span className="ml-3 truncate text-xs text-charcoal-3">{contextText(item)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
