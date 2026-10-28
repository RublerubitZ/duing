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
  const initialTab = parseManageTab(tab);

  // 주소의 쿼리만 바뀐 이동은 같은 컴포넌트 상태를 남긴다 — key 로 다시 마운트해 탭이 주소를 따라오게 한다.
  return <FacilityBookingsView key={initialTab} clubId={currentClubId} initialTab={initialTab} />;
}
