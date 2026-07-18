import type { BookingStatus } from '@duing/types';
import { BOOKING_STATUS_META } from '@/app/_lib/bookingDisplay';

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const meta = BOOKING_STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${meta.badgeClass}`}>
        {meta.label}
      </span>
      {meta.subLabel && <span className="text-[11px] text-charcoal-3">{meta.subLabel}</span>}
    </span>
  );
}
