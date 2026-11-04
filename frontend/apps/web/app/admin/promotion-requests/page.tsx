import { Suspense } from 'react';

import { RouteLoading } from '@/app/_components/RouteLoading';
import { AdminPromotionRequestsListPage } from './_pages/AdminPromotionRequestsListPage';

export default function Page() {
  return (
    // useSearchParams 경계 — 총동연 홈 영역 칸이 ?status= 로 첫 탭을 고른다.
    <Suspense fallback={<RouteLoading />}>
      <AdminPromotionRequestsListPage />
    </Suspense>
  );
}
