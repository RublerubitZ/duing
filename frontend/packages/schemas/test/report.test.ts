import { describe, it, expect } from 'vitest';
import { submitReportSchema } from '../src/index';

const validReport = { targetType: 'CLUB', targetId: 1, reasonCode: 'SPAM' } as const;

describe('submitReportSchema', () => {
  it('유효한 신고(대상 유형·ID·사유)는 통과한다', () => {
    expect(submitReportSchema.safeParse(validReport).success).toBe(true);
  });

  it.each([
    { field: 'targetType', message: '신고 대상 유형을 선택해주세요.' },
    { field: 'reasonCode', message: '신고 사유를 선택해주세요.' },
  ])('$field 가 허용 값이 아니면 $message 로 안내한다', ({ field, message }) => {
    const parsed = submitReportSchema.safeParse({ ...validReport, [field]: '' });
    expect(parsed.error?.issues).toEqual([expect.objectContaining({ path: [field], message })]);
  });
});
