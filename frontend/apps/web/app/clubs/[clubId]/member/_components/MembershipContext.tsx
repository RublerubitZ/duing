'use client';

import { createContext, useContext } from 'react';
import type { MyClubMembership } from '@duing/types';

const MembershipContext = createContext<MyClubMembership | null>(null);

export function MembershipProvider({
  membership, children,
}: { membership: MyClubMembership; children: React.ReactNode }) {
  return (
    <MembershipContext.Provider value={membership}>{children}</MembershipContext.Provider>
  );
}

export function useMembership(): MyClubMembership {
  const value = useContext(MembershipContext);
  if (!value) throw new Error('useMembership must be used within MembershipProvider');
  return value;
}
