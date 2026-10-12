import { describe, expect, it } from 'vitest';
import type { NoticeCategory } from '@duing/types';
import { noticeCategoryLabelOf } from '../../app/notices/_lib/categoryLabels';

describe('noticeCategoryLabelOf', () => {
  it.each([
    ['FESTIVAL', '축제'],
    ['FAIR', '박람회'],
    ['FUNDING', '지원사업'],
    ['CONTEST', '공모전'],
    ['GENERAL', '일반'],
  ] as const)('%s → %s', (category, expected) => {
    expect(noticeCategoryLabelOf(category)).toBe(expected);
  });

  it('모르는 분류는 일반', () => {
    expect(noticeCategoryLabelOf('NEW_CATEGORY' as unknown as NoticeCategory)).toBe('일반');
  });
});
