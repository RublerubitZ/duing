'use client';

import Link from 'next/link';
import { useActiveRecruitments } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { DashboardCard } from './DashboardCard';
import { DDayBadge } from '@/app/manage/_components/DDayBadge';
import { RECRUITMENT_DISPLAY_STATUS_BADGE, RECRUITMENT_DISPLAY_STATUS_LABEL } from './dashboard-labels';

export function ActiveRecruitmentsCard({ clubId }: { clubId: number }) {
  const { data, isLoading } = useActiveRecruitments(clubId);
  const recruitments = data ?? [];
  const now = new Date();

  return (
    <DashboardCard
      title="진행 중 모집"
      badge={recruitments.length > 0 ? <span className="text-xs text-charcoal-3">{recruitments.length}건</span> : undefined}
      isLoading={isLoading}
      isEmpty={!isLoading && recruitments.length === 0}
      emptyText="진행 중인 모집이 없어요"
    >
      <ul className="flex flex-col gap-2">
        {recruitments.map((recruitment) => (
          <li key={recruitment.id}>
            <Link
              href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitment.id}`)}
              className="flex items-center justify-between rounded-md px-2 py-2 text-sm transition hover:bg-sage-tint"
            >
              <span className="truncate font-medium text-charcoal">{recruitment.title}</span>
              <span className="ml-3 flex shrink-0 items-center">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RECRUITMENT_DISPLAY_STATUS_BADGE[recruitment.displayStatus]}`}>
                  {RECRUITMENT_DISPLAY_STATUS_LABEL[recruitment.displayStatus]}
                </span>
                <DDayBadge recruitment={recruitment} now={now} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
