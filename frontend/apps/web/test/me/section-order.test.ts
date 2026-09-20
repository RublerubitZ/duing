import { describe, expect, it } from 'vitest';
import { resolveSectionOrder } from '@/app/me/_lib/sectionOrder';

describe('resolveSectionOrder', () => {
  it('진행 중 지원이 없으면 가입한 동아리가 첫 섹션', () => {
    expect(resolveSectionOrder(0)).toEqual(['joined', 'apply', 'saved', 'inquiries', 'archived']);
  });
  it('진행 중 지원이 있으면 지원 현황이 첫 섹션', () => {
    expect(resolveSectionOrder(2)).toEqual(['apply', 'joined', 'saved', 'inquiries', 'archived']);
  });
});
