'use client';

import { ActionItemsCard } from './ActionItemsCard';
import { ActiveRecruitmentsCard } from './ActiveRecruitmentsCard';
import { ApplicantSummaryCard } from './ApplicantSummaryCard';
import { ClubFeedLinkCard } from './ClubFeedLinkCard';
import { FeeLedgerCard } from './FeeLedgerCard';
import { TodayScheduleCard } from './TodayScheduleCard';

// xl(1280) 미만은 사이드바(280px) 때문에 본문이 좁아 한 칸으로 쌓는다 — DOM 순서가 곧 쌓임 순서다.
// xl 부터 오른쪽 칸을 320px 로 고정한다(1280 에서 비율 분할이면 300px 아래로 좁아진다).
export function DashboardCardGrid({ clubId }: { clubId: number }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        <ActionItemsCard clubId={clubId} />
        <ApplicantSummaryCard clubId={clubId} />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <TodayScheduleCard clubId={clubId} />
        <ActiveRecruitmentsCard clubId={clubId} />
        <FeeLedgerCard clubId={clubId} />
        <ClubFeedLinkCard clubId={clubId} />
      </div>
    </div>
  );
}
