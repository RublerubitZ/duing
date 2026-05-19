'use client';

import { use } from 'react';

import {
  useClubDetailQuery,
  useClubPhotosQuery,
  useClubRecruitmentsQuery,
  useRecruitmentDetailQuery,
} from '@duing/hooks';
import type { RecruitmentSummary } from '@duing/types';

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
  const recruitments = useClubRecruitmentsQuery(clubId);

  // 모집 카드는 면접 일정·지원자 수까지 필요하므로 활성 모집의 detail 을 별도 호출.
  const activeRecruitmentSummary: RecruitmentSummary | undefined = recruitments.data?.find(
    (item) => item.displayStatus === 'OPEN' || item.displayStatus === 'ALWAYS_OPEN',
  );
  const recruitmentDetail = useRecruitmentDetailQuery(activeRecruitmentSummary?.id);

  if (detail.isLoading) {
    return <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>;
  }
  if (!detail.data) {
    return <p className="p-6 text-sm text-coral">동아리를 찾을 수 없습니다.</p>;
  }

  const club = detail.data;

  return (
    <div className="bg-cream min-h-screen">
      <ClubDetailHero
        club={club}
        recruitmentDisplayStatus={activeRecruitmentSummary?.displayStatus}
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
            <ClubRecruitmentCard recruitment={recruitmentDetail.data} clubId={clubId} />
            <ClubContactCard
              snsLinks={club.snsLinks}
              location={club.location}
              contactEmail={club.contactEmail}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
