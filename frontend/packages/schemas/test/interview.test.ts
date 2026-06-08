import { describe, it, expect } from 'vitest';
import {
  createInterviewConfigSchema,
  slotPatternSchema,
  updateAvailabilitySchema,
} from '../src/interview';

describe('createInterviewConfigSchema', () => {
  it('200자 초과 location 을 reject 한다', () => {
    const result = createInterviewConfigSchema.safeParse({
      availabilityDeadline: '2026-06-18T14:00:00Z',
      location: 'x'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('location 미포함도 허용 (optional)', () => {
    const result = createInterviewConfigSchema.safeParse({
      availabilityDeadline: '2026-06-18T14:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('잘못된 ISO 8601 형식 deadline 을 reject 한다', () => {
    const result = createInterviewConfigSchema.safeParse({
      availabilityDeadline: '2026-06-18',
    });
    expect(result.success).toBe(false);
  });
});

describe('slotPatternSchema', () => {
  it('count=0 을 reject 한다', () => {
    expect(
      slotPatternSchema.safeParse({
        startTime: '2026-06-18T14:00:00Z',
        intervalMinutes: 30,
        count: 0,
        capacity: 1,
      }).success,
    ).toBe(false);
  });
});

describe('updateAvailabilitySchema', () => {
  it('빈 slotIds 를 reject 한다', () => {
    expect(updateAvailabilitySchema.safeParse({ slotIds: [] }).success).toBe(false);
  });

  it('1개 이상이면 통과', () => {
    expect(updateAvailabilitySchema.safeParse({ slotIds: [1] }).success).toBe(true);
  });
});
