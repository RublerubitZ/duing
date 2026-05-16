import { use } from 'react';
import type { ReactNode } from 'react';
import { ManageShell } from '../../_components/ManageShell';

export default function ClubManageLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const currentClubId = Number(clubIdParam);

  return (
    <ManageShell currentClubId={isNaN(currentClubId) ? null : currentClubId}>
      {children}
    </ManageShell>
  );
}