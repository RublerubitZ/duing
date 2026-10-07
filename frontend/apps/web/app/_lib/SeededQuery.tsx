import { dehydrate, HydrationBoundary, QueryClient, type QueryKey } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type Props = {
  queryKey: QueryKey;
  data: unknown;
  children: ReactNode;
};

/**
 * 서버에서 받은 공개 데이터 한 건을 클라이언트 React Query 캐시에 심는다(서버 컴포넌트).
 * 하위 클라이언트 컴포넌트는 서버 렌더·하이드레이션 첫 프레임부터 데이터로 그려져 초기 HTML 에 본문이 들어간다.
 *
 * <p>updatedAt 0 — 마운트 직후 항상 stale 이라 지금처럼 방문마다 다시 받는다. ISR HTML 의 익명 스냅샷이
 * 로그인 사용자에게 남지 않는다(연락처처럼 뷰어에 따라 달라지는 필드). 이미 캐시에 있는 같은 키는 덮지 않는다
 * — hydrate 는 더 새로운 dataUpdatedAt 만 반영한다(클라이언트 내비게이션).
 */
export function SeededQuery({ queryKey, data, children }: Props) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(queryKey, data, { updatedAt: 0 });
  return <HydrationBoundary state={dehydrate(queryClient)}>{children}</HydrationBoundary>;
}
