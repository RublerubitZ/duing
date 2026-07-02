'use client';

import { use, useState } from 'react';

import { useFacilityDetailQuery } from '@duing/hooks';

import { FacilityTimeline } from '../_components/FacilityTimeline';
import { FacilityUpdateBanner } from '../_components/FacilityUpdateBanner';
import {
  monthDiff,
  seoulDateIso,
  shiftYearMonth,
  yearMonthLabel,
} from '../_lib/facilityTimeline';

// 백엔드 수집 경계(설계문서 §16.2)와 동일 — 현재월 ±12개월 밖은 이동 불가.
const MONTH_NAV_LIMIT = 12;

export default function FacilityDetailPage({
  params,
}: {
  params: Promise<{ facilityId: string }>;
}) {
  const { facilityId: facilityIdParam } = use(params);
  const facilityId = Number(facilityIdParam);

  // 현재월(KST wall-clock) 기본값 — prod JVM/브라우저 타임존과 무관하게 Asia/Seoul 기준.
  const currentYearMonth = seoulDateIso(new Date()).slice(0, 7);
  const [yearMonth, setYearMonth] = useState(currentYearMonth);
  const detail = useFacilityDetailQuery(facilityId, yearMonth);

  const diffFromCurrent = monthDiff(currentYearMonth, yearMonth);
  const prevDisabled = diffFromCurrent <= -MONTH_NAV_LIMIT;
  const nextDisabled = diffFromCurrent >= MONTH_NAV_LIMIT;

  // 미캐시 월 첫 진입은 온디맨드 수집 동안 로딩 표시(§16.2) — 폴링/refetch interval 없음.
  if (detail.isLoading) {
    return <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>;
  }
  if (!detail.data) {
    return <p className="p-6 text-sm text-coral">시설을 찾을 수 없습니다.</p>;
  }

  const { facility, lastUpdatedAt, stale } = detail.data;
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

        {/* 월 이동 — 현재월 ±12개월 경계에서 비활성화(§16.2) */}
        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setYearMonth(shiftYearMonth(yearMonth, -1))}
            disabled={prevDisabled}
            aria-disabled={prevDisabled}
            className="rounded-md px-3 py-1.5 text-[13px] font-semibold text-charcoal-2 hover:bg-graysoft disabled:cursor-not-allowed disabled:text-charcoal-3 motion-safe:transition-colors"
          >
            ← 이전 달
          </button>
          <span className="text-[15px] font-bold" style={{ color: '#1F4A36' }}>
            {yearMonthLabel(yearMonth)}
          </span>
          <button
            type="button"
            onClick={() => setYearMonth(shiftYearMonth(yearMonth, 1))}
            disabled={nextDisabled}
            aria-disabled={nextDisabled}
            className="rounded-md px-3 py-1.5 text-[13px] font-semibold text-charcoal-2 hover:bg-graysoft disabled:cursor-not-allowed disabled:text-charcoal-3 motion-safe:transition-colors"
          >
            다음 달 →
          </button>
        </div>

        <div className="mt-3">
          {/* key 로 월 전환 시 날짜 선택을 리셋 — defaultDay 로직(현재월=오늘, 그 외=1일)이 다시 적용된다 */}
          <FacilityTimeline key={yearMonth} reservations={facility.reservations} yearMonth={yearMonth} />
        </div>
      </div>
    </section>
  );
}
