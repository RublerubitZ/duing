import { describe, expect, it } from 'vitest';

import {
  FEE_PERIOD_PRESETS,
  readPeriodValue,
  writePeriodParams,
  type FeePeriodPreset,
  type FeePeriodValue,
} from '@/app/admin/fees/_lib/feePeriod';

/** 목록은 전체 기간이, 상세는 최근 30일이 기본이다 — 생략 규칙은 화면마다 달라야 한다. */
const PAGE_FALLBACKS: FeePeriodPreset[] = ['ALL', 'LAST_30D'];

function roundTrip(value: FeePeriodValue, fallback: FeePeriodPreset): FeePeriodValue {
  const params = new URLSearchParams();
  writePeriodParams(params, value, fallback);
  return readPeriodValue(params, fallback);
}

describe('회비 감사 기간 주소 왕복', () => {
  it.each(PAGE_FALLBACKS)('기본값이 %s 인 화면은 어떤 프리셋을 골라도 주소를 거쳐 그대로 복원한다', (fallback) => {
    for (const preset of FEE_PERIOD_PRESETS) {
      // CUSTOM 만 from/to 가 값의 일부다 — 나머지는 조회 시점에 환산하므로 프리셋만 오가면 된다.
      const value: FeePeriodValue =
        preset === 'CUSTOM' ? { preset, from: '2026-03-01', to: '2026-03-31' } : { preset };

      expect(roundTrip(value, fallback)).toEqual(value);
    }
  });

  it('주소에서 생략하는 것은 그 화면의 기본 프리셋뿐이다', () => {
    const detail = new URLSearchParams();
    writePeriodParams(detail, { preset: 'ALL' }, 'LAST_30D');
    // 상세의 기본값은 최근 30일이라, 전체 기간은 주소에 남겨야 복원된다.
    expect(detail.toString()).toBe('period=ALL');

    const list = new URLSearchParams();
    writePeriodParams(list, { preset: 'ALL' });
    expect(list.toString()).toBe('');
  });
});
