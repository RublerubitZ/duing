'use client';

import { useState } from 'react';
import { useClubHeroActivitiesQuery } from '@duing/hooks';
import { cn } from '@/app/_lib/cn';
import { useEnteredFromSkeleton } from '@/app/_lib/useEnteredFromSkeleton';
import { Skeleton } from '@/components/loading/Skeleton';
import { ClubHeroBento } from './ClubHeroBento';
import { ClubHeroSwipe } from './ClubHeroSwipe';
import { PhotoLightbox, type LightboxSlide } from './PhotoLightbox';

type Props = { clubId: number };

/**
 * 대표 활동 랜딩 섹션 — 페이지 게이트에 넣지 않는 독립 로딩.
 * 로딩=스켈레톤, 데이터 없음(0개·에러로 데이터 없음)=조용히 미렌더, 시드 뒤 재요청 실패면 시드를 그린다(상세 본문은 정상 유지).
 * 이미지는 쿼리가 신선해진 뒤에만 받는다(재요청이 끝내 실패하면 시드 URL 로 받는다).
 */
export function ClubDetailHeroActivities({ clubId }: Props) {
  const heroQuery = useClubHeroActivitiesQuery(clubId);
  const enteredFromSkeleton = useEnteredFromSkeleton(heroQuery.isLoading);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (heroQuery.isLoading) {
    // 지연은 래퍼, 펄스는 안쪽 — 같은 요소면 animation 축약끼리 덮어써 펄스가 꺼진다(ClubDetailSkeleton 과 같은 규약, #1463).
    return (
      <div className="delayed-show mb-10">
        <div
          role="status"
          aria-label="대표 활동 불러오는 중"
          className="animate-pulse motion-reduce:animate-none"
        >
          <Skeleton className="mb-4 h-6 w-40" />
          <div className="hidden gap-3.5 md:grid md:grid-cols-3">
            <Skeleton className="aspect-[4/5]" />
            <Skeleton className="aspect-[4/5]" />
            <Skeleton className="aspect-[4/5]" />
          </div>
          <Skeleton className="aspect-[4/5] md:hidden" />
        </div>
      </div>
    );
  }

  const heroActivities = heroQuery.data ?? [];
  if (heroActivities.length === 0) return null; // 0개·데이터 없는 에러 공통 — 랜딩은 조용히 강등(시드가 있는 재요청 실패는 아래에서 그린다).
  // 이미지는 이 쿼리가 신선해진 뒤에만 받는다 — ISR 시드(dataUpdatedAt 0)로 그리는 동안(서버 HTML·하이드레이션 첫 프레임)
  // 받으면 모집 상태를 바로잡는 상세 재요청(외부 폼 재확인이 기다린다)과 대역폭을 나눠 쓴다. 재요청이 끝내 실패하면 시드 URL 로 붙인다(#1457).
  const showImages = heroQuery.dataUpdatedAt > 0 || heroQuery.isError;

  const slides: LightboxSlide[] = heroActivities.map((activity) => ({
    id: activity.id,
    imageUrl: activity.storageKey,
    title: activity.title,
    caption: activity.description,
  }));

  return (
    <section className={cn('mb-10', enteredFromSkeleton && 'enter-content')}>
      <div className="mb-4 flex items-baseline gap-2.5">
        <h2 className="text-[20px] font-bold text-ink-deep">대표 활동</h2>
        <span className="text-[13px] text-charcoal-3">동아리의 다양한 활동과 분위기를 만나보세요.</span>
      </div>
      <div className="hidden md:block">
        <ClubHeroBento heroActivities={heroActivities} showImages={showImages} onOpen={setLightboxIndex} />
      </div>
      <div className="md:hidden">
        <ClubHeroSwipe heroActivities={heroActivities} showImages={showImages} onOpen={setLightboxIndex} />
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
