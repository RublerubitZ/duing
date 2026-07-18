'use client';

import { formatLastUpdated } from '../_lib/facilityTimeline';

/** 캐시 폴백 경고 — 예약 판단에 영향을 주는 데이터 정확성 신호라 캘린더 상단 위치를 유지한다. */
export function FacilityStaleNotice({ stale }: { stale: boolean }) {
  if (!stale) return null;
  return (
    <p
      role="status"
      className="inline-flex rounded-[12px] px-3.5 py-2 text-[13px] font-semibold"
      style={{ background: '#FBEFD7', color: '#8E6620' }}
    >
      현재 최신 캐시 데이터를 표시하고 있습니다
    </p>
  );
}

/** 마지막 업데이트 — 페이지 최하단 보조 텍스트(예약 기능보다 낮은 시각 우선순위). */
export function FacilityLastUpdated({ lastUpdatedAt }: { lastUpdatedAt: string | null }) {
  const updatedLabel = formatLastUpdated(lastUpdatedAt);
  if (updatedLabel === '') return null;
  return <p className="text-[11px] text-charcoal-3">마지막 업데이트 {updatedLabel}</p>;
}
