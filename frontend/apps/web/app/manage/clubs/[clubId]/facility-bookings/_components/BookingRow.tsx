'use client';

import Link from 'next/link';
import type { FacilityBookingSummary } from '@duing/types';
import { facilityIcon } from '@/app/_lib/facilityIcon';
import { bookingDateLabel, bookingTimeLabel } from '@/app/_lib/bookingDisplay';
import { toRoute } from '@/app/_lib/route';
import { BookingStatusBadge } from '@/app/_components/BookingStatusBadge';

const STATUS_NOTES: Partial<Record<FacilityBookingSummary['status'], string>> = {
  PENDING: '관리자 검토 중',
  APPROVED: '승인됨 · 학교 반영 대기',
  CONFIRMED: '예약 확정',
  CONFLICT: '학교 예약과 충돌 — 다른 시간이 필요해요',
};

type Props = {
  booking: FacilityBookingSummary;
  onSelect: (bookingId: number) => void;
};

export function BookingRow({ booking, onSelect }: Props) {
  const isConflict = booking.status === 'CONFLICT';
  const note = STATUS_NOTES[booking.status];
  return (
    <li>
      <div
        className={`rounded-xl border bg-paper p-4 motion-safe:transition-colors ${
          isConflict ? 'border-coral/40' : 'border-line hover:border-sage'
        }`}
      >
        <button
          type="button"
          onClick={() => onSelect(booking.bookingId)}
          className="flex w-full items-center gap-3 text-left"
        >
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-graysoft text-xl">
            {facilityIcon(booking.roomName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-[15px] font-bold text-ink-deep">{booking.roomName}</span>
              <BookingStatusBadge status={booking.status} />
            </span>
            <span className="mt-0.5 block tabular-nums text-[13px] text-charcoal-2">
              {bookingDateLabel(booking.date)} · {bookingTimeLabel(booking.startTime, booking.endTime)}
            </span>
            <span className="mt-0.5 block truncate text-xs text-charcoal-3">
              {booking.purpose}
              {note && ` · ${note}`}
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-xs text-charcoal-3">상세 ›</span>
        </button>
        {isConflict && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-coral/10 px-3 py-2">
            <p className="flex-1 text-xs leading-relaxed text-coral">
              승인 후 학교 예약과 겹쳐 확정되지 못했어요. 다른 시간으로 다시 신청해주세요.
            </p>
            <Link
              href={toRoute(`/facilities?facilityId=${booking.facilityId}`)}
              className="btn btn-sm shrink-0 rounded-[10px] bg-coral text-white"
              onClick={(event) => event.stopPropagation()}
            >
              다시 신청
            </Link>
          </div>
        )}
      </div>
    </li>
  );
}
