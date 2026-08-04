'use client';

import { useMeQuery } from '@duing/hooks';

import { useHydrated } from '@/app/_lib/useHydrated';
import { useSeededAuthStatus } from '@/app/_lib/useSeededAuthStatus';
import { LoadingGate } from '@/components/loading/LoadingGate';

/**
 * Defense-in-depth: middleware 가 이미 /admin/* 진입을 ADMIN 으로 제한하지만,
 * 토큰 클레임이 위조되거나 캐시된 페이지가 노출되는 코너 케이스를 막기 위해
 * 클라이언트에서 `useMeQuery` 의 실제 role 값을 한 번 더 확인한다.
 * role 은 시드에 실리지 않으므로(§9.3) 판정은 항상 서버 프로필(meQuery)로만 한다.
 */
export function AdminRoleGuard({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const authStatus = useSeededAuthStatus();
  const meQuery = useMeQuery();

  // /admin 은 A′(SSR 시드) 라우트가 아니라 SSR/프리렌더 프레임이 스토어 초기값(unauthenticated)
  // 으로 그려진다 — 그 프레임에서 판정하면 거의 전원 진짜 관리자인 방문자가 첫 페인트부터
  // 하이드레이션까지 거부 문구를 본다(metric 4). 미하이드레이션 프레임은 판정 자체를 미룬다.
  // 시드된 authenticated 에서는 meQuery 가 즉시 활성이다 — 프로필이 도착할 때까지가 "확인 중"
  // 이고, 조회 실패는 권한 미확인이므로 거부로 떨어뜨린다(관리자 콘솔은 fail-closed).
  if (
    !hydrated ||
    (authStatus === 'authenticated' && !meQuery.isError && meQuery.data === undefined)
  ) {
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
