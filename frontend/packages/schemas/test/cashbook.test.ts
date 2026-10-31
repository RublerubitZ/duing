import { describe, it, expect } from 'vitest';
import { createCashbookEntrySchema } from '../src/index';

const validEntry = {
  entryType: 'EXPENSE',
  categoryCode: 'DINING',
  amount: '12000',
  description: 'MT 저녁',
  transactionDate: '2026-10-20',
} as const;

describe('createCashbookEntrySchema', () => {
  it('유효한 지출 기록은 통과한다', () => {
    expect(createCashbookEntrySchema.safeParse(validEntry).success).toBe(true);
  });

  it.each([
    { field: 'entryType', invalidValue: '', message: '수입/지출을 선택해 주세요.' },
    { field: 'categoryCode', invalidValue: '', message: '카테고리를 선택해 주세요.' },
    { field: 'amount', invalidValue: 'abc', message: '금액은 숫자여야 합니다.' },
  ])('$field 가 잘못되면 $message 로 안내한다', ({ field, invalidValue, message }) => {
    const parsed = createCashbookEntrySchema.safeParse({ ...validEntry, [field]: invalidValue });
    expect(parsed.error?.issues).toEqual([expect.objectContaining({ path: [field], message })]);
  });
});
