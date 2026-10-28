'use client';

import { use, useId, useState } from 'react';
import Link from 'next/link';
import { useLatestPromotionRequestQuery, useManagedClubsQuery } from '@duing/hooks';
import { cn } from '@/app/_lib/cn';
import { toRoute } from '../../../_lib/route';
import { PromotionRequestModal } from './_components/PromotionRequestModal';
import { promotionRequestBadgeText, promotionRequestStatusChip } from './_lib/promotionRequestStatus';
import { DashboardCardGrid } from '../../_components/dashboard/DashboardCardGrid';
import { DashboardHeadline } from '../../_components/dashboard/DashboardHeadline';

// 권한 가드는 [clubId]/layout.tsx 의 ManageGuard 공통이라 이 페이지에는 두지 않는다.
export default function ClubManagePage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const currentClubId = Number(clubIdParam);

  const [promotionOpen, setPromotionOpen] = useState(false);
  const promotionBadgeId = useId();

  const { data: managedClubs } = useManagedClubsQuery();
  // 로딩·오류(404 포함)면 undefined — 배지 없이 버튼을 지금처럼 열어 둔다(fail-open).
  const { data: latestPromotionRequest } = useLatestPromotionRequestQuery(currentClubId);

  const currentManagedClub = managedClubs?.find(
    (managedClub) => managedClub.clubId === currentClubId,
  );

  const promotionBadgeText = latestPromotionRequest
    ? promotionRequestBadgeText(latestPromotionRequest, new Date())
    : null;
  const isPromotionPending = latestPromotionRequest?.status === 'PENDING';

  return (
    <div className="duing mx-auto max-w-5xl px-6 py-8">
      {/* 배지는 lg 이상에서 버튼 옆, 그 아래(모바일·사이드바가 붙는 md 구간)에서는 줄을 바꿔 헤더 아래로 — 제목·버튼 줄을 밀지 않는다. */}
      <header className="mb-8 flex flex-wrap items-center gap-2">
        {/* 제목과 보조 줄은 한 블록 — 배지(order-last basis-full)보다 위에 남는다. */}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">
            {currentManagedClub?.clubName ?? '동아리'}
          </h1>
          <DashboardHeadline clubId={currentClubId} />
        </div>
        {latestPromotionRequest && promotionBadgeText !== null && (
          <p className="order-last basis-full lg:order-none lg:basis-auto">
            <span
              id={promotionBadgeId}
              className={cn(
                'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                promotionRequestStatusChip(latestPromotionRequest.status).badgeClass,
              )}
            >
              {promotionBadgeText}
            </span>
          </p>
        )}
        {/* 버튼 둘은 한 묶음 — 동아리 이름이 길어도 갈라지지 않고 함께 다음 줄로 내려간다. */}
        <div className="flex shrink-0 items-center gap-2">
          {/* 대기 중이면 disabled 대신 aria-disabled — 제출 직후 재조회로 잠겨도 포커스가 body 로 빠지지 않고, Tab 으로 닿아 배지 설명이 읽힌다. */}
          <button
            type="button"
            onClick={() => {
              if (!isPromotionPending) setPromotionOpen(true);
            }}
            aria-disabled={isPromotionPending || undefined}
            aria-describedby={isPromotionPending ? promotionBadgeId : undefined}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-charcoal-2 hover:border-ink hover:text-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:border-line aria-disabled:hover:text-charcoal-2"
          >
            홍보 요청
          </button>
          <Link
            href={toRoute(`/manage/clubs/${currentClubId}/recruitments/new`)}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-deep"
          >
            신규 모집 작성
          </Link>
        </div>
      </header>

      <DashboardCardGrid clubId={currentClubId} />

      {promotionOpen && currentManagedClub && (
        <PromotionRequestModal
          clubId={currentClubId}
          clubName={currentManagedClub.clubName}
          latestRequest={latestPromotionRequest ?? null}
          onClose={() => setPromotionOpen(false)}
        />
      )}
    </div>
  );
}
