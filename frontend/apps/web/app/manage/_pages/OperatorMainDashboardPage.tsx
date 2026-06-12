'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useManagedClubsQuery } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { ActionItemsCard } from '../_components/dashboard/ActionItemsCard';
import { ActiveRecruitmentsCard } from '../_components/dashboard/ActiveRecruitmentsCard';
import { ApplicantSummaryCard } from '../_components/dashboard/ApplicantSummaryCard';
import { TodayScheduleCard } from '../_components/dashboard/TodayScheduleCard';
import { ClubFeedLinkCard } from '../_components/dashboard/ClubFeedLinkCard';
import { DashboardClubSwitcher } from '../_components/dashboard/DashboardClubSwitcher';

export function OperatorMainDashboardPage() {
  const searchParams = useSearchParams();
  const { data: managedClubs, isLoading } = useManagedClubsQuery();

  if (isLoading) {
    return (
      <div className="duing flex min-h-screen items-center justify-center bg-cream">
        <p className="text-sm text-charcoal-3">불러오는 중…</p>
      </div>
    );
  }

  if (!managedClubs || managedClubs.length === 0) {
    return (
      <div className="duing flex min-h-screen flex-col items-center justify-center gap-4 bg-cream">
        <p className="text-charcoal-2">관리하는 동아리가 없습니다.</p>
        <Link
          href={toRoute('/')}
          className="rounded-lg border border-line px-4 py-2 text-sm hover:border-sage"
        >
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  const firstClub = managedClubs[0];
  if (!firstClub) return null;

  const requested = Number(searchParams.get('clubId'));
  const selected = managedClubs.find((club) => club.clubId === requested) ?? firstClub;
  const clubId = selected.clubId;

  return (
    <div className="duing min-h-screen bg-cream px-5 py-6">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-ink-deep">운영 대시보드</h1>
          <DashboardClubSwitcher managedClubs={managedClubs} selectedClubId={clubId} />
        </div>
        <Link
          href={toRoute(`/manage/clubs/${clubId}`)}
          className="text-sm font-medium text-ink hover:underline"
        >
          이 동아리 관리 →
        </Link>
      </header>

      <div className="mb-4">
        <ActionItemsCard clubId={clubId} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ActiveRecruitmentsCard clubId={clubId} />
        <ApplicantSummaryCard clubId={clubId} />
        <TodayScheduleCard clubId={clubId} />
        <ClubFeedLinkCard clubId={clubId} />
      </div>
    </div>
  );
}
