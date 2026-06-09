import { describe, it, expect } from 'vitest';
import { generateSlotsFromPattern } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_utils/generateSlotsFromPattern';

// 로컬 wall-clock 보존이 핵심 — UTC 변환 없이 입력한 시각이 출력에도 그대로 유지되어야 한다.
describe('generateSlotsFromPattern', () => {
  it('startTime 부터 interval 간격으로 count 개를 생성한다', () => {
    const slots = generateSlotsFromPattern({
      startTime: '2026-06-18T18:00',
      intervalMinutes: 30,
      count: 4,
      capacity: 2,
    });
    expect(slots).toHaveLength(4);
    expect(slots.map((slot) => slot.startTime)).toEqual([
      '2026-06-18T18:00:00',
      '2026-06-18T18:30:00',
      '2026-06-18T19:00:00',
      '2026-06-18T19:30:00',
    ]);
    expect(slots.map((slot) => slot.endTime)).toEqual([
      '2026-06-18T18:30:00',
      '2026-06-18T19:00:00',
      '2026-06-18T19:30:00',
      '2026-06-18T20:00:00',
    ]);
    expect(slots.every((slot) => slot.capacity === 2)).toBe(true);
  });

  it('slotDurationMinutes 가 interval 과 다르면 그 길이만큼 endTime 을 생성한다', () => {
    const slots = generateSlotsFromPattern({
      startTime: '2026-06-18T18:00',
      intervalMinutes: 30,
      count: 2,
      capacity: 1,
      slotDurationMinutes: 20,
    });
    expect(slots.map((slot) => slot.startTime)).toEqual([
      '2026-06-18T18:00:00',
      '2026-06-18T18:30:00',
    ]);
    expect(slots.map((slot) => slot.endTime)).toEqual([
      '2026-06-18T18:20:00',
      '2026-06-18T18:50:00',
    ]);
  });
});
