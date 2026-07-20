'use client';

import { useSearchParams } from 'next/navigation';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { toRoute } from '../../../_lib/route';
import { BookingManagementTab } from '../_tabs/BookingManagementTab';
import { SubmissionPrepareTab } from '../_tabs/SubmissionPrepareTab';

const TAB_KEYS = ['pending', 'prepare', 'batches'] as const;
type FacilityOpsTab = (typeof TAB_KEYS)[number];

const TAB_LABELS: Record<FacilityOpsTab, string> = {
  pending: '예약 관리',
  prepare: '학교 제출 준비',
  batches: '제출 목록',
};

function isFacilityOpsTab(value: string | null): value is FacilityOpsTab {
  return value !== null && (TAB_KEYS as readonly string[]).includes(value);
}

/**
 * 시설 예약 업무 단일 페이지(스펙 v3 §7.0) — 승인부터 학교 제출까지 한 화면에서 끝난다.
 * 탭 상태는 URL(?tab=)과 동기화해 새로고침·뒤로가기·딥링크를 보존한다(ClubExplorePage 전례).
 */
export function AdminFacilityBookingsPage() {
  const router = useGuardedRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: FacilityOpsTab = isFacilityOpsTab(tabParam) ? tabParam : 'pending';

  const selectTab = (tab: FacilityOpsTab) => {
    router.replace(toRoute(`/admin/facility-bookings?tab=${tab}`), { scroll: false });
  };

  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-display text-xl text-ink-deep">시설 예약 관리</h1>
        <p className="mt-1 text-sm text-charcoal-3">예약 승인부터 학교 제출까지 한 화면에서 처리해요.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="시설 예약 업무 단계">
        {TAB_KEYS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => selectTab(tab)}
            className={`rounded-full border px-3 py-1.5 text-xs motion-safe:transition-colors ${
              activeTab === tab ? 'border-ink bg-ink text-cream' : 'border-line bg-paper text-charcoal-2 hover:border-sage'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab === 'pending' && <BookingManagementTab />}
      {activeTab === 'prepare' && <SubmissionPrepareTab />}
      {activeTab === 'batches' && (
        <p className="text-sm text-charcoal-3">제출 목록은 준비 중이에요. 만든 제출 목록을 곧 이 탭에서 관리할 수 있어요.</p>
      )}
    </section>
  );
}
