'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { FacilityBookingSummary } from '@duing/types';
import { useClubFacilityBookingsQuery } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { MANAGE_TAB_KEYS, MANAGE_TAB_LABELS, manageTabOf, type ManageTabKey } from '../_lib/bookingTabs';
import { BookingDetailModal } from './BookingDetailModal';
import { BookingRow } from './BookingRow';
import { LoadingGate } from '@/components/loading/LoadingGate';

const EMPTY_MESSAGES: Record<ManageTabKey, string> = {
  ACTIVE: '진행중인 예약 신청이 없어요.',
  PAST: '지난 예약이 없어요.',
};

// KST(Asia/Seoul) 오늘 날짜(yyyy-MM-dd). facilities/_lib/facilityTimeline#seoulDateIso 와 동일 접근이지만
// 라우트 스코프 밖 import 를 피하려 여기 인라인한다(en-CA 로케일 = ISO yyyy-MM-dd 포맷).
function seoulTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export function FacilityBookingsView({ clubId }: { clubId: number }) {
  const [activeTab, setActiveTab] = useState<ManageTabKey>('ACTIVE');
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  // clubId 유효성(운영 권한·NaN)은 page.tsx 가 managedClubs 로 게이트해 notFound 처리하므로,
  // 여기서는 항상 유효한 clubId 만 받는다(sibling photos·members 관례와 동일).
  const bookingsQuery = useClubFacilityBookingsQuery(clubId);

  const bookings = bookingsQuery.data ?? [];
  const grouped = useMemo(() => {
    const active: FacilityBookingSummary[] = [];
    const past: FacilityBookingSummary[] = [];
    const todayIso = seoulTodayIso();
    for (const booking of bookings) {
      (manageTabOf(booking, todayIso) === 'ACTIVE' ? active : past).push(booking);
    }
    return { active, past };
  }, [bookings]);

  const displayedBookings = activeTab === 'ACTIVE' ? grouped.active : grouped.past;

  return (
    <section>
      <header>
        <p className="text-[11px] font-bold tracking-wide08 text-ink">MY RESERVATIONS · 동아리 예약</p>
        <h1 className="mt-1 font-display text-2xl tracking-tightx text-ink-deep">시설 예약 현황</h1>
      </header>

      <div className="mt-5 flex gap-1 border-b border-line" role="tablist" aria-label="예약 상태 필터">
        {MANAGE_TAB_KEYS.map((tabKey) => {
          const isActive = activeTab === tabKey;
          const count = tabKey === 'ACTIVE' ? grouped.active.length : grouped.past.length;
          return (
            <button
              key={tabKey}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tabKey)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm motion-safe:transition-colors ${
                isActive
                  ? 'border-b-2 border-ink font-medium text-ink-deep'
                  : 'text-charcoal-3 hover:text-charcoal'
              }`}
            >
              {MANAGE_TAB_LABELS[tabKey]}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                  isActive ? 'bg-ink text-cream' : 'bg-graysoft text-charcoal-3'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {bookingsQuery.isLoading && (
          <LoadingGate label="예약 내역 불러오는 중" className="min-h-0 py-8" />
        )}
        {bookingsQuery.isError && (
          <div role="alert" className="text-sm text-charcoal-2">
            <p>예약 내역을 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
            <button
              type="button"
              className="btn btn-ghost mt-2"
              onClick={() => void bookingsQuery.refetch()}
            >
              다시 시도
            </button>
          </div>
        )}
        {bookingsQuery.isSuccess && bookings.length === 0 && (
          <div>
            <p className="text-sm text-charcoal-3">아직 신청한 예약이 없어요.</p>
            {/* §9.8 빈 상태 → 예약 홈으로 유도(신청 진입점 제공) */}
            <Link href={toRoute('/facilities')} className="btn btn-secondary mt-3 inline-flex">
              예약하러 가기
            </Link>
          </div>
        )}
        {bookingsQuery.isSuccess && bookings.length > 0 && displayedBookings.length === 0 && (
          <p className="text-sm text-charcoal-3">{EMPTY_MESSAGES[activeTab]}</p>
        )}
        {displayedBookings.length > 0 && (
          <ul className="space-y-2">
            {displayedBookings.map((booking) => (
              <BookingRow key={booking.bookingId} booking={booking} onSelect={setSelectedBookingId} />
            ))}
          </ul>
        )}
      </div>

      {selectedBookingId !== null && (
        <BookingDetailModal
          clubId={clubId}
          bookingId={selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
        />
      )}
    </section>
  );
}
