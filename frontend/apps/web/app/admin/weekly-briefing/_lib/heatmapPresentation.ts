import { addDaysIso } from '@duing/hooks';
import { kstDateTimeFormatter, parseKstInstant } from '@duing/hooks/datetime';

import { screenWeekRange } from './weeklyBriefingPresentation';

import type { AdminWeeklyFacilityHeatmapRow } from '@duing/types';

export const HEATMAP_LEGEND = '숫자는 그날 예약이 걸친 시간 칸 수(9시~22시, 1시간 칸), 색이 진할수록 많음';
export const HEATMAP_SOURCE_NOTE = '두잉에서 승인·확정한 예약 + 학교 시설 일정(같은 시간은 한 번만). 검토 중인 신청은 빼요.';
export const PAST_MONTH_NOTE = '지난달 학교 일정은 그 뒤 바뀐 내용이 반영되지 않았을 수 있어요. 보관한 시설은 빠져요.';
export const HEATMAP_FAILED_TEXT = '시설 예약 시간을 불러오지 못했어요';
export const HEATMAP_NO_FACILITY_TEXT = '등록된 시설이 없어요';

const WEEKDAYS_FROM_MONDAY = ['월', '화', '수', '목', '금', '토', '일'];
const CRAWLED_AT_FORMAT = kstDateTimeFormatter({ month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** 두 표가 같은 절대 기준 — 0 / 1–3 / 4–6 / 7–9 / 10–13. 0 은 채움 없이 흐린 글자. 색은 보조이고 숫자가 본문이다. */
export function heatmapCellClass(occupiedSlotCount: number): string {
  if (occupiedSlotCount <= 0) return 'text-charcoal-3';
  if (occupiedSlotCount <= 3) return 'bg-sage-mist text-ink-deep';
  if (occupiedSlotCount <= 6) return 'bg-sage-soft text-ink-deep';
  if (occupiedSlotCount <= 9) return 'bg-sage text-ink-deep';
  return 'bg-ink-soft text-paper';
}

export type HeatmapDay = { isoDate: string; dayLabel: string; weekdayLabel: string; spokenLabel: string };

/** 열 머리 — 화면은 "26일 / (월)", 스크린리더는 "10월 26일 월요일". */
export function heatmapDays(weekStart: string): HeatmapDay[] {
  return WEEKDAYS_FROM_MONDAY.map((weekday, index) => {
    const isoDate = addDaysIso(weekStart, index);
    const [, month = 0, day = 0] = isoDate.split('-').map(Number);
    return { isoDate, dayLabel: `${day}일`, weekdayLabel: `(${weekday})`, spokenLabel: `${month}월 ${day}일 ${weekday}요일` };
  });
}

/** 그 주 내내 0 인 시설은 접는다 — 남은 시설은 서버 순서(sort_order) 그대로라 두 표의 시설 순서가 같다. */
export function splitHeatmapRows(rows: AdminWeeklyFacilityHeatmapRow[]) {
  const visibleRows = rows.filter((row) => row.occupiedSlotCounts.some((count) => count > 0));
  return { visibleRows, hiddenCount: rows.length - visibleRows.length };
}

const yearMonthOf = (isoDate: string) => isoDate.split('-').slice(0, 2).join('-');

/** 선택한 주가 이번 달(KST) 이전 달에 걸치는가 — 학교 일정은 당월·익월만 다시 수집한다. */
export function touchesPastMonth(weekStart: string, todayIso: string): boolean {
  return yearMonthOf(weekStart) < yearMonthOf(todayIso);
}

/** "학교 일정 11월 5일 오전 9:00 기준" */
export const crawledAtText = (crawledAt: string) => `학교 일정 ${CRAWLED_AT_FORMAT.format(parseKstInstant(crawledAt))} 기준`;

export const reviewHeatmapCaption = (weekStart: string, todayIso: string, isLatestWeek: boolean) =>
  `${isLatestWeek ? '지난주 ' : ''}시설별 하루 예약 시간 (${screenWeekRange(weekStart, todayIso, false)})`;

export const thisWeekHeatmapCaption = (weekStart: string, todayIso: string) =>
  `이번 주 시설별 하루 예약 시간 (${screenWeekRange(weekStart, todayIso, false)})`;
