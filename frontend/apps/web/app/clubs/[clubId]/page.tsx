'use client';

import { use } from 'react';
import { useClubDetailQuery, useClubRecruitmentsQuery, useClubPhotosQuery } from '@duing/hooks';
import type { RecruitmentSummary } from '@duing/types';
import { ClubDetailHero } from './_components/ClubDetailHero';
import { ClubDetailAbout } from './_components/ClubDetailAbout';
import { ClubDetailPhotos } from './_components/ClubDetailPhotos';
import { ClubRecruitmentCard } from './_components/ClubRecruitmentCard';
import { ClubContactCard } from './_components/ClubContactCard';

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

  if (detail.isLoading) {
    return <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>;
  }
  if (!detail.data) {
    return <p className="p-6 text-sm text-coral">동아리를 찾을 수 없습니다.</p>;
  }

  const club = detail.data;
  const activeRecruitment: RecruitmentSummary | undefined = recruitments.data?.find(
    (item) => item.displayStatus === 'OPEN' || item.displayStatus === 'ALWAYS_OPEN',
  );

  return (
    <div className="bg-cream min-h-screen">
      <ClubDetailHero
        club={club}
        recruitmentDisplayStatus={activeRecruitment?.displayStatus}
      />

      <section className="bg-cream px-10 pb-16">
        <div className="max-w-layout mx-auto grid grid-cols-[1fr_380px] gap-12">
          <div>
            <ClubDetailAbout description={club.description} />
            <ClubDetailPhotos photos={photos.data ?? []} />

            {club.faqs.length > 0 && (
              <section className="mt-12">
                <h3 className="mb-4 text-lg font-bold text-ink-deep">FAQ</h3>
                <ul className="space-y-3">
                  {club.faqs
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((faq, idx) => (
                      <li key={idx} className="rounded-[14px] border border-line bg-paper p-4">
                        <p className="font-semibold text-ink-deep">Q. {faq.question}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-charcoal-2">
                          {faq.answer}
                        </p>
                      </li>
                    ))}
                </ul>
              </section>
            )}
          </div>

          <div className="space-y-4">
            <ClubRecruitmentCard recruitment={activeRecruitment} clubId={clubId} />
            <ClubContactCard snsLinks={club.snsLinks} />
          </div>
        </div>
      </section>
    </div>
  );
}
