'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import { useClubPhotosQuery, useManagedClubsQuery } from '@duing/hooks';
import { PhotoUploader } from './_components/PhotoUploader';
import { PhotoGrid } from './_components/PhotoGrid';

export default function ClubPhotosPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const currentClubId = Number(clubIdParam);

  const { data: managedClubs, isLoading: isManagedClubsLoading } = useManagedClubsQuery();
  const { data: photos, isLoading: isPhotosLoading } = useClubPhotosQuery(
    isNaN(currentClubId) ? undefined : currentClubId,
  );

  if (isManagedClubsLoading || isPhotosLoading) {
    return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  }

  const managedClub = managedClubs?.find((club) => club.clubId === currentClubId);
  if (!managedClub) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <header>
        <h1 className="text-xl font-bold">활동사진</h1>
        <p className="mt-1 text-sm text-slate-500">
          업로드 후 드래그로 순서를 바꿀 수 있습니다 (1초 후 자동 저장).
        </p>
      </header>

      <PhotoUploader clubId={currentClubId} />

      {photos && photos.length === 0 && (
        <p className="text-sm text-slate-500">아직 등록된 사진이 없습니다.</p>
      )}

      {photos && photos.length > 0 && (
        <PhotoGrid clubId={currentClubId} photos={photos} />
      )}
    </div>
  );
}