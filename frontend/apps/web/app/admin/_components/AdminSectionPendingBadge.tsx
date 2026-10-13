'use client';

import { useAdminPendingCountsQuery } from '@duing/hooks';

import type { AdminPendingCountKey } from '../_lib/adminSections';

/**
 * 콘솔 첫 화면 카드의 미처리 건수. 페이지는 서버 컴포넌트로 두고 건수만 클라이언트에서 읽는다 —
 * 사이드바와 같은 쿼리 키라 요청은 한 번이고 숫자도 사이드바 뱃지와 어긋나지 않는다.
 * 0건·조회 전·조회 실패에는 아무것도 그리지 않는다.
 */
export function AdminSectionPendingBadge({ pendingCountKey }: { pendingCountKey: AdminPendingCountKey }) {
  const { data: pendingCounts } = useAdminPendingCountsQuery();
  const pendingCount = pendingCounts?.[pendingCountKey] ?? 0;
  if (pendingCount <= 0) return null;
  return (
    <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[12px] font-bold tabular-nums text-charcoal-2 ring-1 ring-line">
      {pendingCount}건 처리 대기
    </span>
  );
}
