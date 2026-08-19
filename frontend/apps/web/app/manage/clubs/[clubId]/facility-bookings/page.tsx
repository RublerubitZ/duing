'use client';

import { use } from 'react';
import { FacilityBookingsView } from './_components/FacilityBookingsView';

// 권한 가드는 [clubId]/layout.tsx 의 ManageGuard 공통이라 이 페이지에는 두지 않는다.
export default function FacilityBookingsPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId: clubIdParam } = use(params);
  const currentClubId = Number(clubIdParam);

  return <FacilityBookingsView clubId={currentClubId} />;
}
