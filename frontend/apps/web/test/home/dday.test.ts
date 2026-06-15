import { describe, expect, it } from 'vitest';

import { computeDday } from '../../app/_lib/dday';

describe('computeDday', () => {
  const today = new Date('2026-09-20T00:00:00');

  it('3일 후 종료 → D-3', () => {
    expect(computeDday('2026-09-23', today)).toBe('D-3');
  });

  it('당일 종료 → D-day', () => {
    expect(computeDday('2026-09-20', today)).toBe('D-day');
  });

  it('1일 후 종료 → D-1', () => {
    expect(computeDday('2026-09-21', today)).toBe('D-1');
  });

  it('이미 지난 종료일 → D+N 형식 (안전망)', () => {
    expect(computeDday('2026-09-18', today)).toBe('D+2');
  });
});
