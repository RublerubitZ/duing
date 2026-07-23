'use client';

import { useState } from 'react';
import { useClubHeroActivitiesQuery } from '@duing/hooks';
import { Skeleton } from '@/components/loading/Skeleton';
import { ClubHeroBento } from './ClubHeroBento';
import { ClubHeroSwipe } from './ClubHeroSwipe';
import { PhotoLightbox, type LightboxSlide } from './PhotoLightbox';

type Props = { clubId: number };

/**
 * 대표 활동 랜딩 섹션 — 페이지 게이트에 넣지 않는 독립 로딩.
 * 로딩=스켈레톤, 0개/에러=조용히 미렌더(상세 본문은 정상 유지).
 */
export function ClubDetailHeroActivities({ clubId }: Props) {
  const heroQuery = useClubHeroActivitiesQuery(clubId);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (heroQuery.isLoading) {
    return (
      <div
        role="status"
        aria-label="대표 활동 불러오는 중"
        className="delayed-show mb-10 animate-pulse motion-reduce:animate-none"
      >
        <Skeleton className="mb-4 h-6 w-40" />
        <div className="hidden gap-3.5 md:grid md:grid-cols-3">
          <Skeleton className="aspect-[4/5]" />
          <Skeleton className="aspect-[4/5]" />
          <Skeleton className="aspect-[4/5]" />
        </div>
        <Skeleton className="aspect-[4/5] md:hidden" />
      </div>
    );
  }

  const heroActivities = heroQuery.data ?? [];
  if (heroActivities.length === 0) return null; // 0개·에러 공통 — 랜딩은 조용히 강등.

  const slides: LightboxSlide[] = heroActivities.map((activity) => ({
    id: activity.id,
    imageUrl: activity.storageKey,
    title: activity.title,
    caption: activity.description,
  }));

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-baseline gap-2.5">
        <h2 className="text-[20px] font-bold text-ink-deep">대표 활동</h2>
        <span className="text-[13px] text-charcoal-3">동아리의 다양한 활동과 분위기를 만나보세요.</span>
      </div>
      <div className="hidden md:block">
        <ClubHeroBento heroActivities={heroActivities} onOpen={setLightboxIndex} />
      </div>
      <div className="md:hidden">
        <ClubHeroSwipe heroActivities={heroActivities} onOpen={setLightboxIndex} />
      </div>
      <PhotoLightbox
        slides={slides}
        initialIndex={lightboxIndex ?? 0}
        open={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
      />
    </section>
  );
}
