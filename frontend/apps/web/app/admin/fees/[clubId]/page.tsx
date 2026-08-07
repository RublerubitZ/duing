import { Suspense } from 'react';

import { RouteLoading } from '@/app/_components/RouteLoading';
import { AdminFeeClubDetailPage } from './_pages/AdminFeeClubDetailPage';

type Props = {
  params: Promise<{ clubId: string }>;
};

export default async function Page({ params }: Props) {
  const { clubId } = await params;
  return (
    // useSearchParams 경계 — fallback null 이면 프리렌더 HTML·하이드레이션 전 화면이 통째로 백지가 된다.
    <Suspense fallback={<RouteLoading />}>
      <AdminFeeClubDetailPage clubId={Number(clubId)} />
    </Suspense>
  );
}
