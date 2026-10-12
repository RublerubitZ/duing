import { describe, expect, it } from 'vitest';
import type { ClubCategory } from '@duing/types';
import { clubCategoryLabel } from '../../app/clubs/[clubId]/_lib/clubCategoryLabel';

describe('clubCategoryLabel', () => {
  it.each([
    ['ACADEMIC', '학술'],
    ['CREATION', '창작'],
    ['ART', '예술'],
    ['SPORTS', '운동'],
    ['VOLUNTEER', '봉사'],
    ['RELIGION', '종교'],
    ['HOBBY', '취미'],
    ['OTHER', '기타'],
  ] as const)('%s → %s', (category, expected) => {
    expect(clubCategoryLabel(category)).toBe(expected);
  });

  it('모르는 분류는 기타', () => {
    expect(clubCategoryLabel('NEW_CATEGORY' as unknown as ClubCategory)).toBe('기타');
  });
});
