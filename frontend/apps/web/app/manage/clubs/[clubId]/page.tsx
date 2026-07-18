'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useManagedClubsQuery } from '@duing/hooks';
import { notFound } from 'next/navigation';
import { toRoute } from '../../../_lib/route';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { PromotionRequestModal } from './_components/PromotionRequestModal';
import { RecertificationRequestModal } from './_components/RecertificationRequestModal';
import { DashboardCardGrid } from '../../_components/dashboard/DashboardCardGrid';

export default function ClubManagePage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const currentClubId = Number(clubIdParam);

  // useState는 조건부 return 이전에 반드시 호출해야 한다 (Rules of Hooks)
  const [promotionOpen, setPromotionOpen] = useState(false);
  const [recertificationOpen, setRecertificationOpen] = useState(false);

  const { data: managedClubs, isLoading: isManagedClubsLoading } = useManagedClubsQuery();

  if (isManagedClubsLoading) {
    return <LoadingGate label="운영 권한 확인 중" />;
  }

  const isManaged =
    managedClubs?.some((managedClub) => managedClub.clubId === currentClubId) ?? false;

  if (!isManagedClubsLoading && managedClubs && !isManaged) {
    notFound();
  }

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
          <button
            type="button"
            onClick={() => setRecertificationOpen(true)}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-charcoal-2 hover:border-ink hover:text-ink"
          >
            재인증 신청
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
      {recertificationOpen && currentManagedClub && (
        <RecertificationRequestModal
          clubId={currentClubId}
          clubName={currentManagedClub.clubName}
          onClose={() => setRecertificationOpen(false)}
        />
      )}
    </div>
  );
}
