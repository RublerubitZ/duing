import { describe, expect, it } from 'vitest';

import {
  FEE_PERIOD_PRESETS,
  readPeriodValue,
  writePeriodParams,
  type FeePeriodValue,
} from '@/app/admin/fees/_lib/feePeriod';

function roundTrip(value: FeePeriodValue): FeePeriodValue {
  const params = new URLSearchParams();
  writePeriodParams(params, value);
  return readPeriodValue(params);
}

describe('회비 감사 기간 주소 왕복', () => {
  it('어떤 프리셋을 골라도 주소를 거쳐 그대로 복원한다', () => {
    for (const preset of FEE_PERIOD_PRESETS) {
      // CUSTOM 만 from/to 가 값의 일부다 — 나머지는 조회 시점에 환산하므로 프리셋만 오가면 된다.
      const value: FeePeriodValue =
        preset === 'CUSTOM' ? { preset, from: '2026-03-01', to: '2026-03-31' } : { preset };

      expect(roundTrip(value)).toEqual(value);
    }
  });

  it('주소에서 생략하는 것은 기본 프리셋(전체)뿐이다', () => {
    const allPeriod = new URLSearchParams();
    writePeriodParams(allPeriod, { preset: 'ALL' });
    expect(allPeriod.toString()).toBe('');

    // 전체가 아닌 기간은 주소에 남겨야 복원된다.
    const last30Days = new URLSearchParams();
    writePeriodParams(last30Days, { preset: 'LAST_30D' });
    expect(last30Days.toString()).toBe('period=LAST_30D');
  });
});
