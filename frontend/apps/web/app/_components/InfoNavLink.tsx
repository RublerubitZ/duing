'use client';

import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';

import { useLastInfoPath } from '@/app/_lib/useLastInfoPath';

/**
 * HomeNav(Server Component)용 "정보" 링크 — 마지막 방문 허브 경로 이동이 클라이언트 훅을
 * 요구해 HomeNavAdminLink/HomeNavAuthSlot 처럼 슬롯으로 분리했다. 이동 정책은 getLastInfoPath 단일 지점.
 */
export function InfoNavLink({ className }: { className?: string }) {
  const pathname = usePathname();
  const lastInfoPath = useLastInfoPath(pathname);

  return (
    <Link href={lastInfoPath} className={className}>
      정보
    </Link>
  );
}
