'use client';

import Link from 'next/link';
import { useMeQuery } from '@duing/hooks';
import { toRoute } from '../_lib/route';

/**
 * role === 'ADMIN' 인 사용자에게만 노출되는 총동연 콘솔 진입 링크.
 * 비ADMIN 또는 비로그인 상태에서는 아무것도 렌더하지 않는다.
 */
export function HomeNavAdminLink({ className }: { className?: string }) {
  const meQuery = useMeQuery();
  if (meQuery.data?.role !== 'ADMIN') return null;

  return (
    <Link href={toRoute('/admin/clubs')} className={className}>
      총동연
    </Link>
  );
}
