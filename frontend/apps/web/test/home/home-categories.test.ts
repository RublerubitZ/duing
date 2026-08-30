import { describe, expect, it } from 'vitest';
import type { ClubCategory } from '@duing/types';

import { HOME_CATEGORIES, HOME_CATEGORY_BY_VALUE } from '../../app/_lib/homeCategories';

const ALL_CATEGORIES: ClubCategory[] = [
  'ACADEMIC', 'CREATION', 'ART', 'SPORTS',
  'VOLUNTEER', 'RELIGION', 'HOBBY', 'OTHER',
];

/** WCAG 상대 휘도 — 카드 배경이 흰색(paper)이라 그 위 대비만 본다. */
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastOnWhite(hex: string): number {
  return 1.05 / (relativeLuminance(hex) + 0.05);
}

describe('HOME_CATEGORIES', () => {
  it('8개의 카테고리가 정의된다', () => {
    expect(HOME_CATEGORIES).toHaveLength(8);
  });

  it('ClubCategory enum 의 8개 값과 1:1 대응한다 (중복 없음)', () => {
    const values = HOME_CATEGORIES.map((category) => category.value).sort();
    expect(values).toEqual([...ALL_CATEGORIES].sort());
  });

  it('한글 라벨이 학술/창작/예술/운동/봉사/종교/취미/기타 와 일치한다', () => {
    const labels = HOME_CATEGORIES.map((category) => category.label);
    expect(labels).toEqual(['학술', '창작', '예술', '운동', '봉사', '종교', '취미', '기타']);
  });

  it('픽토그램은 모두 토스페이스 원본 SVG 를 가리킨다', () => {
    for (const category of HOME_CATEGORIES) {
      expect(category.iconSrc).toMatch(/^\/tossface\/u[0-9A-F]+\.svg$/);
    }
  });

  it('라벨 색은 흰 카드 위에서 본문 텍스트 대비(4.5:1)를 넘는다', () => {
    // 이 색은 장식 틴트가 아니라 카드의 카테고리 라벨 "텍스트" 색이고, 모바일 12px·데스크탑 16px 라
    // large-text 예외(18.66px bold 이상)에 해당하지 않는다.
    // 예전 팔레트는 운동 3.39:1 · 봉사 3.09:1 로 미달이었다 — 값을 바꿀 때 이 테스트가 먼저 잡는다.
    const failing = HOME_CATEGORIES.filter((category) => contrastOnWhite(category.labelColor) < 4.5)
      .map((category) => `${category.value} ${category.labelColor}`);

    expect(failing).toEqual([]);
  });

  it('enum 값으로 찾는 조회 맵이 8개를 모두 덮는다', () => {
    for (const value of ALL_CATEGORIES) {
      expect(HOME_CATEGORY_BY_VALUE[value].value).toBe(value);
    }
  });
});
