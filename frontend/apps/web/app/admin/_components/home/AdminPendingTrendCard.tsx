'use client';

import {
  buildPendingTrendBars,
  pendingTrendComparison,
  recordedDayCount,
  useAdminPendingCountsQuery,
  useAdminPendingTrendQuery,
} from '@duing/hooks';
import { cn } from '@/app/_lib/cn';
import { DashboardCard } from '@/components/dashboard/DashboardCard';

import {
  MIN_RECORDED_DAYS,
  MISSING_DAY_LEGEND,
  PENDING_TREND_GUIDE,
  RECENT_FLOW_SCOPE,
  pendingTrendBarDateText,
  pendingTrendBarValueText,
  pendingTrendSummary,
  recentFlowText,
  shortDateLabel,
} from './adminPendingTrendPresentation';

import type { PendingTrendBar } from '@duing/hooks';
import type { AdminPendingTrend } from '@duing/types';

// 막대 줄 = 막대 영역 120px + 값 라벨 띠(1rem 줄 + 0.25rem 간격, 글씨 크기를 따라 커진다) — 글씨를 키워도 라벨이 막대 높이를 먹지 않는다.
const BAR_AREA_HEIGHT_PX = 120;

export function AdminPendingTrendCard() {
  const trendQuery = useAdminPendingTrendQuery();
  const pendingCountsQuery = useAdminPendingCountsQuery();
  const trend = trendQuery.data;
  // 오늘 막대는 머리말과 같은 pending-counts 캐시를 읽는다 — 그 값을 받는 중이면 카드 전체를 로딩으로 둬
  // 비교 문장(오늘 기준 ↔ 마지막 기록일 기준)이 값 도착 순간 바뀌지 않게 한다.
  const isTodayTotalLoading = pendingCountsQuery.data === undefined && !pendingCountsQuery.isError;

  return (
    <DashboardCard
      title="처리 대기 추이"
      badge={<span className="text-xs text-charcoal-3">최근 14일</span>}
      isLoading={(trend === undefined && !trendQuery.isError) || isTodayTotalLoading}
      // pending-counts 실패는 오늘 막대 "—" 로만 드러낸다 — 이 카드에 "일부 정보를 불러오지 못했어요"를 붙이지 않는다.
      isError={trendQuery.isError}
      isEmpty={!trend}
    >
      {trend ? <PendingTrendBody trend={trend} todayTotal={pendingCountsQuery.data?.totalPendingCount ?? null} /> : null}
    </DashboardCard>
  );
}

function PendingTrendBody({ trend, todayTotal }: { trend: AdminPendingTrend; todayTotal: number | null }) {
  const bars = buildPendingTrendBars(trend.days, todayTotal);
  const comparison = pendingTrendComparison(bars);
  const flow = (
    <div className="mt-3 border-t border-line pt-3">
      <p className="break-keep text-sm font-medium text-charcoal">{recentFlowText(trend.recentFlow)}</p>
      <p className="mt-1 break-keep text-xs text-charcoal-3">{RECENT_FLOW_SCOPE}</p>
    </div>
  );

  // 기록 부족 판정은 저장 기록 수 하나로 — 막대 하나짜리 차트를 그리지 않는다.
  if (recordedDayCount(trend.days) < MIN_RECORDED_DAYS || !comparison) {
    return (
      <>
        <p className="break-keep text-sm text-charcoal-2">{PENDING_TREND_GUIDE}</p>
        {flow}
      </>
    );
  }

  const summary = pendingTrendSummary(comparison);
  const maxValue = Math.max(1, ...bars.map((bar) => (bar.kind === 'value' ? bar.value : 0)));
  const labelledDates = new Set([comparison.from.date, comparison.to.date]);
  const firstDate = bars[0]?.date;

  return (
    <>
      <p className="break-keep text-sm text-charcoal-2">{summary}</p>
      <figure role="img" aria-label={summary} className="mt-3">
        <div className="flex h-[calc(120px+1.25rem)] items-end gap-0.5">
          {bars.map((bar) => (
            <PendingTrendBarColumn
              key={bar.date}
              bar={bar}
              maxValue={maxValue}
              showLabel={labelledDates.has(bar.date) || bar.kind === 'unavailable'}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-charcoal-3">
          <span>{firstDate ? shortDateLabel(firstDate) : null}</span>
          <span>오늘</span>
        </div>
      </figure>
      {bars.some((bar) => bar.kind === 'missing') ? <p className="mt-1 text-xs text-charcoal-3">{MISSING_DAY_LEGEND}</p> : null}
      {/* 표는 figure 밖 형제 — role=img 의 자식은 보조기기에서 빠지고, 툴팁(title)은 키보드·터치로 볼 수 없다. */}
      <details className="mt-2">
        <summary className="w-fit cursor-pointer rounded py-3.5 text-xs font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink">
          날짜별 보기
        </summary>
        <table className="mt-1 w-full text-xs">
          <thead>
            <tr className="text-charcoal-3">
              <th scope="col" className="py-1 text-left font-medium">날짜</th>
              <th scope="col" className="py-1 text-right font-medium">남은 대기</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((bar) => (
              <tr key={bar.date} className="border-t border-line">
                <td className="py-1 text-charcoal-2">{pendingTrendBarDateText(bar)}</td>
                <td className="py-1 text-right tabular-nums text-charcoal">{pendingTrendBarValueText(bar)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      {flow}
    </>
  );
}

function PendingTrendBarColumn({ bar, maxValue, showLabel }: { bar: PendingTrendBar; maxValue: number; showLabel: boolean }) {
  return (
    <div
      title={`${pendingTrendBarDateText(bar)} · ${pendingTrendBarValueText(bar)}`}
      className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
    >
      {showLabel ? (
        <span className="mb-1 text-[11px] font-semibold leading-4 tabular-nums text-charcoal">
          {bar.kind === 'value' ? bar.value : '—'}
        </span>
      ) : null}
      {bar.kind === 'value' ? (
        <div
          data-bar
          className={cn('w-full max-w-[16px]', bar.isToday ? 'bg-ink-deep' : 'bg-sage-deep', bar.value > 0 && 'rounded-t')}
          // 0 은 2px 토막으로 보인다 — 높이 0 막대는 기록 없음(점선)과 구분되지 않는다.
          // 1건 이상은 최소 4px — 최댓값이 크면 비율 높이가 0 토막(2px)보다 얇아져 0건으로 읽힌다.
          style={{ height: bar.value === 0 ? '2px' : `${Math.max(4, (bar.value / maxValue) * BAR_AREA_HEIGHT_PX)}px` }}
        />
      ) : bar.kind === 'missing' ? (
        <div data-bar-missing className="h-0 w-full max-w-[16px] border-t-2 border-dashed border-charcoal-3" />
      ) : null}
    </div>
  );
}
