'use client';

import { use } from 'react';
import { parseManageTab } from './_lib/bookingTabs';
import { FacilityBookingsView } from './_components/FacilityBookingsView';

// 권한 가드는 [clubId]/layout.tsx 의 ManageGuard 공통이라 이 페이지에는 두지 않는다.
export default function FacilityBookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const { tab } = use(searchParams);
  const currentClubId = Number(clubIdParam);

  return <FacilityBookingsView clubId={currentClubId} initialTab={parseManageTab(tab)} />;
}
