import { describe, expect, it } from 'vitest';

import type { Bank, FeeStatus } from '@duing/types';

import {
  bankLabel,
  billingTypeLabel,
  feeStatusChip,
  feeStatusLabel,
  formatWon,
} from '../../app/_lib/feeLabels';

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

  describe('feeStatusChip', () => {
    it('라벨과 배지 색을 한 쌍으로 돌려주고 라벨은 feeStatusLabel 과 같다', () => {
      const statuses: FeeStatus[] = ['PENDING', 'PAID', 'PARTIAL_PAID', 'OVERDUE', 'CANCELLED'];
      for (const status of statuses) {
        const chip = feeStatusChip(status);
        expect(chip.label).toBe(feeStatusLabel(status));
        expect(chip.badgeClass).not.toBe('');
      }
    });

    it('연체와 납부완료는 서로 다른 배지 색을 쓴다', () => {
      expect(feeStatusChip('OVERDUE').badgeClass).toBe('bg-coral/10 text-coral');
      expect(feeStatusChip('PAID').badgeClass).toBe('bg-sage/20 text-sage');
    });
  });

  describe('formatWon', () => {
    it('천 단위 구분 기호와 원 단위를 붙여 포맷한다', () => {
      expect(formatWon(10000)).toBe('10,000원');
      expect(formatWon(0)).toBe('0원');
      expect(formatWon(1234567)).toBe('1,234,567원');
    });
  });

  describe('bankLabel', () => {
    it('은행 코드별 한국어 라벨을 반환한다', () => {
      const expected: Record<Bank, string> = {
        KB: 'KB국민',
        SHINHAN: '신한',
        WOORI: '우리',
        HANA: '하나',
        NH: 'NH농협',
        IBK: 'IBK기업',
        KAKAO: '카카오뱅크',
        TOSS: '토스뱅크',
        SC: 'SC제일',
        BUSAN: '부산',
        IM: 'iM뱅크(대구)',
        KYONGNAM: '경남',
        GWANGJU: '광주',
        JEONBUK: '전북',
        MG: '새마을금고',
        SHINHYUP: '신협',
        POST: '우체국',
        KDB: 'KDB산업',
        SUHYUP: '수협',
      };
      for (const [bank, label] of Object.entries(expected)) {
        expect(bankLabel(bank as Bank)).toBe(label);
      }
    });
  });
});
