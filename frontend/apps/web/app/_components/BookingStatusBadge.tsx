import type { BookingStatus } from '@duing/types';
import { BOOKING_STATUS_META } from '@/app/_lib/bookingDisplay';
import { StatusPill } from '@/app/_components/StatusPill';

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const meta = BOOKING_STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1">
      <StatusPill label={meta.label} className={meta.badgeClass} />
      {meta.subLabel && <span className="text-[11px] text-charcoal-3">{meta.subLabel}</span>}
    </span>
  );
}
