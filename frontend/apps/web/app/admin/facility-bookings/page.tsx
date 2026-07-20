import { Suspense } from 'react';

import { RouteLoading } from '@/app/_components/RouteLoading';
import { AdminFacilityBookingsPage } from './_pages/AdminFacilityBookingsPage';

export default function Page() {
  return (
    // useSearchParams 경계 — fallback null 이면 프리렌더 HTML·하이드레이션 전 화면이 통째로 백지가 된다.
    <Suspense fallback={<RouteLoading />}>
      <AdminFacilityBookingsPage />
    </Suspense>
  );
}
