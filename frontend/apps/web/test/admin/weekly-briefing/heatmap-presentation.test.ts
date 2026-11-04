import { describe, expect, it } from 'vitest';

import {
  crawledAtText,
  heatmapCellClass,
  heatmapDays,
  reviewHeatmapCaption,
  splitHeatmapRows,
  thisWeekHeatmapCaption,
  touchesPastMonth,
} from '@/app/admin/weekly-briefing/_lib/heatmapPresentation';

const rowOf = (facilityId: number, occupiedSlotCounts: number[]) => ({ facilityId, roomName: `시설${facilityId}`, sortOrder: facilityId, occupiedSlotCounts });

describe('heatmapPresentation', () => {
  it.each([
    [0, 'text-charcoal-3'],
    [1, 'bg-sage-mist'],
    [3, 'bg-sage-mist'],
    [4, 'bg-sage-soft'],
    [6, 'bg-sage-soft'],
    [7, 'bg-sage '],
    [9, 'bg-sage '],
    [10, 'bg-ink-soft'],
    [13, 'bg-ink-soft'],
  ])('%d칸은 두 표 같은 절대 기준 단계(%s)다 — 0 / 1–3 / 4–6 / 7–9 / 10–13', (count, expectedClass) => {
    expect(`${heatmapCellClass(count)} `).toContain(expectedClass);
  });

  it('열 머리 — 화면은 "26일 / (월)", 스크린리더는 "10월 26일 월요일"', () => {
    const days = heatmapDays('2026-10-26');
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ isoDate: '2026-10-26', dayLabel: '26일', weekdayLabel: '(월)', spokenLabel: '10월 26일 월요일' });
    expect(days[6]).toEqual({ isoDate: '2026-11-01', dayLabel: '1일', weekdayLabel: '(일)', spokenLabel: '11월 1일 일요일' });
  });

  it('그 주 내내 0 인 시설은 접고 수를 세며, 남은 시설은 서버 순서 그대로다', () => {
    const { visibleRows, hiddenCount } = splitHeatmapRows([rowOf(1, [0, 0, 0, 0, 0, 0, 0]), rowOf(2, [0, 3, 0, 0, 0, 0, 0]), rowOf(3, [0, 0, 0, 0, 0, 0, 0]), rowOf(4, [13, 0, 0, 0, 0, 0, 0])]);
    expect(visibleRows.map((row) => row.facilityId)).toEqual([2, 4]);
    expect(hiddenCount).toBe(2);
  });

  it('선택한 주가 이번 달 이전에 걸칠 때만 지난달 안내를 붙인다', () => {
    expect(touchesPastMonth('2026-10-26', '2026-11-05')).toBe(true);
    expect(touchesPastMonth('2026-11-02', '2026-11-05')).toBe(false);
    expect(touchesPastMonth('2026-11-30', '2026-12-01')).toBe(true);
  });

  it('수집 시각·caption 문구', () => {
    expect(crawledAtText('2026-11-05T00:00:00Z')).toBe('학교 일정 11월 5일 오전 9:00 기준');
    expect(reviewHeatmapCaption('2026-10-26', '2026-11-05', true)).toBe('지난주 시설별 하루 예약 시간 (10월 26일 – 11월 1일)');
    expect(reviewHeatmapCaption('2026-10-19', '2026-11-05', false)).toBe('시설별 하루 예약 시간 (10월 19일 – 25일)');
    expect(thisWeekHeatmapCaption('2026-11-02', '2026-11-05')).toBe('이번 주 시설별 하루 예약 시간 (11월 2일 – 8일)');
  });
});
