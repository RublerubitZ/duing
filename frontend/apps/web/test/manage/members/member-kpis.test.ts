import { describe, expect, it } from 'vitest';
import type { ClubMember } from '@duing/types';
import { computeMemberKpis } from '@/app/manage/clubs/[clubId]/members/_lib/memberKpis';
import {
  EMPTY_MEMBER_FILTERS,
  filterMembers,
} from '@/app/manage/clubs/[clubId]/members/_lib/memberFilters';

// KST 정오 고정 — 최근 가입 경계 계산을 결정적으로(member-filters.test 와 동일 기준).
const NOW = new Date('2026-07-24T12:00:00+09:00');

const KST_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
function kstDaysAgo(daysAgo: number): string {
  return KST_DATE.format(new Date(NOW.getTime() - daysAgo * 86_400_000));
}

function member(overrides: Partial<ClubMember> = {}): ClubMember {
  return {
    memberId: 1,
    userId: 1,
    name: '홍길동',
    studentId: '20200001',
    role: 'MEMBER',
    joinedAt: kstDaysAgo(10),
    major: '컴퓨터공학과',
    grade: 'JUNIOR',
    phoneMasked: null,
    generation: 3,
    feeStatus: 'PAID',
    ...overrides,
  };
}

function kpiByLabel(members: ClubMember[], useGeneration: boolean, label: string) {
  const kpi = computeMemberKpis(members, useGeneration, NOW).find((k) => k.label === label);
  if (!kpi) throw new Error(`KPI not found: ${label}`);
  return kpi;
}

describe('computeMemberKpis — 4종 구성', () => {
  it('KPI 는 항상 4개다', () => {
    expect(computeMemberKpis([], true, NOW)).toHaveLength(4);
    expect(computeMemberKpis([], false, NOW)).toHaveLength(4);
  });

  it('① 재적 회원은 전체 수다', () => {
    const members = [member({ memberId: 1 }), member({ memberId: 2 }), member({ memberId: 3 })];
    const kpi = kpiByLabel(members, true, '재적 회원');
    expect(kpi.value).toBe('3');
  });

  it('② 임원은 회장+임원 합계를 값으로, 회장/임원 분해를 서브텍스트로 낸다', () => {
    const members = [
      member({ memberId: 1, role: 'LEADER' }),
      member({ memberId: 2, role: 'OFFICER' }),
      member({ memberId: 3, role: 'OFFICER' }),
      member({ memberId: 4, role: 'MEMBER' }),
    ];
    const kpi = kpiByLabel(members, true, '임원');
    expect(kpi.value).toBe('3');
    expect(kpi.sub).toBe('회장 1 · 임원 2');
  });

  it('② 회장이 없어도 서브텍스트는 회장 0 으로 낸다', () => {
    const members = [member({ memberId: 1, role: 'OFFICER' })];
    const kpi = kpiByLabel(members, true, '임원');
    expect(kpi.value).toBe('1');
    expect(kpi.sub).toBe('회장 0 · 임원 1');
  });

  it('③ 회비 미납은 UNPAID 수다', () => {
    const members = [
      member({ memberId: 1, feeStatus: 'UNPAID' }),
      member({ memberId: 2, feeStatus: 'UNPAID' }),
      member({ memberId: 3, feeStatus: 'PAID' }),
      member({ memberId: 4, feeStatus: 'NONE' }),
    ];
    const kpi = kpiByLabel(members, true, '회비 미납');
    expect(kpi.value).toBe('2');
  });
});

describe('computeMemberKpis — ④ 조건부(기수 ON)', () => {
  it('최신 기수는 최고 generation·해당 보유자 수를 낸다', () => {
    const members = [
      member({ memberId: 1, generation: 3 }),
      member({ memberId: 2, generation: 5 }),
      member({ memberId: 3, generation: 5 }),
      member({ memberId: 4, generation: null }),
    ];
    const kpi = kpiByLabel(members, true, '최신 기수');
    expect(kpi.value).toBe('5기');
    expect(kpi.sub).toBe('2명');
  });

  it('전원 기수 null 이면 값은 — 이고 서브텍스트는 없다', () => {
    const members = [
      member({ memberId: 1, generation: null }),
      member({ memberId: 2, generation: null }),
    ];
    const kpi = kpiByLabel(members, true, '최신 기수');
    expect(kpi.value).toBe('—');
    expect(kpi.sub).toBeUndefined();
  });

  it('회원이 없어도 값은 — 다', () => {
    const kpi = kpiByLabel([], true, '최신 기수');
    expect(kpi.value).toBe('—');
    expect(kpi.sub).toBeUndefined();
  });
});

describe('computeMemberKpis — ④ 조건부(기수 OFF)', () => {
  it('최근 가입은 90일 이내 가입 수를 X명으로 낸다', () => {
    const members = [
      member({ memberId: 1, joinedAt: kstDaysAgo(10) }),
      member({ memberId: 2, joinedAt: kstDaysAgo(90) }),
      member({ memberId: 3, joinedAt: kstDaysAgo(91) }),
    ];
    const kpi = kpiByLabel(members, false, '최근 가입');
    expect(kpi.value).toBe('2명');
    expect(kpi.sub).toBeUndefined();
  });

  it('최근 가입 수는 RECENT 필터 결과 수와 정확히 일치한다(동일 기준)', () => {
    const members = [
      member({ memberId: 1, joinedAt: kstDaysAgo(0) }),
      member({ memberId: 2, joinedAt: kstDaysAgo(90) }),
      member({ memberId: 3, joinedAt: kstDaysAgo(91) }),
      member({ memberId: 4, joinedAt: kstDaysAgo(365) }),
    ];
    const kpi = kpiByLabel(members, false, '최근 가입');
    const filtered = filterMembers(members, {
      query: '',
      filters: { ...EMPTY_MEMBER_FILTERS, flags: ['RECENT'] },
      useGeneration: false,
      now: NOW,
    });
    expect(kpi.value).toBe(`${filtered.length}명`);
  });
});

describe('computeMemberKpis — ON/OFF 전환', () => {
  const members = [member({ memberId: 1, generation: 7, joinedAt: kstDaysAgo(5) })];

  it('4번째 KPI 는 ON=최신 기수, OFF=최근 가입 으로 전환된다', () => {
    const on = computeMemberKpis(members, true, NOW).at(3);
    const off = computeMemberKpis(members, false, NOW).at(3);
    expect(on?.label).toBe('최신 기수');
    expect(on?.value).toBe('7기');
    expect(off?.label).toBe('최근 가입');
    expect(off?.value).toBe('1명');
  });

  it('앞 3종(재적·임원·미납)은 ON/OFF 와 무관하게 동일하다', () => {
    const on = computeMemberKpis(members, true, NOW).slice(0, 3);
    const off = computeMemberKpis(members, false, NOW).slice(0, 3);
    expect(off).toEqual(on);
  });
});
