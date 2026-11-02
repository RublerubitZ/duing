'use client';

import { useState } from 'react';

import { useAdminWeeklyFacilityHeatmapQuery } from '@duing/hooks';

import { cn } from '@/app/_lib/cn';
import { ErrorState } from '@/app/admin/_components/ErrorState';
import { Skeleton } from '@/components/loading/Skeleton';

import {
  HEATMAP_FAILED_TEXT,
  HEATMAP_LEGEND,
  HEATMAP_SOURCE_NOTE,
  PAST_MONTH_NOTE,
  crawledAtText,
  heatmapCellClass,
  heatmapDays,
  splitHeatmapRows,
  touchesPastMonth,
} from '../_lib/heatmapPresentation';

import type { AdminWeeklyFacilityHeatmap } from '@duing/types';

type Props = { weekStart: string; todayIso: string; caption: string; isThisWeek: boolean };

/** 시설별 하루 예약 시간 히트맵 — 자기 조회의 로딩·실패를 그 자리에서 그린다(다른 블록은 그대로). */
export function FacilityHeatmap({ weekStart, todayIso, caption, isThisWeek }: Props) {
  const heatmapQuery = useAdminWeeklyFacilityHeatmapQuery(weekStart);
  const heatmap = heatmapQuery.data;
  return (
    <div className="mt-6 print:break-inside-avoid">
      {heatmap ? (
        <FacilityHeatmapTable heatmap={heatmap} weekStart={weekStart} todayIso={todayIso} caption={caption} isThisWeek={isThisWeek} />
      ) : (
        <>
          <p className="text-sm font-semibold text-charcoal">{caption}</p>
          {heatmapQuery.isError ? (
            <div className="mt-2">
              <ErrorState variant="inline" message={HEATMAP_FAILED_TEXT} onRetry={() => void heatmapQuery.refetch()} />
            </div>
          ) : (
            <div role="status" aria-label="시설 예약 시간 불러오는 중" aria-busy="true" className="mt-2 animate-pulse motion-reduce:animate-none">
              <Skeleton className="h-40 w-full" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FacilityHeatmapTable({
  heatmap,
  weekStart,
  todayIso,
  caption,
  isThisWeek,
}: Props & { heatmap: AdminWeeklyFacilityHeatmap }) {
  const [showAll, setShowAll] = useState(false);
  const days = heatmapDays(weekStart);
  const { visibleRows, hiddenCount } = splitHeatmapRows(heatmap.facilities);
  const rows = showAll ? heatmap.facilities : visibleRows;
  // 이번 주 표의 지난 날 흐림은 대비 차로 — 오늘·남은 날 머리만 charcoal(12.65:1)로 올리고 지난 날은 머리 행 기본색(charcoal-3 6.10:1). 둘 다 AA.
  const isTodayOrLater = (isoDate: string) => isThisWeek && isoDate >= todayIso;
  return (
    <>
      <p className="text-sm font-semibold text-charcoal">{caption}</p>
      <p className="mt-1 break-keep text-xs text-charcoal-2">{HEATMAP_SOURCE_NOTE}</p>
      {/* 좁은 폭은 카드 안 가로 스크롤 — 키보드로도 스크롤하게 포커스를 받고, 인쇄에서는 펼쳐 A4 한 폭에 8열을 넣는다. */}
      <div
        role="region"
        aria-label={caption}
        tabIndex={0}
        className="mt-2 overflow-x-auto rounded-md border border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink print:overflow-visible print:border-0"
      >
        <table className="w-full min-w-[36rem] border-collapse text-sm print:min-w-0 print:text-[10px]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-xs text-charcoal-3">
              <th scope="col" className="sticky left-0 z-10 bg-paper px-3 py-2 text-left font-medium">시설</th>
              {days.map((day) => {
                const isToday = isThisWeek && day.isoDate === todayIso;
                return (
                  <th key={day.isoDate} scope="col" className={cn('px-2 py-2 text-center font-medium', isTodayOrLater(day.isoDate) && 'text-charcoal')}>
                    <span aria-hidden className="block">{day.dayLabel}</span>
                    <span aria-hidden className={cn('block', isToday && 'font-semibold text-ink')}>{isToday ? '오늘' : day.weekdayLabel}</span>
                    <span className="sr-only">{isToday ? `${day.spokenLabel} 오늘` : day.spokenLabel}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.facilityId} className="border-t border-line">
                <th scope="row" className="sticky left-0 z-10 break-keep bg-paper px-3 py-2 text-left font-medium text-charcoal">
                  {row.roomName}
                </th>
                {row.occupiedSlotCounts.map((occupiedSlotCount, index) => {
                  const isoDate = days[index]?.isoDate ?? '';
                  return (
                    <td
                      key={isoDate || String(index)}
                      className={cn(
                        'px-2 py-2 text-center tabular-nums [-webkit-print-color-adjust:exact] [print-color-adjust:exact]',
                        heatmapCellClass(occupiedSlotCount),
                      )}
                    >
                      {occupiedSlotCount}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 break-keep text-xs text-charcoal-3">{HEATMAP_LEGEND}</p>
      {hiddenCount > 0 && !showAll ? (
        <p className="mt-1 text-xs text-charcoal-2">
          {`예약 없는 시설 ${hiddenCount}곳은 뺐어요`}{' '}
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="no-print min-h-11 rounded px-1 font-medium text-ink underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            모두 보기
          </button>
        </p>
      ) : null}
      {touchesPastMonth(weekStart, todayIso) ? <p className="mt-1 break-keep text-xs text-charcoal-3">{PAST_MONTH_NOTE}</p> : null}
      {isThisWeek && heatmap.currentMonthCrawledAt ? (
        <p className="mt-1 text-xs text-charcoal-3">{crawledAtText(heatmap.currentMonthCrawledAt)}</p>
      ) : null}
    </>
  );
}
