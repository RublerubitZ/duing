'use client';

import { ActionItemsCard } from './ActionItemsCard';
import { ActiveRecruitmentsCard } from './ActiveRecruitmentsCard';
import { ApplicantSummaryCard } from './ApplicantSummaryCard';
import { TodayScheduleCard } from './TodayScheduleCard';
import { ClubFeedLinkCard } from './ClubFeedLinkCard';

export function DashboardCardGrid({ clubId }: { clubId: number }) {
  return (
    <>
      <div className="mb-4">
        <ActionItemsCard clubId={clubId} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ActiveRecruitmentsCard clubId={clubId} />
        <ApplicantSummaryCard clubId={clubId} />
        <TodayScheduleCard clubId={clubId} />
        <ClubFeedLinkCard clubId={clubId} />
      </div>
    </>
  );
}
