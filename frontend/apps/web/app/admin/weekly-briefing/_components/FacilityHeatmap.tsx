'use client';

import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { useAdminWeeklyFacilityHeatmapQuery } from '@duing/hooks';

import { cn } from '@/app/_lib/cn';
import { ErrorState } from '@/app/admin/_components/ErrorState';
import { Skeleton } from '@/components/loading/Skeleton';

import {
  HEATMAP_FAILED_TEXT,
  HEATMAP_LEGEND,
  HEATMAP_NO_FACILITY_TEXT,
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

// 스크롤 상자가 생기는 좁은 폭에서 긴 시설 이름이 sticky 첫 열로 상자를 다 덮지 않게 폭을 고정하고 줄을 바꾼다.
// lg 부터는 상자가 표보다 넓어 스크롤이 없으므로 지금 그대로(auto), 인쇄도 auto 로 A4 한 폭에 8열을 나눠 넣는다.
const FIRST_COLUMN_CLASS =
  'sticky left-0 z-10 w-[7.5rem] max-w-[7.5rem] bg-paper px-3 py-2 text-left font-medium [overflow-wrap:anywhere] lg:w-auto lg:max-w-none print:w-auto';

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
          {/* 전역 `.duing h3`(line-height 1.1)이 유틸리티보다 구체적이라 ! 로 p 때 줄 높이(text-sm 1.25rem)를 지킨다 — 두 줄일 때 간격. */}
          <h3 className="text-sm font-semibold !leading-5 text-charcoal">{caption}</h3>
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
  const scrollRegionRef = useRef<HTMLDivElement>(null);
  if (heatmap.facilities.length === 0) {
    // 시설이 하나도 없으면(보관 제외 뒤) 머리만 있는 빈 표 대신 한 줄로 쓴다.
    return (
      <>
        <h3 className="text-sm font-semibold !leading-5 text-charcoal">{caption}</h3>
        <p className="mt-2 text-sm text-charcoal-2">{HEATMAP_NO_FACILITY_TEXT}</p>
      </>
    );
  }
  const { visibleRows, hiddenCount } = splitHeatmapRows(heatmap.facilities);
  const showAllButton = (
    <button
      type="button"
      onClick={() => {
        // 누른 버튼이 사라진다 — 펼친 표(스크롤 영역)로 포커스를 옮긴다. 모든 시설이 0 인 주는 펼쳐야 표가 생겨 먼저 그린다.
        flushSync(() => setShowAll(true));
        scrollRegionRef.current?.focus();
      }}
      className="no-print min-h-11 rounded px-1 font-medium text-ink underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
    >
      모두 보기
    </button>
  );
  // 모든 시설이 그 주 내내 0 이면(방학 주 등) 날짜 머리만 있는 빈 표 대신 한 줄로 쓴다 — 표·범례 자리만 바꾸고 출처·지난달 안내·수집 시각은 남긴다.
  const showEmptyWeekLine = visibleRows.length === 0 && !showAll;
  const days = heatmapDays(weekStart);
  const rows = showAll ? heatmap.facilities : visibleRows;
  // 이번 주 표의 지난 날 흐림은 대비 차로 — 오늘·남은 날 머리만 charcoal(12.65:1)로 올리고 지난 날은 머리 행 기본색(charcoal-3 6.10:1). 둘 다 AA.
  const isTodayOrLater = (isoDate: string) => isThisWeek && isoDate >= todayIso;
  return (
    <>
      <h3 className="text-sm font-semibold !leading-5 text-charcoal">{caption}</h3>
      <p className="mt-1 break-keep text-xs text-charcoal-2">{HEATMAP_SOURCE_NOTE}</p>
      {showEmptyWeekLine ? (
        <p className="mt-2 text-sm text-charcoal-2">
          {`이 주에는 예약이 없어요(시설 ${heatmap.facilities.length}곳)`}{' '}
          {showAllButton}
        </p>
      ) : (
        <>
          {/* 좁은 폭은 카드 안 가로 스크롤 — 키보드로도 스크롤하게 포커스를 받고, 인쇄에서는 펼쳐 A4 한 폭에 8열을 넣는다.
              relative: 열 머리의 sr-only(절대 위치)가 이 상자를 기준으로 잡혀야 상자 안에서 잘린다 — 없으면 문서가 가로로 넘친다. */}
          <div
            ref={scrollRegionRef}
            role="region"
            aria-label={caption}
            tabIndex={0}
            className="relative mt-2 overflow-x-auto rounded-md border border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink print:overflow-visible print:border-0"
          >
            <table className="w-full min-w-[36rem] border-collapse text-sm print:min-w-0 print:text-[10px]">
              <caption className="sr-only">{caption}</caption>
              <thead>
                <tr className="text-xs text-charcoal-3">
                  <th scope="col" className={FIRST_COLUMN_CLASS}>시설</th>
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
                    <th scope="row" className={cn(FIRST_COLUMN_CLASS, 'break-keep text-charcoal')}>
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
              {showAllButton}
            </p>
          ) : null}
        </>
      )}
      {touchesPastMonth(weekStart, todayIso) ? <p className="mt-1 break-keep text-xs text-charcoal-3">{PAST_MONTH_NOTE}</p> : null}
      {isThisWeek && heatmap.currentMonthCrawledAt ? (
        <p className="mt-1 text-xs text-charcoal-3">{crawledAtText(heatmap.currentMonthCrawledAt)}</p>
      ) : null}
    </>
  );
}
