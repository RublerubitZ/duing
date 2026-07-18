'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import { useManagedClubsQuery } from '@duing/hooks';
import { FacilityBookingsView } from './_components/FacilityBookingsView';
import { LoadingGate } from '@/components/loading/LoadingGate';

export default function FacilityBookingsPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId: clubIdParam } = use(params);
  const currentClubId = Number(clubIdParam);

  const { data: managedClubs, isLoading: isManagedClubsLoading } = useManagedClubsQuery();

  if (isManagedClubsLoading) {
    return <LoadingGate label="운영 권한 확인 중" />;
  }

  // 운영 권한이 없는 clubId(또는 NaN)는 sibling 관리 페이지(photos·members)와 동일하게 notFound.
  const managedClub = managedClubs?.find((club) => club.clubId === currentClubId);
  if (!managedClub) {
    notFound();
  }

  return <FacilityBookingsView clubId={currentClubId} />;
}
