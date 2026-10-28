import { notFound } from 'next/navigation';

import { parsePositiveIdParam } from '@/app/_lib/idParam';

import { parseFeeTab, parseInitialBillStatus } from './_lib/feeTabs';
import { ClubFeesPage } from './_pages/ClubFeesPage';

export default async function FeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ tab?: string | string[]; status?: string | string[] }>;
}) {
  const { clubId: clubIdParam } = await params;
  const currentClubId = parsePositiveIdParam(clubIdParam);
  if (currentClubId === null) {
    notFound();
  }

  // 운영진 홈 업무 큐가 탭·필터를 골라 들어온다(`?tab=bill&status=OVERDUE`, `?tab=bank`). 탭을 바꿔도 주소는 고치지 않는다.
  const { tab, status } = await searchParams;
  const initialTab = parseFeeTab(tab);

  return (
    <ClubFeesPage
      clubId={currentClubId}
      initialTab={initialTab}
      initialBillStatus={parseInitialBillStatus(initialTab, status)}
    />
  );
}
