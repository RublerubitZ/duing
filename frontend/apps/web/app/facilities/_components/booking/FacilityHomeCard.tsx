'use client';

import type { FacilityItem } from '@duing/types';
import { facilityIcon } from '@/app/_lib/facilityIcon';
import { todayFreeSlotCount } from '../../_lib/bookingHome';
import { seoulDateIso } from '../../_lib/facilityTimeline';

type Props = {
  facility: FacilityItem;
  windowLabel: string | null;
  onSelect: (facilityId: number) => void;
};

export function FacilityHomeCard({ facility, windowLabel, onSelect }: Props) {
  // reservations 는 월 전체 예약이므로 오늘 남은 칸 계산 전에 오늘 것만 걸러낸다(§Task2 계약).
  const now = new Date();
  const todayIso = seoulDateIso(now);
  const todayReservations = facility.reservations.filter((slot) => slot.date === todayIso);
  const freeCount = todayFreeSlotCount(todayReservations, now);
  return (
    <button
      type="button"
      onClick={() => onSelect(facility.id)}
      className="flex w-full flex-col overflow-hidden rounded-xl border border-line bg-paper text-left motion-safe:transition-shadow hover:shadow-md"
    >
      <div className="relative grid h-24 place-items-center bg-gradient-to-br from-sage-soft to-sage-mist">
        <span aria-hidden className="text-4xl">{facilityIcon(facility.roomName)}</span>
        {facility.isUsingNow && (
          <span className="absolute right-3 top-3 rounded-full bg-paper/90 px-2 py-0.5 text-[11px] font-bold text-coral">
            지금 사용중
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="text-base font-bold text-ink-deep">{facility.roomName}</h3>
        {facility.location && <p className="text-xs text-charcoal-3">{facility.location}</p>}
        {windowLabel && (
          <p className="text-xs text-charcoal-2">
            예약 가능 <span className="font-bold text-ink">{windowLabel}</span>
          </p>
        )}
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-charcoal-3">오늘 남은 시간</span>
            <span className="tabular-nums font-bold text-ink">
              {freeCount === null ? '오늘 마감' : freeCount === 0 ? '없음' : `${freeCount}칸`}
            </span>
          </div>
          <div className="flex gap-[2px]" aria-hidden>
            {Array.from({ length: 10 }).map((_, index) => (
              <span
                key={index}
                className={`h-1.5 flex-1 rounded-sm ${
                  freeCount !== null && index < Math.min(10, freeCount) ? 'bg-sage' : 'bg-graysoft'
                }`}
              />
            ))}
          </div>
        </div>
        <span className="btn btn-secondary mt-3 w-full justify-center">날짜 보기 →</span>
      </div>
    </button>
  );
}
