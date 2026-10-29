import { describe, expect, it } from 'vitest';
import { pickSearchParam } from '@/app/admin/_lib/searchParamChoice';

const STATUSES = ['ALL', 'PENDING', 'RESOLVED'] as const;

describe('pickSearchParam', () => {
  it('허용 목록에 있는 값이면 그 값을 돌려준다', () => {
    expect(pickSearchParam('PENDING', STATUSES)).toBe('PENDING');
  });

  it.each([[null], [''], ['pending'], ['DELETED']])('없거나 모르는 값(%j)이면 undefined', (raw) => {
    expect(pickSearchParam(raw, STATUSES)).toBeUndefined();
  });
});
