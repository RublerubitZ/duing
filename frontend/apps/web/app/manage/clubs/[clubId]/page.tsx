'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useManagedClubsQuery } from '@duing/hooks';
import { toRoute } from '../../../_lib/route';
import { PromotionRequestModal } from './_components/PromotionRequestModal';
import { DashboardCardGrid } from '../../_components/dashboard/DashboardCardGrid';

// 권한 가드는 [clubId]/layout.tsx 의 ManageGuard 공통이라 이 페이지에는 두지 않는다.
export default function ClubManagePage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const currentClubId = Number(clubIdParam);

  const [promotionOpen, setPromotionOpen] = useState(false);

  const { data: managedClubs } = useManagedClubsQuery();

  const currentManagedClub = managedClubs?.find(
    (managedClub) => managedClub.clubId === currentClubId,
  );

  return (
    <div className="duing mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {currentManagedClub?.clubName ?? '동아리'}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPromotionOpen(true)}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-charcoal-2 hover:border-ink hover:text-ink"
          >
            홍보 요청
          </button>
          <Link
            href={toRoute(`/manage/clubs/${currentClubId}/recruitments/new`)}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-deep"
          >
            신규 모집 작성
          </Link>
        </div>
      </header>

      <DashboardCardGrid clubId={currentClubId} />

      {promotionOpen && currentManagedClub && (
        <PromotionRequestModal
          clubId={currentClubId}
          clubName={currentManagedClub.clubName}
          onClose={() => setPromotionOpen(false)}
        />
      )}
    </div>
  );
}
