'use client';

import type { AdminFacilityBookingSummary } from '@duing/types';
import { bookingDateLabel, bookingTimeLabel } from '@/app/_lib/bookingDisplay';
import { BookingStatusBadge } from '@/app/_components/BookingStatusBadge';

type Props = {
  rows: AdminFacilityBookingSummary[];
  onSelect: (bookingId: number) => void;
};

export function AdminBookingQueueTable({ rows, onSelect }: Props) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.bookingId}>
          <button
            type="button"
            onClick={() => onSelect(row.bookingId)}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-paper p-4 text-left motion-safe:transition-colors hover:border-sage"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-deep">
                {row.clubName} · {row.roomName} · {bookingDateLabel(row.date)}{' '}
                {bookingTimeLabel(row.startTime, row.endTime)}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-charcoal-3">
                <span className="truncate">{row.purpose}</span>
                {row.approvedWaitingDays !== undefined && (
                  <span className={row.approvedWaitingDays >= 7 ? 'font-bold text-coral' : ''}>
                    학교 반영 대기 D+{row.approvedWaitingDays}
                  </span>
                )}
                {row.conflictSuspected && (
                  <span className="rounded-full bg-coral/15 px-2 py-0.5 font-bold text-coral">충돌 의심</span>
                )}
                {row.partiallyMatched && (
                  <span className="rounded-full bg-[#FBEFD7] px-2 py-0.5 font-bold text-[#8E6620]">부분 반영</span>
                )}
              </p>
            </div>
            <BookingStatusBadge status={row.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}
