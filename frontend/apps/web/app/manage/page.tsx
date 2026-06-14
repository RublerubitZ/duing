'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useManagedClubsQuery } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';

export default function ManagePage() {
  const router = useRouter();
  const { data: managedClubs, isLoading } = useManagedClubsQuery();

  const firstClub = managedClubs?.[0];

  useEffect(() => {
    if (!isLoading && firstClub) {
      router.push(toRoute(`/manage/clubs/${firstClub.clubId}`));
    }
  }, [isLoading, firstClub, router]);

  if (isLoading) {
    return (
      <div className="duing flex min-h-dvh items-center justify-center bg-cream">
        <p className="text-sm text-charcoal-3">불러오는 중…</p>
      </div>
    );
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

  // 동아리가 있고 로딩도 끝났으면 위 useEffect가 첫 동아리로 리다이렉트 중인 상태다.
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="text-sm text-charcoal-3">이동 중…</p>
    </div>
  );
}
