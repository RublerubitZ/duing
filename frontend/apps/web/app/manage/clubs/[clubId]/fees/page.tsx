import { notFound } from 'next/navigation';

import { ClubFeesPage } from './_pages/ClubFeesPage';

export default async function FeesPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = await params;
  const currentClubId = Number(clubIdParam);
  if (Number.isNaN(currentClubId)) {
    notFound();
  }

  return <ClubFeesPage clubId={currentClubId} />;
}
