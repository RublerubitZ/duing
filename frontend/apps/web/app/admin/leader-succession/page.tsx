import { Suspense } from 'react';

import { RouteLoading } from '@/app/_components/RouteLoading';
import { AdminSuccessionListPage } from './_pages/AdminSuccessionListPage';

export default function Page() {
  return (
    // useSearchParams 경계 — 총동연 홈 영역 칸이 ?status= 로 첫 탭을 고른다.
    <Suspense fallback={<RouteLoading />}>
      <AdminSuccessionListPage />
    </Suspense>
  );
}
