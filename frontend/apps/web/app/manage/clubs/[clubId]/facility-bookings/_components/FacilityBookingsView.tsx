'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useClubFacilityBookingsQuery } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import {
  BOOKING_TAB_KEYS,
  BOOKING_TAB_LABELS,
  bookingTabOf,
  type BookingTabKey,
} from '../_lib/bookingDisplay';
import { BookingDetailModal } from './BookingDetailModal';
import { BookingRow } from './BookingRow';

const EMPTY_MESSAGES: Record<BookingTabKey, string> = {
  ALL: '아직 신청한 예약이 없어요.',
  ACTIVE: '진행 중인 예약 신청이 없어요.',
  CONFIRMED: '확정된 예약이 없어요.',
  CLOSED: '종료된 예약 신청이 없어요.',
};

export function FacilityBookingsView({ clubId }: { clubId: number }) {
  const [activeTab, setActiveTab] = useState<BookingTabKey>('ALL');
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  // clubId 유효성(운영 권한·NaN)은 page.tsx 가 managedClubs 로 게이트해 notFound 처리하므로,
  // 여기서는 항상 유효한 clubId 만 받는다(sibling photos·members 관례와 동일).
  const bookingsQuery = useClubFacilityBookingsQuery(clubId);

  const bookings = bookingsQuery.data ?? [];
  const displayedBookings = useMemo(
    () => (activeTab === 'ALL' ? bookings : bookings.filter((booking) => bookingTabOf(booking.status) === activeTab)),
    [bookings, activeTab],
  );

  return (
    <section>
      <h1 className="font-display text-xl text-ink-deep">시설 예약</h1>
      <p className="mt-1 text-sm text-charcoal-3">동아리 이름으로 신청한 시설 대관 내역이에요.</p>

      <div className="mt-4 flex gap-1 border-b border-line" role="tablist" aria-label="예약 상태 필터">
        {BOOKING_TAB_KEYS.map((tabKey) => (
          <button
            key={tabKey}
            type="button"
            role="tab"
            aria-selected={activeTab === tabKey}
            onClick={() => setActiveTab(tabKey)}
            className={`px-3 py-2 text-sm motion-safe:transition-colors ${
              activeTab === tabKey
                ? 'border-b-2 border-ink font-medium text-ink-deep'
                : 'text-charcoal-3 hover:text-charcoal'
            }`}
          >
            {BOOKING_TAB_LABELS[tabKey]}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {bookingsQuery.isLoading && <p className="text-sm text-charcoal-3">불러오는 중…</p>}
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
        {bookingsQuery.isSuccess && displayedBookings.length === 0 && (
          <div>
            <p className="text-sm text-charcoal-3">{EMPTY_MESSAGES[activeTab]}</p>
            {/* §9.8 빈 상태 → 예약 홈으로 유도(신청 진입점 제공) */}
            <Link href={toRoute('/facilities')} className="btn btn-secondary mt-3 inline-flex">
              예약하러 가기
            </Link>
          </div>
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
