'use client';

import type { FacilityBookingSummary } from '@duing/types';
import { bookingDateLabel, bookingTimeLabel } from '@/app/_lib/bookingDisplay';
import { BookingStatusBadge } from '@/app/_components/BookingStatusBadge';

type Props = {
  booking: FacilityBookingSummary;
  onSelect: (bookingId: number) => void;
};

export function BookingRow({ booking, onSelect }: Props) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(booking.bookingId)}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-paper p-4 text-left motion-safe:transition-colors hover:border-sage"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-deep">
            {booking.roomName} · {bookingDateLabel(booking.date)} {bookingTimeLabel(booking.startTime, booking.endTime)}
          </p>
          <p className="mt-0.5 truncate text-xs text-charcoal-3">{booking.purpose}</p>
        </div>
        <BookingStatusBadge status={booking.status} />
      </button>
    </li>
  );
}
