import { afterEach, describe, expect, it } from 'vitest';

import { generateRoundSlotsFromPattern } from '@/components/interview/_utils/generateSlotsFromPattern';

function slotRanges(result: ReturnType<typeof generateRoundSlotsFromPattern>): string[] {
  if (!result.ok) throw new Error(result.reason);
  return result.slots.map((slot) => `${slot.startTime}~${slot.endTime}`);
}

describe('generateRoundSlotsFromPattern', () => {
  it('날짜 + 시간 범위를 면접 시간 간격의 슬롯으로 나눈다(docstring 예시)', () => {
    const result = generateRoundSlotsFromPattern({
      date: '2026-07-15',
      startTime: '10:00',
      endTime: '12:00',
      durationMinutes: 30,
      capacity: 2,
    });

    expect(result).toEqual({
      ok: true,
      slots: [
        { startTime: '2026-07-15T10:00:00', endTime: '2026-07-15T10:30:00', capacity: 2 },
        { startTime: '2026-07-15T10:30:00', endTime: '2026-07-15T11:00:00', capacity: 2 },
        { startTime: '2026-07-15T11:00:00', endTime: '2026-07-15T11:30:00', capacity: 2 },
        { startTime: '2026-07-15T11:30:00', endTime: '2026-07-15T12:00:00', capacity: 2 },
      ],
    });
  });

  it('끝까지 들어가지 않는 꼬리 시간은 버린다', () => {
    const result = generateRoundSlotsFromPattern({
      date: '2026-07-15',
      startTime: '10:00',
      endTime: '11:45',
      durationMinutes: 30,
      capacity: 1,
    });

    expect(slotRanges(result)).toEqual([
      '2026-07-15T10:00:00~2026-07-15T10:30:00',
      '2026-07-15T10:30:00~2026-07-15T11:00:00',
      '2026-07-15T11:00:00~2026-07-15T11:30:00',
    ]);
  });

  it('초가 있는 입력은 초를 그대로 싣는다', () => {
    const result = generateRoundSlotsFromPattern({
      date: '2026-07-15',
      startTime: '10:00:30',
      endTime: '11:00:30',
      durationMinutes: 30,
      capacity: 1,
    });

    expect(slotRanges(result)).toEqual([
      '2026-07-15T10:00:30~2026-07-15T10:30:30',
      '2026-07-15T10:30:30~2026-07-15T11:00:30',
    ]);
  });

  it.each([
    ['종료가 시작보다 이르면', '11:00', '10:00'],
    ['종료와 시작이 같으면', '10:00', '10:00'],
  ])('%s 거부한다(자정을 넘는 범위 미지원)', (_label, startTime, endTime) => {
    expect(
      generateRoundSlotsFromPattern({
        date: '2026-07-15',
        startTime,
        endTime,
        durationMinutes: 30,
        capacity: 1,
      }),
    ).toEqual({
      ok: false,
      reason: '종료 시각은 시작 시각보다 늦어야 합니다. 자정을 넘는 범위는 지원하지 않습니다.',
    });
  });

  it('날짜·시각 형식이 아니면 거부한다', () => {
    expect(
      generateRoundSlotsFromPattern({
        date: '2026/07/15',
        startTime: '10:00',
        endTime: '11:00',
        durationMinutes: 30,
        capacity: 1,
      }),
    ).toEqual({ ok: false, reason: '슬롯 패턴 입력이 올바르지 않습니다. 날짜와 시각을 확인해주세요.' });
  });

  describe('입력은 한국 시간 벽시계 — 기기 시간대의 일광절약 전환과 무관하다', () => {
    const originalTz = process.env.TZ;
    afterEach(() => {
      // undefined 를 대입하면 문자열 "undefined" 가 들어가 UTC 로 동작한다 — 원래 없었으면 지운다.
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    it('뉴욕 기기, 겨울 시간으로 돌아가는 날(11/01) 0~4시 → 30분 슬롯 8개, 중복·뒤집힌 슬롯 없음', () => {
      process.env.TZ = 'America/New_York';

      const ranges = slotRanges(
        generateRoundSlotsFromPattern({
          date: '2026-11-01',
          startTime: '00:00',
          endTime: '04:00',
          durationMinutes: 30,
          capacity: 1,
        }),
      );

      expect(ranges).toEqual([
        '2026-11-01T00:00:00~2026-11-01T00:30:00',
        '2026-11-01T00:30:00~2026-11-01T01:00:00',
        '2026-11-01T01:00:00~2026-11-01T01:30:00',
        '2026-11-01T01:30:00~2026-11-01T02:00:00',
        '2026-11-01T02:00:00~2026-11-01T02:30:00',
        '2026-11-01T02:30:00~2026-11-01T03:00:00',
        '2026-11-01T03:00:00~2026-11-01T03:30:00',
        '2026-11-01T03:30:00~2026-11-01T04:00:00',
      ]);
    });

    it('뉴욕 기기, 여름 시간이 시작되는 날(03/08) 0~4시 → 기기에 없는 2시대 슬롯도 그대로 8개', () => {
      process.env.TZ = 'America/New_York';

      const ranges = slotRanges(
        generateRoundSlotsFromPattern({
          date: '2026-03-08',
          startTime: '00:00',
          endTime: '04:00',
          durationMinutes: 30,
          capacity: 1,
        }),
      );

      expect(ranges).toEqual([
        '2026-03-08T00:00:00~2026-03-08T00:30:00',
        '2026-03-08T00:30:00~2026-03-08T01:00:00',
        '2026-03-08T01:00:00~2026-03-08T01:30:00',
        '2026-03-08T01:30:00~2026-03-08T02:00:00',
        '2026-03-08T02:00:00~2026-03-08T02:30:00',
        '2026-03-08T02:30:00~2026-03-08T03:00:00',
        '2026-03-08T03:00:00~2026-03-08T03:30:00',
        '2026-03-08T03:30:00~2026-03-08T04:00:00',
      ]);
    });

    it('뉴욕 기기, 03/08 2시 30분 시작 → 첫 슬롯이 3시 30분으로 밀리지 않는다', () => {
      process.env.TZ = 'America/New_York';

      const ranges = slotRanges(
        generateRoundSlotsFromPattern({
          date: '2026-03-08',
          startTime: '02:30',
          endTime: '04:00',
          durationMinutes: 30,
          capacity: 1,
        }),
      );

      expect(ranges).toEqual([
        '2026-03-08T02:30:00~2026-03-08T03:00:00',
        '2026-03-08T03:00:00~2026-03-08T03:30:00',
        '2026-03-08T03:30:00~2026-03-08T04:00:00',
      ]);
    });
  });
});
