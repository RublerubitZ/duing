'use client';

import { use, useRef, useState } from 'react';
import { notFound } from 'next/navigation';
import {
  useClubHeroActivitiesQuery,
  useClubPhotosQuery,
  useManagedClubsQuery,
} from '@duing/hooks';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { SectionCard } from '@/app/manage/_components/SectionCard';
import {
  ActivityHeroSection,
  type ActivityHeroSectionHandle,
} from './_components/ActivityHeroSection';
import { ActivityPhotoGrid } from './_components/ActivityPhotoGrid';
import { ActivityPreview } from './_components/ActivityPreview';

const HERO_SLOT_COUNT = 6;

export default function ClubPhotosPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const currentClubId = Number(clubIdParam);
  const queryClubId = isNaN(currentClubId) ? undefined : currentClubId;

  const heroSectionRef = useRef<ActivityHeroSectionHandle>(null);
  // hero 섹션에서 시드했지만 아직 미저장인 사진 id — 그리드 "대표로 지정" 선차단(409 예방)에 합친다.
  const [pendingPhotoIds, setPendingPhotoIds] = useState<number[]>([]);

  const managedClubsQuery = useManagedClubsQuery();
  const photosQuery = useClubPhotosQuery(queryClubId);
  const heroQuery = useClubHeroActivitiesQuery(queryClubId);

  if (managedClubsQuery.isLoading || photosQuery.isLoading || heroQuery.isLoading) {
    return <LoadingGate label="활동 피드 불러오는 중" />;
  }

  const managedClub = managedClubsQuery.data?.find((club) => club.clubId === currentClubId);
  if (!managedClub) {
    notFound();
  }

  const pageHeader = (
    <header className="mb-6">
      <h1 className="text-xl font-bold text-ink">활동 피드</h1>
      <p className="mt-1 text-[13px] text-charcoal-2">
        대표 활동 6개와 전체 활동 사진을 관리하고, 학생에게 보일 모습을 미리 확인하세요.
      </p>
    </header>
  );

  // hero/photos 쿼리 실패 시 빈 데이터로 정상 화면을 렌더하면 6칸 전부 빈 슬롯으로 보여 재등록을 유도한다.
  // 대신 에러 상태 + 두 쿼리 재시도 버튼을 보인다(managedClubs 실패는 위 notFound() 로 처리).
  if (heroQuery.isError || photosQuery.isError) {
    return (
      <div className="mx-auto max-w-[1240px] px-6 py-9">
        {pageHeader}
        <div role="alert" className="text-sm text-charcoal-2">
          <p>활동 피드를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
          <button
            type="button"
            className="btn btn-ghost mt-2"
            onClick={() => {
              void heroQuery.refetch();
              void photosQuery.refetch();
            }}
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  const photoList = photosQuery.data ?? [];
  const heroList = heroQuery.data ?? [];
  // 승격 비활성 여부는 ref(비반응형)가 아니라 쿼리 데이터로 직접 파생해 반응형으로 유지한다.
  // pending 시드도 슬롯을 점유하므로 합산 — 승격이 pending 슬롯을 건너뛰는 정책과 짝(무반응 데드클릭 방지).
  const promoteDisabled = heroList.length + pendingPhotoIds.length >= HERO_SLOT_COUNT;
  // 저장된 hero + pending 시드 사진 = 사용 중. 해당 그리드 카드의 "대표로 지정"을 선차단한다.
  const usedPhotoIds = [...heroList.map((hero) => hero.clubPhotoId), ...pendingPhotoIds];

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-9">
      {pageHeader}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <div>
          <ActivityHeroSection
            ref={heroSectionRef}
            clubId={currentClubId}
            heroActivities={heroList}
            photos={photoList}
            onPendingPhotoIdsChange={setPendingPhotoIds}
          />
          <SectionCard number={2} title="전체 활동 사진" description="드래그로 순서를 바꿀 수 있어요(1초 후 자동 저장).">
            <ActivityPhotoGrid
              clubId={currentClubId}
              photos={photoList}
              onPromote={(photo) => heroSectionRef.current?.promotePhoto(photo)}
              promoteDisabled={promoteDisabled}
              usedPhotoIds={usedPhotoIds}
            />
          </SectionCard>
        </div>

        <aside data-testid="activity-preview" className="hidden xl:sticky xl:top-6 xl:block">
          <ActivityPreview
            clubName={managedClub.clubName}
            heroActivities={heroList}
            photos={photoList}
          />
        </aside>
      </div>
    </div>
  );
}
