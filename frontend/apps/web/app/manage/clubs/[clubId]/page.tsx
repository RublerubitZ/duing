'use client';

import { use } from 'react';
import Link from 'next/link';
import { useClubRecruitmentsQuery, useManagedClubsQuery } from '@duing/hooks';
import { notFound } from 'next/navigation';
import { toRoute } from '../../../_lib/route';

export default function ClubManagePage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const currentClubId = Number(clubIdParam);

  const { data: managedClubs, isLoading: isManagedClubsLoading } = useManagedClubsQuery();
  const { data: recruitments, isLoading: isRecruitmentsLoading } = useClubRecruitmentsQuery(
    isNaN(currentClubId) ? undefined : currentClubId,
  );

  if (isManagedClubsLoading) {
    return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  }

  const isManaged =
    managedClubs?.some((managedClub) => managedClub.clubId === currentClubId) ?? false;

  if (!isManagedClubsLoading && managedClubs && !isManaged) {
    notFound();
  }

  const currentManagedClub = managedClubs?.find(
    (managedClub) => managedClub.clubId === currentClubId,
  );

  const activeRecruitments = recruitments?.filter((recruitment) => recruitment.effectivelyOpen) ?? [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {currentManagedClub?.clubName ?? '동아리'} 콘솔
        </h1>
        <Link
          href={toRoute(`/manage/clubs/${currentClubId}/recruitments/new`)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          신규 모집 작성
        </Link>
      </header>

      <section>
        <h2 className="mb-4 font-semibold">활성 모집</h2>

        {isRecruitmentsLoading && (
          <p className="text-sm text-slate-500">불러오는 중…</p>
        )}

        {!isRecruitmentsLoading && activeRecruitments.length === 0 && (
          <p className="text-sm text-slate-500">현재 진행 중인 모집이 없습니다.</p>
        )}

        {activeRecruitments.length > 0 && (
          <ul className="space-y-2">
            {activeRecruitments.map((recruitment) => (
              <li key={recruitment.id}>
                <Link
                  href={toRoute(`/manage/clubs/${currentClubId}/recruitments/${recruitment.id}/applicants`)}
                  className="block rounded-lg border border-slate-200 p-4 hover:border-slate-400"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium">{recruitment.title}</span>
                    <span className="text-xs text-slate-500">~ {recruitment.endDate}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {recruitment.applicationMode === 'EXTERNAL' ? '외부 폼' : '자체 폼'} ·{' '}
                    {recruitment.targetRole === 'OFFICER' ? '운영진' : '부원'} 모집 · 정원{' '}
                    {recruitment.capacity}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
