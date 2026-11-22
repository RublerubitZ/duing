'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { Suspense, useEffect, useState } from 'react';
import { useManagedClubsQuery } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { ManageGuardNotice } from './_components/ManageGuard';
import { LAST_CLUB_STORAGE_KEY } from './_lib/lastClubStorage';

function ManageRedirect() {
  const router = useGuardedRouter();
  const searchParams = useSearchParams();
  const { data: managedClubs, isLoading, isFetching, isFetchedAfterMount, isPlaceholderData, refetch } =
    useManagedClubsQuery();
  // 데이터 없이 다시 받으면 TanStack 은 조회 중(pending)으로 돌아간다 — 이 화면에서 실패한 뒤의 조회는 첫 로딩이 아니라 다시 시도로 본다(다른 화면과 같은 식).
  const isRetrying = isFetching && isFetchedAfterMount && (managedClubs === undefined || isPlaceholderData);

  // 마이페이지 "관리" 버튼은 `?clubId=` 로 어떤 동아리를 관리할지 전달한다.
  // 우선순위: 쿼리 → 마지막에 본 동아리(ManageShell 이 저장, 목록에 있을 때만) → 첫 동아리.
  const requestedClubId = searchParams.get('clubId');
  const [lastViewedClubId] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(LAST_CLUB_STORAGE_KEY);
    } catch {
      // SSR(window 없음)·저장소 차단 — 기억을 포기하고 첫 동아리로 간다. 마크업에는 영향이 없어 하이드레이션 불일치는 없다.
      return null;
    }
  });
  const targetClub =
    managedClubs?.find((club) => String(club.clubId) === requestedClubId) ??
    managedClubs?.find((club) => String(club.clubId) === lastViewedClubId) ??
    managedClubs?.[0];

  useEffect(() => {
    if (!isLoading && targetClub) {
      // push 는 /manage 를 기록에 남겨, 콘솔에서 뒤로가면 이 effect 가 다시 콘솔로 보낸다(#1751).
      router.replace(toRoute(`/manage/clubs/${targetClub.clubId}`));
    }
  }, [isLoading, targetClub, router]);

  if (isLoading && !isRetrying) {
    return <LoadingGate label="관리 동아리 불러오는 중" className="duing min-h-dvh bg-cream" />;
  }

  // 받은 목록이 없으면 '없음'이 아니라 '모름'이다(#1579) — 운영 동아리가 없는 회원에게도 서버는 빈 배열로 답한다.
  if (!managedClubs) {
    return (
      <ManageGuardNotice
        heading="운영 동아리 목록을 불러오지 못했어요."
        actionHref={toRoute('/')}
        actionLabel="홈으로 돌아가기"
        retry={{ isRetrying, onRetry: () => void refetch() }}
      />
    );
  }

  if (managedClubs.length === 0) {
    return (
      <div className="duing flex min-h-dvh flex-col items-center justify-center gap-4 bg-cream">
        <p className="text-charcoal-2">관리하는 동아리가 없습니다.</p>
        <Link
          href={toRoute('/')}
          className="rounded-lg border border-line px-4 py-2 text-sm hover:border-sage"
        >
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  // 동아리가 있고 로딩도 끝났으면 위 useEffect가 대상 동아리로 리다이렉트 중인 상태다.
  return <LoadingGate label="이동 중" className="min-h-dvh" />;
}

export default function ManagePage() {
  return (
    <Suspense fallback={<LoadingGate className="duing min-h-dvh bg-cream" />}>
      <ManageRedirect />
    </Suspense>
  );
}
