'use client';

import Link from 'next/link';
import { useClubFacilityBookingsQuery, useManagedClubsQuery } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import { toRoute } from '@/app/_lib/route';

/** 예약 홈 상단 "내 신청 N건 진행 중" 칩(§9.6) — 로그인 운영진에게만 보인다. */
export function MyBookingsChip() {
  const authStatus = useAuthStore((state) => state.status);
  const managedClubsQuery = useManagedClubsQuery({ enabled: authStatus === 'authenticated' });
  const managedClubs = managedClubsQuery.data ?? [];
  const singleClubId = managedClubs.length === 1 ? managedClubs[0]?.clubId : undefined;
  const bookingsQuery = useClubFacilityBookingsQuery(singleClubId);

  if (authStatus !== 'authenticated' || managedClubs.length === 0) return null;

  if (singleClubId !== undefined) {
    // "진행 중" = 관리 화면 진행 중 탭과 동일 정의(PENDING·APPROVED·CONFLICT) — CONFLICT 는
    // 주의가 필요한 상태라 오히려 진입 유도가 필요하다.
    const activeCount = (bookingsQuery.data ?? []).filter(
      (booking) =>
        booking.status === 'PENDING' || booking.status === 'APPROVED' || booking.status === 'CONFLICT',
    ).length;
    if (activeCount === 0) return null;
    return (
      <Link
        href={toRoute(`/manage/clubs/${singleClubId}/facility-bookings`)}
        className="inline-flex items-center gap-1 rounded-full border border-line bg-paper px-3 py-1.5 text-xs text-charcoal-2 hover:border-sage"
      >
        내 신청 <span className="font-bold text-ink">{activeCount}건</span> 진행 중 →
      </Link>
    );
  }

  // 운영 동아리가 여럿이면 카운트 없이 관리 홈으로(재량 결정 ② — 동아리별 집계는 P2)
  return (
    <Link
      href={toRoute('/manage')}
      className="inline-flex items-center rounded-full border border-line bg-paper px-3 py-1.5 text-xs text-charcoal-2 hover:border-sage"
    >
      내 예약 관리 →
    </Link>
  );
}
