import { notFound } from 'next/navigation';

import { parsePositiveIdParam } from '@/app/_lib/idParam';

import { ClubFeesPage } from './_pages/ClubFeesPage';

export default async function FeesPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = await params;
  const currentClubId = parsePositiveIdParam(clubIdParam);
  if (currentClubId === null) {
    notFound();
  }

  return <ClubFeesPage clubId={currentClubId} />;
}
