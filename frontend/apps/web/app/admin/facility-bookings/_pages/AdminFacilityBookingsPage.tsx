'use client';

import { useSearchParams } from 'next/navigation';
import {
  useAdminFacilityBookingSummaryQuery,
  useSubmissionBatchesQuery,
  useSubmissionCandidatesQuery,
} from '@duing/hooks';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { toRoute } from '../../../_lib/route';
import { CrawlFreshnessChip } from '../_components/CrawlFreshnessChip';
import { PurposeNote } from '../_components/PurposeNote';
import { conflictCardCount } from '../_lib/adminBookingDisplay';
import { currentMonthRange } from '../_lib/submissionPeriod';
import { BookingManagementTab } from '../_tabs/BookingManagementTab';
import { SubmissionBatchesTab } from '../_tabs/SubmissionBatchesTab';
import { SubmissionPrepareTab } from '../_tabs/SubmissionPrepareTab';

const TAB_KEYS = ['review', 'prepare', 'ready', 'archive'] as const;
type FacilityOpsTab = (typeof TAB_KEYS)[number];

const TAB_LABELS: Record<FacilityOpsTab, string> = {
  review: '예약 검토',
  prepare: '제출 준비',
  ready: '제출 대기',
  archive: '제출 이력',
};

// 탭별 화면 목적 1줄 안내(개편 스펙 §1) — 다음 단계로 이어지는 흐름을 문장으로 알려준다.
const TAB_PURPOSE: Record<FacilityOpsTab, string> = {
  review: "예약을 검토해 승인 또는 거절해요. 승인한 예약은 '제출 준비'에 자동으로 나타나요.",
  prepare: '승인된 예약이 자동으로 표시돼요. 제외할 예약만 해제하고 제출 목록을 만들어 주세요.',
  ready: "학교 행정실 제출을 마친 목록은 '제출 완료' 처리를 해주세요. CSV로 제출 서류를 준비할 수 있어요.",
  archive: '지금까지 만든 제출 목록의 전체 기록이에요. 완료·취소된 목록도 CSV를 다시 받을 수 있어요.',
};

// 구 URL 호환(개편 스펙 §1) — 북마크·외부 링크의 기존 탭 키를 새 워크플로 탭으로 흡수한다.
const LEGACY_TAB_ALIASES: Record<string, FacilityOpsTab> = { pending: 'review', batches: 'ready' };

function isFacilityOpsTab(value: string | null): value is FacilityOpsTab {
  return value !== null && (TAB_KEYS as readonly string[]).includes(value);
}

function resolveTab(tabParam: string | null): FacilityOpsTab {
  // `in` 은 프로토타입 상속 키(?tab=constructor 등)도 통과시킨다 — 자체 키만 인정(COLLEGE_DISPLAY_NAME 가드 전례).
  if (tabParam !== null && Object.prototype.hasOwnProperty.call(LEGACY_TAB_ALIASES, tabParam)) {
    return LEGACY_TAB_ALIASES[tabParam] ?? 'review';
  }
  return isFacilityOpsTab(tabParam) ? tabParam : 'review';
}

/**
 * 시설 예약 업무 단일 페이지(개편 스펙 §1) — 검토→준비→제출 대기→이력 4단계 워크플로 탭.
 * 스테퍼처럼 보이지만 동작은 자유 이동 탭이다(운영 루프는 선형이 아니라 순환).
 * 탭 상태는 URL(?tab=)과 동기화해 새로고침·뒤로가기·딥링크를 보존한다(ClubExplorePage 전례).
 */
export function AdminFacilityBookingsPage() {
  const router = useGuardedRouter();
  const searchParams = useSearchParams();
  const activeTab = resolveTab(searchParams.get('tab'));

  // 탭 건수·신선도 칩용 조회 — 준비 탭 건수는 이번 달 기본 기간 기준(준비 탭 기본 조회와 캐시 공유).
  const summaryQuery = useAdminFacilityBookingSummaryQuery();
  const candidatesQuery = useSubmissionCandidatesQuery(currentMonthRange());
  const readyBatchCountQuery = useSubmissionBatchesQuery({ page: 0, size: 1, status: 'REVIEWING' });

  const tabCountOf = (tab: FacilityOpsTab): number | undefined => {
    if (tab === 'review') return summaryQuery.data?.pendingCount;
    if (tab === 'prepare') return candidatesQuery.data?.summary.awaitingCount;
    if (tab === 'ready') return readyBatchCountQuery.data?.totalElements;
    return undefined; // 이력 탭은 건수 표기 실익이 없다.
  };
  const conflictAttentionCount = summaryQuery.data !== undefined ? conflictCardCount(summaryQuery.data) : 0;

  const selectTab = (tab: FacilityOpsTab) => {
    router.replace(toRoute(`/admin/facility-bookings?tab=${tab}`), { scroll: false });
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-xl text-ink-deep">시설 예약 관리</h1>
          <p className="mt-1 text-sm text-charcoal-3">예약 승인부터 학교 제출까지 한 화면에서 처리해요.</p>
        </div>
        <CrawlFreshnessChip crawledAt={summaryQuery.data?.crawledAt} />
      </div>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="시설 예약 업무 단계">
        {TAB_KEYS.map((tab, stepIndex) => {
          const isActive = activeTab === tab;
          const tabCount = tabCountOf(tab);
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectTab(tab)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs motion-safe:transition-colors ${
                isActive ? 'border-ink bg-ink text-cream' : 'border-line bg-paper text-charcoal-2 hover:border-sage'
              }`}
            >
              <span
                aria-hidden
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  isActive ? 'bg-cream/20 text-cream' : 'bg-graysoft text-charcoal-3'
                }`}
              >
                {stepIndex + 1}
              </span>
              {/* 모바일은 활성 단계명만 노출(개편 스펙 §10) — 비활성 탭은 번호로 식별하되,
                  sr-only 로 접근성 이름은 유지한다(display:none 은 접근성 트리에서도 빠짐). */}
              <span className={isActive ? '' : 'sr-only sm:not-sr-only'}>{TAB_LABELS[tab]}</span>
              {/* 공백 텍스트 노드는 접근성 이름을 '예약 검토 7'로 띄어 읽히게 한다(필터 칩과 동일 처리). */}
              {tabCount !== undefined && (
                <>
                  {' '}
                  <span
                    className={`tabular-nums ${isActive ? '' : 'sr-only sm:not-sr-only'}`}
                    title={tab === 'prepare' ? '이번 달 기준' : undefined}
                  >
                    {tabCount}
                  </span>
                </>
              )}
              {/* 충돌·의심 잔건 경고 점(장식) — 건수 자체는 검토 탭의 KPI 카드·필터 칩이 전달한다. */}
              {tab === 'review' && conflictAttentionCount > 0 && (
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-coral" />
              )}
            </button>
          );
        })}
      </div>

      <PurposeNote>{TAB_PURPOSE[activeTab]}</PurposeNote>

      {activeTab === 'review' && <BookingManagementTab />}
      {activeTab === 'prepare' && <SubmissionPrepareTab />}
      {activeTab === 'ready' && <SubmissionBatchesTab statusFilter="REVIEWING" />}
      {activeTab === 'archive' && <SubmissionBatchesTab />}
    </section>
  );
}
