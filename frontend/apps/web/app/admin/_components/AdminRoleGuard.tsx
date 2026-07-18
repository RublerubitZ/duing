'use client';

import { useMeQuery } from '@duing/hooks';

import { LoadingGate } from '@/components/loading/LoadingGate';

/**
 * Defense-in-depth: middleware 가 이미 /admin/* 진입을 ADMIN 으로 제한하지만,
 * 토큰 클레임이 위조되거나 캐시된 페이지가 노출되는 코너 케이스를 막기 위해
 * 클라이언트에서 `useMeQuery` 의 실제 role 값을 한 번 더 확인한다.
 */
export function AdminRoleGuard({ children }: { children: React.ReactNode }) {
  const meQuery = useMeQuery();

  if (meQuery.isLoading) {
    return <LoadingGate label="권한 확인 중" />;
  }
  if (meQuery.data?.role !== 'ADMIN') {
    return (
      <p className="text-coral px-4 sm:px-6 md:px-10 py-12 text-sm">
        총동연(관리자) 권한이 필요합니다.
      </p>
    );
  }
  return <>{children}</>;
}
