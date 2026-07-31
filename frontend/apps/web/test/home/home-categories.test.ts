import { describe, expect, it } from 'vitest';
import type { ClubCategory } from '@duing/types';

import { HOME_CATEGORIES } from '../../app/_lib/homeCategories';

const ALL_CATEGORIES: ClubCategory[] = [
  'ACADEMIC', 'CREATION', 'ART', 'SPORTS',
  'VOLUNTEER', 'RELIGION', 'HOBBY', 'OTHER',
];

describe('HOME_CATEGORIES', () => {
  it('8개의 카테고리가 정의된다', () => {
    expect(HOME_CATEGORIES).toHaveLength(8);
  });

  it('ClubCategory enum 의 8개 값과 1:1 대응한다 (중복 없음)', () => {
    const values = HOME_CATEGORIES.map((c) => c.value).sort();
    expect(values).toEqual([...ALL_CATEGORIES].sort());
  });

  it('한글 라벨이 학술/창작/예술/운동/봉사/종교/취미/기타 와 일치한다', () => {
    const labels = HOME_CATEGORIES.map((c) => c.label);
    expect(labels).toEqual(['학술', '창작', '예술', '운동', '봉사', '종교', '취미', '기타']);
  });

  it('각 카테고리는 imageSrc · accent · index 메타를 가진다', () => {
    for (const category of HOME_CATEGORIES) {
      expect(category.imageSrc).toMatch(/^\/categories\//);
      expect(category.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(category.index).toMatch(/^0[1-8]$/);
    }
  });
});
