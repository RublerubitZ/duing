import { describe, expect, it } from 'vitest';

import { billingTypeLabel, feeStatusLabel, formatWon } from '../../app/_lib/feeLabels';

describe('feeLabels', () => {
  describe('billingTypeLabel', () => {
    it('billing_type 별 한국어 라벨을 반환한다', () => {
      expect(billingTypeLabel('MONTHLY')).toBe('월 회비');
      expect(billingTypeLabel('SEMESTER')).toBe('학기 회비');
      expect(billingTypeLabel('YEARLY')).toBe('연 회비');
      expect(billingTypeLabel('ONE_TIME')).toBe('일회성');
    });
  });

  describe('feeStatusLabel', () => {
    it('상태별 한국어 라벨을 반환한다', () => {
      expect(feeStatusLabel('PENDING')).toBe('납부대기');
      expect(feeStatusLabel('PAID')).toBe('납부완료');
      expect(feeStatusLabel('PARTIAL_PAID')).toBe('부분납부');
      expect(feeStatusLabel('OVERDUE')).toBe('연체');
      expect(feeStatusLabel('CANCELLED')).toBe('취소됨');
    });
  });

  describe('formatWon', () => {
    it('천 단위 구분 기호와 원 단위를 붙여 포맷한다', () => {
      expect(formatWon(10000)).toBe('10,000원');
      expect(formatWon(0)).toBe('0원');
      expect(formatWon(1234567)).toBe('1,234,567원');
    });
  });
});
