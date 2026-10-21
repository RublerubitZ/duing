'use client';

import Link from 'next/link';
import { useMeQuery } from '@duing/hooks';
import { toRoute } from '../_lib/route';
import { useHydrated } from '../_lib/useHydrated';

/**
 * role === 'ADMIN' 인 사용자에게만 노출되는 총동연 콘솔 진입 링크.
 * 비ADMIN 또는 비로그인 상태에서는 아무것도 렌더하지 않는다.
 */
export function HomeNavAdminLink({ className }: { className?: string }) {
  const meQuery = useMeQuery();
  const hydrated = useHydrated();
  // 하이드레이션 프레임은 서버처럼 비운다 — 부팅 세션 복원(me 선요청)이 본문보다 먼저 끝나면 서버 HTML 에 없는 링크가 생겨 어긋난다.
  if (!hydrated || meQuery.data?.role !== 'ADMIN') return null;

  return (
    <Link href={toRoute('/admin/clubs')} className={className} title="총동아리연합회 콘솔">
      총동연
    </Link>
  );
}
