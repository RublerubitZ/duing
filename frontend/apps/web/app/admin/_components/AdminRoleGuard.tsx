'use client';

import { useMeQuery } from '@duing/hooks';

import { useBoundedAuthStatus } from '@/app/_lib/useBoundedAuthStatus';
import { LoadingGate } from '@/components/loading/LoadingGate';

/**
 * Defense-in-depth: middleware 가 이미 /admin/* 진입을 ADMIN 으로 제한하지만,
 * 토큰 클레임이 위조되거나 캐시된 페이지가 노출되는 코너 케이스를 막기 위해
 * 클라이언트에서 `useMeQuery` 의 실제 role 값을 한 번 더 확인한다.
 */
export function AdminRoleGuard({ children }: { children: React.ReactNode }) {
  // 확인이 끝나지 않는 장애에서 영영 "확인 중" 에 머물지 않도록 상한을 둔 status 를 쓴다.
  const authStatus = useBoundedAuthStatus();
  const meQuery = useMeQuery();

  // 세션 확인 중(idle)에는 권한을 판정하지 않는다. useMeQuery 는 status 가 확정될 때까지
  // enabled:false 라 isLoading 이 false 로 내려오고(비활성 쿼리는 fetching 이 아니다),
  // 그대로 두면 로그인한 관리자가 콘솔을 열 때마다 권한 거부 문구를 먼저 보게 된다.
  if (authStatus === 'idle' || meQuery.isLoading) {
    return <LoadingGate label="권한 확인 중" />;
  }
  if (meQuery.data?.role !== 'ADMIN') {
    return (
      <p className="text-danger px-4 sm:px-6 md:px-10 py-12 text-sm">
        총동연(관리자) 권한이 필요합니다.
      </p>
    );
  }
  return <>{children}</>;
}
