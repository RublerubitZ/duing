'use client';

import Link from 'next/link';
import { useAdminFacilityBookingSummaryQuery } from '@duing/hooks';
import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { DASHBOARD_CHIP_TONE_CLASS } from '@/components/dashboard/dashboardChipTone';

// 시설 예약 화면 요약 카드(BookingSummaryCards "학교 반영 대기")와 같은 경고 기준 — 그 전에는 경고색을 칠하지 않는다.
const SCHOOL_SYNC_LATE_DAYS = 7;

export function AdminSchoolSyncCard() {
  const summaryQuery = useAdminFacilityBookingSummaryQuery();
  const bookingCounts = summaryQuery.data;

  return (
    <DashboardCard
      title="학교 반영 대기"
      // 로딩 = 아직 data 가 없고 실패도 아님(오프라인으로 멈춘 조회 포함).
      isLoading={bookingCounts === undefined && !summaryQuery.isError}
      isError={summaryQuery.isError}
      // 응답이 없을 때만 빈 상태 — 0건은 본문("반영 대기 없음")으로 그려 링크를 남긴다.
      isEmpty={!bookingCounts}
      footer={
        <Link
          href={toRoute('/admin/facility-bookings?tab=review')}
          className="inline-flex min-h-11 items-center text-xs font-medium text-ink hover:underline"
        >
          시설 예약 관리
        </Link>
      }
    >
      {bookingCounts ? (
        <div className="flex flex-col gap-2 text-sm">
          <p className="break-keep text-xs text-charcoal-3">승인했지만 학교 일정에 아직 안 보이는 예약</p>
          {bookingCounts.approvedWaitingCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-bold tabular-nums text-ink">{bookingCounts.approvedWaitingCount}건</span>
              <span
                className={cn(
                  'max-w-full break-keep rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                  DASHBOARD_CHIP_TONE_CLASS[bookingCounts.oldestApprovedWaitingDays >= SCHOOL_SYNC_LATE_DAYS ? 'late' : 'info'],
                )}
              >
                가장 오래 기다림 D+{bookingCounts.oldestApprovedWaitingDays}
              </span>
            </div>
          ) : (
            <p className="font-medium text-charcoal-2">반영 대기 없음</p>
          )}
        </div>
      ) : null}
    </DashboardCard>
  );
}
