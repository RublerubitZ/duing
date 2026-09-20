import { describe, expect, it } from 'vitest';

import { buildEventRows, formatEventRange } from '../../app/notices/_lib/eventFormat';

// BE 는 행사 정보의 시작·종료를 각각 선택으로 두고(둘 다 있을 때만 순서 검사), 다섯 필드 중 하나라도 있으면
// eventInfo 객체를 내린다 — 그래서 startAt 이 null 인 응답이 실제로 온다(prod 공지 14, NEXT-DUING-1P).
describe('formatEventRange', () => {
  it('시작 없이 종료만 있으면 "종료 일시까지" 로 표기한다', () => {
    expect(formatEventRange(null, '2026-09-16T23:59:00')).toBe('9.16(수) 23:59까지');
  });

  it('시작과 종료가 같은 날이면 시각 범위만 붙인다(기존 표기 유지)', () => {
    expect(formatEventRange('2026-09-25T10:00:00', '2026-09-25T12:00:00')).toBe('9.25(금) 10:00–12:00');
  });
});

describe('buildEventRows', () => {
  it('일시가 둘 다 없으면 일시 행을 만들지 않고 나머지 행만 남긴다', () => {
    const rows = buildEventRows({ startAt: null, endAt: null, location: '대강당', host: null, audience: null });
    expect(rows.map((row) => row.label)).toEqual(['장소']);
  });

  it('종료만 있으면 일시 행이 "까지" 표기로 들어간다', () => {
    const rows = buildEventRows({ startAt: null, endAt: '2026-09-16T23:59:00', location: null, host: null, audience: null });
    expect(rows).toEqual([{ label: '일시', value: '9.16(수) 23:59까지' }]);
  });
});
