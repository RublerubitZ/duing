import { describe, expect, it } from 'vitest';
import type { GlobalEventCategory } from '@duing/types';
import {
  GLOBAL_EVENT_CATEGORY_LABEL,
  GLOBAL_EVENT_CATEGORY_ORDER,
  globalEventCategoryLabelOf,
} from '../../app/admin/global-events/_lib/categoryLabels';

describe('globalEventCategoryLabelOf', () => {
  it.each(GLOBAL_EVENT_CATEGORY_ORDER)('%s 는 라벨 표 값', (category) => {
    expect(globalEventCategoryLabelOf(category)).toBe(GLOBAL_EVENT_CATEGORY_LABEL[category]);
  });

  it('모르는 분류는 기타', () => {
    expect(globalEventCategoryLabelOf('NEW_CATEGORY' as unknown as GlobalEventCategory)).toBe('기타');
  });
});
