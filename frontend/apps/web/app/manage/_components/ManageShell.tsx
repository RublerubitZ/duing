'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useManagedClubsQuery } from '@duing/hooks';
import { ManageGuard } from './ManageGuard';
import { ClubSelector } from './ClubSelector';
import { ManageNav } from './ManageNav';

type ManageShellProps = {
  currentClubId: number | null;
  children: ReactNode;
};

export function ManageShell({ currentClubId, children }: ManageShellProps) {
  const { data: managedClubs, isLoading } = useManagedClubsQuery();

  return (
    <ManageGuard managedClubs={managedClubs} isLoading={isLoading}>
      <div className="flex min-h-screen">
        <aside className="w-[248px] shrink-0 flex flex-col gap-[18px] px-4 py-[22px] pb-6 bg-[#2f3a2e] border-r border-[#232c22]">
          <div className="flex items-center gap-2 px-2 pb-3.5 border-b border-[#44503f]">
            <Link href="/" className="block">
              <span className="font-mono font-semibold text-[18px] text-[#f1ecd9] tracking-[-0.02em]">
                Du<span className="text-[#5b7e4d]">·</span>ing
              </span>
              <span className="block text-[12px] text-[#9aa191] mt-0.5 ml-0.5">운영진 콘솔</span>
            </Link>
          </div>

          {managedClubs && managedClubs.length > 0 && (
            <>
              <ClubSelector managedClubs={managedClubs} currentClubId={currentClubId} />
              {currentClubId !== null && (
                <ManageNav currentClubId={currentClubId} />
              )}
            </>
          )}

          <div className="mt-auto pt-3 border-t border-[#44503f] px-2 flex justify-between text-[11.5px] text-[#9aa191]">
            <span>v1.0.0</span>
            <span>회장 모드</span>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto bg-[#f3efe4]">
          {children}
        </main>
      </div>
    </ManageGuard>
  );
}