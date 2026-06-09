import { describe, it, expect } from 'vitest';
import {
  createInterviewConfigSchema,
  slotPatternSchema,
  updateAvailabilitySchema,
} from '../src/interview';

// 테스트 결정성: 현재 시각보다 멀리 떨어진 미래 / 과거 문자열을 동적으로 생성.
function futureLocalDateTime(): string {
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`;
}

function pastLocalDateTime(): string {
  const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}T${pad(past.getHours())}:${pad(past.getMinutes())}`;
}

describe('createInterviewConfigSchema', () => {
  it('200자 초과 location 을 reject 한다', () => {
    const result = createInterviewConfigSchema.safeParse({
      availabilityDeadline: futureLocalDateTime(),
      location: 'x'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('location 미포함도 허용 (optional)', () => {
    const result = createInterviewConfigSchema.safeParse({
      availabilityDeadline: futureLocalDateTime(),
    });
    expect(result.success).toBe(true);
  });

  it('datetime-local 형식(YYYY-MM-DDTHH:mm) 의 미래 시각을 허용한다', () => {
    const result = createInterviewConfigSchema.safeParse({
      availabilityDeadline: futureLocalDateTime(),
    });
    expect(result.success).toBe(true);
  });

  it('잘못된 형식 deadline 을 reject 한다', () => {
    const result = createInterviewConfigSchema.safeParse({
      availabilityDeadline: '2026-06-18',
    });
    expect(result.success).toBe(false);
  });

  it('과거 시각 deadline 을 reject 한다', () => {
    const result = createInterviewConfigSchema.safeParse({
      availabilityDeadline: pastLocalDateTime(),
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
