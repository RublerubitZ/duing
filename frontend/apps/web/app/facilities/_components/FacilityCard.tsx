'use client';

import { Link } from 'next-view-transitions';

import { toRoute } from '../../_lib/route';
import type { FacilityItem, ReservationSlot } from '@duing/types';

const INK = '#1F4A36';
const INK_SOFT = '#2E6149';
const AVAILABLE_DOT = '#9DB6A0';
const MUTED = '#6F7574';

function slotTime(slot: ReservationSlot): string {
  return `${slot.start}~${slot.end}`;
}

export function FacilityCard({ facility }: { facility: FacilityItem }) {
  const usingNow = facility.isUsingNow && facility.currentReservation !== null;
  const dotColor = usingNow ? INK_SOFT : AVAILABLE_DOT;

  return (
    <Link
      href={toRoute(`/facilities/${facility.id}`)}
      className="relative flex flex-col gap-3 overflow-hidden rounded-[18px] border border-line bg-paper p-[18px] transition hover:shadow-2"
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: dotColor, boxShadow: usingNow ? `0 0 0 3px ${dotColor}33` : undefined }}
          aria-hidden
        />
        <span className="text-[12.5px] font-bold" style={{ color: usingNow ? INK_SOFT : MUTED }}>
          {usingNow ? '현재 사용 중' : '현재 이용 가능'}
        </span>
      </div>

      <div>
        <h3 className="text-[18px] leading-[1.25]" style={{ color: INK }}>
          {facility.roomName}
        </h3>
        {facility.location && <p className="mt-1 text-[13px] text-charcoal-3">{facility.location}</p>}
      </div>

      <div className="mt-1 border-t border-dashed border-line pt-3 text-[13px] text-charcoal-2">
        {usingNow && facility.currentReservation ? (
          <p>
            <span className="font-bold" style={{ color: INK_SOFT }}>
              {slotTime(facility.currentReservation)}
            </span>{' '}
            · {facility.currentReservation.organization}
          </p>
        ) : facility.nextReservation ? (
          <p className="text-charcoal-3">
            다음 예약 {slotTime(facility.nextReservation)} · {facility.nextReservation.organization}
          </p>
        ) : (
          <p className="text-charcoal-3">예정된 예약이 없어요</p>
        )}
      </div>

      <span className="mt-1 self-start text-[12.5px] font-semibold" style={{ color: INK }}>
        상세보기 →
      </span>
    </Link>
  );
}
