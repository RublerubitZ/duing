'use client';

import Link from 'next/link';
import type { RecruitmentSummary } from '@duing/types';
import { CLOSING_SOON_DAYS, daysUntilKst, useActiveRecruitments } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { DashboardCard } from './DashboardCard';
import { RECRUITMENT_DISPLAY_STATUS_BADGE, RECRUITMENT_DISPLAY_STATUS_LABEL } from './dashboard-labels';

/** 마감일 D-day 뱃지 — 임박(D-0~D-3)은 coral pill 강조, 그 외는 muted 텍스트. 상시모집·마감·경과는 미표시 */
function DDayBadge({ recruitment, now }: { recruitment: RecruitmentSummary; now: Date }) {
  if (recruitment.displayStatus === 'CLOSED' || recruitment.displayStatus === 'ALWAYS_OPEN') return null;
  if (!recruitment.endDate) return null;
  const daysLeft = daysUntilKst(recruitment.endDate, now);
  if (daysLeft < 0) return null;
  const label = daysLeft === 0 ? 'D-day' : `D-${daysLeft}`;
  if (daysLeft <= CLOSING_SOON_DAYS) {
    return <span className="pill pill-coral ml-2 shrink-0">{label}</span>;
  }
  return <span className="ml-2 shrink-0 text-xs text-charcoal-3">{label}</span>;
}

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
