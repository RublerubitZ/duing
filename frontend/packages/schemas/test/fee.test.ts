import { describe, it, expect } from 'vitest';
import { generateBillsSchema, toGenerateBillsPayload } from '../src/index';

describe('generateBillsSchema (discriminatedUnion)', () => {
  it('MONTHLY 는 회차만 필수다', () => {
    expect(generateBillsSchema.safeParse({ billingType: 'MONTHLY', billingPeriod: '2026-07' }).success).toBe(true);
    expect(generateBillsSchema.safeParse({ billingType: 'MONTHLY', billingPeriod: '' }).success).toBe(false);
  });

  it('SEMESTER 는 라벨·시작·종료·마감이 모두 필수다', () => {
    expect(
      generateBillsSchema.safeParse({
        billingType: 'SEMESTER',
        billingPeriod: '2026-1학기',
        billingStartDate: '2026-03-01',
        billingEndDate: '2026-08-31',
        dueDate: '2026-03-31',
      }).success,
    ).toBe(true);
    expect(
      generateBillsSchema.safeParse({ billingType: 'SEMESTER', billingPeriod: '2026-1학기' }).success,
    ).toBe(false);
  });
});

describe('toGenerateBillsPayload', () => {
  it('billingType discriminator 를 제거하고 flat 페이로드로 만든다', () => {
    const payload = toGenerateBillsPayload({ billingType: 'MONTHLY', billingPeriod: '2026-07' });
    expect(payload).not.toHaveProperty('billingType');
    expect(payload.billingPeriod).toBe('2026-07');
  });

  it('MONTHLY 의 미입력(빈 문자열) dueDate 는 와이어에서 제외한다(백엔드 LocalDate 400 방지)', () => {
    const payload = toGenerateBillsPayload({ billingType: 'MONTHLY', billingPeriod: '2026-07', dueDate: '' });
    expect(payload).not.toHaveProperty('dueDate');
    expect(payload).toEqual({ billingPeriod: '2026-07' });
  });

  it('YEARLY 는 미입력 마감을 제외하고, 입력한 마감만 싣는다', () => {
    expect(toGenerateBillsPayload({ billingType: 'YEARLY', billingPeriod: '2026', dueDate: '' })).toEqual({
      billingPeriod: '2026',
    });
    expect(
      toGenerateBillsPayload({ billingType: 'YEARLY', billingPeriod: '2026', dueDate: '2026-01-31' }),
    ).toEqual({ billingPeriod: '2026', dueDate: '2026-01-31' });
  });

  it('SEMESTER 는 기간·마감 필드를 모두 싣는다', () => {
    expect(
      toGenerateBillsPayload({
        billingType: 'SEMESTER',
        billingPeriod: '2026-1학기',
        billingStartDate: '2026-03-01',
        billingEndDate: '2026-08-31',
        dueDate: '2026-03-31',
      }),
    ).toEqual({
      billingPeriod: '2026-1학기',
      billingStartDate: '2026-03-01',
      billingEndDate: '2026-08-31',
      dueDate: '2026-03-31',
    });
  });

  it('ONE_TIME 은 라벨·행사일·마감을 싣는다(종료일 없음)', () => {
    const payload = toGenerateBillsPayload({
      billingType: 'ONE_TIME',
      billingPeriod: 'MT참가비',
      billingStartDate: '2026-05-20',
      dueDate: '2026-05-25',
    });
    expect(payload).toEqual({
      billingPeriod: 'MT참가비',
      billingStartDate: '2026-05-20',
      dueDate: '2026-05-25',
    });
    expect(payload).not.toHaveProperty('billingEndDate');
  });
});
