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
    return <p className="p-6 text-[13.5px] text-[#8a8f83]">불러오는 중…</p>;
  }

  const managedClub = managedClubs?.find((club) => club.clubId === currentClubId);
  if (!managedClub) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-[1100px] px-12 py-9 pb-20">
      <header className="flex items-baseline gap-3 mb-1.5">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[#2a2f27] m-0">활동사진</h1>
        <span className="font-mono text-[11px] tracking-[0.14em] text-[#8a8f83] uppercase">
          ADMIN · PHOTOS
        </span>
      </header>
      <p className="text-[13.5px] text-[#4a5247] mb-7 mt-0">
        업로드 후 드래그로 순서를 바꿀 수 있습니다 (1초 후 자동 저장).
      </p>

      <PhotoUploader clubId={currentClubId} />

      {photos && photos.length === 0 && (
        <p className="text-[13.5px] text-[#8a8f83]">아직 등록된 사진이 없습니다.</p>
      )}

      {photos && photos.length > 0 && (
        <PhotoGrid clubId={currentClubId} photos={photos} />
      )}
    </div>
  );
}
