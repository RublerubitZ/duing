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
        <aside className="w-60 shrink-0 border-r border-slate-200 bg-slate-50">
          <div className="border-b border-slate-200 px-4 py-4">
            <Link href="/" className="text-sm font-semibold text-slate-800 hover:text-slate-600">
              Du-ing 운영진 콘솔
            </Link>
          </div>

          {managedClubs && managedClubs.length > 0 && (
            <>
              <ClubSelector
                managedClubs={managedClubs}
                currentClubId={currentClubId}
              />
              {currentClubId !== null && (
                <ManageNav currentClubId={currentClubId} />
              )}
            </>
          )}
        </aside>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </ManageGuard>
  );
}