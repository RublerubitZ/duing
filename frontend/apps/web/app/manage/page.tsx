'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { Suspense, useEffect } from 'react';
import { useManagedClubsQuery } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { LoadingGate } from '@/components/loading/LoadingGate';

function ManageRedirect() {
  const router = useGuardedRouter();
  const searchParams = useSearchParams();
  const { data: managedClubs, isLoading } = useManagedClubsQuery();

  // 마이페이지 "관리" 버튼은 `?clubId=` 로 어떤 동아리를 관리할지 전달한다.
  // 이 값이 관리 가능한 동아리 목록에 있으면 그 동아리로, 없거나 비어 있으면 첫 동아리로 이동한다.
  const requestedClubId = searchParams.get('clubId');
  const targetClub =
    managedClubs?.find((club) => String(club.clubId) === requestedClubId) ??
    managedClubs?.[0];

  useEffect(() => {
    if (!isLoading && targetClub) {
      router.push(toRoute(`/manage/clubs/${targetClub.clubId}`));
    }
  }, [isLoading, targetClub, router]);

  if (isLoading) {
    return <LoadingGate label="관리 동아리 불러오는 중" className="duing min-h-dvh bg-cream" />;
  }

  if (!managedClubs || managedClubs.length === 0) {
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
