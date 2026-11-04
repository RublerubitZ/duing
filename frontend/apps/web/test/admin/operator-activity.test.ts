import { describe, expect, it } from 'vitest';

import { OPERATOR_INACTIVE_DAYS, operatorInactiveDays } from '@/app/admin/_lib/operatorActivity';

// KST 2026-10-13 12:00 — 기준 시각을 고정해 KST 달력 일수 경계를 본다.
const NOW = new Date('2026-10-13T12:00:00+09:00');

describe('운영진 접속 경과 일수', () => {
  it('서버 판정과 같은 30일을 기준으로 둔다', () => {
    expect(OPERATOR_INACTIVE_DAYS).toBe(30);
  });

  it.each([
    ['오늘 접속', '2026-10-13T00:30:00Z', 0],
    ['KST 자정 직후 접속(UTC 로는 전날)', '2026-10-12T15:10:00Z', 0],
    ['KST 그 전날 23:50(UTC 14:50)', '2026-10-12T14:50:00Z', 1],
    ['30일 전 KST 00:30', '2026-09-12T15:30:00Z', 30],
    ['31일 전 KST 23:59', '2026-09-12T14:59:00Z', 31],
  ])('%s → %d일', (_label, lastActiveAt, expectedDays) => {
    expect(operatorInactiveDays(lastActiveAt, NOW)).toBe(expectedDays);
  });

  it('기기 시계가 늦어 미래 시각이면 음수다 — 표시는 0 이하를 오늘로 쓴다', () => {
    expect(operatorInactiveDays('2026-10-14T03:00:00Z', NOW)).toBeLessThan(0);
  });
});
