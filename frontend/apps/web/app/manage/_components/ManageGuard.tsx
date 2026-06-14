'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { ManagedClub } from '@duing/types';

type ManageGuardProps = {
  managedClubs: ManagedClub[] | undefined;
  isLoading: boolean;
  children: ReactNode;
};

export function ManageGuard({ managedClubs, isLoading, children }: ManageGuardProps) {
  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-slate-500">불러오는 중…</p>
      </div>
    );
  }

  if (!managedClubs || managedClubs.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <p className="text-slate-600">현재 운영하는 동아리가 없습니다.</p>
        <Link
          href="/"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:border-slate-500"
        >
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}