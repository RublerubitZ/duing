import { describe, expect, it } from 'vitest';
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
});
