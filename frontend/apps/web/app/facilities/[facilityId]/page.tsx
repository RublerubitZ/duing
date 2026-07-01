'use client';

import { use } from 'react';

import { useFacilityDetailQuery } from '@duing/hooks';

import { FacilityTimeline } from '../_components/FacilityTimeline';
import { FacilityUpdateBanner } from '../_components/FacilityUpdateBanner';

export default function FacilityDetailPage({
  params,
}: {
  params: Promise<{ facilityId: string }>;
}) {
  const { facilityId: facilityIdParam } = use(params);
  const facilityId = Number(facilityIdParam);
  const detail = useFacilityDetailQuery(facilityId);

  if (detail.isLoading) {
    return <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>;
  }
  if (!detail.data) {
    return <p className="p-6 text-sm text-coral">시설을 찾을 수 없습니다.</p>;
  }

  const { facility, yearMonth, lastUpdatedAt, stale } = detail.data;
  const usingNow = facility.isUsingNow && facility.currentReservation !== null;

  return (
    <section className="bg-cream px-4 sm:px-6 md:px-10 pb-20 pt-8">
      <div className="max-w-layout mx-auto">
        <div className="mb-2 flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{
              background: usingNow ? '#2E6149' : '#9DB6A0',
              boxShadow: usingNow ? '0 0 0 3px #2E614933' : undefined,
            }}
            aria-hidden
          />
          <span className="text-[13px] font-bold" style={{ color: usingNow ? '#2E6149' : '#6F7574' }}>
            {usingNow ? '현재 사용 중' : '현재 이용 가능'}
          </span>
        </div>
        <h1 className="text-[28px] tracking-tightx md:text-[36px]" style={{ color: '#1F4A36' }}>
          {facility.roomName}
        </h1>
        {facility.location && <p className="mt-1 text-[14px] text-charcoal-2">{facility.location}</p>}

        <div className="mt-5">
          <FacilityUpdateBanner lastUpdatedAt={lastUpdatedAt} stale={stale} />
        </div>

        <div className="mt-5">
          <FacilityTimeline reservations={facility.reservations} yearMonth={yearMonth} />
        </div>
      </div>
    </section>
  );
}
