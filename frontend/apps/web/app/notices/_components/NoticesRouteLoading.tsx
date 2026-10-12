'use client';

import { useRoutePathname } from '@/app/_lib/useRoutePathname';

import { NoticeDetailSkeleton } from './NoticeDetailSkeleton';
import { NoticeListSkeleton } from './NoticeListSkeleton';

// 소식 경로 로딩 경계(app/notices/loading.tsx)의 그림 — 이 경계는 목록 페이지뿐 아니라 상세 세그먼트까지 감싸, 프리페치 전
// 목록에서 상세로 이동하면 상세 세그먼트보다 먼저 잡힌다(16.3.6 낙관적 라우팅). 그래서 그림은 도착 경로로 고른다 — 경로는
// 정규화 훅으로 읽는다(끝 슬래시·ISR 재생성 경로를 접는다 — useRoutePathname 문서).
export function NoticesRouteLoading() {
  return useRoutePathname() === '/notices' ? <NoticeListSkeleton /> : <NoticeDetailSkeleton />;
}
