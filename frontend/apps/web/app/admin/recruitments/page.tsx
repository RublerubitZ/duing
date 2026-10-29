import { Suspense } from 'react';

import { RouteLoading } from '@/app/_components/RouteLoading';
import { AdminRecruitmentsPage } from './_pages/AdminRecruitmentsPage';

// 검색어는 컴포넌트 상태이고, 상태·정렬 첫 값만 주소에서 읽는다 — useSearchParams 경계.
export default function Page() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <AdminRecruitmentsPage />
    </Suspense>
  );
}
