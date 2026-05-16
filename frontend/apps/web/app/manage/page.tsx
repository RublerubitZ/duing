'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useManagedClubs } from '@duing/hooks';
import { toRoute } from '../_lib/route';

export default function ManagePage() {
  const router = useRouter();
  const { data: managedClubs, isLoading } = useManagedClubs();

  useEffect(() => {
    if (!managedClubs || managedClubs.length === 0) return;
    const firstClub = managedClubs[0];
    if (!firstClub) return;
    router.push(toRoute(`/manage/clubs/${firstClub.clubId}`));
  }, [managedClubs, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">불러오는 중…</p>
      </div>
    );
  }

  if (!managedClubs || managedClubs.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-slate-600">관리하는 동아리가 없습니다.</p>
        <Link
          href="/"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:border-slate-500"
        >
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-slate-500">이동 중…</p>
    </div>
  );
}