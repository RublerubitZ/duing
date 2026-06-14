'use client';

import { use } from 'react';

import { useClubDetailQuery, useClubPhotosQuery } from '@duing/hooks';

import { ClubContactCard } from './_components/ClubContactCard';
import { ClubDetailApplyBar } from './_components/ClubDetailApplyBar';
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
    <>
      <ClubDetailHero
        club={club}
        recruitmentDisplayStatus={club.activeRecruitment?.displayStatus}
      />

      <section className="bg-cream px-4 sm:px-6 md:px-10 pb-16">
        <div className="max-w-layout mx-auto grid grid-cols-1 gap-10 lg:grid-cols-[1fr_380px] lg:gap-12">
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

      {/* 모바일 전용 하단 고정 지원 바 (md:hidden). 데스크탑은 우측 모집 카드를 그대로 쓴다. */}
      <ClubDetailApplyBar recruitment={club.activeRecruitment ?? undefined} />
    </>
  );
}
