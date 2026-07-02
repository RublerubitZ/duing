'use client';

import { formatLastUpdated } from '../_lib/facilityTimeline';

export function FacilityUpdateBanner({
  lastUpdatedAt,
  stale,
}: {
  lastUpdatedAt: string | null;
  stale: boolean;
}) {
  const updatedLabel = formatLastUpdated(lastUpdatedAt);
  return (
    <div>
      {updatedLabel && (
        <p className="text-[12.5px] text-charcoal-3">마지막 업데이트 {updatedLabel}</p>
      )}
      {stale && (
        <p
          role="status"
          className="mt-2 inline-flex rounded-[12px] px-3.5 py-2 text-[13px] font-semibold"
          style={{ background: '#FBEFD7', color: '#8E6620' }}
        >
          현재 최신 캐시 데이터를 표시하고 있습니다
        </p>
      )}
    </div>
  );
}
