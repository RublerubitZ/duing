'use client';

import Link from 'next/link';
import { useAdminPendingCountsQuery, useAdminTriageQueue } from '@duing/hooks';
import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { DASHBOARD_CHIP_TONE_CLASS } from '@/components/dashboard/dashboardChipTone';
import {
  ADMIN_TRIAGE_AREA_LABEL,
  INACTIVE_CLUB_TRIAGE_HREF,
  clubApprovalFallbackShown,
  presentTriageItem,
  triageQueueSummary,
} from './adminTriagePresentation';

const ROW_LINK_CLASS =
  'flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2 transition hover:bg-sage-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink';
const ACTION_LABEL_CLASS = 'shrink-0 rounded-md border border-sage-soft bg-paper px-3 py-1.5 text-xs font-semibold text-ink';

export function AdminTriageQueueCard() {
  const queue = useAdminTriageQueue();
  const pendingCountsQuery = useAdminPendingCountsQuery();
  const pendingCounts = pendingCountsQuery.data;
  // data 유무가 기준 — 재조회가 실패해도 받은 건수는 그대로 쓴다(사이드바 배지와 같은 기준).
  const countsLoading = pendingCounts === undefined && !pendingCountsQuery.isError;
  const countsFailed = pendingCounts === undefined && pendingCountsQuery.isError;
  const clubApprovalCount = pendingCounts?.clubApproval ?? 0;
  const summary = triageQueueSummary(queue.items.length, pendingCounts?.totalPendingCount);
  const showClubApprovalFallback = clubApprovalFallbackShown(clubApprovalCount, queue.areas.CLUB_APPROVAL);
  // 운영 중단 미결도 같은 판정(건수 ≥1 인데 영역 행 0 — 100곳 초과·목록 실패·두 요청 사이 어긋남). 필드가 없으면(옛 백엔드) 0 이라 줄이 없다.
  const inactiveClubCount = pendingCounts?.inactiveClubPending ?? 0;
  const showInactiveClubFallback = clubApprovalFallbackShown(inactiveClubCount, queue.areas.INACTIVE_CLUB);
  const now = new Date();

  return (
    <DashboardCard
      title="처리 대기열"
      // 목록이 먼저 0행으로 끝나도 건수(동아리 승인 줄)가 정해지기 전에는 "없어요"를 띄우지 않는다.
      isLoading={queue.isLoading || (countsLoading && queue.items.length === 0)}
      isError={queue.isError || countsFailed}
      isEmpty={queue.items.length === 0 && !showClubApprovalFallback && !showInactiveClubFallback}
      emptyText="처리할 대기 건이 없어요"
    >
      {/* 요약은 카드 머리(줄바꿈 없는 justify-between) 대신 본문 첫 줄 — 좁은 폭·큰 글씨에서 넘치지 않게. */}
      {summary ? <p className="mb-2 px-2 text-xs text-charcoal-3">{summary}</p> : null}
      <ul className="flex flex-col gap-1">
        {queue.items.map((item) => {
          const row = presentTriageItem(item, now);
          return (
            <li key={row.key}>
              {/* 행 전체가 링크 하나 — 같은 이름의 버튼이 여러 개 생기지 않게 처리 문구는 span 이다. */}
              <Link href={toRoute(row.href)} className={ROW_LINK_CLASS}>
                <span className="min-w-0 flex-1 basis-56">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span
                      className={cn(
                        'rounded border px-1.5 text-[11px] font-semibold',
                        row.isDanger ? 'border-coral/40 text-coral-deep' : 'border-line text-charcoal-2',
                      )}
                    >
                      {row.areaLabel}
                    </span>
                    {/* flex 자식은 min-w-0 이 없으면 공백 없는 긴 토큰에서 줄어들지 못해 break-words 가 듣지 않는다. */}
                    <span className="min-w-0 break-words break-keep text-sm font-medium text-charcoal">{row.title}</span>
                  </span>
                  {row.context ? <span className="block break-words break-keep text-xs text-charcoal-3">{row.context}</span> : null}
                </span>
                {/* 칩과 처리 문구는 함께 줄을 바꾼다 — 따로 바꾸면 행마다 처리 문구 자리가 달라진다. */}
                <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                  <span className={cn('max-w-full break-keep rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', DASHBOARD_CHIP_TONE_CLASS[row.chip.tone])}>
                    {row.chip.text}
                  </span>
                  <span className={ACTION_LABEL_CLASS}>{row.actionLabel}</span>
                </span>
              </Link>
            </li>
          );
        })}
        {showClubApprovalFallback ? (
          <li>
            {/* 동아리 승인을 시각 순 행으로 못 넣었을 때(시각 모름·목록 실패 등) 건수만 아는 한 줄 — 승인 대기가 홈에서 사라지지 않게. */}
            <Link href={toRoute('/admin/clubs')} className={ROW_LINK_CLASS}>
              <span className="min-w-0 flex-1 basis-56">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="rounded border border-line px-1.5 text-[11px] font-semibold text-charcoal-2">동아리 승인</span>
                  <span className="break-keep text-sm font-medium text-charcoal">승인 대기 {clubApprovalCount}건</span>
                </span>
                <span className="block break-keep text-xs text-charcoal-3">신청 시각을 알 수 없어요</span>
              </span>
              <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <span className={ACTION_LABEL_CLASS}>승인 검토</span>
              </span>
            </Link>
          </li>
        ) : null}
        {showInactiveClubFallback ? (
          <li>
            {/* 운영 중단 미결을 시각 순 행으로 못 넣었을 때 건수만 아는 한 줄 — "운영 중단 미결 N곳"이 홈에서 사라지지 않게. */}
            <Link href={toRoute(INACTIVE_CLUB_TRIAGE_HREF)} className={ROW_LINK_CLASS}>
              <span className="min-w-0 flex-1 basis-56">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="rounded border border-line px-1.5 text-[11px] font-semibold text-charcoal-2">
                    {ADMIN_TRIAGE_AREA_LABEL.INACTIVE_CLUB}
                  </span>
                  <span className="break-keep text-sm font-medium text-charcoal">{inactiveClubCount}곳</span>
                </span>
                <span className="block break-keep text-xs text-charcoal-3">동아리 목록에서 확인해 주세요</span>
              </span>
              <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <span className={ACTION_LABEL_CLASS}>미결 정리</span>
              </span>
            </Link>
          </li>
        ) : null}
      </ul>
    </DashboardCard>
  );
}
