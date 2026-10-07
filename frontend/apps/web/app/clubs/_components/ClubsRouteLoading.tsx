'use client';

import { usePathname } from 'next/navigation';

import { RouteLoading } from '@/app/_components/RouteLoading';

import { ClubDetailSkeleton } from '../[clubId]/_components/ClubDetailSkeleton';
import { ClubExploreSkeleton } from './ClubExploreSkeleton';

const CLUB_DETAIL_PATH = /^\/clubs\/[^/]+\/?$/;

// /clubs 아래 경로 로딩 경계(app/clubs/loading.tsx·[clubId]/loading.tsx)가 함께 쓰는 그림 — 경계는 자기 페이지뿐 아니라
// 하위 세그먼트까지 감싸, 프리페치 전 상세·멤버로 이동하면 부모 경계가 먼저 잡힌다(16.3.6 낙관적 라우팅이 상세를 지연 노드로
// 먼저 커밋). 그래서 그림은 경계 위치가 아니라 도착 경로로 고른다 — 커밋된 라우터 경로가 곧 도착 주소다.
// 멤버 화면은 모양이 달라 공용 스피너를 쓴다.
export function ClubsRouteLoading() {
  const pathname = usePathname();
  if (pathname === '/clubs') {
    // 탐색 스켈레톤은 서버 fallback·화면 안 로딩과 같이 쓰는 컴포넌트라 지연을 안에 두지 않는다 — 지연은 래퍼, 펄스는 안쪽.
    return (
      <div className="delayed-show">
        <ClubExploreSkeleton />
      </div>
    );
  }
  if (CLUB_DETAIL_PATH.test(pathname)) return <ClubDetailSkeleton />;
  return <RouteLoading />;
}
