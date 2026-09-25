import { notFound } from 'next/navigation';

import { ClubFeesPage } from './_pages/ClubFeesPage';

export default async function FeesPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = await params;
  const currentClubId = Number(clubIdParam);
  // 형식 검사는 미들웨어가 먼저 실제 404 로 끊는다(loading 경계 안의 notFound 는 200 소프트 404) — 여기는 매처가 바뀌었을 때의 방어선.
  if (Number.isNaN(currentClubId)) {
    notFound();
  }

  return <ClubFeesPage clubId={currentClubId} />;
}
