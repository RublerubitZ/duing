import { describe, expect, it } from 'vitest';
import type { ClubSummary } from '@duing/types';

import { closingSoonEmphasis, selectClosingSoonClubs } from '../../app/_lib/closingSoon';

const TODAY = new Date('2026-09-20T09:00:00');

function club(id: number, name: string, endDate: string | null): ClubSummary {
  return {
    id,
    name,
    category: 'ACADEMIC',
    division: null,
    college: null,
    department: null,
    logoUrl: null,
    status: 'ACTIVE',
    tags: [],
    tagline: null,
    centralClub: false,
    activeRecruitment:
      endDate === null
        ? null
        : { recruitmentId: id, displayStatus: 'OPEN', startDate: '2026-09-01', endDate },
  };
}

describe('selectClosingSoonClubs', () => {
  it('마감 D-7 ~ D-Day 인 모집만 노출한다 (D-8 이상·마감 완료·상시모집 제외)', () => {
    const items = selectClosingSoonClubs(
      [
        club(1, 'D-day', '2026-09-20'),
        club(2, 'D-7', '2026-09-27'),
        club(3, 'D-8-제외', '2026-09-28'),
        club(4, '마감완료-제외', '2026-09-19'),
        club(5, '상시-제외', null),
      ],
      TODAY,
    );

    expect(items.map((item) => item.name)).toEqual(['D-day', 'D-7']);
  });

  it('입력 정렬(마감 임박순)을 보존하고 D-day / D-N 라벨을 만든다', () => {
    const items = selectClosingSoonClubs(
      [club(1, '가까움', '2026-09-20'), club(2, '사흘', '2026-09-23')],
      TODAY,
    );

    expect(items[0]?.label).toBe('D-day');
    expect(items[1]?.label).toBe('D-3');
  });
});

describe('closingSoonEmphasis', () => {
  it('D-day·D-1=danger, D-2·D-3=warning, D-4~D-7=default', () => {
    expect(closingSoonEmphasis(0)).toBe('danger');
    expect(closingSoonEmphasis(1)).toBe('danger');
    expect(closingSoonEmphasis(2)).toBe('warning');
    expect(closingSoonEmphasis(3)).toBe('warning');
    expect(closingSoonEmphasis(4)).toBe('default');
    expect(closingSoonEmphasis(7)).toBe('default');
  });
});
