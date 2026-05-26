'use client';

import { use } from 'react';

import { useClubDetailQuery, useClubPhotosQuery } from '@duing/hooks';

import { ClubContactCard } from './_components/ClubContactCard';
import { ClubDetailHero } from './_components/ClubDetailHero';
import { ClubDetailStats } from './_components/ClubDetailStats';
import { ClubDetailTabs } from './_components/ClubDetailTabs';
import { ClubRecruitmentCard } from './_components/ClubRecruitmentCard';

export default function ClubDetailPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const clubId = Number(clubIdParam);

  const detail = useClubDetailQuery(clubId);
  const photos = useClubPhotosQuery(clubId);

  if (detail.isLoading) {
    return <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>;
  }
  if (!detail.data) {
    return <p className="p-6 text-sm text-coral">동아리를 찾을 수 없습니다.</p>;
  }

  const club = detail.data;

  return (
<<<<<<< HEAD
    <>
=======
    <div className="bg-cream min-h-screen">
>>>>>>> origin/main
      <ClubDetailHero
        club={club}
        recruitmentDisplayStatus={club.activeRecruitment?.displayStatus}
      />

      <section className="bg-cream px-10 pb-16">
        <div className="max-w-layout mx-auto grid grid-cols-[1fr_380px] gap-12">
          <div>
            <div className="mb-8">
              <ClubDetailStats club={club} />
            </div>
            <ClubDetailTabs club={club} photos={photos.data ?? []} />
          </div>

          <div className="space-y-4">
            <ClubRecruitmentCard recruitment={club.activeRecruitment ?? undefined} clubId={clubId} />
            <ClubContactCard
              snsLinks={club.snsLinks}
              location={club.location}
              contactEmail={club.contactEmail}
            />
          </div>
        </div>
      </section>
<<<<<<< HEAD
    </>
=======
    </div>
>>>>>>> origin/main
  );
}
