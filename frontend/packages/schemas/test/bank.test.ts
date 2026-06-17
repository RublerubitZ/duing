import { describe, it, expect } from 'vitest';
import { syncBankTransactionsSchema } from '../src/index';

describe('syncBankTransactionsSchema', () => {
  it('유효한 계좌 비밀번호·주민번호 앞 6자리는 통과한다', () => {
    expect(
      syncBankTransactionsSchema.safeParse({
        accountPassword: '1234',
        residentNumber: '990101',
      }).success,
    ).toBe(true);
  });

  it('주민번호가 6자리가 아니면 거부한다', () => {
    expect(
      syncBankTransactionsSchema.safeParse({
        accountPassword: '1234',
        residentNumber: '99010',
      }).success,
    ).toBe(false);
    expect(
      syncBankTransactionsSchema.safeParse({
        accountPassword: '1234',
        residentNumber: '9901011',
      }).success,
    ).toBe(false);
  });

  it('주민번호에 숫자 외 문자가 있으면 거부한다', () => {
    const result = syncBankTransactionsSchema.safeParse({
      accountPassword: '1234',
      residentNumber: '99010a',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain('주민등록번호 앞 6자리를 입력해 주세요.');
    }
  });

  it('계좌 비밀번호가 비어 있으면 거부한다', () => {
    const result = syncBankTransactionsSchema.safeParse({
      accountPassword: '',
      residentNumber: '990101',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain('계좌 비밀번호는 필수입니다.');
    }
  });
});
