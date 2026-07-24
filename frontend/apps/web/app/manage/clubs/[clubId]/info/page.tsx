'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import { useClubDetailQuery, useManagedClubsQuery, useUpdateClubMutation } from '@duing/hooks';
import { ClubInfoForm } from './_components/ClubInfoForm';
import { LoadingGate } from '@/components/loading/LoadingGate';

export default function ClubInfoPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const currentClubId = Number(clubIdParam);

  const { data: managedClubs, isLoading: isManagedClubsLoading } = useManagedClubsQuery();
  const { data: detail, isLoading: isDetailLoading } = useClubDetailQuery(
    isNaN(currentClubId) ? undefined : currentClubId,
  );
  const updateMutation = useUpdateClubMutation(currentClubId);

  if (isManagedClubsLoading || isDetailLoading) {
    return <LoadingGate label="동아리 정보 불러오는 중" />;
  }

  const managedClub = managedClubs?.find((club) => club.clubId === currentClubId);
  if (!managedClub) {
    notFound();
  }

  if (!detail) {
    return <p className="p-6 text-sm text-slate-500">동아리 정보를 불러올 수 없습니다.</p>;
  }

  const mode = managedClub.myRole === 'LEADER' ? 'leader' : 'officer';

  return <ClubInfoForm detail={detail} mode={mode} mutation={updateMutation} />;
}
