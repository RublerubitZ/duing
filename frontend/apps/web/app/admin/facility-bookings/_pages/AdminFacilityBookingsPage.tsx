'use client';

import { Fragment, type ReactNode } from 'react';
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
import { FacilityCrawlTab } from '../_tabs/FacilityCrawlTab';
import { SubmissionBatchesTab } from '../_tabs/SubmissionBatchesTab';
import { SubmissionPrepareTab } from '../_tabs/SubmissionPrepareTab';

const TAB_KEYS = ['review', 'prepare', 'ready', 'archive', 'crawl'] as const;
type FacilityOpsTab = (typeof TAB_KEYS)[number];

const TAB_LABELS: Record<FacilityOpsTab, string> = {
  review: '예약 검토',
  prepare: '제출 준비',
  ready: '제출 대기',
  archive: '제출 이력',
  crawl: '크롤 예약',
};

// 탭별 화면 목적 안내(목업 PurposeNote) — 핵심 행위·다음 단계를 굵게 강조한다.
const TAB_PURPOSE: Record<FacilityOpsTab, ReactNode> = {
  review: (
    <>
      <strong>예약을 검토해 승인 또는 거절해요.</strong> 승인한 예약은 <strong>제출 준비</strong> 단계에 자동으로
      나타나요.
    </>
  ),
  prepare: (
    <>
      <strong>승인된 예약이 자동으로 표시돼요.</strong> 제외할 예약만 해제하고 <strong>제출 목록</strong>을 만들어
      주세요.
    </>
  ),
  ready: (
    <>
      <strong>학교 행정실 제출을 마친 목록은 &apos;완료 처리&apos;를 해주세요.</strong> CSV로 제출 서류를 준비할 수
      있어요.
    </>
  ),
  archive: (
    <>
      제출을 <strong>마친 목록</strong>이에요. 완료·취소된 목록의 CSV를 다시 받을 수 있어요. 진행 중인 목록은 &lsquo;제출 대기&rsquo;에 있어요.
    </>
  ),
  crawl: (
    <>
      학교에서 수집한 크롤 예약 원본이에요. <strong>크롤 예약</strong>은 해당 시간 예약이 차단되고,{' '}
      <strong>기본 확보 시간</strong>(동아리 관리의 &lsquo;기본 확보 시간 대상&rsquo; 지정)은 차단 없이 다른
      동아리도 신청할 수 있어요.
    </>
  ),
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
 * 시설 예약 업무 단일 페이지(개편 스펙 §1) — 검토→준비→제출 대기→이력 4단계 워크플로 탭 + 크롤 예약 참조 탭.
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

  // 크롤 예약은 워크플로 단계가 아니라 참조 탭 — 단계 진행(✓) 계산에서 제외한다(스펙 §3).
  const activeStepIndex = activeTab === 'crawl' ? -1 : TAB_KEYS.indexOf(activeTab);

  return (
    // 다른 admin 페이지와 동일한 컨테이너 관례(max-w-layout+px+py) — 없으면 사이드바에 붙고 와이드에서 과확장된다.
    <main className="max-w-layout mx-auto space-y-5 px-4 py-10 sm:px-6 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          {/* 목업 CAdmin 헤더 — eyebrow 서브타이틀 + 큰 타이틀 */}
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-charcoal-3">
            FACILITY BOOKINGS · 학교 제출 워크플로
          </p>
          <h1 className="mt-1 font-display text-2xl text-ink-deep">시설 예약 관리</h1>
        </div>
        <CrawlFreshnessChip crawledAt={summaryQuery.data?.crawledAt} />
      </div>

      {/* 워크플로 레일(목업 FacSubmitStepper) — 카드형 레일, 지난 단계 ✓ · 현재 단계 ink-deep 블록.
          시각은 스테퍼지만 동작은 자유 이동 탭이다(운영 루프는 순환). */}
      <div
        className="flex items-stretch gap-1 rounded-2xl border border-line bg-paper p-2"
        role="tablist"
        aria-label="시설 예약 업무 단계"
      >
        {TAB_KEYS.map((tab, stepIndex) => {
          const isActive = activeTab === tab;
          const isDone = stepIndex < activeStepIndex;
          const tabCount = tabCountOf(tab);
          return (
            <Fragment key={tab}>
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => selectTab(tab)}
                className={`flex flex-1 items-center gap-2 rounded-[11px] px-2 py-3 text-left motion-safe:transition-colors sm:gap-2.5 sm:px-4 ${
                  isActive ? 'bg-ink-deep' : 'hover:bg-graysoft/60'
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-extrabold ${
                    isActive
                      ? 'bg-sage text-ink-deep'
                      : isDone
                        ? 'bg-sage-mist text-ink'
                        : 'bg-graysoft text-charcoal-3'
                  }`}
                >
                  {isDone ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-[15px] w-[15px]"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : (
                    stepIndex + 1
                  )}
                </span>
                {/* 충돌·의심 잔건 경고 점(장식) — sr-only 라벨 밖에 두어 모바일에서도 보인다. */}
                {tab === 'review' && conflictAttentionCount > 0 && (
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
                )}
                <span className="min-w-0">
                  {/* 모바일은 활성 단계명만 노출 — 비활성 탭은 sr-only 로 접근성 이름을 유지한다. */}
                  <span
                    className={`block truncate text-[13.5px] font-bold leading-tight ${
                      isActive ? 'text-paper' : isDone ? 'text-ink-deep' : 'text-charcoal-2'
                    } ${isActive ? '' : 'sr-only sm:not-sr-only sm:block'}`}
                  >
                    {TAB_LABELS[tab]}
                  </span>
                  {/* 공백 텍스트 노드는 접근성 이름을 '예약 검토 7건'으로 띄어 읽히게 한다. */}
                  {tabCount !== undefined && (
                    <>
                      {' '}
                      <span
                        className={`mt-0.5 block font-mono text-[11px] ${
                          isActive ? 'text-sage' : 'text-charcoal-3'
                        } ${isActive ? '' : 'sr-only sm:not-sr-only sm:block'}`}
                        title={tab === 'prepare' ? '이번 달 기준' : undefined}
                      >
                        {tabCount}건
                      </span>
                    </>
                  )}
                </span>
              </button>
              {stepIndex < TAB_KEYS.length - 1 && (
                <span aria-hidden className="hidden items-center sm:flex">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`h-4 w-4 ${stepIndex < activeStepIndex ? 'text-sage' : 'text-line'}`}
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </span>
              )}
            </Fragment>
          );
        })}
      </div>

      <PurposeNote>{TAB_PURPOSE[activeTab]}</PurposeNote>

      {activeTab === 'review' && <BookingManagementTab />}
      {activeTab === 'prepare' && <SubmissionPrepareTab />}
      {activeTab === 'ready' && <SubmissionBatchesTab statusFilter="REVIEWING" />}
      {/* 이력 탭은 완료·취소만(ARCHIVED) — 진행 중 배치는 '제출 대기' 탭에서만 보이도록 단계를 가른다. */}
      {activeTab === 'archive' && <SubmissionBatchesTab statusFilter="ARCHIVED" />}
      {activeTab === 'crawl' && <FacilityCrawlTab />}
    </main>
  );
}
