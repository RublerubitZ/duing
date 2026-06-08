import { describe, it, expectTypeOf } from 'vitest';
import type { MyInterviewSchedule } from '../src/interview';

describe('MyInterviewSchedule discriminated union', () => {
  it('assigned=false 분기에서 schedule 은 null 타입으로 좁혀진다', () => {
    const value: MyInterviewSchedule = {
      assigned: false,
      schedule: null,
      location: null,
    };
    if (!value.assigned) {
      expectTypeOf(value.schedule).toEqualTypeOf<null>();
      expectTypeOf(value.location).toEqualTypeOf<null>();
    }
  });

  it('assigned=true 분기에서 schedule 의 scheduleId 가 number 로 좁혀진다', () => {
    const value: MyInterviewSchedule = {
      assigned: true,
      schedule: {
        scheduleId: 1,
        slotId: 1,
        startTime: '2026-06-18T14:00:00Z',
        endTime: '2026-06-18T14:30:00Z',
        status: 'ASSIGNED',
        assignedAt: '2026-06-18T13:00:00Z',
      },
      location: '공학관 2201호',
    };
    if (value.assigned) {
      // schedule 은 NonNullable — optional chaining 없이 직접 접근 가능해야 한다.
      expectTypeOf(value.schedule.scheduleId).toEqualTypeOf<number | undefined>();
      expectTypeOf(value.location).toEqualTypeOf<string | null>();
    }
  });
});
