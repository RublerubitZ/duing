import { Suspense } from 'react';

import { RouteLoading } from '@/app/_components/RouteLoading';
import { AdminClubsListPage } from './_pages/AdminClubsListPage';

export default function Page() {
  return (
    // useSearchParams 경계 — 총동연 홈 '운영 중단 미결' 칸이 ?status= 로 첫 탭을 고른다(정적 셸 유지).
    <Suspense fallback={<RouteLoading />}>
      <AdminClubsListPage />
    </Suspense>
  );
}
