'use client';

import { useFacilityUsageQuery } from '@duing/hooks';

import { FacilityOverviewTimeline } from '../_components/FacilityOverviewTimeline';
import { FacilityUpdateBanner } from '../_components/FacilityUpdateBanner';
import { FacilityUsageGuide } from '../_components/FacilityUsageGuide';

export function FacilityExplorePage() {
  const usageQuery = useFacilityUsageQuery();

  return (
    <div>
      <section className="border-b border-line bg-cream px-4 sm:px-6 md:px-10 pt-10 pb-6">
        <div className="max-w-layout mx-auto">
          <div className="mb-2 text-[13px] font-semibold tracking-wide08 text-ink">
            FACILITY · 학생회관 이용현황
          </div>
          <h1 className="text-[28px] tracking-tightx md:text-[40px]">시설 이용현황</h1>
          <p className="mt-2 text-[14px] text-charcoal-2">
            학생회관 공용시설의 예약 현황을 확인하세요.
          </p>
          {usageQuery.data && (
            <div className="mt-4">
              <FacilityUpdateBanner
                lastUpdatedAt={usageQuery.data.lastUpdatedAt}
                stale={usageQuery.data.stale}
              />
            </div>
          )}
        </div>
      </section>

      <section className="px-4 sm:px-6 md:px-10 pt-6 pb-10">
        <div className="max-w-layout mx-auto">
          {usageQuery.isLoading && <p className="text-sm text-charcoal-2">불러오는 중…</p>}
          {usageQuery.error && <p className="text-sm text-coral">시설 정보를 불러오지 못했어요.</p>}
          {usageQuery.data && usageQuery.data.facilities.length === 0 && (
            <p className="text-sm text-charcoal-2">표시할 시설이 없어요.</p>
          )}
          {usageQuery.data && usageQuery.data.facilities.length > 0 && (
            <FacilityOverviewTimeline facilities={usageQuery.data.facilities} />
          )}
        </div>
      </section>

      {/* 정적 안내라 이용현황 로딩·에러와 무관하게 항상 노출한다. */}
      <section className="px-4 sm:px-6 md:px-10 pb-20">
        <div className="max-w-layout mx-auto">
          <FacilityUsageGuide />
        </div>
      </section>
    </div>
  );
}
