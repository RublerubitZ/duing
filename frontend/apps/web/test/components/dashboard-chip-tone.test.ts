import { describe, expect, it } from 'vitest';

import { waitingDaysTone } from '@/components/dashboard/dashboardChipTone';

describe('waitingDaysTone — 기다린 날 수 → 칩 톤(두 콘솔 공용)', () => {
  it.each([
    [0, 'info'],
    [2, 'info'],
    [3, 'soon'],
    [6, 'soon'],
    [7, 'late'],
    [30, 'late'],
  ] as const)('%i일 → %s', (days, tone) => {
    expect(waitingDaysTone(days)).toBe(tone);
  });
});
