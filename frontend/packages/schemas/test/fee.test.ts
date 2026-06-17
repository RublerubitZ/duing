import { describe, it, expect } from 'vitest';
import {
  feeAccountSchema,
  generateBillsSchema,
  recordPaymentSchema,
  toGenerateBillsPayload,
} from '../src/index';

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

describe('recordPaymentSchema', () => {
  it('유효한 납부 기록(금액·수단·납부일·메모)은 통과한다', () => {
    expect(
      recordPaymentSchema.safeParse({
        amount: 10000,
        method: 'CASH',
        paidAt: '2026-06-17',
        memo: '6월 회비',
      }).success,
    ).toBe(true);
  });

  it('메모는 선택값이라 없어도 통과한다', () => {
    expect(
      recordPaymentSchema.safeParse({
        amount: 5000,
        method: 'TRANSFER',
        paidAt: '2026-06-17',
      }).success,
    ).toBe(true);
  });

  it('금액 0/음수/비정수는 거부한다', () => {
    expect(
      recordPaymentSchema.safeParse({ amount: 0, method: 'CASH', paidAt: '2026-06-17' }).success,
    ).toBe(false);
    expect(
      recordPaymentSchema.safeParse({ amount: -100, method: 'CASH', paidAt: '2026-06-17' }).success,
    ).toBe(false);
    expect(
      recordPaymentSchema.safeParse({ amount: 1000.5, method: 'CASH', paidAt: '2026-06-17' }).success,
    ).toBe(false);
  });

  it('AUTO_MATCHED 는 수동 기록 수단으로 거부한다(시스템 전용)', () => {
    expect(
      recordPaymentSchema.safeParse({ amount: 1000, method: 'AUTO_MATCHED', paidAt: '2026-06-17' })
        .success,
    ).toBe(false);
  });

  it('메모는 200자 초과 시 거부한다(백엔드 @Size(200))', () => {
    expect(
      recordPaymentSchema.safeParse({
        amount: 1000,
        method: 'CASH',
        paidAt: '2026-06-17',
        memo: '가'.repeat(201),
      }).success,
    ).toBe(false);
    expect(
      recordPaymentSchema.safeParse({
        amount: 1000,
        method: 'CASH',
        paidAt: '2026-06-17',
        memo: '가'.repeat(200),
      }).success,
    ).toBe(true);
  });

  it('납부일이 비어 있으면 거부한다', () => {
    expect(
      recordPaymentSchema.safeParse({ amount: 1000, method: 'CASH', paidAt: '' }).success,
    ).toBe(false);
  });
});

describe('feeAccountSchema', () => {
  it('유효한 계좌(은행·숫자/하이픈 계좌번호·예금주)는 통과한다', () => {
    expect(
      feeAccountSchema.safeParse({
        bank: 'KAKAO',
        accountNumber: '3333-01-1234567',
        accountHolder: '김두잉',
      }).success,
    ).toBe(true);
  });

  it('지원하지 않는 은행 코드는 거부한다', () => {
    expect(
      feeAccountSchema.safeParse({
        bank: 'CITI',
        accountNumber: '12345',
        accountHolder: '홍길동',
      }).success,
    ).toBe(false);
  });

  it('계좌번호에 숫자·하이픈 외 문자가 있으면 거부한다', () => {
    const result = feeAccountSchema.safeParse({
      bank: 'KB',
      accountNumber: '110-abc',
      accountHolder: '홍길동',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain('계좌번호는 숫자와 하이픈(-)만 입력할 수 있습니다.');
    }
  });

  it('계좌번호는 30자 초과 시 거부한다(백엔드 @Size(max=30))', () => {
    expect(
      feeAccountSchema.safeParse({
        bank: 'KB',
        accountNumber: '1'.repeat(31),
        accountHolder: '홍길동',
      }).success,
    ).toBe(false);
    expect(
      feeAccountSchema.safeParse({
        bank: 'KB',
        accountNumber: '1'.repeat(30),
        accountHolder: '홍길동',
      }).success,
    ).toBe(true);
  });

  it('예금주는 필수이며 50자 초과 시 거부한다', () => {
    expect(
      feeAccountSchema.safeParse({ bank: 'KB', accountNumber: '12345', accountHolder: '' }).success,
    ).toBe(false);
    expect(
      feeAccountSchema.safeParse({
        bank: 'KB',
        accountNumber: '12345',
        accountHolder: '가'.repeat(51),
      }).success,
    ).toBe(false);
  });

  it('19개 은행 코드를 모두 허용한다', () => {
    const banks = [
      'KB',
      'SHINHAN',
      'WOORI',
      'HANA',
      'NH',
      'IBK',
      'KAKAO',
      'TOSS',
      'SC',
      'BUSAN',
      'IM',
      'KYONGNAM',
      'GWANGJU',
      'JEONBUK',
      'MG',
      'SHINHYUP',
      'POST',
      'KDB',
      'SUHYUP',
    ];
    for (const bank of banks) {
      expect(
        feeAccountSchema.safeParse({ bank, accountNumber: '12345', accountHolder: '홍길동' })
          .success,
      ).toBe(true);
    }
  });
});
