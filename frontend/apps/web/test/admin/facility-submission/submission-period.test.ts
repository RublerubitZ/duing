import { describe, expect, it } from 'vitest';
import {
  currentAndNextMonthRange,
  currentMonthRange,
  defaultSubmissionRange,
  nextMonthRange,
} from '../../../app/admin/facility-bookings/_lib/submissionPeriod';

// KST 자정 직후(UTC 로는 전날 15:00) — 로컬/UTC 로 계산하면 날짜가 하루 어긋나는 시각으로 고정한다.
const kstMidnightAfter = (isoDate: string) => new Date(`${isoDate}T00:30:00+09:00`);

describe('submissionPeriod', () => {
  it('기본 기간은 오늘(KST)부터 다음 달 말일까지다', () => {
    expect(defaultSubmissionRange(kstMidnightAfter('2026-09-21'))).toEqual({
      startDate: '2026-09-21',
      endDate: '2026-10-31',
    });
  });

  it('12월에는 다음 해 1월 말일까지, 최대 62일(7/1→8/31·12/1→1/31)이다', () => {
    expect(defaultSubmissionRange(kstMidnightAfter('2026-12-01'))).toEqual({
      startDate: '2026-12-01',
      endDate: '2027-01-31',
    });
    expect(defaultSubmissionRange(kstMidnightAfter('2026-07-01'))).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-08-31',
    });
  });

  it('프리셋 3종 — 이번 달·다음 달·이번+다음 달', () => {
    const now = kstMidnightAfter('2026-02-10');
    expect(currentMonthRange(now)).toEqual({ startDate: '2026-02-01', endDate: '2026-02-28' });
    expect(nextMonthRange(now)).toEqual({ startDate: '2026-03-01', endDate: '2026-03-31' });
    expect(currentAndNextMonthRange(now)).toEqual({ startDate: '2026-02-01', endDate: '2026-03-31' });
  });
});
