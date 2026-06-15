import { use } from 'react';
import type { ReactNode } from 'react';
import { MemberAccessGuard } from './_components/MemberAccessGuard';

export default function ClubMemberLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const clubId = Number(clubIdParam);
  if (!Number.isFinite(clubId)) return null;

  return <MemberAccessGuard clubId={clubId}>{children}</MemberAccessGuard>;
}
